-- ERP가 소유한 은행거래의 변경을 Ledger가 읽기 전용으로 동기화할 수 있게 한다.
-- 과거 Ledger에서 ERP로 이관한 거래는 순환 동기화를 막기 위해 내보내지 않는다.

create table finance.ledger_bank_transaction_export_outbox (
  event_id bigserial primary key,
  organization_id uuid not null references core.organizations(id) on delete restrict,
  -- 원본이 하드 삭제되더라도 CANCEL 이벤트와 감사 근거는 남겨야 하므로 FK를 걸지 않는다.
  bank_transaction_id uuid not null,
  event_type text not null check (event_type in ('UPSERT','CANCEL')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index ledger_bank_transaction_export_cursor_idx
  on finance.ledger_bank_transaction_export_outbox(organization_id,event_id);

create table finance.ledger_bank_transaction_request_nonces (
  nonce text primary key,
  request_timestamp bigint not null,
  used_at timestamptz not null default now()
);

create index ledger_bank_transaction_request_nonce_used_idx
  on finance.ledger_bank_transaction_request_nonces(used_at);

alter table finance.ledger_bank_transaction_export_outbox enable row level security;
alter table finance.ledger_bank_transaction_request_nonces enable row level security;
revoke all on finance.ledger_bank_transaction_export_outbox,
  finance.ledger_bank_transaction_request_nonces from public,anon,authenticated;
grant select,insert on finance.ledger_bank_transaction_export_outbox to service_role;
grant select,insert,delete on finance.ledger_bank_transaction_request_nonces to service_role;
grant usage,select on sequence finance.ledger_bank_transaction_export_outbox_event_id_seq to service_role;
create policy ledger_bank_transaction_export_server
  on finance.ledger_bank_transaction_export_outbox for all to service_role
  using (true) with check (true);
create policy ledger_bank_transaction_nonce_server
  on finance.ledger_bank_transaction_request_nonces for all to service_role
  using (true) with check (true);

create function finance.ledger_bank_transaction_export_payload(p_transaction finance.bank_transactions)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  account_row finance.bank_accounts;
  recommended_name text;
  confirmed_name text;
begin
  select * into account_row from finance.bank_accounts where id=p_transaction.bank_account_id;
  if p_transaction.recommended_account_subject_id is not null then
    select name into recommended_name from finance.account_subjects
      where id=p_transaction.recommended_account_subject_id;
  end if;
  if p_transaction.confirmed_account_subject_id is not null then
    select name into confirmed_name from finance.account_subjects
      where id=p_transaction.confirmed_account_subject_id;
  end if;
  return jsonb_build_object(
    'erp_transaction_id',p_transaction.id,
    'erp_account_id',p_transaction.bank_account_id,
    'bank_name',account_row.bank_name,
    'account_name',account_row.account_name,
    'account_number',account_row.account_no,
    'account_type',account_row.account_type,
    'account_purpose',account_row.account_purpose,
    'transacted_at',p_transaction.transacted_at,
    'transaction_kind',p_transaction.transaction_kind,
    'description',p_transaction.description,
    'deposit_amount',p_transaction.deposit_amount,
    'withdrawal_amount',p_transaction.withdrawal_amount,
    'balance_amount',p_transaction.balance_amount,
    'counterparty',p_transaction.counterparty,
    'branch_name',p_transaction.branch_name,
    'uploaded_major_category',p_transaction.uploaded_major_category,
    'uploaded_account_title',p_transaction.uploaded_account_title,
    'match_status',p_transaction.match_status,
    'recommended_account_subject_id',p_transaction.recommended_account_subject_id,
    'recommended_account_subject_name',coalesce(recommended_name,p_transaction.recommended_account_subject_name),
    'confirmed_account_subject_id',p_transaction.confirmed_account_subject_id,
    'confirmed_account_subject_name',confirmed_name,
    'classification_status',p_transaction.classification_status,
    'recommendation_reason',p_transaction.recommendation_reason,
    'memo',p_transaction.memo,
    'source_system',p_transaction.source_system,
    'source_transaction_id',p_transaction.source_transaction_id,
    'source_payload_hash',p_transaction.source_payload_hash,
    'source_readonly',p_transaction.source_readonly,
    'source_created_at',p_transaction.created_at,
    'source_deleted_at',p_transaction.deleted_at
  );
end $$;

create function finance.enqueue_ledger_bank_transaction_export()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  transaction_row finance.bank_transactions;
begin
  transaction_row:=case when tg_op='DELETE' then old else new end;
  if tg_op='UPDATE'
    and coalesce(old.source_system,'')<>'dbapt-ledger'
    and coalesce(new.source_system,'')='dbapt-ledger' then
    insert into finance.ledger_bank_transaction_export_outbox(
      organization_id,bank_transaction_id,event_type,payload
    ) values (
      old.organization_id,old.id,'CANCEL',
      finance.ledger_bank_transaction_export_payload(old)
    );
    return new;
  end if;
  if coalesce(transaction_row.source_system,'')='dbapt-ledger' then
    return coalesce(new,old);
  end if;
  insert into finance.ledger_bank_transaction_export_outbox(
    organization_id,bank_transaction_id,event_type,payload
  ) values (
    transaction_row.organization_id,transaction_row.id,
    case when tg_op='DELETE' or transaction_row.deleted_at is not null then 'CANCEL' else 'UPSERT' end,
    finance.ledger_bank_transaction_export_payload(transaction_row)
  );
  return coalesce(new,old);
end $$;

create trigger bank_transaction_ledger_export
after insert or update or delete on finance.bank_transactions
for each row execute function finance.enqueue_ledger_bank_transaction_export();

create function finance.enqueue_ledger_bank_account_export()
returns trigger language plpgsql security invoker set search_path='' as $$
declare transaction_row finance.bank_transactions;
begin
  if new.bank_name is not distinct from old.bank_name
    and new.account_name is not distinct from old.account_name
    and new.account_no is not distinct from old.account_no
    and new.account_type is not distinct from old.account_type
    and new.account_purpose is not distinct from old.account_purpose then
    return new;
  end if;
  for transaction_row in select * from finance.bank_transactions
    where bank_account_id=new.id and coalesce(source_system,'')<>'dbapt-ledger'
  loop
    insert into finance.ledger_bank_transaction_export_outbox(
      organization_id,bank_transaction_id,event_type,payload
    ) values (
      transaction_row.organization_id,transaction_row.id,
      case when transaction_row.deleted_at is null then 'UPSERT' else 'CANCEL' end,
      finance.ledger_bank_transaction_export_payload(transaction_row)
    );
  end loop;
  return new;
end $$;

create trigger bank_account_ledger_export
after update on finance.bank_accounts
for each row execute function finance.enqueue_ledger_bank_account_export();

create function finance.enqueue_ledger_bank_subject_export()
returns trigger language plpgsql security invoker set search_path='' as $$
declare transaction_row finance.bank_transactions;
begin
  if new.name is not distinct from old.name then return new; end if;
  for transaction_row in select * from finance.bank_transactions
    where (recommended_account_subject_id=new.id or confirmed_account_subject_id=new.id)
      and coalesce(source_system,'')<>'dbapt-ledger'
  loop
    insert into finance.ledger_bank_transaction_export_outbox(
      organization_id,bank_transaction_id,event_type,payload
    ) values (
      transaction_row.organization_id,transaction_row.id,
      case when transaction_row.deleted_at is null then 'UPSERT' else 'CANCEL' end,
      finance.ledger_bank_transaction_export_payload(transaction_row)
    );
  end loop;
  return new;
end $$;

create trigger bank_subject_ledger_export
after update on finance.account_subjects
for each row execute function finance.enqueue_ledger_bank_subject_export();

insert into finance.ledger_bank_transaction_export_outbox(
  organization_id,bank_transaction_id,event_type,payload
)
select transaction_row.organization_id,transaction_row.id,
  case when transaction_row.deleted_at is null then 'UPSERT' else 'CANCEL' end,
  finance.ledger_bank_transaction_export_payload(transaction_row)
from finance.bank_transactions transaction_row
where coalesce(transaction_row.source_system,'')<>'dbapt-ledger';
