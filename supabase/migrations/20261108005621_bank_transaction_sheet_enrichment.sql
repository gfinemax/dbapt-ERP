-- 기존 은행거래 ID를 유지하면서 Google 시트의 분류 근거와 누락 거래만 증분 반영한다.
-- 같은 시트는 원본 행 번호로 멱등 처리하고, 신규 거래도 원본 출처를 변경할 수 없게 보존한다.

create table if not exists finance.bank_transaction_sheet_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  bank_account_id uuid not null references finance.bank_accounts(id) on delete restrict,
  source_document_id text not null,
  source_sheet text not null,
  source_hash text not null,
  source_row_count integer not null check (source_row_count > 0),
  matched_count integer not null check (matched_count >= 0),
  inserted_count integer not null check (inserted_count >= 0),
  source_deposit_total numeric(14,0) not null check (source_deposit_total >= 0),
  source_withdrawal_total numeric(14,0) not null check (source_withdrawal_total >= 0),
  reason text not null,
  imported_by uuid not null references auth.users(id) on delete restrict,
  imported_at timestamptz not null default now(),
  unique (organization_id,bank_account_id,source_document_id,source_sheet,source_hash),
  check (matched_count + inserted_count = source_row_count)
);

create table if not exists finance.bank_transaction_sheet_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references finance.bank_transaction_sheet_import_batches(id) on delete restrict,
  source_row integer not null check (source_row > 1),
  bank_transaction_id uuid not null references finance.bank_transactions(id) on delete restrict,
  operation text not null check (operation in ('MATCHED','INSERTED')),
  match_basis text not null check (match_basis in ('EXACT','DATE_ONLY_CONFIRMED','NEW')),
  account_category text,
  source_payload jsonb not null,
  source_payload_hash text not null,
  created_at timestamptz not null default now(),
  unique (batch_id,source_row),
  unique (batch_id,bank_transaction_id)
);

create index if not exists bank_transaction_sheet_import_batches_account_idx
  on finance.bank_transaction_sheet_import_batches(organization_id,bank_account_id,imported_at desc);
create index if not exists bank_transaction_sheet_import_batches_bank_account_fk_idx
  on finance.bank_transaction_sheet_import_batches(bank_account_id);
create index if not exists bank_transaction_sheet_import_batches_imported_by_fk_idx
  on finance.bank_transaction_sheet_import_batches(imported_by);
create index if not exists bank_transaction_sheet_import_rows_transaction_idx
  on finance.bank_transaction_sheet_import_rows(bank_transaction_id);

alter table finance.bank_transaction_sheet_import_batches enable row level security;
alter table finance.bank_transaction_sheet_import_rows enable row level security;
revoke all on finance.bank_transaction_sheet_import_batches,
  finance.bank_transaction_sheet_import_rows from public,anon,authenticated;
grant select,insert on finance.bank_transaction_sheet_import_batches,
  finance.bank_transaction_sheet_import_rows to service_role;

drop policy if exists bank_transaction_sheet_import_batches_server
  on finance.bank_transaction_sheet_import_batches;
create policy bank_transaction_sheet_import_batches_server
  on finance.bank_transaction_sheet_import_batches for all to service_role
  using (true) with check (true);
drop policy if exists bank_transaction_sheet_import_rows_server
  on finance.bank_transaction_sheet_import_rows;
create policy bank_transaction_sheet_import_rows_server
  on finance.bank_transaction_sheet_import_rows for all to service_role
  using (true) with check (true);

