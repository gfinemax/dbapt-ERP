-- Rollback: drop the new child tables in reverse order, then drop the added
-- expense_resolutions/bank_transactions columns. Existing rows are untouched.
alter table finance.expense_workflow_operations drop constraint if exists expense_workflow_operations_command_check;
alter table finance.expense_workflow_operations add constraint expense_workflow_operations_command_check check (command in ('PAYMENT_COMPLETE','ITEM_PAYMENT_COMPLETE','PAYMENT_HOLD','VOUCHER_CREATE','VOUCHER_CONFIRM','VOUCHER_CANCEL'));
alter table finance.expense_resolutions
  add column if not exists expense_kind text not null default 'GENERAL' check (expense_kind in ('GENERAL','PERSONAL_REIMBURSEMENT','BANK_POST_APPROVAL','PETTY_CASH_BATCH','RECURRING_BATCH')),
  add column if not exists accounting_date date,
  add column if not exists actual_expense_date date,
  add column if not exists drafted_at timestamptz not null default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists disbursed_at timestamptz,
  add column if not exists is_post_approval boolean not null default false,
  add column if not exists post_approval_reason text,
  add column if not exists evidence_kind text not null default 'NONE',
  add column if not exists evidence_status text not null default 'NONE' check (evidence_status in ('QUALIFIED','GENERAL','ALTERNATIVE','DEFICIENT','NONE')),
  add column if not exists missing_evidence_reason text,
  add column if not exists actual_spender_label text,
  add column if not exists settlement_recipient_label text,
  add column if not exists settlement_amount numeric(14,0),
  add column if not exists settlement_completed_at timestamptz,
  add column if not exists bank_transaction_id uuid references finance.bank_transactions(id) on delete restrict;

create unique index if not exists expense_resolutions_bank_transaction_unique_idx
  on finance.expense_resolutions(bank_transaction_id)
  where bank_transaction_id is not null and deleted_at is null;

alter table finance.bank_transactions
  add column if not exists bank_transaction_uid text,
  add column if not exists resolution_status text not null default 'UNRESOLVED' check (resolution_status in ('UNRESOLVED','DRAFTING','EVIDENCE_MISSING','RESOLVED','APPROVED','EXPLANATION_REQUIRED','REFUND_TARGET'));

create unique index if not exists bank_transactions_uid_unique_idx on finance.bank_transactions(bank_transaction_uid) where bank_transaction_uid is not null;

alter table finance.vouchers
  add column if not exists expense_resolution_id text references finance.expense_resolutions(id) on delete restrict,
  add column if not exists detail_transaction_id text,
  add column if not exists bank_transaction_id uuid references finance.bank_transactions(id) on delete restrict;

create unique index if not exists vouchers_bank_transaction_unique_idx
  on finance.vouchers(bank_transaction_id)
  where bank_transaction_id is not null and deleted_at is null;

create table if not exists finance.expense_compliance_settings (
  organization_id uuid primary key references core.organizations(id) on delete cascade,
  petty_cash_limit numeric(14,0) not null default 30000,
  monthly_person_warning_limit numeric(14,0) not null default 100000,
  petty_cash_allowed_accounts text[] not null default array['사무용품비','소모품비','우편료·택배비','복사·출력비','소액 교통비·주차비','업무용 생수·음료','기타 통상적인 사무국 운영비'],
  petty_cash_excluded_keywords text[] not null default array['계약금','용역비','자문료','인건비','급여','수당','조합장','임원','회의비','식사비','환불금','토지매입비','주요 사업비','차입금','대여금','현금 인출','목적 불분명','자산'],
  allow_no_evidence_approval boolean not null default true,
  no_evidence_approver_role text,
  allow_personal_reimbursement boolean not null default true,
  post_approval_max_days integer,
  fact_confirmer_roles text[] not null default '{}',
  approval_line jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists finance.expense_detail_transactions (
  id text primary key,
  resolution_id text not null references finance.expense_resolutions(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  transaction_date date not null,
  actual_spender_label text not null,
  vendor_name text not null,
  item_name text not null,
  business_purpose text not null,
  account_title text not null,
  amount numeric(14,0) not null check (amount > 0),
  payment_method text not null,
  evidence_kind text not null default 'NONE',
  evidence_status text not null default 'NONE' check (evidence_status in ('QUALIFIED','GENERAL','ALTERNATIVE','DEFICIENT','NONE')),
  fact_confirmation_id uuid,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists expense_detail_resolution_line_unique_idx
  on finance.expense_detail_transactions(resolution_id, line_no)
  where deleted_at is null;

create table if not exists finance.expense_fact_confirmations (
  id uuid primary key default gen_random_uuid(),
  resolution_id text not null references finance.expense_resolutions(id) on delete restrict,
  detail_transaction_id text references finance.expense_detail_transactions(id) on delete restrict,
  revision_no integer not null default 1,
  actual_spender_label text not null,
  actual_expense_date date not null,
  vendor_name text not null,
  item_description text not null,
  amount numeric(14,0) not null check (amount > 0),
  business_purpose text not null,
  missing_receipt_reason text not null,
  payment_method text not null,
  author_label text not null,
  confirmer_label text,
  confirmed_at timestamptz,
  electronic_confirmation jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$ begin
  alter table finance.expense_detail_transactions add constraint expense_detail_fact_confirmation_fk foreign key(fact_confirmation_id) references finance.expense_fact_confirmations(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table finance.vouchers add constraint vouchers_detail_transaction_fk foreign key(detail_transaction_id) references finance.expense_detail_transactions(id) on delete restrict;
exception when duplicate_object then null; end $$;

create table if not exists finance.expense_supporting_files (
  id uuid primary key default gen_random_uuid(),
  resolution_id text not null references finance.expense_resolutions(id) on delete restrict,
  detail_transaction_id text references finance.expense_detail_transactions(id) on delete restrict,
  fact_confirmation_id uuid references finance.expense_fact_confirmations(id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  uploaded_by_label text not null,
  created_at timestamptz not null default now(),
  unique(storage_bucket,storage_path)
);

alter table finance.expense_compliance_settings enable row level security;
alter table finance.expense_detail_transactions enable row level security;
alter table finance.expense_fact_confirmations enable row level security;
alter table finance.expense_supporting_files enable row level security;
grant all on finance.expense_compliance_settings, finance.expense_detail_transactions, finance.expense_fact_confirmations, finance.expense_supporting_files to service_role;
