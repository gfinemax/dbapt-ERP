-- Ledger에서 잘못 이관된 은행 원장을 삭제하지 않고, 검증된 ERP 원장으로
-- 한 번에 교체한다. 기존 원본과 연결 이력은 감사 목적으로 그대로 보존한다.

create table finance.bank_transaction_replacement_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  bank_account_id uuid not null references finance.bank_accounts(id) on delete restrict,
  source_system text not null default 'dbapt-ledger',
  ledger_account_id text not null,
  status text not null default 'APPLIED' check (status in ('APPLIED','CANCELLED')),
  replaced_count integer not null check (replaced_count > 0),
  replacement_count integer not null check (replacement_count > 0),
  replaced_deposit_total numeric(18,0) not null default 0,
  replaced_withdrawal_total numeric(18,0) not null default 0,
  replacement_deposit_total numeric(18,0) not null default 0,
  replacement_withdrawal_total numeric(18,0) not null default 0,
  reason text not null check (length(trim(reason)) between 10 and 500),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{32}$'),
  applied_by uuid not null references auth.users(id) on delete restrict,
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id,id)
);

alter table finance.bank_transactions
  add column replacement_batch_id uuid references finance.bank_transaction_replacement_batches(id) on delete restrict,
  add column superseded_by_batch_id uuid references finance.bank_transaction_replacement_batches(id) on delete restrict;

create index bank_transaction_replacement_account_idx
  on finance.bank_transaction_replacement_batches(organization_id,bank_account_id,applied_at desc);
create index bank_transactions_replacement_batch_idx
  on finance.bank_transactions(replacement_batch_id) where replacement_batch_id is not null;
create index bank_transactions_superseded_batch_idx
  on finance.bank_transactions(superseded_by_batch_id) where superseded_by_batch_id is not null;

alter table finance.bank_transaction_replacement_batches enable row level security;
revoke all on finance.bank_transaction_replacement_batches from public,anon,authenticated;
grant select,insert,update on finance.bank_transaction_replacement_batches to service_role;
create policy bank_transaction_replacement_batches_server
  on finance.bank_transaction_replacement_batches for all to service_role
  using (true) with check (true);

alter table finance.ledger_bank_transaction_sources
  drop constraint if exists ledger_bank_transaction_sources_import_status_check;
alter table finance.ledger_bank_transaction_sources
  add constraint ledger_bank_transaction_sources_import_status_check
  check (import_status in ('PENDING_MAPPING','IMPORTED','INVALID','CONFLICT','SUPERSEDED'));

alter table finance.ledger_bank_transaction_sources
  drop constraint if exists ledger_bank_transaction_sources_check;
alter table finance.ledger_bank_transaction_sources
  add constraint ledger_bank_transaction_sources_state_check check (
    (import_status in ('IMPORTED','CONFLICT','SUPERSEDED') and bank_transaction_id is not null and imported_at is not null)
    or (import_status in ('PENDING_MAPPING','INVALID') and bank_transaction_id is null and imported_at is null)
  );

create or replace function finance.guard_ledger_imported_bank_transaction() returns trigger
language plpgsql security invoker set search_path='' as $$
declare replacement_transition boolean;
begin
  if old.source_readonly then
    if tg_op='DELETE' then
      raise exception 'Ledger에서 이관한 통장 원본은 삭제할 수 없습니다.';
    end if;
    replacement_transition := old.deleted_at is null and new.deleted_at is not null
      and old.superseded_by_batch_id is null and new.superseded_by_batch_id is not null;
    if (new.deleted_at is distinct from old.deleted_at
        or new.superseded_by_batch_id is distinct from old.superseded_by_batch_id)
      and not replacement_transition then
      raise exception 'Ledger 원본 제외는 감사되는 원장 교체 절차에서만 처리할 수 있습니다.';
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

