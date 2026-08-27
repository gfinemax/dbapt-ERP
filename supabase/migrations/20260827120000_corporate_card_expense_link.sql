create table if not exists finance.corporate_card_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  transaction_uid text not null,
  approved_at timestamptz not null,
  amount numeric(18,2) not null check (amount > 0),
  merchant_name text not null default '법인카드 사용처 미확인',
  category text,
  card_name text not null,
  card_last_four text not null check (card_last_four ~ '^[0-9]{4}$'),
  approval_no text,
  memo text,
  resolution_status text not null default 'UNRESOLVED' check (resolution_status in ('UNRESOLVED', 'DRAFTING', 'EVIDENCE_MISSING', 'APPROVED')),
  linked_resolution_id text references finance.expense_resolutions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, transaction_uid)
);

create index if not exists corporate_card_transactions_unresolved_idx
  on finance.corporate_card_transactions (organization_id, resolution_status, approved_at desc)
  where linked_resolution_id is null;

alter table finance.corporate_card_transactions enable row level security;

revoke all on finance.corporate_card_transactions from anon, authenticated;
grant select, insert, update, delete on finance.corporate_card_transactions to service_role;
