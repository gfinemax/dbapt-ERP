create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema auth;
create schema core;
create schema finance;
create schema audit;
create table auth.users(id uuid primary key);
create table core.organizations(id uuid primary key);
create table core.user_profiles(id uuid primary key);
create table finance.reimbursement_members(
  organization_id uuid not null, user_id uuid not null, display_name text not null,
  permissions text[] not null, active boolean not null default true
);
create function finance.workflow_actor(p_org uuid,p_actor uuid) returns finance.reimbursement_members
language plpgsql stable as $$
declare m finance.reimbursement_members;
begin
  select * into m from finance.reimbursement_members where organization_id=p_org and user_id=p_actor and active;
  if not found then raise exception 'actor not found'; end if;
  return m;
end $$;
create table finance.collection_assessments(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references core.organizations(id),
  external_member_id text not null, member_no text, member_name_snapshot text not null, assessment_code text not null,
  due_date date, assessed_amount numeric(16,0) not null, status text not null default 'ACTIVE',
  lock_version integer not null default 1, created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(organization_id,id),
  unique(organization_id,external_member_id,assessment_code)
);
create table finance.collection_ledger_events(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, actor_id uuid not null,
  entity_id uuid not null, action text not null, reason text not null default '', before_data jsonb,
  after_data jsonb not null, created_at timestamptz not null default now()
);
create table finance.collection_receipt_allocations(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  assessment_id uuid not null, bank_transaction_id uuid not null,
  amount numeric(16,0) not null, reason text not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table finance.collection_receipt_reversals(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  allocation_id uuid not null, reason text not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table finance.account_subjects(id uuid primary key default gen_random_uuid(),name text not null);
create table finance.bank_accounts(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references core.organizations(id),
  bank_name text not null, account_name text not null, account_no text not null, account_type text not null,
  usage_status text not null default '사용', last_synced_at timestamptz, sync_status text not null default '확인필요',
  unmatched_count integer not null default 0, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table finance.bank_transactions(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  bank_account_id uuid not null references finance.bank_accounts(id),
  transacted_at timestamptz not null, description text not null, counterparty text,
  deposit_amount numeric(16,0) not null default 0, withdrawal_amount numeric(16,0) not null default 0,
  balance_amount numeric(16,0), transaction_kind text, branch_name text,
  recommended_account_subject_name text, uploaded_major_category text, uploaded_account_title text,
  confirmed_account_subject_id uuid references finance.account_subjects(id),
  classification_status text not null default 'UNREVIEWED', match_status text not null default '미분류',
  raw_payload jsonb not null default '{}'::jsonb, memo text, bank_transaction_uid text,
  resolution_status text not null default 'UNRESOLVED', recommendation_reason text, deleted_at timestamptz,
  unique(organization_id,id)
);
create unique index bank_transactions_uid_unique_idx on finance.bank_transactions(bank_transaction_uid)
where bank_transaction_uid is not null;
create table audit.audit_logs(
  id uuid primary key default gen_random_uuid(), organization_id uuid,
  actor_user_id uuid references core.user_profiles(id),
  action text not null, entity_schema text not null, entity_table text not null, entity_id text not null,
  before_data jsonb, after_data jsonb, created_at timestamptz not null default now(), actor_label text
);