create or replace function finance.apply_bank_transaction_sheet_enrichment(
  p_org uuid,
  p_actor uuid,
  p_bank_account_id uuid,
  p_expected_current_count integer,
  p_source_document_id text,
  p_source_sheet text,
  p_reason text,
  p_rows jsonb
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor finance.reimbursement_members;
  batch_id uuid;
  existing_batch finance.bank_transaction_sheet_import_batches;
  item jsonb;
  input_hash text:=encode(extensions.digest(convert_to(p_rows::text,'UTF8'),'sha256'),'hex');
  source_count integer;
  current_count integer;
  matched_count integer:=0;
  inserted_count integer:=0;
  deposit_total numeric:=0;
  withdrawal_total numeric:=0;
  deposit_value numeric;
  withdrawal_value numeric;
  source_row integer;
  matched_id uuid;
  transaction_id uuid;
  transaction_date date;
  transaction_time time;
  transaction_at timestamptz;
  source_payload jsonb;
  category_value text;
  match_basis text;
  existing_transaction finance.bank_transactions;
begin
  actor:=finance.workflow_actor(p_org,p_actor);
  if not (actor.permissions && array['ADMIN','CLOSE']) then
    raise exception '은행 원장 증분 보강은 관리자 또는 마감 담당자만 할 수 있습니다.';
  end if;
  if length(trim(coalesce(p_source_document_id,'')))=0
    or length(trim(coalesce(p_source_sheet,'')))=0
    or length(trim(coalesce(p_reason,''))) not between 10 and 500 then
    raise exception '시트 원본과 반영 사유를 확인해주세요.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception '반영할 시트 거래는 1건 이상 2,000건 이하이어야 합니다.';
  end if;

  select * into existing_batch
  from finance.bank_transaction_sheet_import_batches
  where organization_id=p_org and bank_account_id=p_bank_account_id
    and source_document_id=trim(p_source_document_id)
    and source_sheet=trim(p_source_sheet) and source_hash=input_hash;
  if found then
    return jsonb_build_object(
      'batch_id',existing_batch.id,'source_row_count',existing_batch.source_row_count,
      'matched_count',existing_batch.matched_count,'inserted_count',existing_batch.inserted_count,
      'current_count',(select count(*) from finance.bank_transactions
        where organization_id=p_org and bank_account_id=p_bank_account_id and deleted_at is null),
      'already_applied',true
    );
  end if;

  perform 1 from finance.bank_accounts
  where id=p_bank_account_id and organization_id=p_org and deleted_at is null
  for update;
  if not found then raise exception '반영 대상 은행계좌를 찾을 수 없습니다.'; end if;

  select count(*) into current_count from finance.bank_transactions
  where organization_id=p_org and bank_account_id=p_bank_account_id and deleted_at is null;
  if current_count<>p_expected_current_count then
    raise exception '현재 거래 건수가 달라졌습니다. 미리보기를 새로 확인해주세요. 예상 %, 현재 %',
      p_expected_current_count,current_count;
  end if;
  source_count:=jsonb_array_length(p_rows);
  if source_count<>(select count(distinct (value->>'source_row')::integer)
    from jsonb_array_elements(p_rows)) then
    raise exception '시트 원본 행 번호가 중복되었습니다.';
  end if;
  if (select count(*) from jsonb_array_elements(p_rows)
      where nullif(value->>'matched_bank_transaction_id','') is not null)
    <>(select count(distinct value->>'matched_bank_transaction_id')
      from jsonb_array_elements(p_rows)
      where nullif(value->>'matched_bank_transaction_id','') is not null) then
    raise exception '하나의 기존 거래를 둘 이상의 시트 행에 연결할 수 없습니다.';
  end if;

  matched_count:=(select count(*) from jsonb_array_elements(p_rows)
    where nullif(value->>'matched_bank_transaction_id','') is not null);
  inserted_count:=source_count-matched_count;
  select coalesce(sum(coalesce((value->>'deposit_amount')::numeric,0)),0),
    coalesce(sum(coalesce((value->>'withdrawal_amount')::numeric,0)),0)
  into deposit_total,withdrawal_total
  from jsonb_array_elements(p_rows);
  batch_id:=gen_random_uuid();
  insert into finance.bank_transaction_sheet_import_batches(
    id,organization_id,bank_account_id,source_document_id,source_sheet,source_hash,
    source_row_count,matched_count,inserted_count,source_deposit_total,
    source_withdrawal_total,reason,imported_by
  ) values(
    batch_id,p_org,p_bank_account_id,trim(p_source_document_id),trim(p_source_sheet),input_hash,
    source_count,matched_count,inserted_count,deposit_total,withdrawal_total,trim(p_reason),p_actor
  );
  matched_count:=0;
  inserted_count:=0;
  deposit_total:=0;
  withdrawal_total:=0;

  for item in select value from jsonb_array_elements(p_rows) loop
    source_row:=(item->>'source_row')::integer;
    transaction_date:=(item->>'transaction_date')::date;
    transaction_time:=nullif(item->>'transaction_time','')::time;
    deposit_value:=coalesce((item->>'deposit_amount')::numeric,0);
    withdrawal_value:=coalesce((item->>'withdrawal_amount')::numeric,0);
    matched_id:=nullif(item->>'matched_bank_transaction_id','')::uuid;
    match_basis:=coalesce(nullif(item->>'match_basis',''),case when matched_id is null then 'NEW' else 'EXACT' end);
    category_value:=nullif(trim(coalesce(item->>'account_category','')),'');
    source_payload:=coalesce(item->'source_payload','{}'::jsonb)
      || jsonb_build_object(
        'source_document_id',trim(p_source_document_id),'source_sheet',trim(p_source_sheet),
        'source_row',source_row,'transaction_time_precision',
        case when transaction_time is null then 'DATE' else 'SECOND' end
      );
    if source_row<=1 or coalesce(item->>'description','')=''
      or deposit_value<0 or withdrawal_value<0
      or ((deposit_value>0)=(withdrawal_value>0))
      or match_basis not in ('EXACT','DATE_ONLY_CONFIRMED','NEW')
      or (matched_id is null)<>(match_basis='NEW') then
      raise exception '시트 %행의 필수값, 입출금 방향 또는 연결 기준을 확인해주세요.',source_row;
    end if;
    transaction_at:=(transaction_date+coalesce(transaction_time,'00:00:00'::time)) at time zone 'Asia/Seoul';
    deposit_total:=deposit_total+deposit_value;
    withdrawal_total:=withdrawal_total+withdrawal_value;

    if matched_id is not null then
      select * into existing_transaction from finance.bank_transactions
      where id=matched_id and organization_id=p_org and bank_account_id=p_bank_account_id
        and deleted_at is null for update;
      if not found
        or (existing_transaction.transacted_at at time zone 'Asia/Seoul')::date<>transaction_date
        or existing_transaction.deposit_amount<>deposit_value
        or existing_transaction.withdrawal_amount<>withdrawal_value
        or (transaction_time is not null and
          (existing_transaction.transacted_at at time zone 'Asia/Seoul')::time(0)<>transaction_time::time(0)) then
        raise exception '시트 %행과 연결한 기존 거래의 날짜·시간·금액이 일치하지 않습니다.',source_row;
      end if;
      transaction_id:=matched_id;
      matched_count:=matched_count+1;
      if category_value is not null and existing_transaction.confirmed_account_subject_id is null then
        update finance.bank_transactions set
          recommended_account_subject_id=null,
          recommended_account_subject_name=category_value,
          classification_status='RECOMMENDED',
          match_status='신규후보',
          recommendation_reason='구글시트 항목구분: '||category_value
        where id=transaction_id;
      end if;
    else
      insert into finance.bank_transactions(
        organization_id,bank_account_id,transacted_at,transaction_kind,description,
        deposit_amount,withdrawal_amount,balance_amount,counterparty,branch_name,
        uploaded_major_category,uploaded_account_title,recommended_account_subject_id,
        recommended_account_subject_name,match_status,raw_payload,memo,bank_transaction_uid,
        classification_status,recommendation_reason,source_system,source_transaction_id,
        source_payload_hash,source_readonly,source_imported_at
      ) values(
        p_org,p_bank_account_id,transaction_at,
        case when deposit_value>0 then '입금' else '출금' end,item->>'description',
        deposit_value,withdrawal_value,null,null,null,category_value,null,null,category_value,
        case when category_value is null then '미분류' else '신규후보' end,
        source_payload,nullif(item->>'memo',''),
        'SHEET:'||trim(p_source_document_id)||':'||trim(p_source_sheet)||':'||source_row::text,
        case when category_value is null then 'UNREVIEWED' else 'RECOMMENDED' end,
        case when category_value is null then null else '구글시트 항목구분: '||category_value end,
        'google-sheet',trim(p_source_document_id)||':'||trim(p_source_sheet)||':'||source_row::text,
        encode(extensions.digest(convert_to(source_payload::text,'UTF8'),'sha256'),'hex'),true,clock_timestamp()
      ) returning id into transaction_id;
      inserted_count:=inserted_count+1;
    end if;

    insert into finance.bank_transaction_sheet_import_rows(
      batch_id,source_row,bank_transaction_id,operation,match_basis,account_category,
      source_payload,source_payload_hash
    ) values(
      batch_id,source_row,transaction_id,
      case when matched_id is null then 'INSERTED' else 'MATCHED' end,
      match_basis,category_value,source_payload,
      encode(extensions.digest(convert_to(source_payload::text,'UTF8'),'sha256'),'hex')
    );
  end loop;

  if matched_count+inserted_count<>source_count then
    raise exception '시트 행 반영 건수가 일치하지 않습니다.';
  end if;
  insert into audit.audit_logs(
    organization_id,actor_user_id,action,entity_schema,entity_table,entity_id,after_data
  ) values(
    p_org,p_actor,'BANK_SHEET_ENRICHED','finance','bank_transaction_sheet_import_batches',batch_id::text,
    jsonb_build_object(
      'bank_account_id',p_bank_account_id,'source_document_id',trim(p_source_document_id),
      'source_sheet',trim(p_source_sheet),'source_row_count',source_count,
      'matched_count',matched_count,'inserted_count',inserted_count,
      'source_deposit_total',deposit_total,'source_withdrawal_total',withdrawal_total,
      'reason',trim(p_reason)
    )
  );
  return jsonb_build_object(
    'batch_id',batch_id,'source_row_count',source_count,'matched_count',matched_count,
    'inserted_count',inserted_count,'current_count',current_count+inserted_count,
    'source_deposit_total',deposit_total,'source_withdrawal_total',withdrawal_total,
    'already_applied',false
  );
end
$$;

revoke all on function finance.apply_bank_transaction_sheet_enrichment(
  uuid,uuid,uuid,integer,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function finance.apply_bank_transaction_sheet_enrichment(
  uuid,uuid,uuid,integer,text,text,text,jsonb
) to service_role;

drop trigger if exists normalize_ledger_bank_auth_actor on audit.audit_logs;
create trigger normalize_ledger_bank_auth_actor
before insert on audit.audit_logs
for each row
when (new.action in (
  'LEDGER_BANK_BACKFILL_SYNC','LEDGER_BANK_ACCOUNT_MAP','LEDGER_ACCOUNT_SUBJECTS_SYNC',
  'BANK_LEDGER_REPLACED','BANK_REPLACEMENTS_REVERTED_TO_METADATA','BANK_SHEET_ENRICHED'
))
execute function audit.normalize_ledger_bank_auth_actor();