create function finance.preview_ledger_bank_replacement(
  p_org uuid,p_actor uuid,p_bank_account_id uuid,p_source_system text default 'dbapt-ledger'
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  actor finance.reimbursement_members;
  target_ids uuid[];
  ledger_accounts text[];
  target_count integer:=0;
  deposit_total numeric:=0;
  withdrawal_total numeric:=0;
  first_at timestamptz;
  last_at timestamptz;
  expense_count integer:=0;
  voucher_count integer:=0;
  quick_count integer:=0;
  reimbursement_count integer:=0;
  small_expense_count integer:=0;
  payment_count integer:=0;
  transfer_count integer:=0;
  allocation_count integer:=0;
  refund_count integer:=0;
  trust_count integer:=0;
  feedback_count integer:=0;
  blocker_count integer:=0;
begin
  actor:=finance.workflow_actor(p_org,p_actor);
  if not (actor.permissions && array['READ','ADMIN','CLOSE','APPROVE','PAY']) then
    raise exception '은행 원장 교체 조회 권한이 필요합니다.';
  end if;
  if not exists(select 1 from finance.bank_accounts
    where organization_id=p_org and id=p_bank_account_id and deleted_at is null) then
    raise exception '사용 가능한 ERP 계좌를 선택해주세요.';
  end if;

  select coalesce(array_agg(t.id order by t.id),'{}'::uuid[]),
    coalesce(array_agg(distinct s.ledger_account_id),'{}'::text[]),
    count(*),coalesce(sum(t.deposit_amount),0),coalesce(sum(t.withdrawal_amount),0),
    min(t.transacted_at),max(t.transacted_at)
  into target_ids,ledger_accounts,target_count,deposit_total,withdrawal_total,first_at,last_at
  from finance.ledger_bank_transaction_sources s
  join finance.bank_transactions t on t.id=s.bank_transaction_id
  where s.organization_id=p_org and s.source_system=p_source_system
    and s.import_status='IMPORTED' and t.organization_id=p_org
    and t.bank_account_id=p_bank_account_id and t.deleted_at is null;

  if target_count>0 then
    select count(*) into expense_count from finance.expense_resolutions
      where bank_transaction_id=any(target_ids) and deleted_at is null;
    select count(*) into voucher_count from finance.vouchers
      where bank_transaction_id=any(target_ids) and deleted_at is null;
    select count(*) into quick_count from finance.quick_expense_records
      where bank_transaction_id=any(target_ids);
    select count(*) into reimbursement_count from finance.personal_reimbursements
      where bank_transaction_id=any(target_ids) and status not in ('REJECTED','CANCELLED');
    select count(*) into small_expense_count from approval.small_expenses
      where bank_transaction_id=any(target_ids) and review_status<>'CANCELLED';
    select count(*) into payment_count from finance.workflow_payments
      where bank_transaction_id=any(target_ids);
    select count(*) into transfer_count from finance.workflow_transfers
      where withdrawal_id=any(target_ids) or deposit_id=any(target_ids);
    select count(*) into allocation_count from finance.collection_receipt_allocations
      where bank_transaction_id=any(target_ids);
    select count(*) into refund_count from finance.collection_refunds
      where bank_transaction_id=any(target_ids) and status<>'CANCELLED';
    select count(*) into trust_count from finance.trust_operating_bank_links
      where organization_id=p_org and bank_transaction_id=any(target_ids);
    select count(*) into feedback_count from finance.ledger_allocation_feedback_outbox
      where organization_id=p_org and bank_transaction_id=any(target_ids);
  end if;
  blocker_count:=expense_count+voucher_count+quick_count+reimbursement_count+small_expense_count
    +payment_count+transfer_count+allocation_count+refund_count+trust_count+feedback_count;

  return jsonb_build_object(
    'ready',target_count>0 and cardinality(ledger_accounts)=1 and blocker_count=0,
    'target_count',target_count,
    'ledger_account_ids',to_jsonb(ledger_accounts),
    'deposit_total',deposit_total,
    'withdrawal_total',withdrawal_total,
    'first_transaction_at',first_at,
    'last_transaction_at',last_at,
    'blocker_count',blocker_count,
    'blockers',jsonb_build_object(
      'expense_resolutions',expense_count,'vouchers',voucher_count,
      'quick_expenses',quick_count,'reimbursements',reimbursement_count,
      'small_expenses',small_expense_count,'workflow_payments',payment_count,
      'account_transfers',transfer_count,'receipt_allocations',allocation_count,
      'refunds',refund_count,'trust_links',trust_count,'ledger_feedback',feedback_count
    )
  );
end $$;

create function finance.apply_ledger_bank_replacement(
  p_org uuid,p_actor uuid,p_bank_account_id uuid,p_expected_old_count integer,
  p_reason text,p_rows jsonb,p_source_system text default 'dbapt-ledger'
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  actor finance.reimbursement_members;
  preview jsonb;
  batch_id uuid:=gen_random_uuid();
  target_ids uuid[];
  ledger_account text;
  item jsonb;
  row_count integer;
  inserted_count integer:=0;
  old_deposit numeric:=0;
  old_withdrawal numeric:=0;
  new_deposit numeric:=0;
  new_withdrawal numeric:=0;
  source_id text;
  uid text;
  deposit_value numeric;
  withdrawal_value numeric;
begin
  actor:=finance.workflow_actor(p_org,p_actor);
  if not (actor.permissions && array['ADMIN','CLOSE']) then
    raise exception '은행 원장 교체는 관리자 또는 마감 담당자만 할 수 있습니다.';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 500 then
    raise exception '원장 교체 사유를 10자 이상 입력해주세요.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception '교체할 거래는 1건 이상 2,000건 이하로 입력해주세요.';
  end if;
  preview:=finance.preview_ledger_bank_replacement(p_org,p_actor,p_bank_account_id,p_source_system);
  if not coalesce((preview->>'ready')::boolean,false) then
    raise exception '후속 업무 연결 또는 원본 계좌 상태를 먼저 확인해주세요.';
  end if;
  if (preview->>'target_count')::integer<>p_expected_old_count then
    raise exception '교체 대상 건수가 달라졌습니다. 미리보기를 새로고침해주세요.';
  end if;
  if (select count(*) from jsonb_array_elements(p_rows)) <>
      (select count(distinct value->>'source_transaction_id') from jsonb_array_elements(p_rows)) then
    raise exception '거래고유번호가 중복되었습니다.';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    source_id:=trim(coalesce(item->>'source_transaction_id',''));
    uid:=trim(coalesce(item->>'bank_transaction_uid',''));
    deposit_value:=coalesce((item->>'deposit_amount')::numeric,0);
    withdrawal_value:=coalesce((item->>'withdrawal_amount')::numeric,0);
    if source_id='' or length(source_id)>200 or uid=''
      or coalesce(item->>'payload_hash','')!~'^[0-9a-f]{64}$'
      or coalesce(item->>'description','')=''
      or coalesce(item->>'transacted_at','')=''
      or coalesce(item->>'transaction_kind','') not in ('입금','출금')
      or deposit_value<0 or withdrawal_value<0 or ((deposit_value>0)=(withdrawal_value>0))
      or item->>'balance_amount' is null
      or coalesce(item->>'uploaded_major_category','')='' then
      raise exception '필수값, 입출금 방향, 잔액 또는 항목구분을 확인해주세요. 거래고유번호: %',source_id;
    end if;
    if (item->>'transaction_kind'='입금')<>(deposit_value>0) then
      raise exception '거래구분과 입출금액이 일치하지 않습니다. 거래고유번호: %',source_id;
    end if;
    if exists(select 1 from finance.bank_transactions
      where bank_transaction_uid=uid and deleted_at is null) then
      raise exception '이미 등록된 거래고유번호입니다: %',source_id;
    end if;
    new_deposit:=new_deposit+deposit_value;
    new_withdrawal:=new_withdrawal+withdrawal_value;
  end loop;

  perform 1
  from finance.ledger_bank_transaction_sources s
  join finance.bank_transactions t on t.id=s.bank_transaction_id
  where s.organization_id=p_org and s.source_system=p_source_system
    and s.import_status='IMPORTED' and t.organization_id=p_org
    and t.bank_account_id=p_bank_account_id and t.deleted_at is null
  for update of s,t;

  select coalesce(array_agg(t.id order by t.id),'{}'::uuid[]),
    min(s.ledger_account_id),coalesce(sum(t.deposit_amount),0),coalesce(sum(t.withdrawal_amount),0)
  into target_ids,ledger_account,old_deposit,old_withdrawal
  from finance.ledger_bank_transaction_sources s
  join finance.bank_transactions t on t.id=s.bank_transaction_id
  where s.organization_id=p_org and s.source_system=p_source_system
    and s.import_status='IMPORTED' and t.organization_id=p_org
    and t.bank_account_id=p_bank_account_id and t.deleted_at is null;
  row_count:=cardinality(target_ids);
  if row_count<>p_expected_old_count then
    raise exception '교체 대상이 변경되었습니다. 다시 미리보기 해주세요.';
  end if;

  insert into finance.bank_transaction_replacement_batches(
    id,organization_id,bank_account_id,source_system,ledger_account_id,
    replaced_count,replacement_count,replaced_deposit_total,replaced_withdrawal_total,
    replacement_deposit_total,replacement_withdrawal_total,reason,input_hash,applied_by
  ) values(
    batch_id,p_org,p_bank_account_id,p_source_system,ledger_account,row_count,jsonb_array_length(p_rows),
    old_deposit,old_withdrawal,new_deposit,new_withdrawal,trim(p_reason),md5(p_rows::text),p_actor
  );

  update finance.bank_transactions set
    deleted_at=clock_timestamp(),superseded_by_batch_id=batch_id
  where id=any(target_ids);
  update finance.ledger_bank_transaction_sources set
    import_status='SUPERSEDED',issue_detail='ERP 원장 교체 배치 '||batch_id::text||'로 사용 제외',
    synced_at=clock_timestamp()
  where organization_id=p_org and source_system=p_source_system
    and bank_transaction_id=any(target_ids) and import_status='IMPORTED';

  insert into finance.bank_transactions(
    organization_id,bank_account_id,transacted_at,transaction_kind,description,
    deposit_amount,withdrawal_amount,balance_amount,counterparty,branch_name,
    uploaded_major_category,uploaded_account_title,recommended_account_subject_id,
    recommended_account_subject_name,match_status,raw_payload,memo,bank_transaction_uid,
    classification_status,recommendation_reason,source_system,source_transaction_id,
    source_payload_hash,source_readonly,source_imported_at,replacement_batch_id
  )
  select p_org,p_bank_account_id,(item->>'transacted_at')::timestamptz,item->>'transaction_kind',
    item->>'description',(item->>'deposit_amount')::numeric,(item->>'withdrawal_amount')::numeric,
    (item->>'balance_amount')::numeric,nullif(item->>'counterparty',''),nullif(item->>'branch_name',''),
    item->>'uploaded_major_category',nullif(item->>'uploaded_account_title',''),
    nullif(item->>'recommended_account_subject_id','')::uuid,
    nullif(item->>'recommended_account_subject_name',''),coalesce(nullif(item->>'match_status',''),'미분류'),
    coalesce(item->'raw_payload','{}'::jsonb),nullif(item->>'memo',''),item->>'bank_transaction_uid',
    case when nullif(item->>'recommended_account_subject_name','') is null then 'UNREVIEWED' else 'RECOMMENDED' end,
    nullif(item->>'recommendation_reason',''),'erp-bank-file',item->>'source_transaction_id',
    item->>'payload_hash',true,clock_timestamp(),batch_id
  from jsonb_array_elements(p_rows) item;
  get diagnostics inserted_count=row_count;

  insert into audit.audit_logs(
    organization_id,actor_user_id,action,entity_schema,entity_table,entity_id,before_data,after_data
  ) values(
    p_org,p_actor,'BANK_LEDGER_REPLACED','finance','bank_transaction_replacement_batches',batch_id::text,
    jsonb_build_object('ledger_account_id',ledger_account,'count',p_expected_old_count,
      'deposit_total',old_deposit,'withdrawal_total',old_withdrawal),
    jsonb_build_object('count',inserted_count,'deposit_total',new_deposit,
      'withdrawal_total',new_withdrawal,'reason',trim(p_reason))
  );
  return jsonb_build_object('batch_id',batch_id,'replaced_count',p_expected_old_count,
    'replacement_count',inserted_count,'replacement_deposit_total',new_deposit,
    'replacement_withdrawal_total',new_withdrawal);
end $$;

revoke all on function finance.preview_ledger_bank_replacement(uuid,uuid,uuid,text),
  finance.apply_ledger_bank_replacement(uuid,uuid,uuid,integer,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function finance.preview_ledger_bank_replacement(uuid,uuid,uuid,text),
  finance.apply_ledger_bank_replacement(uuid,uuid,uuid,integer,text,jsonb,text)
  to service_role;
