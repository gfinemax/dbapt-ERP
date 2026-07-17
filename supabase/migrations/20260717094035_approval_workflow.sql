create schema if not exists approval;
grant usage on schema approval to service_role;

create sequence if not exists approval.document_no_seq;

create table if not exists approval.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id),
  document_no text not null unique,
  document_type text not null check (document_type in ('GENERAL', 'EXPENSE', 'CONTRACT')),
  title text not null,
  purpose text not null default '',
  body text not null default '',
  drafter_id uuid references core.user_profiles(id),
  drafter_label text not null,
  department_label text not null default '',
  approval_status text not null default 'DRAFT' check (approval_status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'WITHDRAWN', 'CANCELLED')),
  meeting_status text not null default 'NOT_REQUIRED' check (meeting_status in ('NOT_REQUIRED', 'REQUIRED', 'SCHEDULED', 'APPROVED', 'REJECTED', 'DEFERRED')),
  execution_status text not null default 'NOT_LINKED' check (execution_status in ('NOT_LINKED', 'BUDGET_RESERVED', 'EXECUTION_READY', 'EXPENSE_DRAFT', 'EXPENSE_APPROVED', 'PAID', 'VOUCHER_POSTED', 'CLOSED')),
  amount numeric(16,0) not null default 0 check (amount >= 0),
  budget_item text,
  budget_year integer,
  reserved_amount numeric(16,0) not null default 0 check (reserved_amount >= 0),
  counterparty_id uuid references finance.business_partners(id),
  counterparty_name text,
  contract_start_date date,
  contract_end_date date,
  desired_execution_date date,
  expected_effect text not null default '',
  project_name text not null default '',
  security_level text not null default 'INTERNAL' check (security_level in ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL')),
  is_urgent boolean not null default false,
  payment_due_date date,
  payment_method text,
  payment_account_id uuid references finance.bank_accounts(id),
  is_out_of_budget boolean not null default false,
  has_member_burden boolean not null default false,
  evidence_kind text,
  recommended_meeting_body text,
  recommendation_reason text,
  regulation_reference text,
  meeting_confirmed boolean not null default false,
  final_meeting_body text,
  related_document text,
  is_contract_related boolean not null default false,
  is_installment_payment boolean not null default false,
  meeting_id uuid,
  expense_resolution_id text references finance.expense_resolutions(id),
  voucher_id uuid references finance.vouchers(id),
  current_approval_order integer,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists approval.document_lines (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references approval.documents(id) on delete restrict,
  line_no integer not null check (line_no > 0), partner_id uuid references finance.business_partners(id), partner_name text not null default '',
  account_subject_id uuid references finance.account_subjects(id), account_subject_name text not null default '', budget_item text,
  supply_amount numeric(16,0) not null default 0 check (supply_amount >= 0), vat_amount numeric(16,0) not null default 0 check (vat_amount >= 0),
  total_amount numeric(16,0) generated always as (supply_amount + vat_amount) stored, description text not null default '', created_at timestamptz not null default now(),
  unique(document_id, line_no)
);

create table if not exists approval.budgets (
  id uuid primary key default gen_random_uuid(), organization_id uuid references core.organizations(id), fiscal_year integer not null,
  budget_item text not null, approved_amount numeric(16,0) not null default 0 check (approved_amount >= 0),
  executed_amount numeric(16,0) not null default 0 check (executed_amount >= 0), updated_at timestamptz not null default now(),
  unique(organization_id, fiscal_year, budget_item)
);

create table if not exists approval.budget_reservations (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references approval.documents(id) on delete restrict,
  budget_id uuid references approval.budgets(id) on delete restrict, amount numeric(16,0) not null check (amount >= 0),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','RELEASED','CONSUMED','ADJUSTMENT_REQUIRED')),
  released_amount numeric(16,0) not null default 0 check(released_amount >= 0), release_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists approval.meetings (
  id uuid primary key default gen_random_uuid(), organization_id uuid references core.organizations(id), meeting_body text not null check(meeting_body in ('BOARD','DELEGATES','GENERAL_ASSEMBLY')),
  meeting_date date, meeting_round text not null default '', status text not null default 'DRAFT' check(status in ('DRAFT','SCHEDULED','COMPLETED','CANCELLED')),
  minutes_bucket text, minutes_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table approval.documents add constraint approval_documents_meeting_fk foreign key (meeting_id) references approval.meetings(id);

create table if not exists approval.meeting_agendas (
  id uuid primary key default gen_random_uuid(), meeting_id uuid references approval.meetings(id) on delete restrict, document_id uuid not null references approval.documents(id) on delete restrict,
  agenda_no text, title text not null, proposal_reason text not null default '', main_content text not null default '', requested_resolution text not null default '',
  result text check(result is null or result in ('APPROVED','REJECTED','DEFERRED')), conditions text, decided_at timestamptz, created_at timestamptz not null default now(), unique(document_id)
);

create table if not exists approval.contracts (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references approval.documents(id) on delete restrict,
  contract_no text not null unique, title text not null, partner_id uuid references finance.business_partners(id), partner_name text not null,
  contract_amount numeric(16,0) not null check(contract_amount >= 0), paid_amount numeric(16,0) not null default 0 check(paid_amount >= 0),
  start_date date, end_date date, payment_terms text not null default '', status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','TERMINATED','COMPLETED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table approval.documents add column if not exists contract_id uuid references approval.contracts(id) on delete restrict;

create table if not exists approval.contract_payments (
  id uuid primary key default gen_random_uuid(), contract_id uuid not null references approval.contracts(id) on delete restrict,
  expense_resolution_id text references finance.expense_resolutions(id) on delete restrict, scheduled_date date, requested_amount numeric(16,0) not null check(requested_amount>0),
  paid_amount numeric(16,0) not null default 0 check(paid_amount>=0), status text not null default 'SCHEDULED' check(status in ('SCHEDULED','REQUESTED','PAID','CANCELLED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists approval.small_expenses (
  id uuid primary key default gen_random_uuid(), organization_id uuid references core.organizations(id), expense_date date not null,
  partner_name text not null, description text not null, project_name text not null default '', account_subject_name text not null,
  amount numeric(16,0) not null check(amount > 0), payer_label text not null, evidence_bucket text, evidence_path text, memo text not null default '',
  prohibited_reason text, batch_resolution_id text references finance.expense_resolutions(id), created_by_label text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists approval.meeting_rules (
  id uuid primary key default gen_random_uuid(), organization_id uuid references core.organizations(id), rule_name text not null,
  keyword text not null, recommended_body text not null check(recommended_body in ('BOARD','DELEGATES','GENERAL_ASSEMBLY','INTERNAL')),
  reason text not null, regulation_reference text not null default '', priority integer not null default 100, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists approval.approval_steps (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references approval.documents(id) on delete restrict,
  step_order integer not null check (step_order > 0),
  approver_id uuid references core.user_profiles(id),
  approver_label text not null,
  approver_role text not null default '',
  status text not null default 'WAITING' check (status in ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'SKIPPED')),
  comment text,
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, step_order)
);

create table if not exists approval.attachments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references approval.documents(id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  content_type text not null,
  file_size bigint not null check (file_size >= 0),
  uploaded_by_label text not null,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table if not exists approval.audit_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references approval.documents(id) on delete restrict,
  action_type text not null,
  actor_id uuid references core.user_profiles(id),
  actor_label text not null,
  comment text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists approval.settings (
  organization_id uuid primary key references core.organizations(id) on delete cascade,
  meeting_threshold_amount numeric(16,0) not null default 100000000 check (meeting_threshold_amount >= 0),
  small_expense_limit numeric(16,0) not null default 50000 check (small_expense_limit >= 0),
  default_approval_line jsonb not null default '[]'::jsonb,
  material_change_fields text[] not null default array['amount','counterparty_id','budget_item','contract_start_date','contract_end_date'],
  updated_at timestamptz not null default now()
);

create index if not exists approval_documents_status_updated_idx on approval.documents (approval_status, updated_at desc) where deleted_at is null;
create index if not exists approval_documents_drafter_idx on approval.documents (drafter_label, updated_at desc) where deleted_at is null;
create index if not exists approval_documents_execution_idx on approval.documents (execution_status, updated_at desc) where deleted_at is null;
create index if not exists approval_steps_pending_idx on approval.approval_steps (approver_label, status, document_id);
create index if not exists approval_audit_logs_document_idx on approval.audit_logs (document_id, created_at desc);
create index if not exists approval_budget_reservations_active_idx on approval.budget_reservations (budget_id, status) where status='ACTIVE';
create index if not exists approval_small_expenses_month_idx on approval.small_expenses (expense_date, batch_resolution_id) where deleted_at is null;

alter table approval.documents enable row level security;
alter table approval.approval_steps enable row level security;
alter table approval.attachments enable row level security;
alter table approval.audit_logs enable row level security;
alter table approval.settings enable row level security;
alter table approval.document_lines enable row level security;
alter table approval.budgets enable row level security;
alter table approval.budget_reservations enable row level security;
alter table approval.meetings enable row level security;
alter table approval.meeting_agendas enable row level security;
alter table approval.contracts enable row level security;
alter table approval.small_expenses enable row level security;
alter table approval.meeting_rules enable row level security;
alter table approval.contract_payments enable row level security;

grant all on all tables in schema approval to service_role;
grant usage, select on all sequences in schema approval to service_role;

create or replace function approval.prevent_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'approval audit logs are immutable';
end;
$$;

drop trigger if exists approval_audit_logs_immutable on approval.audit_logs;
create trigger approval_audit_logs_immutable
before update or delete on approval.audit_logs
for each row execute function approval.prevent_audit_mutation();

create or replace function approval.next_document_no()
returns text language sql security definer set search_path = approval, public as $$
  select 'APR-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('approval.document_no_seq')::text, 6, '0');
$$;

grant execute on function approval.next_document_no() to service_role;

create or replace function approval.create_document(p_document jsonb,p_steps jsonb,p_lines jsonb,p_submit boolean)
returns uuid language plpgsql security definer set search_path=approval,core,public as $$
declare v_id uuid; v_no text; v_org uuid; v_amount numeric(16,0); v_line_total numeric(16,0);
begin
  select id into v_org from core.organizations where status='active' order by created_at limit 1;
  v_amount:=coalesce((p_document->>'amount')::numeric,0);
  select coalesce(sum(coalesce((line->>'supplyAmount')::numeric,0)+coalesce((line->>'vatAmount')::numeric,0)),0) into v_line_total from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) line;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))>0 and v_line_total<>v_amount then raise exception '세부항목 합계와 기안 총액이 일치하지 않습니다.'; end if;
  if jsonb_array_length(coalesce(p_steps,'[]'::jsonb))=0 then raise exception '결재선이 필요합니다.'; end if;
  v_no:=approval.next_document_no();
  insert into approval.documents(organization_id,document_no,document_type,title,purpose,body,drafter_label,department_label,approval_status,meeting_status,execution_status,amount,budget_item,budget_year,counterparty_name,desired_execution_date,expected_effect,project_name,security_level,is_urgent,payment_due_date,payment_method,is_out_of_budget,has_member_burden,evidence_kind,meeting_confirmed,final_meeting_body,related_document,is_contract_related,is_installment_payment,submitted_at)
  values(v_org,v_no,p_document->>'documentType',p_document->>'title',coalesce(p_document->>'purpose',''),coalesce(p_document->>'body',''),p_document->>'drafterLabel',coalesce(p_document->>'departmentLabel',''),case when p_submit then 'SUBMITTED' else 'DRAFT' end,coalesce(p_document->>'meetingStatus','NOT_REQUIRED'),'NOT_LINKED',v_amount,nullif(p_document->>'budgetItem',''),nullif(p_document->>'fiscalYear','')::integer,nullif(p_document->>'counterpartyName',''),nullif(p_document->>'desiredExecutionDate','')::date,coalesce(p_document->>'expectedEffect',''),coalesce(p_document->>'projectName',''),coalesce(p_document->>'securityLevel','INTERNAL'),coalesce((p_document->>'urgent')::boolean,false),nullif(p_document->>'paymentDueDate','')::date,nullif(p_document->>'paymentMethod',''),coalesce((p_document->>'outOfBudget')::boolean,false),coalesce((p_document->>'memberBurden')::boolean,false),nullif(p_document->>'evidenceKind',''),coalesce((p_document->>'meetingConfirmed')::boolean,false),nullif(p_document->>'finalMeetingBody',''),nullif(p_document->>'relatedDocument',''),coalesce((p_document->>'contractRelated')::boolean,false),coalesce((p_document->>'installmentPayment')::boolean,false),case when p_submit then now() else null end)
  returning id into v_id;
  insert into approval.approval_steps(document_id,step_order,approver_label,approver_role,status)
  select v_id,ordinality,step->>'approverLabel',coalesce(step->>'approverRole',''),case when p_submit and ordinality=1 then 'PENDING' else 'WAITING' end from jsonb_array_elements(p_steps) with ordinality as x(step,ordinality);
  insert into approval.document_lines(document_id,line_no,partner_name,account_subject_name,budget_item,supply_amount,vat_amount,description)
  select v_id,ordinality,coalesce(line->>'partnerName',''),coalesce(line->>'accountSubjectName',''),nullif(line->>'budgetItem',''),coalesce((line->>'supplyAmount')::numeric,0),coalesce((line->>'vatAmount')::numeric,0),coalesce(line->>'description','') from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) with ordinality as x(line,ordinality);
  insert into approval.audit_logs(document_id,action_type,actor_label,after_data) values(v_id,case when p_submit then 'SUBMITTED' else 'CREATED' end,p_document->>'drafterLabel',p_document);
  return v_id;
end; $$;
grant execute on function approval.create_document(jsonb,jsonb,jsonb,boolean) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('approval-attachments','approval-attachments',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create or replace function approval.decide_document(
  p_document_id uuid, p_actor_label text, p_decision text, p_comment text default null
) returns text language plpgsql security definer set search_path=approval,finance,core,public as $$
declare
  v_document approval.documents%rowtype;
  v_step approval.approval_steps%rowtype;
  v_next approval.approval_steps%rowtype;
  v_final_status text;
begin
  select * into v_document from approval.documents where id=p_document_id and deleted_at is null for update;
  if not found or v_document.approval_status not in ('SUBMITTED','IN_REVIEW') then raise exception '결재 가능한 문서가 아닙니다.'; end if;
  select * into v_step from approval.approval_steps where document_id=p_document_id and status='PENDING' for update;
  if not found or v_step.approver_label <> p_actor_label then raise exception '현재 결재자만 처리할 수 있습니다.'; end if;
  if p_decision='REJECT' and coalesce(trim(p_comment),'')='' then raise exception '반려 사유가 필요합니다.'; end if;
  if p_decision not in ('APPROVE','REJECT','REVISION_REQUEST') then raise exception '지원하지 않는 결재 처리입니다.'; end if;

  update approval.approval_steps set status=case when p_decision='APPROVE' then 'APPROVED' else 'REJECTED' end, comment=p_comment, acted_at=now() where id=v_step.id;
  if p_decision='APPROVE' then
    select * into v_next from approval.approval_steps where document_id=p_document_id and step_order>v_step.step_order and status='WAITING' order by step_order limit 1;
    if found then
      update approval.approval_steps set status='PENDING' where id=v_next.id;
      v_final_status := 'IN_REVIEW';
    else
      v_final_status := 'APPROVED';
      if v_document.document_type in ('EXPENSE','CONTRACT') and not v_document.is_out_of_budget then
        insert into approval.budget_reservations(document_id,budget_id,amount)
        select v_document.id,b.id,v_document.amount from approval.budgets b
        where b.organization_id is not distinct from v_document.organization_id and b.fiscal_year=coalesce(v_document.budget_year,extract(year from current_date)::integer) and b.budget_item=v_document.budget_item
        on conflict do nothing;
      end if;
    end if;
  elsif p_decision='REVISION_REQUEST' then v_final_status := 'REVISION_REQUESTED';
  else v_final_status := 'REJECTED'; end if;

  update approval.documents set approval_status=v_final_status,
    reserved_amount=case when v_final_status='APPROVED' and document_type in ('EXPENSE','CONTRACT') and not is_out_of_budget then amount else 0 end,
    execution_status=case when v_final_status='APPROVED' and meeting_status='NOT_REQUIRED' and not is_out_of_budget then 'BUDGET_RESERVED' else 'NOT_LINKED' end,
    approved_at=case when v_final_status='APPROVED' then now() else null end, rejected_at=case when v_final_status in ('REJECTED','REVISION_REQUESTED') then now() else null end, updated_at=now()
  where id=p_document_id;
  insert into approval.audit_logs(document_id,action_type,actor_label,comment,before_data,after_data)
  values(p_document_id,case when p_decision='APPROVE' then 'APPROVED_STEP' when p_decision='REVISION_REQUEST' then 'REVISION_REQUESTED' else 'REJECTED' end,p_actor_label,p_comment,to_jsonb(v_document),jsonb_build_object('approval_status',v_final_status));
  return v_final_status;
end; $$;
grant execute on function approval.decide_document(uuid,text,text,text) to service_role;

create or replace function approval.release_reservation(p_document_id uuid,p_actor_label text,p_action text,p_reason text)
returns void language plpgsql security definer set search_path=approval,public as $$
declare v_document approval.documents%rowtype;
begin
  select * into v_document from approval.documents where id=p_document_id for update;
  if p_action not in ('WITHDRAWN','CANCELLED') then raise exception '지원하지 않는 상태입니다.'; end if;
  update approval.budget_reservations set status='RELEASED',released_amount=amount,release_reason=p_reason,updated_at=now() where document_id=p_document_id and status='ACTIVE';
  update approval.documents set approval_status=p_action,reserved_amount=0,execution_status='NOT_LINKED',updated_at=now() where id=p_document_id;
  insert into approval.audit_logs(document_id,action_type,actor_label,comment,before_data,after_data) values(p_document_id,p_action,p_actor_label,p_reason,to_jsonb(v_document),jsonb_build_object('approval_status',p_action));
end; $$;
grant execute on function approval.release_reservation(uuid,text,text,text) to service_role;

alter table finance.expense_resolutions add column if not exists approval_document_id uuid references approval.documents(id) on delete restrict;
create unique index if not exists expense_resolutions_approval_document_unique_idx on finance.expense_resolutions(approval_document_id) where approval_document_id is not null and deleted_at is null;

create or replace function approval.create_expense_draft(p_document_id uuid,p_actor_label text,p_resolution_data jsonb)
returns text language plpgsql security definer set search_path=approval,finance,public as $$
declare v_document approval.documents%rowtype; v_year text; v_seq integer; v_no text; v_id text; v_data jsonb;
begin
  select * into v_document from approval.documents where id=p_document_id and deleted_at is null for update;
  if not found then raise exception '기안 문서를 찾을 수 없습니다.'; end if;
  if v_document.approval_status<>'APPROVED' or v_document.meeting_status not in ('NOT_REQUIRED','APPROVED') then raise exception '내부결재와 필요한 의결이 완료되어야 합니다.'; end if;
  if v_document.is_out_of_budget then raise exception '예산 외 지출은 예산 변경 또는 의결 완료 전 집행할 수 없습니다.'; end if;
  if v_document.expense_resolution_id is not null then return v_document.expense_resolution_id; end if;
  perform pg_advisory_xact_lock(hashtext('finance.expense_resolution_no'));
  v_year:=to_char(current_date,'YYYY');
  select coalesce(max((regexp_match(resolution_no,'^지결-'||v_year||'-(\d+)$'))[1]::integer),0)+1 into v_seq from finance.expense_resolutions where resolution_no like '지결-'||v_year||'-%';
  v_no:='지결-'||v_year||'-'||lpad(v_seq::text,4,'0'); v_id:='approval-expense-'||p_document_id::text;
  v_data:=p_resolution_data||jsonb_build_object('id',v_id,'resolutionNo',v_no);
  insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,current_approver_label,approval_status,payment_status,resolution_mode,expense_timing,input_method,execution_method,project_name,subject,total_payment_amount,settlement_status,resolution_data,approval_document_id)
  values(v_id,v_document.organization_id,v_no,v_document.drafter_label,null,'작성중','지급전','SINGLE','ADVANCE','MANUAL','VENDOR_DIRECT',v_document.project_name,v_document.title,v_document.amount,'정산없음',v_data,p_document_id);
  update approval.documents set expense_resolution_id=v_id,execution_status='EXPENSE_DRAFT',updated_at=now() where id=p_document_id;
  insert into approval.audit_logs(document_id,action_type,actor_label,after_data) values(p_document_id,'EXPENSE_DRAFT_CREATED',p_actor_label,jsonb_build_object('resolution_id',v_id,'resolution_no',v_no));
  return v_id;
end; $$;
grant execute on function approval.create_expense_draft(uuid,text,jsonb) to service_role;

create or replace function approval.sync_expense_execution() returns trigger language plpgsql security definer set search_path=approval,finance,public as $$
declare v_doc approval.documents%rowtype; v_paid numeric(16,0);
begin
  if new.approval_document_id is null then return new; end if;
  select * into v_doc from approval.documents where id=new.approval_document_id for update;
  v_paid:=coalesce(new.actual_paid_amount,new.total_payment_amount,0);
  if new.payment_status='지급완료' and old.payment_status is distinct from new.payment_status then
    update approval.budget_reservations set status='CONSUMED',released_amount=greatest(amount-v_paid,0),release_reason=case when amount>v_paid then '실제 지급액 차액 해제' else null end,updated_at=now() where document_id=v_doc.id and status='ACTIVE' and v_paid<=amount;
    update approval.budget_reservations set status='ADJUSTMENT_REQUIRED',release_reason='승인금액 초과 지급 재결재 필요',updated_at=now() where document_id=v_doc.id and status='ACTIVE' and v_paid>amount;
    update approval.documents set reserved_amount=case when v_paid>amount then reserved_amount else 0 end,execution_status=case when v_paid>amount then 'NOT_LINKED' else 'PAID' end,approval_status=case when v_paid>amount then 'REVISION_REQUESTED' else approval_status end,updated_at=now() where id=v_doc.id;
    insert into approval.audit_logs(document_id,action_type,actor_label,after_data) values(v_doc.id,case when v_paid>v_doc.amount then 'PAYMENT_EXCEEDED' else 'PAYMENT_COMPLETED' end,'회계 시스템',jsonb_build_object('paid_amount',v_paid));
  end if;
  if new.voucher_status='전표확정' and old.voucher_status is distinct from new.voucher_status then
    update approval.documents set voucher_id=(select id from finance.vouchers where expense_resolution_id=new.id and voucher_no=new.voucher_no limit 1),execution_status='VOUCHER_POSTED',updated_at=now() where id=v_doc.id;
    insert into approval.audit_logs(document_id,action_type,actor_label,after_data) values(v_doc.id,'VOUCHER_POSTED','회계 시스템',jsonb_build_object('voucher_no',new.voucher_no));
  end if;
  return new;
end; $$;
drop trigger if exists approval_sync_expense_execution on finance.expense_resolutions;
create trigger approval_sync_expense_execution after update of payment_status,voucher_status,actual_paid_amount on finance.expense_resolutions for each row execute function approval.sync_expense_execution();

create or replace function approval.create_meeting_agenda(p_document_id uuid,p_actor_label text,p_meeting_body text)
returns uuid language plpgsql security definer set search_path=approval,public as $$
declare v_document approval.documents%rowtype; v_meeting_id uuid; v_agenda_id uuid;
begin
  select * into v_document from approval.documents where id=p_document_id and deleted_at is null for update;
  if not found or v_document.approval_status<>'APPROVED' or v_document.meeting_status not in ('REQUIRED','SCHEDULED') then raise exception '의결이 필요한 승인 문서만 안건을 만들 수 있습니다.'; end if;
  if p_meeting_body not in ('BOARD','DELEGATES','GENERAL_ASSEMBLY') then raise exception '올바른 의결기관이 아닙니다.'; end if;
  if v_document.meeting_id is not null then return v_document.meeting_id; end if;
  insert into approval.meetings(organization_id,meeting_body,status) values(v_document.organization_id,p_meeting_body,'DRAFT') returning id into v_meeting_id;
  insert into approval.meeting_agendas(meeting_id,document_id,title,proposal_reason,main_content,requested_resolution)
  values(v_meeting_id,p_document_id,v_document.title,v_document.purpose,v_document.body,'기안 내용 및 집행 승인') returning id into v_agenda_id;
  update approval.documents set meeting_id=v_meeting_id,meeting_status='SCHEDULED',final_meeting_body=p_meeting_body,updated_at=now() where id=p_document_id;
  insert into approval.audit_logs(document_id,action_type,actor_label,after_data) values(p_document_id,'MEETING_AGENDA_CREATED',p_actor_label,jsonb_build_object('meeting_id',v_meeting_id,'agenda_id',v_agenda_id,'meeting_body',p_meeting_body));
  return v_meeting_id;
end; $$;
grant execute on function approval.create_meeting_agenda(uuid,text,text) to service_role;

create or replace function approval.decide_meeting_agenda(p_document_id uuid,p_actor_label text,p_result text,p_meeting_date date,p_round text,p_agenda_no text,p_conditions text default null)
returns void language plpgsql security definer set search_path=approval,public as $$
declare v_document approval.documents%rowtype;
begin
  select * into v_document from approval.documents where id=p_document_id for update;
  if v_document.meeting_id is null or p_result not in ('APPROVED','REJECTED','DEFERRED') then raise exception '연결된 안건 또는 의결 결과를 확인해주세요.'; end if;
  update approval.meetings set meeting_date=p_meeting_date,meeting_round=p_round,status='COMPLETED',updated_at=now() where id=v_document.meeting_id;
  update approval.meeting_agendas set agenda_no=p_agenda_no,result=p_result,conditions=p_conditions,decided_at=now() where document_id=p_document_id;
  update approval.documents set meeting_status=p_result,execution_status=case when p_result='APPROVED' and reserved_amount>0 then 'EXECUTION_READY' else 'NOT_LINKED' end,updated_at=now() where id=p_document_id;
  insert into approval.audit_logs(document_id,action_type,actor_label,comment,after_data) values(p_document_id,'MEETING_DECIDED',p_actor_label,p_conditions,jsonb_build_object('result',p_result,'meeting_date',p_meeting_date,'round',p_round,'agenda_no',p_agenda_no));
end; $$;
grant execute on function approval.decide_meeting_agenda(uuid,text,text,date,text,text,text) to service_role;

create or replace function approval.create_contract(p_document_id uuid,p_actor_label text,p_payment_terms text)
returns uuid language plpgsql security definer set search_path=approval,public as $$
declare v_document approval.documents%rowtype; v_contract_id uuid; v_no text;
begin
  select * into v_document from approval.documents where id=p_document_id for update;
  if v_document.document_type<>'CONTRACT' or v_document.approval_status<>'APPROVED' or v_document.meeting_status not in ('NOT_REQUIRED','APPROVED') then raise exception '결재와 의결이 완료된 계약기안만 계약으로 연결할 수 있습니다.'; end if;
  if v_document.contract_id is not null then return v_document.contract_id; end if;
  v_no:='CON-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into approval.contracts(document_id,contract_no,title,partner_id,partner_name,contract_amount,start_date,end_date,payment_terms,status)
  values(p_document_id,v_no,v_document.title,v_document.counterparty_id,coalesce(v_document.counterparty_name,'미지정'),v_document.amount,v_document.contract_start_date,v_document.contract_end_date,p_payment_terms,'ACTIVE') returning id into v_contract_id;
  update approval.documents set contract_id=v_contract_id,execution_status=case when reserved_amount>0 then 'EXECUTION_READY' else execution_status end,updated_at=now() where id=p_document_id;
  insert into approval.audit_logs(document_id,action_type,actor_label,after_data) values(p_document_id,'CONTRACT_LINKED',p_actor_label,jsonb_build_object('contract_id',v_contract_id,'contract_no',v_no));
  return v_contract_id;
end; $$;
grant execute on function approval.create_contract(uuid,text,text) to service_role;

create or replace function approval.guard_contract_payment() returns trigger language plpgsql as $$
declare v_limit numeric(16,0); v_total numeric(16,0);
begin
  select contract_amount into v_limit from approval.contracts where id=new.contract_id for update;
  select coalesce(sum(requested_amount),0) into v_total from approval.contract_payments where contract_id=new.contract_id and status<>'CANCELLED' and id<>new.id;
  if v_total+new.requested_amount>v_limit then raise exception '계약금액을 초과하는 지급 요청입니다.'; end if;
  return new;
end; $$;
create trigger approval_contract_payment_limit before insert or update of requested_amount,status on approval.contract_payments for each row execute function approval.guard_contract_payment();

create or replace function approval.create_small_expense_batch(p_ids uuid[],p_actor_label text,p_resolution_data jsonb)
returns text language plpgsql security definer set search_path=approval,finance,public as $$
declare v_total numeric(16,0); v_month text; v_count integer; v_year text; v_seq integer; v_no text; v_id text; v_org uuid; v_data jsonb;
begin
  select sum(amount),min(to_char(expense_date,'YYYY-MM')),count(distinct to_char(expense_date,'YYYY-MM')),min(organization_id)
  into v_total,v_month,v_count,v_org from approval.small_expenses where id=any(p_ids) and deleted_at is null and batch_resolution_id is null;
  if v_total is null or v_count<>1 then raise exception '같은 월의 미처리 소액경비만 일괄 처리할 수 있습니다.'; end if;
  perform pg_advisory_xact_lock(hashtext('finance.expense_resolution_no'));
  v_year:=to_char(current_date,'YYYY');
  select coalesce(max((regexp_match(resolution_no,'^지결-'||v_year||'-(\d+)$'))[1]::integer),0)+1 into v_seq from finance.expense_resolutions where resolution_no like '지결-'||v_year||'-%';
  v_no:='지결-'||v_year||'-'||lpad(v_seq::text,4,'0'); v_id:='small-expense-'||replace(gen_random_uuid()::text,'-','');
  v_data:=p_resolution_data||jsonb_build_object('id',v_id,'resolutionNo',v_no,'totalPaymentAmount',v_total);
  insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,resolution_mode,expense_timing,input_method,execution_method,subject,total_payment_amount,settlement_status,resolution_data)
  values(v_id,v_org,v_no,p_actor_label,'작성중','지급전','PROJECT_BULK','REIMBURSEMENT','MANUAL','EMPLOYEE_ADVANCE',v_month||' 소액경비 일괄결의',v_total,'정산대기',v_data);
  update approval.small_expenses set batch_resolution_id=v_id,updated_at=now() where id=any(p_ids) and batch_resolution_id is null;
  return v_id;
end; $$;
grant execute on function approval.create_small_expense_batch(uuid[],text,jsonb) to service_role;

create or replace function approval.update_document(p_document_id uuid,p_actor_label text,p_changes jsonb)
returns void language plpgsql security definer set search_path=approval,public as $$
declare v_before approval.documents%rowtype; v_material boolean;
begin
  select * into v_before from approval.documents where id=p_document_id and deleted_at is null for update;
  if not found or v_before.approval_status in ('WITHDRAWN','CANCELLED') then raise exception '수정할 수 없는 문서입니다.'; end if;
  v_material:=v_before.amount is distinct from coalesce(nullif(p_changes->>'amount','')::numeric,v_before.amount)
    or v_before.counterparty_name is distinct from coalesce(p_changes->>'counterpartyName',v_before.counterparty_name)
    or v_before.budget_item is distinct from coalesce(p_changes->>'budgetItem',v_before.budget_item)
    or v_before.project_name is distinct from coalesce(p_changes->>'projectName',v_before.project_name);
  update approval.documents set title=coalesce(nullif(p_changes->>'title',''),title),amount=coalesce(nullif(p_changes->>'amount','')::numeric,amount),counterparty_name=coalesce(p_changes->>'counterpartyName',counterparty_name),budget_item=coalesce(p_changes->>'budgetItem',budget_item),project_name=coalesce(p_changes->>'projectName',project_name),
    approval_status=case when v_material and v_before.approval_status='APPROVED' then 'REVISION_REQUESTED' else approval_status end,
    execution_status=case when v_material and v_before.approval_status='APPROVED' then 'NOT_LINKED' else execution_status end,
    reserved_amount=case when v_material and v_before.approval_status='APPROVED' then 0 else reserved_amount end,updated_at=now() where id=p_document_id;
  if v_material and v_before.approval_status='APPROVED' then
    update approval.budget_reservations set status='RELEASED',released_amount=amount,release_reason='승인 후 중요정보 변경',updated_at=now() where document_id=p_document_id and status='ACTIVE';
    update approval.approval_steps set status=case when step_order=1 then 'PENDING' else 'WAITING' end,comment=null,acted_at=null where document_id=p_document_id;
  end if;
  insert into approval.audit_logs(document_id,action_type,actor_label,before_data,after_data) values(p_document_id,case when v_material and v_before.approval_status='APPROVED' then 'APPROVAL_INVALIDATED' else 'UPDATED' end,p_actor_label,to_jsonb(v_before),p_changes);
end; $$;
grant execute on function approval.update_document(uuid,text,jsonb) to service_role;
