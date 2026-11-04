create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema auth;
create schema core;
create schema finance;
create table auth.users(id uuid primary key);
create table core.organizations(id uuid primary key);
create table finance.reimbursement_members(
  organization_id uuid not null, user_id uuid not null, permissions text[] not null, active boolean not null default true
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
create table finance.bank_transactions(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  transacted_at timestamptz not null, description text not null, counterparty text,
  deposit_amount numeric(16,0) not null default 0, withdrawal_amount numeric(16,0) not null default 0,
  recommended_account_subject_name text, uploaded_account_title text,
  confirmed_account_subject_id uuid references finance.account_subjects(id),
  classification_status text not null default 'UNREVIEWED', deleted_at timestamptz
);
