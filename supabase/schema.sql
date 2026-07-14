create schema if not exists core;
create schema if not exists finance;
create schema if not exists reports;
create schema if not exists documents;
create schema if not exists integrations;
create schema if not exists audit;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-evidence',
  'expense-evidence',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
create schema if not exists private;

grant usage on schema core to service_role;
grant usage on schema finance to service_role;
grant usage on schema reports to service_role;
grant usage on schema documents to service_role;
grant usage on schema integrations to service_role;
grant usage on schema audit to service_role;
grant usage on schema public to service_role;

do $$
begin
  if to_regclass('finance.bank_accounts') is null and to_regclass('public.bank_accounts') is not null then
    alter table public.bank_accounts set schema finance;
  end if;

  if to_regclass('finance.bank_transactions') is null and to_regclass('public.bank_transactions') is not null then
    alter table public.bank_transactions set schema finance;
  end if;

  if to_regclass('reports.report_definitions') is null and to_regclass('public.report_definitions') is not null then
    alter table public.report_definitions set schema reports;
  end if;

  if to_regclass('reports.report_runs') is null and to_regclass('public.report_runs') is not null then
    alter table public.report_runs set schema reports;
  end if;

  if to_regclass('reports.report_versions') is null and to_regclass('public.report_versions') is not null then
    alter table public.report_versions set schema reports;
  end if;

  if to_regclass('reports.report_files') is null and to_regclass('public.report_files') is not null then
    alter table public.report_files set schema reports;
  end if;

  if to_regclass('reports.report_publications') is null and to_regclass('public.report_publications') is not null then
    alter table public.report_publications set schema reports;
  end if;
end $$;

