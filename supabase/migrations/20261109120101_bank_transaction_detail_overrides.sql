-- 은행·Ledger 원본은 유지하고 목록의 거래내역 표시값만 감사 가능한 이력으로 보정한다.
create table if not exists finance.bank_transaction_detail_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  bank_transaction_id uuid not null references finance.bank_transactions(id) on delete restrict,
  field_name text not null check (field_name in ('UPLOADED_CATEGORY','UPLOADED_ACCOUNT_TITLE','MEMO','BRANCH_NAME')),
  previous_value text not null default '',
  value text not null,
  reason text not null check (length(trim(reason)) between 2 and 500),
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_label text not null,
  created_at timestamptz not null default now()
);

create index if not exists bank_transaction_detail_overrides_lookup_idx
  on finance.bank_transaction_detail_overrides(organization_id,bank_transaction_id,field_name,created_at desc,id desc);
create index if not exists bank_transaction_detail_overrides_actor_idx
  on finance.bank_transaction_detail_overrides(actor_id);

alter table finance.bank_transaction_detail_overrides enable row level security;
revoke all on finance.bank_transaction_detail_overrides from public,anon,authenticated;
grant select,insert on finance.bank_transaction_detail_overrides to service_role;
drop policy if exists bank_transaction_detail_overrides_server
  on finance.bank_transaction_detail_overrides;
create policy bank_transaction_detail_overrides_server
  on finance.bank_transaction_detail_overrides for all to service_role
  using (true) with check (true);

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
    raise exception '수정할 거래내역 항목을 확인해줘.';
  end if;
  if (select count(*) from jsonb_object_keys(p_fields)) not between 1 and 4
    or exists (
      select 1 from jsonb_object_keys(p_fields) as field_keys(field_key)
      where field_key not in ('UPLOADED_CATEGORY','UPLOADED_ACCOUNT_TITLE','MEMO','BRANCH_NAME')
    ) then
    raise exception '수정할 거래내역 항목을 확인해줘.';
  end if;

  select * into transaction_row
  from finance.bank_transactions
  where id=p_transaction_id and organization_id=p_org and deleted_at is null
  for update;
  if not found then raise exception '수정할 은행거래를 찾을 수 없어.'; end if;

  for field_record in select key,value from jsonb_each_text(p_fields) loop
    next_value := trim(coalesce(field_record.value,''));
    if length(next_value) > case when field_record.key='MEMO' then 2000 else 200 end then
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

notify pgrst, 'reload schema';
