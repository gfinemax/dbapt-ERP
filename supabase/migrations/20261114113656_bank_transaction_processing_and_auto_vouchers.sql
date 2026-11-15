-- Keep the bank row immutable as the source of truth.  Processing state is
-- derived from linked approvals, vouchers, transfers and refunds.
create or replace view finance.bank_transaction_processing_status as
with resolution_links as (
  select r.organization_id, r.id as resolution_id, r.resolution_no,
    r.approval_status, r.payment_status, r.bank_transaction_id
  from finance.expense_resolutions r
  where r.deleted_at is null and r.bank_transaction_id is not null
  union
  select r.organization_id, r.id, r.resolution_no, r.approval_status,
    r.payment_status, (item.value->>'bankTransactionId')::uuid
  from finance.expense_resolutions r
  cross join lateral jsonb_array_elements(coalesce(r.resolution_data->'expenseItems', '[]'::jsonb)) item(value)
  where r.deleted_at is null
    and coalesce(item.value->>'bankTransactionId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
), ranked_resolution as (
  select links.*, row_number() over (
    partition by links.organization_id, links.bank_transaction_id
    order by case links.approval_status when '승인완료' then 1 when '승인대기' then 2 else 3 end,
      links.resolution_id desc
  ) as rank_no
  from resolution_links links
), active_voucher as (
  select v.*, row_number() over (
    partition by v.organization_id, v.bank_transaction_id
    order by case v.approval_status when '승인완료' then 1 else 2 end, v.created_at desc, v.id desc
  ) as rank_no,
  exists(
    select 1 from finance.voucher_lines line
    where line.voucher_id=v.id and line.account_subject_id is null
  ) as has_missing_account
  from finance.vouchers v
  where v.deleted_at is null and v.bank_transaction_id is not null and v.approval_status<>'취소'
)
select bank.organization_id, bank.id as bank_transaction_id,
  case
    when transfer.id is not null then '전표완료'
    when refund.id is not null then '전표완료'
    when voucher.approval_status='승인완료' and not voucher.has_missing_account then '전표완료'
    when voucher.id is not null then '전표확인'
    when resolution.approval_status='승인완료' then '승인완료'
    when resolution.approval_status='승인대기' then '승인대기'
    when resolution.resolution_id is not null then '결의서 작성중'
    else '결의서 작성 대기'
  end as workflow_stage,
  case
    when transfer.id is not null then '계좌대체'
    when refund.id is not null then '취소·환불 연결'
    when voucher.approval_status='승인완료' and not voucher.has_missing_account then '전표 생성 완료'
    else '확인 필요'
  end as accounting_result,
  resolution.resolution_id, resolution.resolution_no,
  voucher.id as voucher_id, voucher.voucher_no,
  coalesce(voucher.has_missing_account, true) as account_review_required
from finance.bank_transactions bank
left join ranked_resolution resolution
  on resolution.organization_id=bank.organization_id
 and resolution.bank_transaction_id=bank.id and resolution.rank_no=1
left join active_voucher voucher
  on voucher.organization_id=bank.organization_id
 and voucher.bank_transaction_id=bank.id and voucher.rank_no=1
left join finance.workflow_transfers transfer
  on transfer.organization_id=bank.organization_id
 and (transfer.withdrawal_id=bank.id or transfer.deposit_id=bank.id)
left join finance.collection_refunds refund
  on refund.organization_id=bank.organization_id
 and refund.bank_transaction_id=bank.id and refund.status='PAID'
where bank.deleted_at is null;

revoke all on finance.bank_transaction_processing_status from public, anon, authenticated;
grant select on finance.bank_transaction_processing_status to service_role;

create or replace function finance.auto_finalize_bank_expense_vouchers(
  p_org uuid,
  p_resolution_id text,
  p_actor uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  resolution finance.expense_resolutions;
  bank finance.bank_transactions;
  voucher finance.vouchers;
  debit_subject uuid;
  credit_subject uuid;
  target_voucher_id uuid;
  voucher_number text;
  first_voucher_number text;
  prefix text;
  sequence_no integer;
  amount_value numeric;
  linked_total numeric;
  linked_count integer:=0;
  completed_count integer:=0;
  before_data jsonb;
  updated_data jsonb;
  item_rows jsonb;
  previous_voucher_setting text:=current_setting('finance.accounting_voucher', true);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 739));
  select * into resolution from finance.expense_resolutions
  where organization_id=p_org and id=p_resolution_id and deleted_at is null for update;
  if not found then raise exception '조직의 지출결의서를 찾을 수 없어.'; end if;
  if resolution.expense_kind<>'BANK_POST_APPROVAL'
    or resolution.approval_status<>'승인완료'
    or resolution.payment_status<>'지급완료' then
    raise exception '승인과 지급이 완료된 통장 선출금 사후결의만 자동 전표를 만들 수 있어.';
  end if;
  if finance.accounting_resolution_managed(p_org, p_resolution_id) then
    return jsonb_build_object('status','INTEGRATED_ACCOUNTING','resolution_id',p_resolution_id);
  end if;

  with linked as (
    select resolution.bank_transaction_id as bank_transaction_id
    where resolution.bank_transaction_id is not null
    union
    select (item.value->>'bankTransactionId')::uuid
    from jsonb_array_elements(coalesce(resolution.resolution_data->'expenseItems','[]'::jsonb)) item(value)
    where coalesce(item.value->>'bankTransactionId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )
  select count(*), coalesce(sum(b.withdrawal_amount),0)
  into linked_count, linked_total
  from linked join finance.bank_transactions b
    on b.organization_id=p_org and b.id=linked.bank_transaction_id and b.deleted_at is null;
  if linked_count=0 then raise exception '전표로 만들 통장 출금 원본이 연결되지 않았어.'; end if;
  if linked_total<>resolution.total_payment_amount then
    raise exception '연결된 통장 출금 합계와 지출결의 총액이 일치하지 않아.';
  end if;

  before_data:=to_jsonb(resolution);
  for bank in
    with linked as (
      select resolution.bank_transaction_id as bank_transaction_id
      where resolution.bank_transaction_id is not null
      union
      select (item.value->>'bankTransactionId')::uuid
      from jsonb_array_elements(coalesce(resolution.resolution_data->'expenseItems','[]'::jsonb)) item(value)
      where coalesce(item.value->>'bankTransactionId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    select b.* from linked join finance.bank_transactions b
      on b.organization_id=p_org and b.id=linked.bank_transaction_id and b.deleted_at is null
    order by b.transacted_at, b.id
  loop
    amount_value:=bank.withdrawal_amount;
    select s.id into debit_subject from finance.account_subjects s
      where s.organization_id=p_org and s.id=bank.confirmed_account_subject_id and s.is_active;
    select s.id into credit_subject
      from finance.bank_account_subject_links link
      join finance.account_subjects s on s.id=link.account_subject_id
      where link.organization_id=p_org and link.bank_account_id=bank.bank_account_id
        and s.organization_id=p_org and s.is_active;

    select * into voucher from finance.vouchers
      where organization_id=p_org and bank_transaction_id=bank.id and deleted_at is null
      order by created_at limit 1 for update;
    if found and voucher.expense_resolution_id is distinct from p_resolution_id then
      raise exception '통장 원본에 다른 전표가 이미 연결되어 있어.';
    end if;
    if not found then
      target_voucher_id:=gen_random_uuid();
      prefix:='지출-'||extract(year from coalesce(resolution.accounting_date, resolution.actual_expense_date, bank.transacted_at::date))::integer||'-AUTO-';
      select count(*)+1 into sequence_no from finance.vouchers
        where organization_id=p_org and voucher_no like prefix||'%';
      loop
        voucher_number:=prefix||lpad(sequence_no::text,6,'0');
        exit when not exists(select 1 from finance.vouchers where organization_id=p_org and voucher_no=voucher_number);
        sequence_no:=sequence_no+1;
      end loop;
      perform set_config('finance.accounting_voucher', target_voucher_id::text, true);
      insert into finance.vouchers(id,organization_id,voucher_no,voucher_date,approval_status,memo,bank_transaction_id,expense_resolution_id)
      values(target_voucher_id,p_org,voucher_number,coalesce(resolution.accounting_date,resolution.actual_expense_date,(bank.transacted_at at time zone 'Asia/Seoul')::date),
        case when debit_subject is not null and credit_subject is not null then '승인완료' else '승인대기' end,
        resolution.resolution_no||' · '||bank.description,bank.id,p_resolution_id);
    else
      target_voucher_id:=voucher.id;
      voucher_number:=voucher.voucher_no;
      perform set_config('finance.accounting_voucher', target_voucher_id::text, true);
      if voucher.approval_status<>'승인완료' then
        update finance.vouchers set
          approval_status=case when debit_subject is not null and credit_subject is not null then '승인완료' else '승인대기' end,
          memo=resolution.resolution_no||' · '||bank.description,
          updated_at=now()
        where id=target_voucher_id;
        delete from finance.voucher_lines where voucher_id=target_voucher_id;
      end if;
    end if;
    if not exists(select 1 from finance.voucher_lines where voucher_id=target_voucher_id) then
      insert into finance.voucher_lines(voucher_id,account_subject_id,description,debit_amount,credit_amount,sort_order)
      values
        (target_voucher_id,debit_subject,bank.description,amount_value,0,1),
        (target_voucher_id,credit_subject,'연결 통장 출금',0,amount_value,2);
    end if;
    if debit_subject is not null and credit_subject is not null then completed_count:=completed_count+1; end if;
    if first_voucher_number is null then first_voucher_number:=voucher_number; end if;
  end loop;
  perform set_config('finance.accounting_voucher', coalesce(previous_voucher_setting,''), true);

  updated_data:=resolution.resolution_data
    || jsonb_build_object(
      'voucherNo',first_voucher_number,
      'voucherStatus',case when completed_count=linked_count then '전표확정' else '전표초안' end,
      'voucherGenerated',true
    );
  if jsonb_typeof(updated_data->'expenseItems')='array' then
    select jsonb_agg(
      case when coalesce(item.value->>'bankTransactionId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then item.value || jsonb_build_object(
          'voucherNo',v.voucher_no,
          'voucherStatus',case when v.approval_status='승인완료' then '전표확정' else '전표초안' end
        ) else item.value end
      order by item.ordinality
    ) into item_rows
    from jsonb_array_elements(updated_data->'expenseItems') with ordinality item(value,ordinality)
    left join finance.vouchers v on v.organization_id=p_org
      and v.bank_transaction_id=case
        when coalesce(item.value->>'bankTransactionId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (item.value->>'bankTransactionId')::uuid else null end
      and v.deleted_at is null;
    updated_data:=jsonb_set(updated_data,'{expenseItems}',coalesce(item_rows,'[]'::jsonb),true);
  end if;
  if completed_count=linked_count then
    updated_data:=updated_data || jsonb_build_object(
      'voucherConfirmedAt',now(),
      'voucherConfirmedBy',case when p_actor is null then '회계 시스템' else '계정확인 담당자' end
    );
  end if;

  perform set_config('finance.legacy_expense_command_org',p_org::text,true);
  perform set_config('finance.legacy_expense_command_id',p_resolution_id,true);
  update finance.expense_resolutions set
    voucher_no=first_voucher_number,
    voucher_status=case when completed_count=linked_count then '전표확정' else '전표초안' end,
    resolution_data=updated_data,
    updated_at=now()
  where organization_id=p_org and id=p_resolution_id;
  perform set_config('finance.legacy_expense_command_org','',true);
  perform set_config('finance.legacy_expense_command_id','',true);

  insert into finance.expense_workflow_audit_logs(resolution_id,action,actor_label,actor_id,before_data,after_data)
  values(p_resolution_id,'AUTO_VOUCHER_SYNC',case when p_actor is null then '회계 시스템' else '계정확인 담당자' end,p_actor,before_data,
    jsonb_build_object('linked_count',linked_count,'completed_count',completed_count,'voucher_status',case when completed_count=linked_count then '전표확정' else '전표초안' end));
  return jsonb_build_object(
    'status',case when completed_count=linked_count then '전표 생성 완료' else '확인 필요' end,
    'resolution_id',p_resolution_id,
    'linked_count',linked_count,
    'completed_count',completed_count
  );
exception when others then
  perform set_config('finance.accounting_voucher', coalesce(previous_voucher_setting,''), true);
  raise;
end
$$;

create or replace function finance.trigger_auto_finalize_bank_expense_vouchers()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.expense_kind='BANK_POST_APPROVAL'
    and new.approval_status='승인완료'
    and new.payment_status='지급완료'
    and (old.approval_status,old.payment_status) is distinct from (new.approval_status,new.payment_status) then
    perform finance.auto_finalize_bank_expense_vouchers(new.organization_id,new.id,null);
  end if;
  return new;
end
$$;

drop trigger if exists auto_finalize_bank_expense_vouchers on finance.expense_resolutions;
create trigger auto_finalize_bank_expense_vouchers
after update of approval_status,payment_status on finance.expense_resolutions
for each row execute function finance.trigger_auto_finalize_bank_expense_vouchers();

create or replace function finance.refresh_bank_expense_vouchers_for_transactions(
  p_org uuid,
  p_actor uuid,
  p_transaction_ids uuid[]
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  member finance.reimbursement_members;
  resolution_id text;
  results jsonb:='[]'::jsonb;
begin
  member:=finance.workflow_actor(p_org,p_actor);
  if not member.permissions && array['ADMIN','APPROVE','CLOSE'] then
    raise exception '전표 계정 반영 권한이 필요해.';
  end if;
  if p_transaction_ids is null or cardinality(p_transaction_ids)=0 or cardinality(p_transaction_ids)>200 then
    raise exception '다시 확인할 통장거래 목록을 확인해줘.';
  end if;
  for resolution_id in
    with links as (
      select r.id, r.organization_id, r.bank_transaction_id
      from finance.expense_resolutions r
      where r.organization_id=p_org and r.deleted_at is null and r.bank_transaction_id is not null
      union
      select r.id, r.organization_id, (item.value->>'bankTransactionId')::uuid
      from finance.expense_resolutions r
      cross join lateral jsonb_array_elements(coalesce(r.resolution_data->'expenseItems','[]'::jsonb)) item(value)
      where r.organization_id=p_org and r.deleted_at is null
        and coalesce(item.value->>'bankTransactionId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    select distinct r.id
    from links join finance.expense_resolutions r on r.organization_id=links.organization_id and r.id=links.id
    where links.bank_transaction_id=any(p_transaction_ids)
      and r.expense_kind='BANK_POST_APPROVAL' and r.approval_status='승인완료' and r.payment_status='지급완료'
  loop
    results:=results||jsonb_build_array(finance.auto_finalize_bank_expense_vouchers(p_org,resolution_id,p_actor));
  end loop;
  return jsonb_build_object('results',results);
end
$$;

revoke all on function finance.auto_finalize_bank_expense_vouchers(uuid,text,uuid) from public,anon,authenticated;
revoke all on function finance.trigger_auto_finalize_bank_expense_vouchers() from public,anon,authenticated;
revoke all on function finance.refresh_bank_expense_vouchers_for_transactions(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function finance.auto_finalize_bank_expense_vouchers(uuid,text,uuid) to service_role;
grant execute on function finance.trigger_auto_finalize_bank_expense_vouchers() to service_role;
grant execute on function finance.refresh_bank_expense_vouchers_for_transactions(uuid,uuid,uuid[]) to service_role;
