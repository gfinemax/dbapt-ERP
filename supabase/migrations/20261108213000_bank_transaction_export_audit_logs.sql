create table if not exists finance.bank_transaction_export_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id),
  actor_id uuid not null references auth.users(id),
  actor_label text not null,
  export_format text not null check (export_format in ('XLSX', 'PDF')),
  selected_columns text[] not null,
  filters jsonb not null default '{}'::jsonb,
  row_count integer not null check (row_count >= 0),
  deposit_total bigint not null default 0,
  withdrawal_total bigint not null default 0,
  file_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists bank_transaction_export_audit_logs_org_created_idx
  on finance.bank_transaction_export_audit_logs (organization_id, created_at desc);

create index if not exists bank_transaction_export_audit_logs_actor_idx
  on finance.bank_transaction_export_audit_logs (actor_id);

alter table finance.bank_transaction_export_audit_logs enable row level security;

revoke all on table finance.bank_transaction_export_audit_logs from public, anon, authenticated;
grant select, insert on table finance.bank_transaction_export_audit_logs to service_role;

drop policy if exists bank_transaction_export_audit_logs_service_role on finance.bank_transaction_export_audit_logs;
create policy bank_transaction_export_audit_logs_service_role
  on finance.bank_transaction_export_audit_logs
  for all
  to service_role
  using (true)
  with check (true);

comment on table finance.bank_transaction_export_audit_logs is '은행 거래 검색 결과 파일 내보내기 감사 이력';
comment on column finance.bank_transaction_export_audit_logs.selected_columns is '사용자가 선택한 내보내기 컬럼 순서';
comment on column finance.bank_transaction_export_audit_logs.filters is '내보내기에 적용한 읽기 전용 검색 조건';
