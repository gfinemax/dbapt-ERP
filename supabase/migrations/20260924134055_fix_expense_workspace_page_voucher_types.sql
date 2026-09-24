create index if not exists expense_resolutions_org_used_created_idx
  on finance.expense_resolutions(organization_id, actual_expense_date desc, created_at desc, id)
  where deleted_at is null;

create index if not exists personal_reimbursements_org_used_created_idx
  on finance.personal_reimbursements(organization_id, used_on desc, submitted_at desc, id);

create index if not exists approval_small_expenses_org_used_created_idx
  on approval.small_expenses(organization_id, expense_date desc, created_at desc, id)
  where deleted_at is null;

create or replace function finance.expense_workspace_page(
  p_org uuid,
  p_actor uuid,
  p_page integer default 1,
  p_page_size integer default 50,
  p_kind text default 'ALL',
  p_connection text default 'ALL',
  p_search text default '',
  p_sort text default 'USED_DESC',
  p_status text default '',
  p_source_kind text default null,
  p_source_id text default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  member finance.reimbursement_members;
  staff boolean;
  is_admin boolean;
  normalized_page integer := greatest(coalesce(p_page, 1), 1);
  normalized_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  normalized_kind text := upper(coalesce(nullif(btrim(p_kind), ''), 'ALL'));
  normalized_connection text := upper(coalesce(nullif(btrim(p_connection), ''), 'ALL'));
  normalized_search text := lower(btrim(coalesce(p_search, '')));
  normalized_sort text := upper(coalesce(nullif(btrim(p_sort), ''), 'USED_DESC'));
  normalized_status text := btrim(coalesce(p_status, ''));
  result jsonb;
begin
  member := finance.workflow_actor(p_org, p_actor);
  staff := member.permissions && array['ADMIN', 'APPROVE', 'PAY', 'CLOSE', 'SENIOR'];
  is_admin := 'ADMIN' = any(member.permissions);

  if normalized_kind not in ('ALL', 'RESOLUTION', 'SMALL', 'QUICK', 'PERSONAL') then
    normalized_kind := 'ALL';
  end if;
  if normalized_connection not in ('ALL', 'CONNECTED', 'UNCONNECTED') then
    normalized_connection := 'ALL';
  end if;
  if normalized_sort not in ('USED_DESC', 'CREATED_DESC', 'AMOUNT_DESC', 'ACTION_REQUIRED') then
    normalized_sort := 'USED_DESC';
  end if;

  with originals as materialized (
    select
      'RESOLUTION'::text as source_kind,
      r.id::text as source_id,
      r.resolution_no::text as number,
      coalesce(nullif(r.subject, ''), r.resolution_no)::text as title,
      r.total_payment_amount as amount,
      r.created_at,
      r.updated_at,
      r.actual_expense_date::text as used_at,
      r.actual_expense_date::timestamptz as used_sort,
      r.accounting_date::text as accounting_date,
      null::text as budget_month,
      r.approval_status::text as approval_status,
      r.payment_status::text as payment_status,
      r.author_label::text as author_label,
      coalesce(r.resolution_data->>'paymentTarget', r.resolution_data->>'accountHolder')::text as counterparty,
      r.resolution_data->>'reason' as usage_description,
      r.resolution_data->>'memo' as memo,
      null::text as budget_item,
      r.expense_detail_id::text as expense_detail_id,
      null::text as evidence_kind,
      null::text as evidence_review_status,
      null::text as missing_evidence_reason,
      null::text as evidence_review_note,
      null::text as personal_purpose,
      null::text as personal_updated_at,
      false as personal_can_edit,
      false as personal_is_applicant,
      'RESOLUTION'::text as workflow_source_kind,
      r.id::text as workflow_source_id,
      null::uuid as evidence_quick_id,
      true as can_connect_base
    from finance.expense_resolutions r
    where staff and r.organization_id = p_org and r.deleted_at is null

    union all

    select
      'SMALL',
      s.id::text,
      null,
      s.description,
      s.amount,
      s.created_at,
      s.updated_at,
      s.expense_date::text,
      s.expense_date::timestamptz,
      null,
      (date_trunc('month', s.expense_date::timestamp)::date)::text,
      s.review_status,
      null,
      s.created_by_label,
      s.partner_name,
      s.description,
      s.memo,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      false,
      false,
      'QUICK',
      s.quick_record_id::text,
      s.quick_record_id,
      false
    from approval.small_expenses s
    where staff and s.organization_id = p_org and s.deleted_at is null

    union all

    select
      'QUICK',
      q.id::text,
      null,
      q.usage_description,
      q.amount,
      q.created_at,
      q.updated_at,
      q.occurred_at::text,
      q.occurred_at,
      null,
      null,
      q.record_status,
      null,
      q.recorded_by_label,
      q.counterparty,
      q.usage_description,
      null,
      q.budget_item,
      q.expense_detail_id::text,
      q.evidence_kind,
      q.evidence_review_status,
      q.missing_evidence_reason,
      q.evidence_review_note,
      null,
      null,
      false,
      false,
      'QUICK',
      q.id::text,
      q.id,
      true
    from finance.quick_expense_records q
    where staff
      and q.organization_id = p_org
      and not exists (
        select 1
        from approval.small_expenses s
        where s.organization_id = p_org
          and s.quick_record_id = q.id
          and s.deleted_at is null
      )

    union all

    select
      'PERSONAL',
      p.id::text,
      null,
      p.merchant || ' · ' || p.purpose,
      p.amount,
      p.submitted_at,
      p.updated_at,
      p.used_on::text,
      p.used_on::timestamptz,
      null,
      p.budget_month::text,
      p.status,
      case when p.status = 'PAID' then '지급완료' else null end,
      m.display_name,
      p.merchant,
      p.purpose,
      null,
      null,
      null,
      p.evidence_kind,
      p.evidence_review_status,
      p.missing_receipt_reason,
      p.evidence_review_note,
      p.purpose,
      p.updated_at::text,
      p.status = 'SUBMITTED' and (p.applicant_id = p_actor or is_admin),
      p.applicant_id = p_actor,
      'PERSONAL',
      p.id::text,
      null,
      true
    from finance.personal_reimbursements p
    left join finance.reimbursement_members m
      on m.organization_id = p.organization_id and m.user_id = p.applicant_id
    where p.organization_id = p_org and (staff or p.applicant_id = p_actor)
  ), linked as materialized (
    select o.*, t.id as transaction_id
    from originals o
    left join finance.workflow_transactions t
      on t.organization_id = p_org
      and t.source_kind = o.workflow_source_kind
      and t.source_id = o.workflow_source_id
  ), filtered as materialized (
    select l.*
    from linked l
    where (normalized_kind = 'ALL' or l.source_kind = normalized_kind)
      and (
        normalized_connection = 'ALL'
        or (normalized_connection = 'CONNECTED' and l.transaction_id is not null)
        or (normalized_connection = 'UNCONNECTED' and l.transaction_id is null)
      )
      and (
        normalized_search = ''
        or position(normalized_search in lower(concat_ws(' ', l.title, l.number, l.counterparty))) > 0
      )
      and (
        normalized_kind <> 'RESOLUTION'
        or normalized_status = ''
        or l.approval_status = normalized_status
      )
  ), ranked as materialized (
    select
      f.*,
      row_number() over (
        order by
          case when normalized_sort = 'ACTION_REQUIRED' then
            case
              when f.approval_status in ('SOURCE_PENDING', 'EVIDENCE_PENDING', 'NEEDS_RESOLUTION', 'RETURNED', 'SUPPLEMENT') then 0
              when f.approval_status in ('작성중', '승인대기', 'SUBMITTED', 'PENDING', 'APPROVED') then 1
              when f.transaction_id is null then 2
              else 3
            end
          end asc nulls last,
          case when normalized_sort = 'AMOUNT_DESC' then f.amount end desc nulls last,
          case when normalized_sort = 'CREATED_DESC' then f.created_at end desc nulls last,
          case when normalized_sort = 'CREATED_DESC' then f.used_sort end desc nulls last,
          case when normalized_sort in ('USED_DESC', 'AMOUNT_DESC', 'ACTION_REQUIRED') then f.used_sort end desc nulls last,
          f.created_at desc,
          f.source_kind,
          f.source_id
      ) as row_number
    from filtered f
  ), stats as (
    select
      (select count(*)::integer from linked) as total_count,
      (select count(*)::integer from filtered) as filtered_count,
      jsonb_build_object(
        'ALL', (select count(*)::integer from linked),
        'RESOLUTION', (select count(*)::integer from linked where source_kind = 'RESOLUTION'),
        'SMALL', (select count(*)::integer from linked where source_kind = 'SMALL'),
        'QUICK', (select count(*)::integer from linked where source_kind = 'QUICK'),
        'PERSONAL', (select count(*)::integer from linked where source_kind = 'PERSONAL')
      ) as kind_counts
  ), paging as (
    select
      s.*,
      greatest(1, ceil(s.filtered_count::numeric / normalized_page_size)::integer) as page_count,
      least(
        normalized_page,
        greatest(1, ceil(s.filtered_count::numeric / normalized_page_size)::integer)
      ) as effective_page
    from stats s
  ), page_rows as materialized (
    select r.*
    from ranked r
    cross join paging p
    where r.row_number > (p.effective_page - 1) * normalized_page_size
      and r.row_number <= p.effective_page * normalized_page_size
  ), targets as materialized (
    select p.*, true as in_page
    from page_rows p
    union all
    select l.*, null::bigint as row_number, false as in_page
    from linked l
    where p_source_kind is not null
      and p_source_id is not null
      and l.source_kind = upper(p_source_kind)
      and l.source_id = p_source_id
      and not exists (
        select 1 from page_rows p
        where p.source_kind = l.source_kind and p.source_id = l.source_id
      )
  ), enriched as (
    select
      target.source_kind,
      target.source_id,
      target.row_number,
      target.in_page,
      jsonb_build_object(
        'source_kind', target.source_kind,
        'source_id', target.source_id,
        'number', target.number,
        'title', target.title,
        'amount', target.amount,
        'created_at', target.created_at,
        'updated_at', target.updated_at,
        'used_at', target.used_at,
        'accounting_date', target.accounting_date,
        'budget_month', target.budget_month,
        'approval_status', target.approval_status,
        'payment_status', target.payment_status,
        'author_label', target.author_label,
        'counterparty', target.counterparty,
        'transaction_id', target.transaction_id,
        'can_connect', target.can_connect_base and target.transaction_id is null,
        'amounts', case
          when target.transaction_id is null then null
          else finance.workflow_transaction_amounts(p_org, target.transaction_id)
        end,
        'evidence_files', coalesce(evidence.files, '[]'::jsonb),
        'trust_items', coalesce(trust.items, '[]'::jsonb),
        'vouchers', coalesce(voucher.items, '[]'::jsonb),
        'evidence_kind', target.evidence_kind,
        'evidence_review_status', target.evidence_review_status,
        'missing_evidence_reason', target.missing_evidence_reason,
        'evidence_review_note', target.evidence_review_note,
        'budget_item', target.budget_item,
        'expense_detail_id', target.expense_detail_id,
        'usage_description', target.usage_description,
        'memo', target.memo,
        'personal_purpose', target.personal_purpose,
        'personal_updated_at', target.personal_updated_at,
        'personal_can_edit', target.personal_can_edit,
        'personal_is_applicant', target.personal_is_applicant
      ) as record
    from targets target
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'ocr_job_id', j.id,
          'file_name', j.original_filename,
          'content_type', j.content_type,
          'storage_path', j.storage_path,
          'evidence_type', j.evidence_type,
          'status', j.status,
          'stage', j.stage,
          'progress', j.progress,
          'result_data', j.result_data,
          'error_message', j.error_message,
          'created_at', e.created_at
        ) order by e.created_at desc
      ) as files
      from finance.quick_expense_evidence e
      join finance.expense_evidence_ocr_jobs j on j.id = e.ocr_job_id
      where target.evidence_quick_id is not null
        and e.organization_id = p_org
        and e.quick_expense_id = target.evidence_quick_id
    ) evidence on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'request_id', i.request_id,
          'request_no', request.request_no,
          'status', i.status,
          'requested_amount', i.requested_amount,
          'approved_amount', i.approved_amount,
          'paid_amount', finance.trust_item_paid(p_org, i.id),
          'needs_review', i.needs_review
        ) order by request.created_at desc, i.id
      ) as items
      from finance.workflow_trust_items i
      join finance.workflow_trust_requests request
        on request.id = i.request_id and request.organization_id = p_org
      where target.transaction_id is not null
        and i.organization_id = p_org
        and i.transaction_id = target.transaction_id
    ) trust on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'voucher_no', v.voucher_no,
          'status', v.approval_status,
          'source_kind', link.source_kind
        ) order by v.voucher_date desc, v.id
      ) as items
      from finance.vouchers v
      left join finance.workflow_voucher_links link
        on link.voucher_id = v.id and link.organization_id = p_org
      where v.organization_id = p_org
        and v.deleted_at is null
        and (
          (target.source_kind = 'RESOLUTION' and v.expense_resolution_id = target.source_id)
          or (link.source_kind = 'RECOGNITION' and link.source_id = target.transaction_id)
          or (
            link.source_kind = 'PAYMENT'
            and exists (
              select 1
              from finance.workflow_allocations allocation
              where allocation.organization_id = p_org
                and allocation.payment_id = link.source_id
                and allocation.transaction_id = target.transaction_id
            )
          )
        )
    ) voucher on true
  )
  select jsonb_build_object(
    'records', coalesce(
      (select jsonb_agg(e.record order by e.row_number) from enriched e where e.in_page),
      '[]'::jsonb
    ),
    'selected_record', (
      select e.record
      from enriched e
      where p_source_kind is not null
        and p_source_id is not null
        and e.source_kind = upper(p_source_kind)
        and e.source_id = p_source_id
      order by e.in_page desc
      limit 1
    ),
    'total_count', paging.total_count,
    'filtered_count', paging.filtered_count,
    'kind_counts', paging.kind_counts,
    'page', paging.effective_page,
    'page_size', normalized_page_size,
    'page_count', paging.page_count,
    'staff', staff
  )
  into result
  from paging;

  return result;
end
$$;

revoke all on function finance.expense_workspace_page(uuid,uuid,integer,integer,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function finance.expense_workspace_page(uuid,uuid,integer,integer,text,text,text,text,text,text,text)
  to service_role;

notify pgrst, 'reload schema';
