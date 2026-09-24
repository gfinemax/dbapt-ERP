create or replace function finance.finance_dashboard_tasks(p_org uuid, p_actor uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  member finance.reimbursement_members;
  staff boolean;
  tasks jsonb;
  section_tasks jsonb;
  transaction_row finance.workflow_transactions;
  contract_row finance.workflow_contract_versions;
  fresh_source jsonb;
  amounts jsonb;
  available numeric;
begin
  member := finance.workflow_actor(p_org, p_actor);
  staff := member.permissions && array['ADMIN', 'APPROVE', 'PAY', 'CLOSE', 'SENIOR'];
  tasks := finance.finance_task_sources(p_org, p_actor);

  with expense_sources as materialized (
    select
      'RESOLUTION'::text as source_kind,
      resolution.id::text as source_id,
      coalesce(nullif(resolution.subject, ''), resolution.resolution_no)::text as title,
      resolution.approval_status::text as approval_status,
      resolution.created_at,
      'RESOLUTION'::text as workflow_source_kind,
      resolution.id::text as workflow_source_id,
      true as can_connect
    from finance.expense_resolutions resolution
    where staff
      and resolution.organization_id = p_org
      and resolution.deleted_at is null

    union all

    select
      'SMALL',
      small.id::text,
      small.description,
      small.review_status,
      small.created_at,
      'QUICK',
      small.quick_record_id::text,
      false
    from approval.small_expenses small
    where staff
      and small.organization_id = p_org
      and small.deleted_at is null

    union all

    select
      'QUICK',
      quick.id::text,
      quick.usage_description,
      quick.record_status,
      quick.created_at,
      'QUICK',
      quick.id::text,
      true
    from finance.quick_expense_records quick
    where staff
      and quick.organization_id = p_org
      and not exists (
        select 1
        from approval.small_expenses small
        where small.organization_id = p_org
          and small.quick_record_id = quick.id
          and small.deleted_at is null
      )

    union all

    select
      'PERSONAL',
      reimbursement.id::text,
      reimbursement.merchant || ' · ' || reimbursement.purpose,
      reimbursement.status,
      reimbursement.submitted_at,
      'PERSONAL',
      reimbursement.id::text,
      true
    from finance.personal_reimbursements reimbursement
    where reimbursement.organization_id = p_org
      and (staff or reimbursement.applicant_id = p_actor)
  ), linked_expenses as materialized (
    select source.*, transaction.id as transaction_id
    from expense_sources source
    left join finance.workflow_transactions transaction
      on transaction.organization_id = p_org
      and transaction.source_kind = source.workflow_source_kind
      and transaction.source_id = source.workflow_source_id
  ), expense_tasks as (
    select
      linked.created_at,
      0 as task_order,
      jsonb_build_object(
        'id', 'connect:' || linked.source_kind || ':' || linked.source_id,
        'kind', 'UNCONNECTED',
        'title', linked.title,
        'detail', '기존 원본을 신탁·지급·회계 업무에 연결',
        'href', '/finance/expenses?source_kind=' || linked.source_kind || '&source_id=' || linked.source_id
      ) as task
    from linked_expenses linked
    where linked.can_connect and linked.transaction_id is null

    union all

    select
      linked.created_at,
      1,
      jsonb_build_object(
        'id', 'approval:' || linked.source_kind || ':' || linked.source_id,
        'kind', 'APPROVAL',
        'title', linked.title,
        'detail', '원본의 승인대기 상태 · 담당 결재자는 원본에서 확인',
        'href', '/finance/expenses?source_kind=' || linked.source_kind || '&source_id=' || linked.source_id
      )
    from linked_expenses linked
    where linked.approval_status in ('승인대기', 'SUBMITTED')
  )
  select coalesce(
    jsonb_agg(expense_tasks.task order by expense_tasks.created_at desc, expense_tasks.task_order, expense_tasks.task->>'id'),
    '[]'::jsonb
  )
  into section_tasks
  from expense_tasks;
  tasks := tasks || section_tasks;

  if staff then
    with supplement_requests as (
      select
        request.id,
        request.request_no,
        request.title,
        request.created_at,
        count(item.id)::integer as item_count
      from finance.workflow_trust_requests request
      join finance.workflow_trust_items item
        on item.organization_id = p_org and item.request_id = request.id
      where request.organization_id = p_org
        and (item.status = 'SUPPLEMENT' or item.needs_review)
      group by request.id, request.request_no, request.title, request.created_at
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', 'trust:' || request.id::text,
          'kind', 'TRUST_SUPPLEMENT',
          'title', request.request_no || ' · ' || request.title,
          'detail', '보완·재검토 항목 ' || request.item_count::text || '건',
          'href', '/finance/trust?request=' || request.id::text
        ) order by request.created_at desc, request.id
      ),
      '[]'::jsonb
    )
    into section_tasks
    from supplement_requests request;
    tasks := tasks || coalesce(section_tasks, '[]'::jsonb);

    for transaction_row in
      select transaction.*
      from finance.workflow_transactions transaction
      where transaction.organization_id = p_org
      order by transaction.created_at desc, transaction.id
    loop
      amounts := finance.workflow_transaction_amounts(p_org, transaction_row.id);
      available := 0;

      if transaction_row.payment_review_required
        or ((amounts->>'paid') is null and not transaction_row.legacy_payment_complete)
      then
        tasks := tasks || jsonb_build_array(jsonb_build_object(
          'id', 'payment-review:' || transaction_row.id::text,
          'kind', 'PAYMENT_REVIEW',
          'title', transaction_row.title,
          'detail', '기존 지급 사실·금액 확인 필요',
          'href', '/finance/payments?tab=REVIEW'
        ));
      end if;

      if transaction_row.payment_review_required
        or transaction_row.legacy_payment_complete
        or (amounts->>'remaining')::numeric = 0
      then
        continue;
      end if;

      begin
        fresh_source := finance.workflow_source(
          p_org,
          transaction_row.source_kind,
          transaction_row.source_id
        );
      exception when others then
        continue;
      end;

      if fresh_source->>'signature' is distinct from transaction_row.source_signature
        or fresh_source->'can_pay' is distinct from 'true'::jsonb
      then
        continue;
      end if;

      select contract.*
      into contract_row
      from finance.workflow_contract_versions contract
      where contract.organization_id = p_org
        and contract.id = transaction_row.contract_version_id
        and contract.status = 'VERIFIED';
      if not found or transaction_row.route = 'UNKNOWN' then
        continue;
      end if;

      if transaction_row.route = 'TRUST_DIRECT' then
        select coalesce(
          sum(greatest(0, item.approved_amount - finance.trust_item_paid(p_org, item.id))),
          0
        )
        into available
        from finance.workflow_trust_items item
        join finance.workflow_trust_requests request on request.id = item.request_id
        where item.organization_id = p_org
          and item.transaction_id = transaction_row.id
          and item.status in ('APPROVED', 'PARTIAL')
          and not item.needs_review
          and item.source_revision = transaction_row.revision
          and request.contract_version_id = transaction_row.contract_version_id
          and request.status not in ('DRAFT', 'WITHDRAWN', 'REJECTED');
        available := least(available, (amounts->>'remaining')::numeric);
      elsif contract_row.conditions->>'operating_allowed' = 'true'
        and coalesce(contract_row.conditions->>'operating_basis', '') <> ''
      then
        available := least(
          (amounts->>'remaining')::numeric,
          (amounts->>'requestable')::numeric
        );
      end if;

      if available > 0 then
        tasks := tasks || jsonb_build_array(jsonb_build_object(
          'id', 'pay:' || transaction_row.id::text,
          'kind', 'PAYABLE',
          'title', transaction_row.title,
          'detail', '현재 지급 가능 ' || to_char(available, 'FM999,999,999,999,999,999') || '원 · 실행 시 재검증',
          'href', '/finance/payments?tab=READY'
        ));
      end if;
    end loop;

    with managed_vouchers as (
      select
        voucher.id,
        voucher.voucher_no,
        voucher.voucher_date,
        voucher.created_at,
        case
          when link.voucher_id is null then false
          else link.source_signature is distinct from
            finance.accounting_source_read(p_org, link.source_kind, link.source_id)->>'signature'
        end as source_stale
      from finance.vouchers voucher
      join finance.workflow_voucher_controls control
        on control.organization_id = p_org and control.voucher_id = voucher.id
      left join finance.workflow_voucher_links link on link.voucher_id = voucher.id
      where voucher.organization_id = p_org and voucher.deleted_at is null
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', 'voucher:' || managed.id::text,
          'kind', 'ACCOUNTING_REVIEW',
          'title', managed.voucher_no,
          'detail', case
            when managed.source_stale then '연결 원본 변경 · 최신 원본 재검토'
            else '회계 초안 · 확정 정책 확인 전'
          end,
          'href', '/finance?voucherId=' || managed.id::text
        ) order by managed.voucher_date desc, managed.created_at desc, managed.id
      ),
      '[]'::jsonb
    )
    into section_tasks
    from managed_vouchers managed;
    tasks := tasks || section_tasks;

    with accounting_sources as materialized (
      select finance.accounting_source_read(p_org, 'RECOGNITION', transaction.id) as source
      from finance.workflow_transactions transaction
      where transaction.organization_id = p_org
      union all
      select finance.accounting_source_read(p_org, 'PAYMENT', payment.id)
      from finance.workflow_payments payment
      where payment.organization_id = p_org
      union all
      select finance.accounting_source_read(p_org, 'TRANSFER', transfer.id)
      from finance.workflow_transfers transfer
      where transfer.organization_id = p_org
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', 'accounting:' || (source->>'kind') || ':' || (source->>'id'),
          'kind', 'ACCOUNTING_REVIEW',
          'title', source->>'title',
          'detail', coalesce(nullif(source->>'blocked_reason', ''), '전표 미연결 · 회계 화면에서 원본 선택'),
          'href', '/finance'
        ) order by source->>'occurred_at' desc nulls last, source->>'kind', source->>'id'
      ),
      '[]'::jsonb
    )
    into section_tasks
    from accounting_sources
    where nullif(source->>'existing_voucher_id', '') is null;
    tasks := tasks || section_tasks;
  end if;

  return tasks;
end
$$;

revoke all on function finance.finance_dashboard_tasks(uuid, uuid)
  from public, anon, authenticated;
grant execute on function finance.finance_dashboard_tasks(uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
