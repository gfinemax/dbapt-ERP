create table if not exists approval.approval_line_rules(
  id uuid primary key default gen_random_uuid(),organization_id uuid references core.organizations(id),rule_name text not null,
  document_type text check(document_type is null or document_type in ('GENERAL','EXPENSE','CONTRACT')),
  min_amount numeric(16,0) not null default 0 check(min_amount>=0),max_amount numeric(16,0) check(max_amount is null or max_amount>=min_amount),
  steps jsonb not null check(jsonb_typeof(steps)='array' and jsonb_array_length(steps)>0),priority integer not null default 100,is_active boolean not null default true,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table approval.approval_line_rules enable row level security;
grant all on approval.approval_line_rules to service_role;
create index if not exists approval_line_rules_match_idx on approval.approval_line_rules(organization_id,document_type,min_amount,priority) where is_active;

insert into core.roles(id,name,description) values
('approval_drafter','기안자','내 기안·보완·반려 문서 우선'),
('approval_approver','결재자·사무국','결재·의결·집행 예정 업무 우선'),
('approval_chair','조합장','최종결재·고액계약·예산초과 업무 우선'),
('approval_accounting','회계담당자','지출결의·지급·증빙·전표 업무 우선'),
('approval_auditor','감사','예산초과·승인 후 변경·취소·계약초과 업무 우선')
on conflict(id) do update set name=excluded.name,description=excluded.description;
