-- 구글시트의 계좌구분은 신규 계좌/거래 원본이 아니라 기존 거래를 찾기 위한 키다.
-- 2026-11-08에 원장 교체로 반영한 3개 계좌를 기존 Ledger 원본으로 복구하고,
-- 시트의 항목구분만 검토 가능한 계정과목 추천 근거로 보존한다.

create table if not exists finance.bank_transaction_metadata_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  bank_transaction_id uuid not null references finance.bank_transactions(id) on delete restrict,
  replacement_batch_id uuid not null references finance.bank_transaction_replacement_batches(id) on delete restrict,
  source_document_id text not null,
  source_sheet text not null,
  source_row integer not null check (source_row > 0),
  field_name text not null check (field_name in ('ACCOUNT_CATEGORY')),
  source_value text,
  match_status text not null check (match_status in ('APPLIED','REVIEW_REQUIRED','NO_VALUE')),
  match_key jsonb not null,
  source_payload jsonb not null,
  imported_by uuid not null references auth.users(id) on delete restrict,
  imported_at timestamptz not null default now(),
  unique (organization_id,source_document_id,source_sheet,source_row,field_name)
);

create index if not exists bank_transaction_metadata_import_transaction_idx
  on finance.bank_transaction_metadata_imports(organization_id,bank_transaction_id,imported_at desc);
create index if not exists bank_transaction_metadata_import_review_idx
  on finance.bank_transaction_metadata_imports(organization_id,match_status,imported_at desc);
create index if not exists bank_transaction_metadata_import_batch_idx
  on finance.bank_transaction_metadata_imports(organization_id,replacement_batch_id);
create index if not exists bank_transaction_metadata_import_actor_idx
  on finance.bank_transaction_metadata_imports(imported_by);

alter table finance.bank_transaction_metadata_imports enable row level security;
revoke all on finance.bank_transaction_metadata_imports from public,anon,authenticated;
grant select,insert on finance.bank_transaction_metadata_imports to service_role;
drop policy if exists bank_transaction_metadata_imports_server
  on finance.bank_transaction_metadata_imports;
create policy bank_transaction_metadata_imports_server
  on finance.bank_transaction_metadata_imports for all to service_role
  using (true) with check (true);

create or replace function finance.guard_ledger_imported_bank_transaction() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  replacement_transition boolean;
  rollback_transition boolean;
begin
  if old.source_readonly then
    if tg_op='DELETE' then
      raise exception 'Ledger에서 이관한 통장 원본은 삭제할 수 없습니다.';
    end if;
    replacement_transition := old.deleted_at is null and new.deleted_at is not null
      and old.superseded_by_batch_id is null and new.superseded_by_batch_id is not null;
    rollback_transition := current_setting('app.bank_replacement_rollback',true)='on'
      and old.deleted_at is not null and new.deleted_at is null
      and old.superseded_by_batch_id is not null and new.superseded_by_batch_id is null;
    if (new.deleted_at is distinct from old.deleted_at
        or new.superseded_by_batch_id is distinct from old.superseded_by_batch_id)
      and not replacement_transition and not rollback_transition then
      raise exception 'Ledger 원본 제외 또는 복구는 감사되는 원장 교체 절차에서만 처리할 수 있습니다.';
    end if;
    if new.organization_id is distinct from old.organization_id
      or new.bank_account_id is distinct from old.bank_account_id
      or new.transacted_at is distinct from old.transacted_at
      or new.transaction_kind is distinct from old.transaction_kind
      or new.description is distinct from old.description
      or new.deposit_amount is distinct from old.deposit_amount
      or new.withdrawal_amount is distinct from old.withdrawal_amount
      or new.balance_amount is distinct from old.balance_amount
      or new.counterparty is distinct from old.counterparty
      or new.branch_name is distinct from old.branch_name
      or new.uploaded_major_category is distinct from old.uploaded_major_category
      or new.uploaded_account_title is distinct from old.uploaded_account_title
      or new.memo is distinct from old.memo
      or new.bank_transaction_uid is distinct from old.bank_transaction_uid
      or new.raw_payload is distinct from old.raw_payload
      or new.source_system is distinct from old.source_system
      or new.source_transaction_id is distinct from old.source_transaction_id
      or new.source_payload_hash is distinct from old.source_payload_hash
      or new.source_readonly is distinct from old.source_readonly
      or new.source_imported_at is distinct from old.source_imported_at
      or new.replacement_batch_id is distinct from old.replacement_batch_id then
      raise exception 'Ledger에서 이관한 통장 원본 필드는 변경할 수 없습니다.';
    end if;
  end if;
  return coalesce(new,old);
end $$;

create or replace function finance.preserve_superseded_ledger_bank_source() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.import_status='SUPERSEDED'
    and coalesce(current_setting('app.bank_replacement_rollback',true),'')<>'on' then
    new.import_status:=old.import_status;
    new.issue_detail:=old.issue_detail;
    new.bank_transaction_id:=old.bank_transaction_id;
    new.imported_at:=old.imported_at;
  end if;
  return new;
