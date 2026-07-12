alter table finance.expense_resolutions
  add column if not exists actual_paid_amount numeric(14, 0),
  add column if not exists settlement_status text,
  add column if not exists voucher_no text,
  add column if not exists voucher_status text;

create unique index if not exists expense_resolutions_voucher_no_unique_idx
  on finance.expense_resolutions (voucher_no)
  where voucher_no is not null and deleted_at is null;

create table if not exists finance.expense_workflow_operations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  resolution_id text not null references finance.expense_resolutions(id) on delete cascade,
  command text not null check (command in ('PAYMENT_COMPLETE', 'ITEM_PAYMENT_COMPLETE', 'PAYMENT_HOLD', 'VOUCHER_CREATE', 'VOUCHER_CONFIRM')),
  status text not null default 'PROCESSING' check (status in ('PROCESSING', 'COMPLETED', 'FAILED')),
  request_data jsonb not null default '{}'::jsonb,
  result_data jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table finance.expense_workflow_operations enable row level security;

grant all on finance.expense_workflow_operations to service_role;

create index if not exists expense_workflow_operations_resolution_idx
  on finance.expense_workflow_operations (resolution_id, created_at desc);

alter table audit.audit_logs
  add column if not exists actor_label text;

create table if not exists finance.expense_workflow_audit_logs (
  id uuid primary key default gen_random_uuid(),
  resolution_id text not null references finance.expense_resolutions(id) on delete cascade,
  operation_id uuid references finance.expense_workflow_operations(id) on delete set null,
  action text not null,
  actor_label text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table finance.expense_workflow_audit_logs enable row level security;

grant all on finance.expense_workflow_audit_logs to service_role;

create index if not exists expense_workflow_audit_logs_resolution_idx
  on finance.expense_workflow_audit_logs (resolution_id, created_at desc);