create table if not exists core.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_registration_no text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references core.organizations(id),
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.roles (
  id text primary key,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists core.user_roles (
  user_id uuid not null references core.user_profiles(id) on delete cascade,
  role_id text not null references core.roles(id) on delete restrict,
  organization_id uuid references core.organizations(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table if not exists core.business_partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id),
  code text not null unique,
  partner_type text not null default '매입' check (partner_type in ('매출', '매입', '혼합')),
  owner_type text not null default '사업자' check (owner_type in ('사업자', '개인')),
  name text not null,
  registration_no text not null unique,
  representative text not null default '미입력',
  business_category text not null default '미입력',
  business_item text not null default '미입력',
  address text,
  project_scope text not null default '회계/자금',
  phone text not null default '',
  balance_type text not null default '채무' check (balance_type in ('채권', '채무', '정산')),
  balance_amount numeric(16, 0) not null default 0,
  evidence_profile_status text not null default '미비' check (evidence_profile_status in ('완료', '미비')),
  registration_source text not null default '직접등록' check (registration_source in ('직접등록', 'OCR 자동등록')),
  first_transaction_date date,
  source_resolution_no text,
  source_evidence_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

grant select, insert, update on core.business_partners to service_role;
create index if not exists business_partners_name_idx on core.business_partners (name);
create index if not exists business_partners_registration_no_idx on core.business_partners (registration_no);

create table if not exists core.code_groups (
  id text primary key,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists core.codes (
  id text primary key,
  group_id text not null references core.code_groups(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists finance.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id),
  bank_name text not null,
  account_name text not null,
  account_no text not null,
  account_type text not null check (account_type in ('신탁계좌', '운영계좌', '토지비계좌')),
  usage_status text not null default '사용' check (usage_status in ('사용', '사용안함')),
  last_synced_at timestamptz,
  sync_status text not null default '확인필요' check (sync_status in ('정상', '확인필요')),
  unmatched_count integer not null default 0 check (unmatched_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table finance.bank_accounts
  add column if not exists organization_id uuid references core.organizations(id),
  add column if not exists deleted_at timestamptz;

create table if not exists finance.account_subjects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id),
  code text not null,
  name text not null,
  parent_id uuid references finance.account_subjects(id),
  subject_type text not null default '지출' check (subject_type in ('수입', '지출', '자산', '부채', '정산')),
  normal_balance text not null default '차변' check (normal_balance in ('차변', '대변')),
  business_category text not null default '미분류',
  source text not null default '직접등록' check (source in ('운영비 예산안', '수지분석표', '직접등록')),
  aliases text[] not null default array[]::text[],
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

alter table finance.account_subjects
  add column if not exists subject_type text not null default '지출' check (subject_type in ('수입', '지출', '자산', '부채', '정산')),
  add column if not exists normal_balance text not null default '차변' check (normal_balance in ('차변', '대변')),
  add column if not exists business_category text not null default '미분류',
  add column if not exists source text not null default '직접등록' check (source in ('운영비 예산안', '수지분석표', '직접등록')),
  add column if not exists aliases text[] not null default array[]::text[],
  add column if not exists description text not null default '',
  add column if not exists sort_order integer not null default 0;

create table if not exists finance.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id),
  bank_account_id uuid not null references finance.bank_accounts(id) on delete cascade,
  transacted_at timestamptz not null,
  transaction_kind text not null default '출금' check (transaction_kind in ('입금', '출금')),
  description text not null,
  deposit_amount numeric(14, 0) not null default 0 check (deposit_amount >= 0),
  withdrawal_amount numeric(14, 0) not null default 0 check (withdrawal_amount >= 0),
  balance_amount numeric(14, 0),
  counterparty text,
  branch_name text,
  uploaded_major_category text,
  uploaded_account_title text,
  recommended_account_subject_id uuid references finance.account_subjects(id),
  recommended_account_subject_name text,
  match_status text not null default '미분류' check (match_status in ('업로드분류', '자동추천', '신규후보', '미분류')),
  raw_payload jsonb not null default '{}'::jsonb,
  memo text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table finance.bank_transactions
  add column if not exists organization_id uuid references core.organizations(id),
  add column if not exists transaction_kind text not null default '출금' check (transaction_kind in ('입금', '출금')),
  add column if not exists branch_name text,
  add column if not exists uploaded_major_category text,
  add column if not exists uploaded_account_title text,
  add column if not exists recommended_account_subject_id uuid references finance.account_subjects(id),
  add column if not exists recommended_account_subject_name text,
  add column if not exists match_status text not null default '미분류' check (match_status in ('업로드분류', '자동추천', '신규후보', '미분류')),
  add column if not exists raw_payload jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz;

create table if not exists finance.vouchers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id),
  voucher_no text not null,
  voucher_date date not null,
  approval_status text not null default '승인대기' check (approval_status in ('승인대기', '검토중', '승인완료', '취소')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, voucher_no)
);

create table if not exists finance.voucher_lines (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references finance.vouchers(id) on delete cascade,
  account_subject_id uuid references finance.account_subjects(id),
  description text not null,
  debit_amount numeric(14, 0) not null default 0 check (debit_amount >= 0),
  credit_amount numeric(14, 0) not null default 0 check (credit_amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists finance.expense_resolutions (
  id text primary key,
  organization_id uuid references core.organizations(id),
  resolution_no text not null,
  author_label text not null,
  current_approver_label text,
  approval_status text not null check (approval_status in ('작성중', '승인대기', '승인완료', '반려')),
  payment_status text not null,
  resolution_mode text check (resolution_mode in ('SINGLE', 'PROJECT_BULK')),
  expense_timing text check (expense_timing in ('ADVANCE', 'REIMBURSEMENT', 'SETTLEMENT')),
  input_method text check (input_method in ('MANUAL', 'EXCEL', 'EVIDENCE_OCR')),
  execution_method text check (execution_method in ('VENDOR_DIRECT', 'EMPLOYEE_ADVANCE', 'CORPORATE_CARD', 'AUTHORIZATION_ONLY')),
  expense_burden_type text check (expense_burden_type in ('EMPLOYEE_PREPAID', 'VENDOR_UNPAID', 'CORPORATE_CARD', 'ORGANIZATION_PAID', 'CASH')),
  original_resolution_id text references finance.expense_resolutions(id),
  settlement_due_date date,
  settlement_manager_label text,
  project_name text,
  subject text,
  total_payment_amount numeric(14, 0) not null default 0,
  actual_paid_amount numeric(14, 0),
  settlement_status text,
  voucher_no text,
  voucher_status text check (voucher_status is null or voucher_status in ('전표초안', '전표확정', '전표취소')),
  resolution_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, resolution_no)
);

alter table finance.expense_resolutions
  add column if not exists resolution_mode text check (resolution_mode in ('SINGLE', 'PROJECT_BULK')),
  add column if not exists expense_timing text check (expense_timing in ('ADVANCE', 'REIMBURSEMENT', 'SETTLEMENT')),
  add column if not exists input_method text check (input_method in ('MANUAL', 'EXCEL', 'EVIDENCE_OCR')),
  add column if not exists execution_method text check (execution_method in ('VENDOR_DIRECT', 'EMPLOYEE_ADVANCE', 'CORPORATE_CARD', 'AUTHORIZATION_ONLY')),
  add column if not exists expense_burden_type text check (expense_burden_type in ('EMPLOYEE_PREPAID', 'VENDOR_UNPAID', 'CORPORATE_CARD', 'ORGANIZATION_PAID', 'CASH')),
  add column if not exists original_resolution_id text references finance.expense_resolutions(id),
  add column if not exists settlement_due_date date,
  add column if not exists settlement_manager_label text,
  add column if not exists project_name text,
  add column if not exists subject text;

alter table finance.expense_resolutions
  add column if not exists actual_paid_amount numeric(14, 0),
  add column if not exists settlement_status text,
  add column if not exists voucher_no text,
  add column if not exists voucher_status text check (voucher_status is null or voucher_status in ('전표초안', '전표확정', '전표취소'));

create unique index if not exists expense_resolutions_voucher_no_unique_idx
  on finance.expense_resolutions (voucher_no)
  where voucher_no is not null and deleted_at is null;

create table if not exists finance.expense_resolution_items (
  id text primary key,
  resolution_id text not null references finance.expense_resolutions(id) on delete cascade,
  item_kind text not null check (item_kind in ('SINGLE', 'BATCH')),
  item_no integer not null check (item_no > 0),
  supply_amount numeric(14, 0) not null default 0 check (supply_amount >= 0),
  vat_amount numeric(14, 0) not null default 0 check (vat_amount >= 0),
  total_amount numeric(14, 0) not null default 0 check (total_amount >= 0),
  item_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resolution_id, item_kind, item_no)
);

create table if not exists finance.expense_account_allocations (
  id text primary key,
  resolution_id text not null references finance.expense_resolutions(id) on delete cascade,
  item_id text references finance.expense_resolution_items(id) on delete cascade,
  account_title text not null,
  budget_item text,
  amount numeric(14, 0) not null default 0 check (amount >= 0),
  description text,
  allocation_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.expense_resolution_evidence (
  id text primary key,
  resolution_id text not null references finance.expense_resolutions(id) on delete cascade,
  item_id text references finance.expense_resolution_items(id) on delete set null,
  evidence_type text not null,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  content_type text not null,
  file_size bigint not null check (file_size > 0),
  ocr_status text not null check (ocr_status in ('EXTRACTED', 'REVIEW_REQUIRED', 'CONFIRMED', 'FAILED')),
  ocr_data jsonb not null default '{}'::jsonb,
  uploaded_by_label text not null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

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

create table if not exists reports.report_definitions (
  id text primary key,
  name text not null,
  frequency text not null check (frequency in ('monthly', 'quarterly', 'yearly')),
  output_formats text[] not null default '{}',
  generation_rule text not null,
  publication_targets text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reports.report_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id),
  report_definition_id text not null references reports.report_definitions(id),
  title text not null,
  period_label text not null,
  period_start date not null,
  period_end date not null,
  scheduled_generation_date date not null,
  generated_at timestamptz,
  status text not null default '작성예정' check (status in ('작성예정', '초안', '검토중', '승인완료', '공개완료', '수정필요')),
  current_version integer not null default 1 check (current_version >= 1),
  update_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, report_definition_id, period_start, period_end)
);

alter table reports.report_runs
  add column if not exists organization_id uuid references core.organizations(id);

create table if not exists reports.report_versions (
  id uuid primary key default gen_random_uuid(),
  report_run_id uuid not null references reports.report_runs(id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  source_snapshot jsonb not null default '{}'::jsonb,
  change_summary text,
  generated_by text not null default 'system',
  created_at timestamptz not null default now(),
  unique (report_run_id, version_no)
);

create table if not exists reports.report_files (
  id uuid primary key default gen_random_uuid(),
  report_version_id uuid not null references reports.report_versions(id) on delete cascade,
  file_kind text not null check (file_kind in ('docx', 'xlsx', 'pdf', 'public-package')),
  file_path text not null,
  font_family text not null default 'Trebuchet MS',
  created_at timestamptz not null default now()
);

create table if not exists reports.report_publications (
  id uuid primary key default gen_random_uuid(),
  report_run_id uuid not null references reports.report_runs(id) on delete cascade,
  report_version_id uuid references reports.report_versions(id) on delete set null,
  target text not null check (target in ('홈페이지', '정보몽땅')),
  status text not null default '공개대기' check (status in ('공개대기', '공개완료', '공개취소')),
  published_at timestamptz,
  memo text,
  created_at timestamptz not null default now(),
  unique (report_run_id, target)
);

create table if not exists documents.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id),
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  content_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table if not exists integrations.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id),
  provider text not null,
  job_type text not null,
  status text not null default '대기' check (status in ('대기', '진행중', '완료', '실패')),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists audit.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id),
  actor_user_id uuid references core.user_profiles(id),
  actor_label text,
  action text not null,
  entity_schema text not null,
  entity_table text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table audit.audit_logs
  add column if not exists actor_label text;

