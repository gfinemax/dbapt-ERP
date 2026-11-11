-- 목록의 거래내역은 단일 ERP 표시값으로 관리하고 은행·Ledger·업로드 원문은 그대로 유지한다.
alter table finance.bank_transaction_detail_overrides
  drop constraint if exists bank_transaction_detail_overrides_field_name_check;
alter table finance.bank_transaction_detail_overrides
  add constraint bank_transaction_detail_overrides_field_name_check
  check (field_name in ('TRANSACTION_DETAIL','UPLOADED_CATEGORY','UPLOADED_ACCOUNT_TITLE','MEMO','BRANCH_NAME'));

create or replace function finance.bank_transaction_effective_detail(
  p_org uuid,
  p_transaction_id uuid
)
returns text
language sql
stable
security invoker
set search_path=''
as $$
  select coalesce(
    (
      select detail_override.value
      from finance.bank_transaction_detail_overrides detail_override
      where detail_override.organization_id=p_org
        and detail_override.bank_transaction_id=p_transaction_id
        and detail_override.field_name='TRANSACTION_DETAIL'
      order by detail_override.created_at desc,detail_override.id desc
      limit 1
    ),
    (
      select legacy_memo.value
      from finance.bank_transaction_detail_overrides legacy_memo
      where legacy_memo.organization_id=p_org
        and legacy_memo.bank_transaction_id=p_transaction_id
        and legacy_memo.field_name='MEMO'
      order by legacy_memo.created_at desc,legacy_memo.id desc
      limit 1
    ),
    (
      select sheet_memo.source_value
      from finance.bank_transaction_sheet_field_overrides sheet_memo
      where sheet_memo.organization_id=p_org
        and sheet_memo.bank_transaction_id=p_transaction_id
        and sheet_memo.field_name='MEMO'
        and sheet_memo.apply_status='APPLIED'
      order by sheet_memo.imported_at desc,sheet_memo.id desc
      limit 1
    ),
    nullif(trim(transaction_row.memo),''),
    (
      select legacy_account.value
      from finance.bank_transaction_detail_overrides legacy_account
      where legacy_account.organization_id=p_org
        and legacy_account.bank_transaction_id=p_transaction_id
        and legacy_account.field_name='UPLOADED_ACCOUNT_TITLE'
      order by legacy_account.created_at desc,legacy_account.id desc
      limit 1
    ),
    nullif(trim(transaction_row.uploaded_account_title),''),
    nullif(trim(transaction_row.description),''),
    ''
  )
  from finance.bank_transactions transaction_row
  where transaction_row.organization_id=p_org
    and transaction_row.id=p_transaction_id
    and transaction_row.deleted_at is null
$$;

revoke all on function finance.bank_transaction_effective_detail(uuid,uuid)
  from public,anon,authenticated;
grant execute on function finance.bank_transaction_effective_detail(uuid,uuid)
  to service_role;

create or replace function finance.search_bank_transaction_detail_ids(
  p_org uuid,
  p_query text
)
returns table(bank_transaction_id uuid)
language sql
stable
security invoker
set search_path=''
as $$
  select latest.bank_transaction_id
  from (
    select distinct on (detail_override.bank_transaction_id)
      detail_override.bank_transaction_id,
      detail_override.value
    from finance.bank_transaction_detail_overrides detail_override
    where detail_override.organization_id=p_org
      and detail_override.field_name='TRANSACTION_DETAIL'
    order by detail_override.bank_transaction_id,detail_override.created_at desc,detail_override.id desc
  ) latest
  where nullif(trim(p_query),'') is not null
    and latest.value ilike '%'||trim(p_query)||'%'
$$;

revoke all on function finance.search_bank_transaction_detail_ids(uuid,text)
  from public,anon,authenticated;
grant execute on function finance.search_bank_transaction_detail_ids(uuid,text)
  to service_role;