end $$;

create or replace function finance.revert_bank_replacements_to_metadata_classification(
  p_org uuid,
  p_actor uuid,
  p_replacement_batch_ids uuid[],
  p_source_document_id text,
  p_source_sheet text,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor finance.reimbursement_members;
  batch_row finance.bank_transaction_replacement_batches;
  batch_id uuid;
  current_count integer;
  original_count integer;
  imported_count integer:=0;
  batch_imported_count integer:=0;
  restored_count integer:=0;
  review_count integer:=0;
  no_value_count integer:=0;
begin
  actor:=finance.workflow_actor(p_org,p_actor);
  if not (actor.permissions && array['ADMIN','CLOSE']) then
    raise exception '은행 원장 보정은 관리자 또는 마감 담당자만 할 수 있습니다.';
  end if;
  if coalesce(array_length(p_replacement_batch_ids,1),0)=0 then
    raise exception '되돌릴 원장 교체 배치를 선택해주세요.';
  end if;
  if length(trim(coalesce(p_source_document_id,'')))=0
    or length(trim(coalesce(p_source_sheet,'')))=0
    or length(trim(coalesce(p_reason,''))) not between 10 and 500 then
    raise exception '분류 원본과 보정 사유를 확인해주세요.';
  end if;

  perform set_config('app.bank_replacement_rollback','on',true);

  foreach batch_id in array p_replacement_batch_ids loop
    select * into batch_row
    from finance.bank_transaction_replacement_batches
    where id=batch_id and organization_id=p_org
    for update;
    if not found then raise exception '원장 교체 배치를 찾을 수 없습니다: %',batch_id; end if;
    if batch_row.status='CANCELLED' then continue; end if;

    select count(*) into current_count
    from finance.bank_transactions
    where organization_id=p_org and replacement_batch_id=batch_id and deleted_at is null;
    select count(*) into original_count
    from finance.bank_transactions
    where organization_id=p_org and superseded_by_batch_id=batch_id and deleted_at is not null;
    if current_count<>batch_row.replacement_count or original_count<>batch_row.replaced_count then
      raise exception '교체 후 거래 상태가 달라 보정을 중단합니다: %',batch_id;
    end if;
    if not coalesce((finance.preview_ledger_bank_replacement(
      p_org,p_actor,batch_row.bank_account_id,batch_row.source_system
    )->>'ready')::boolean,false) then
      raise exception '후속 업무에 연결된 거래가 있어 보정을 중단합니다: %',batch_id;
    end if;

    insert into finance.bank_transaction_metadata_imports(
      organization_id,bank_transaction_id,replacement_batch_id,
      source_document_id,source_sheet,source_row,field_name,source_value,
      match_status,match_key,source_payload,imported_by
    )
    with new_base as (
      select n.*,
        coalesce(nullif(n.uploaded_major_category,''),nullif(n.raw_payload->>'항목구분','')) category_label,
        case when coalesce(n.raw_payload->>'원본행','')~'^[0-9]+$'
          then (n.raw_payload->>'원본행')::integer else 0 end source_row
      from finance.bank_transactions n
      where n.organization_id=p_org and n.replacement_batch_id=batch_id and n.deleted_at is null
    ), group_stats as (
      select bank_account_id,transacted_at,deposit_amount,withdrawal_amount,
        count(distinct coalesce(category_label,'')) category_variants
      from new_base
      group by bank_account_id,transacted_at,deposit_amount,withdrawal_amount
    ), new_ranked as (
      select n.*,
        row_number() over (
          partition by n.bank_account_id,n.transacted_at,n.deposit_amount,n.withdrawal_amount
          order by case when n.source_row>0 then n.source_row else 2147483647 end,n.id
        ) match_order,s.category_variants
      from new_base n
      join group_stats s using(bank_account_id,transacted_at,deposit_amount,withdrawal_amount)
    ), old_ranked as (
      select o.*,
        row_number() over (
          partition by o.bank_account_id,o.transacted_at,o.deposit_amount,o.withdrawal_amount
          order by case when coalesce(o.source_transaction_id,'')~'^[0-9]+$'
            then o.source_transaction_id::bigint else 9223372036854775807 end,o.id
        ) match_order
      from finance.bank_transactions o
      where o.organization_id=p_org and o.superseded_by_batch_id=batch_id and o.deleted_at is not null
    )
    select p_org,o.id,batch_id,trim(p_source_document_id),trim(p_source_sheet),n.source_row,
      'ACCOUNT_CATEGORY',n.category_label,
      case when n.category_label is null then 'NO_VALUE'
        when n.category_variants>1 then 'REVIEW_REQUIRED' else 'APPLIED' end,
      jsonb_build_object(
        'bank_account_id',n.bank_account_id,'transacted_at',n.transacted_at,
        'deposit_amount',n.deposit_amount,'withdrawal_amount',n.withdrawal_amount,
        'match_order',n.match_order
      ),n.raw_payload,p_actor
    from new_ranked n
    join old_ranked o on o.bank_account_id=n.bank_account_id
      and o.transacted_at=n.transacted_at
      and o.deposit_amount=n.deposit_amount
      and o.withdrawal_amount=n.withdrawal_amount
      and o.match_order=n.match_order
    where n.source_row>0
    on conflict(organization_id,source_document_id,source_sheet,source_row,field_name) do nothing;
    get diagnostics batch_imported_count=row_count;
    imported_count:=imported_count+batch_imported_count;
    restored_count:=restored_count+original_count;

    update finance.bank_transactions t set
      recommended_account_subject_id=null,
      recommended_account_subject_name=m.source_value,
      classification_status='RECOMMENDED',
      match_status='신규후보',
      recommendation_reason='구글시트 항목구분: '||m.source_value
    from finance.bank_transaction_metadata_imports m
    where m.organization_id=p_org and m.replacement_batch_id=batch_id
      and m.bank_transaction_id=t.id and m.match_status='APPLIED'
      and nullif(m.source_value,'') is not null
      and t.confirmed_account_subject_id is null;

    update finance.bank_transactions t set
      recommended_account_subject_id=null,
      recommended_account_subject_name=null,
      classification_status='DEFERRED',
      match_status='미분류',
      recommendation_reason='구글시트 중복 거래의 항목구분이 달라 수동 검토 필요'
    from finance.bank_transaction_metadata_imports m
    where m.organization_id=p_org and m.replacement_batch_id=batch_id
      and m.bank_transaction_id=t.id and m.match_status='REVIEW_REQUIRED'
      and t.confirmed_account_subject_id is null;

    select count(*) filter(where match_status='REVIEW_REQUIRED'),
      count(*) filter(where match_status='NO_VALUE')
    into current_count,original_count
    from finance.bank_transaction_metadata_imports
    where organization_id=p_org and replacement_batch_id=batch_id;
    review_count:=review_count+current_count;
    no_value_count:=no_value_count+original_count;

    update finance.bank_transactions set
      deleted_at=clock_timestamp(),superseded_by_batch_id=batch_id
    where organization_id=p_org and replacement_batch_id=batch_id and deleted_at is null;

    update finance.ledger_bank_transaction_sources set
      import_status='SUPERSEDED',
      issue_detail='항목구분 보정으로 원본 거래 ID를 복구하여 사용 제외',
      synced_at=clock_timestamp()
    where organization_id=p_org and source_system=batch_row.source_system
      and bank_transaction_id in (
        select id from finance.bank_transactions
        where organization_id=p_org and replacement_batch_id=batch_id
      ) and import_status='IMPORTED';

    update finance.bank_transactions set
      deleted_at=null,superseded_by_batch_id=null
    where organization_id=p_org and superseded_by_batch_id=batch_id and deleted_at is not null
      and replacement_batch_id is null;

    update finance.ledger_bank_transaction_sources set
      import_status='IMPORTED',issue_detail=null,synced_at=clock_timestamp()
    where organization_id=p_org and source_system=batch_row.source_system
      and bank_transaction_id in (
        select id from finance.bank_transactions
        where organization_id=p_org and deleted_at is null
          and bank_account_id=batch_row.bank_account_id
          and replacement_batch_id is null
      ) and import_status='SUPERSEDED';

    update finance.bank_transaction_replacement_batches set status='CANCELLED'
    where id=batch_id and organization_id=p_org;
  end loop;

  insert into audit.audit_logs(
    organization_id,actor_user_id,action,entity_schema,entity_table,entity_id,after_data
  ) values(
    p_org,p_actor,'BANK_REPLACEMENTS_REVERTED_TO_METADATA','finance',
    'bank_transaction_metadata_imports',p_source_document_id,
    jsonb_build_object(
      'replacement_batch_ids',p_replacement_batch_ids,
      'restored_transaction_count',restored_count,
      'metadata_row_count',imported_count,
      'review_required_count',review_count,
      'no_value_count',no_value_count,
      'source_sheet',p_source_sheet,
      'reason',trim(p_reason)
    )
  );

  return jsonb_build_object(
    'restored_transaction_count',restored_count,
    'metadata_row_count',imported_count,
    'review_required_count',review_count,
    'no_value_count',no_value_count
  );
end
$$;

revoke all on function finance.revert_bank_replacements_to_metadata_classification(
  uuid,uuid,uuid[],text,text,text
) from public,anon,authenticated;
grant execute on function finance.revert_bank_replacements_to_metadata_classification(
  uuid,uuid,uuid[],text,text,text
) to service_role;