alter table core.organizations enable row level security;
alter table core.user_profiles enable row level security;
alter table core.roles enable row level security;
alter table core.user_roles enable row level security;
alter table core.code_groups enable row level security;
alter table core.codes enable row level security;
alter table finance.bank_accounts enable row level security;
alter table finance.bank_transactions enable row level security;
alter table finance.account_subjects enable row level security;
alter table finance.vouchers enable row level security;
alter table finance.voucher_lines enable row level security;
alter table finance.expense_resolutions enable row level security;
alter table finance.expense_resolution_items enable row level security;
alter table finance.expense_account_allocations enable row level security;
alter table finance.expense_resolution_evidence enable row level security;
alter table finance.expense_workflow_operations enable row level security;
alter table finance.expense_workflow_audit_logs enable row level security;
alter table reports.report_definitions enable row level security;
alter table reports.report_runs enable row level security;
alter table reports.report_versions enable row level security;
alter table reports.report_files enable row level security;
alter table reports.report_publications enable row level security;
alter table documents.files enable row level security;
alter table integrations.sync_jobs enable row level security;
alter table audit.audit_logs enable row level security;

grant all on all tables in schema core to service_role;
grant all on all tables in schema finance to service_role;
grant all on all tables in schema reports to service_role;
grant all on all tables in schema documents to service_role;
grant all on all tables in schema integrations to service_role;
grant all on all tables in schema audit to service_role;

