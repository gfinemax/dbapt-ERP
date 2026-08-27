create table if not exists finance.quick_expense_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  source_type text not null check (source_type in ('BANK_TRANSACTION', 'CORPORATE_CARD', 'MANUAL')),
  bank_transaction_id uuid references finance.bank_transactions(id) on delete restrict,
  corporate_card_transaction_id uuid references finance.corporate_card_transactions(id) on delete restrict,
  payment_method text not null check (payment_method in ('CORPORATE_CARD', 'BANK_TRANSFER', 'AUTO_DEBIT', 'CASH', 'PERSONAL_PREPAID')),
  occurred_at timestamptz not null,
  amount numeric(18,2) not null check (amount > 0),
  counterparty text not null default '',
  usage_description text not null check (length(trim(usage_description)) > 0),
  budget_item text not null check (length(trim(budget_item)) > 0),
  evidence_status text not null default 'NONE' check (evidence_status in ('QUALIFIED', 'GENERAL', 'ALTERNATIVE', 'NONE')),
  approval_skip_reason text not null,
  direct_expense_decision text not null check (direct_expense_decision in ('ALLOWED', 'RECOMMENDED', 'REQUIRED')),
  direct_expense_reasons text[] not null default '{}',
  record_status text not null default 'RECORDED' check (record_status in ('RECORDED', 'NEEDS_RESOLUTION', 'CONVERTED')),
  recorded_by_label text not null,
  linked_resolution_id text references finance.expense_resolutions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_expense_source_matches check (
    (source_type = 'BANK_TRANSACTION' and bank_transaction_id is not null and corporate_card_transaction_id is null)
    or (source_type = 'CORPORATE_CARD' and corporate_card_transaction_id is not null and bank_transaction_id is null)
    or (source_type = 'MANUAL' and bank_transaction_id is null and corporate_card_transaction_id is null)
  )
);

create unique index if not exists quick_expense_bank_transaction_unique
  on finance.quick_expense_records (bank_transaction_id)
  where bank_transaction_id is not null;

create unique index if not exists quick_expense_card_transaction_unique
  on finance.quick_expense_records (corporate_card_transaction_id)
  where corporate_card_transaction_id is not null;

create index if not exists quick_expense_organization_date_idx
  on finance.quick_expense_records (organization_id, occurred_at desc);

alter table finance.quick_expense_records enable row level security;
revoke all on finance.quick_expense_records from anon, authenticated;
grant select, insert, update, delete on finance.quick_expense_records to service_role;