create or replace function finance.save_bank_transaction_detail_overrides(
  p_org uuid,
  p_actor uuid,
  p_transaction_id uuid,
  p_fields jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor finance.reimbursement_members;
  transaction_row finance.bank_transactions;
  field_record record;
  current_value text;
  next_value text;
  before_values jsonb := '{}'::jsonb;
  after_values jsonb := '{}'::jsonb;
  changed_count integer := 0;
begin
  actor := finance.workflow_actor(p_org,p_actor,'ADMIN');
  if length(trim(coalesce(p_reason,''))) not between 2 and 500 then
    raise exception '거래내역 수정 사유를 2자 이상 입력해줘.';
  end if;
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception '수정할 거래내역을 확인해줘.';
  end if;
  if (select count(*) from jsonb_object_keys(p_fields)) not between 1 and 5
    or exists (
      select 1 from jsonb_object_keys(p_fields) as field_keys(field_key)
      where field_key not in ('TRANSACTION_DETAIL','UPLOADED_CATEGORY','UPLOADED_ACCOUNT_TITLE','MEMO','BRANCH_NAME')
    ) then
    raise exception '수정할 거래내역을 확인해줘.';
  end if;

  select * into transaction_row
  from finance.bank_transactions
  where id=p_transaction_id and organization_id=p_org and deleted_at is null
  for update;
  if not found then raise exception '수정할 은행거래를 찾을 수 없어.'; end if;

  for field_record in select key,value from jsonb_each_text(p_fields) loop
    next_value := trim(coalesce(field_record.value,''));
    if field_record.key='TRANSACTION_DETAIL' and next_value='' then
      raise exception '거래내역을 입력해줘.';
    end if;
    if length(next_value) > (case when field_record.key in ('MEMO','TRANSACTION_DETAIL') then 2000 else 200 end) then
      raise exception '거래내역 입력 길이를 확인해줘.';
    end if;

    select override_row.value into current_value
    from finance.bank_transaction_detail_overrides override_row
    where override_row.organization_id=p_org
      and override_row.bank_transaction_id=p_transaction_id
      and override_row.field_name=field_record.key
    order by override_row.created_at desc,override_row.id desc
    limit 1;

    if not found then
      current_value := case field_record.key
        when 'TRANSACTION_DETAIL' then finance.bank_transaction_effective_detail(p_org,p_transaction_id)
        when 'UPLOADED_CATEGORY' then coalesce((
          select sheet_override.source_value
          from finance.bank_transaction_sheet_field_overrides sheet_override
          where sheet_override.organization_id=p_org
            and sheet_override.bank_transaction_id=p_transaction_id
            and sheet_override.field_name='ACCOUNT_CATEGORY'
            and sheet_override.apply_status='APPLIED'
          order by sheet_override.imported_at desc,sheet_override.id desc
          limit 1
        ),transaction_row.uploaded_major_category,'')
        when 'UPLOADED_ACCOUNT_TITLE' then coalesce(transaction_row.uploaded_account_title,'')
        when 'MEMO' then coalesce((
          select sheet_override.source_value
          from finance.bank_transaction_sheet_field_overrides sheet_override
          where sheet_override.organization_id=p_org
            and sheet_override.bank_transaction_id=p_transaction_id
            and sheet_override.field_name='MEMO'
            and sheet_override.apply_status='APPLIED'
          order by sheet_override.imported_at desc,sheet_override.id desc
          limit 1
        ),transaction_row.memo,'')
        when 'BRANCH_NAME' then coalesce(transaction_row.branch_name,'')
      end;
    end if;

    before_values := before_values || jsonb_build_object(field_record.key,current_value);
    after_values := after_values || jsonb_build_object(field_record.key,next_value);
    if next_value is distinct from current_value then
      insert into finance.bank_transaction_detail_overrides(
        organization_id,bank_transaction_id,field_name,previous_value,value,reason,actor_id,actor_label
      ) values (
        p_org,p_transaction_id,field_record.key,current_value,next_value,trim(p_reason),p_actor,actor.display_name
      );
      changed_count := changed_count+1;
    end if;
  end loop;

  if changed_count>0 then
    insert into audit.audit_logs(
      organization_id,actor_user_id,action,entity_schema,entity_table,entity_id,before_data,after_data
    ) values (
      p_org,p_actor,'BANK_TRANSACTION_DETAIL_OVERRIDE','finance','bank_transactions',p_transaction_id::text,
      before_values,after_values || jsonb_build_object('reason',trim(p_reason),'changed_count',changed_count)
    );
  end if;

  return jsonb_build_object(
    'transaction_id',p_transaction_id,
    'changed_count',changed_count,
    'values',after_values
  );
end
$$;

revoke all on function finance.save_bank_transaction_detail_overrides(uuid,uuid,uuid,jsonb,text)
  from public,anon,authenticated;
grant execute on function finance.save_bank_transaction_detail_overrides(uuid,uuid,uuid,jsonb,text)
  to service_role;

create or replace view finance.financial_activity_feed
with (security_invoker=true) as
select
  b.id::text as activity_id,
  'BANK_TRANSACTION'::text as origin_type,
  b.id::text as source_record_id,
  b.organization_id,
  b.bank_account_id,
  b.transacted_at,
  b.transaction_kind,
  b.description,
  coalesce(b.memo,'') as memo,
  b.deposit_amount,
  b.withdrawal_amount,
  greatest(b.deposit_amount,b.withdrawal_amount)::numeric(16,0) as activity_amount,
  b.balance_amount,
  coalesce(b.counterparty,'') as counterparty,
  coalesce(b.branch_name,'') as branch_name,
  coalesce(b.uploaded_major_category,'') as uploaded_major_category,
  coalesce(b.uploaded_account_title,'') as uploaded_account_title,
  b.recommended_account_subject_id,
  b.recommended_account_subject_name,
  b.confirmed_account_subject_id,
  b.classification_status,
  coalesce(b.classification_note,'') as classification_note,
  b.recommendation_reason,
  'BANK_CASH'::text as cash_impact,
  null::text as source_kind,
  null::text as accounting_treatment,
  null::text as recognition_status,
  0::numeric(16,0) as actual_fund_amount,
  0::numeric(16,0) as loss_amount,
  null::text as source_root_record_id,
  null::text as linkage_status,
  '{}'::jsonb as source_payload,
  finance.bank_transaction_effective_detail(b.organization_id,b.id) as transaction_detail
from finance.bank_transactions b
where b.deleted_at is null
union all
select
  ('external:'||x.id::text) as activity_id,
  'EXTERNAL_RECOGNITION'::text as origin_type,
  x.id::text as source_record_id,
  x.organization_id,
  null::uuid as bank_account_id,
  (x.recognized_on::timestamp at time zone 'Asia/Seoul') as transacted_at,
  '외부납입'::text as transaction_kind,
  case x.source_kind
    when 'dongil_fixed_certificate' then '동일건설 정액 필증 3천만원'
    when 'application_certificate' then '가입신청필증 외부납입 인정'
    when 'dongil_other' then '동일건설 기타 외부납입 인정'
    when 'trust_account' then '신탁사 보관 수납'
    else '기타 외부납입 인정'
  end as description,
  x.reason as memo,
  0::numeric(16,0) as deposit_amount,
  0::numeric(16,0) as withdrawal_amount,
  x.recognized_amount::numeric(16,0) as activity_amount,
  null::numeric(14,0) as balance_amount,
  coalesce(x.source_payload->>'member_name_snapshot','') as counterparty,
  ''::text as branch_name,
  '외부납입 인정'::text as uploaded_major_category,
  case x.accounting_treatment
    when 'confirmed_loss' then '확정결손'
    when 'trust_receipt' then '신탁사 보관 수납'
    else '회계 처리 검토 필요'
  end as uploaded_account_title,
  null::uuid as recommended_account_subject_id,
  null::text as recommended_account_subject_name,
  null::uuid as confirmed_account_subject_id,
  case
    when x.status='CANCELLED' then 'EXCLUDED'
    when x.accounting_treatment='pending_review' then 'DEFERRED'
    else 'CONFIRMED'
  end as classification_status,
  coalesce(x.linkage_issue_detail,'') as classification_note,
  null::text as recommendation_reason,
  case x.accounting_treatment
    when 'trust_receipt' then 'TRUST_HELD'
    else 'NON_CASH_RECOGNITION'
  end as cash_impact,
  x.source_kind,
  x.accounting_treatment,
  x.status as recognition_status,
  x.actual_fund_amount,
  x.loss_amount,
  x.source_root_recognition_id as source_root_record_id,
  x.linkage_status,
  x.source_payload,
  coalesce(x.reason,'') as transaction_detail
from finance.collection_external_recognitions x;

revoke all on finance.financial_activity_feed from public,anon,authenticated;
grant select on finance.financial_activity_feed to service_role;

create or replace function finance.filtered_financial_activity_summary(
  p_org uuid,
  p_bank_account_id uuid default null,
  p_origin_type text default null,
  p_classification_status text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_query text default null,
  p_source_record_ids text[] default null,
  p_review_required boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  with filtered as (
    select f.*
    from finance.financial_activity_feed f
    where f.organization_id=p_org
      and (p_bank_account_id is null or f.bank_account_id=p_bank_account_id)
      and (p_origin_type is null or f.origin_type=p_origin_type)
      and (p_classification_status is null or f.classification_status=p_classification_status)
      and (p_date_from is null or f.transacted_at >= (p_date_from::timestamp at time zone 'Asia/Seoul'))
      and (p_date_to is null or f.transacted_at < ((p_date_to + 1)::timestamp at time zone 'Asia/Seoul'))
      and (
        coalesce(p_review_required,false)
        or p_source_record_ids is null
        or (f.origin_type='BANK_TRANSACTION' and f.source_record_id=any(p_source_record_ids))
      )
      and (
        not coalesce(p_review_required,false)
        or f.classification_status in ('UNREVIEWED','DEFERRED')
        or (
          f.origin_type='BANK_TRANSACTION'
          and p_source_record_ids is not null
          and f.source_record_id=any(p_source_record_ids)
        )
      )
      and (
        nullif(trim(p_query),'') is null
        or coalesce(f.transaction_detail,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.description,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.counterparty,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.memo,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.uploaded_major_category,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.uploaded_account_title,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.branch_name,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.classification_note,'') ilike '%'||trim(p_query)||'%'
        or f.source_record_id ilike '%'||trim(p_query)||'%'
      )
  )
  select jsonb_build_object(
    'result_count',count(*),
    'bank_deposit_total',coalesce(sum(deposit_amount) filter (where origin_type='BANK_TRANSACTION'),0),
    'bank_withdrawal_total',coalesce(sum(withdrawal_amount) filter (where origin_type='BANK_TRANSACTION'),0),
    'external_recognition_count',count(*) filter (
      where origin_type='EXTERNAL_RECOGNITION' and recognition_status='ACTIVE'
    ),
    'external_recognition_total',coalesce(sum(activity_amount) filter (
      where origin_type='EXTERNAL_RECOGNITION' and recognition_status='ACTIVE'
    ),0)
  )
  from filtered
$$;

revoke all on function finance.filtered_financial_activity_summary(uuid,uuid,text,text,date,date,text,text[],boolean)
  from public,anon,authenticated;
grant execute on function finance.filtered_financial_activity_summary(uuid,uuid,text,text,date,date,text,text[],boolean)
  to service_role;

notify pgrst, 'reload schema';