create index if not exists bank_accounts_org_created_idx
  on finance.bank_accounts (organization_id, created_at desc)
  where deleted_at is null;

create index if not exists bank_transactions_account_date_idx
  on finance.bank_transactions (bank_account_id, transacted_at desc)
  where deleted_at is null;

create index if not exists bank_transactions_match_status_idx
  on finance.bank_transactions (match_status, transacted_at desc)
  where deleted_at is null;

create index if not exists account_subjects_org_sort_idx
  on finance.account_subjects (organization_id, sort_order, code)
  where is_active = true;

create index if not exists vouchers_org_date_idx
  on finance.vouchers (organization_id, voucher_date desc)
  where deleted_at is null;

create index if not exists vouchers_org_status_date_idx
  on finance.vouchers (organization_id, approval_status, voucher_date desc)
  where deleted_at is null;

create index if not exists expense_resolutions_status_updated_idx
  on finance.expense_resolutions (approval_status, updated_at desc)
  where deleted_at is null;

create index if not exists expense_resolutions_approver_status_idx
  on finance.expense_resolutions (current_approver_label, approval_status, updated_at desc)
  where deleted_at is null;

create index if not exists expense_resolutions_workflow_idx
  on finance.expense_resolutions (resolution_mode, expense_timing, input_method, updated_at desc)
  where deleted_at is null;

create index if not exists expense_resolutions_original_idx
  on finance.expense_resolutions (original_resolution_id)
  where original_resolution_id is not null and deleted_at is null;

create index if not exists expense_resolution_items_resolution_idx
  on finance.expense_resolution_items (resolution_id, item_kind, item_no);

create index if not exists expense_account_allocations_resolution_idx
  on finance.expense_account_allocations (resolution_id, created_at);

create index if not exists expense_account_allocations_item_idx
  on finance.expense_account_allocations (item_id)
  where item_id is not null;

create index if not exists expense_resolution_evidence_resolution_idx
  on finance.expense_resolution_evidence (resolution_id, uploaded_at desc);

create index if not exists expense_resolution_evidence_item_idx
  on finance.expense_resolution_evidence (item_id)
  where item_id is not null;

create index if not exists expense_workflow_operations_resolution_idx
  on finance.expense_workflow_operations (resolution_id, created_at desc);

create index if not exists expense_workflow_audit_logs_resolution_idx
  on finance.expense_workflow_audit_logs (resolution_id, created_at desc);

create index if not exists report_runs_definition_generation_idx
  on reports.report_runs (report_definition_id, scheduled_generation_date desc);

create index if not exists report_runs_status_idx
  on reports.report_runs (status, scheduled_generation_date desc);

create index if not exists report_versions_run_version_idx
  on reports.report_versions (report_run_id, version_no desc);

create index if not exists audit_logs_entity_idx
  on audit.audit_logs (entity_schema, entity_table, entity_id, created_at desc);

insert into reports.report_definitions (id, name, frequency, output_formats, generation_rule, publication_targets)
values
  ('performance', '실적보고서', 'quarterly', array['docx', 'pdf'], '분기 종료 다음 달 1일', array['홈페이지', '정보몽땅']),
  ('cash-flow', '자금입출금명세서', 'monthly', array['xlsx', 'pdf'], '대상월 다음 달 1일', array['홈페이지', '정보몽땅']),
  ('budget', '운영비 예산', 'yearly', array['xlsx'], '연 1회 예산 확정 시', array[]::text[])
on conflict (id) do update set
  name = excluded.name,
  frequency = excluded.frequency,
  output_formats = excluded.output_formats,
  generation_rule = excluded.generation_rule,
  publication_targets = excluded.publication_targets,
  updated_at = now();
