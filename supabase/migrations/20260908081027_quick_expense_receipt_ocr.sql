-- Attach the existing evidence OCR pipeline to quick-expense originals.
create table finance.quick_expense_evidence (
  ocr_job_id uuid primary key references finance.expense_evidence_ocr_jobs(id) on delete restrict,
  organization_id uuid not null references core.organizations(id) on delete restrict,
  quick_expense_id uuid not null references finance.quick_expense_records(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, quick_expense_id, ocr_job_id)
);
create index quick_expense_evidence_record_idx on finance.quick_expense_evidence(organization_id,quick_expense_id,created_at desc);

create table finance.quick_expense_operations (
  organization_id uuid not null references core.organizations(id) on delete restrict,
  operation_key text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  command text not null,
  input jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (organization_id,operation_key)
);

create table finance.quick_expense_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  quick_expense_id uuid not null references finance.quick_expense_records(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
create index quick_expense_audit_record_idx on finance.quick_expense_audit(organization_id,quick_expense_id,created_at desc);

alter table finance.quick_expense_evidence enable row level security;
alter table finance.quick_expense_operations enable row level security;
alter table finance.quick_expense_audit enable row level security;
revoke all on finance.quick_expense_evidence,finance.quick_expense_operations,finance.quick_expense_audit from public,anon,authenticated;
grant select,insert on finance.quick_expense_evidence,finance.quick_expense_operations,finance.quick_expense_audit to service_role;

create function finance.quick_expense_command(p_org uuid,p_actor uuid,p_command text,p_id uuid,p_data jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; q finance.quick_expense_records; op finance.quick_expense_operations;
 job finance.expense_evidence_ocr_jobs; before_value jsonb; result jsonb; description text; counterparty_value text;
begin
 if p_org is null or p_actor is null or p_id is null or jsonb_typeof(p_data) is distinct from 'object'
   or coalesce(length(trim(p_key)),0) not between 1 and 200 then raise exception '처리 정보가 올바르지 않습니다.'; end if;
 m:=finance.workflow_actor(p_org,p_actor);
 if not (m.permissions && array['ADMIN','APPROVE','PAY']) then raise exception '간편지출 수정 권한이 없습니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_id::text,741));
 select * into op from finance.quick_expense_operations where organization_id=p_org and operation_key=p_key;
 if found then
  if op.actor_id<>p_actor or op.command<>p_command or op.input<>p_data then raise exception '다른 처리에 사용된 처리키입니다.'; end if;
  return op.result;
 end if;
 select * into q from finance.quick_expense_records where organization_id=p_org and id=p_id for update;
 if not found then raise exception '조직의 간편지출을 찾을 수 없습니다.'; end if;
 before_value:=jsonb_build_object('usage_description',q.usage_description,'counterparty',q.counterparty,'evidence_status',q.evidence_status,'updated_at',q.updated_at);
 if p_command='UPDATE_DETAILS' then
  if p_data->>'expected_updated_at' is distinct from q.updated_at::text then raise exception '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 확인해주세요.'; end if;
  description:=trim(coalesce(p_data->>'usage_description',''));
  counterparty_value:=trim(coalesce(p_data->>'counterparty',''));
  if length(description) not between 1 and 500 then raise exception '사용내용은 1자 이상 500자 이하로 입력해주세요.'; end if;
  if length(counterparty_value)>200 then raise exception '거래처는 200자 이하로 입력해주세요.'; end if;
  update finance.quick_expense_records set usage_description=description,counterparty=counterparty_value,updated_at=clock_timestamp() where id=q.id returning * into q;
  result:=jsonb_build_object('id',q.id,'usage_description',q.usage_description,'counterparty',q.counterparty,'updated_at',q.updated_at);
  insert into finance.quick_expense_audit(organization_id,quick_expense_id,actor_id,action,before_data,after_data)
   values(p_org,q.id,p_actor,p_command,before_value,result);
 elsif p_command='ATTACH_EVIDENCE' then
  select * into job from finance.expense_evidence_ocr_jobs where id=(p_data->>'ocr_job_id')::uuid and organization_id=p_org;
  if not found or job.created_by is distinct from p_actor then raise exception '본인이 업로드한 OCR 영수증을 찾을 수 없습니다.'; end if;
  if exists(select 1 from finance.quick_expense_evidence where ocr_job_id=job.id and quick_expense_id<>q.id) then raise exception '이미 다른 간편지출에 연결된 영수증입니다.'; end if;
  insert into finance.quick_expense_evidence(ocr_job_id,organization_id,quick_expense_id,created_by)
   values(job.id,p_org,q.id,p_actor) on conflict(ocr_job_id) do nothing;
  update finance.quick_expense_records set evidence_status=case when evidence_status='NONE' then 'GENERAL' else evidence_status end,updated_at=clock_timestamp() where id=q.id returning * into q;
  result:=jsonb_build_object('id',q.id,'ocr_job_id',job.id,'evidence_status',q.evidence_status,'updated_at',q.updated_at);
  insert into finance.quick_expense_audit(organization_id,quick_expense_id,actor_id,action,before_data,after_data)
   values(p_org,q.id,p_actor,p_command,before_value,result);
 else raise exception '지원하지 않는 간편지출 처리입니다.';
 end if;
 insert into finance.quick_expense_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,p_key,p_actor,p_command,p_data,result);
 return result;
end $$;
revoke all on function finance.quick_expense_command(uuid,uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function finance.quick_expense_command(uuid,uuid,text,uuid,jsonb,text) to service_role;

create function finance.quick_expense_history_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception '간편지출 증빙과 감사 기록은 덮어쓰거나 삭제할 수 없습니다.'; end $$;
create trigger quick_expense_evidence_immutable before update or delete on finance.quick_expense_evidence for each row execute function finance.quick_expense_history_immutable();
create trigger quick_expense_operations_immutable before update or delete on finance.quick_expense_operations for each row execute function finance.quick_expense_history_immutable();
create trigger quick_expense_audit_immutable before update or delete on finance.quick_expense_audit for each row execute function finance.quick_expense_history_immutable();
revoke all on function finance.quick_expense_history_immutable() from public,anon,authenticated;

create or replace function finance.expense_workspace(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare member finance.reimbursement_members; staff boolean; records jsonb;
begin
 member:=finance.workflow_actor(p_org,p_actor);
 staff:=member.permissions && array['ADMIN','APPROVE','PAY','CLOSE','SENIOR'];
 with originals as (
  select 'RESOLUTION'::text source_kind,r.id::text source_id,r.resolution_no::text number,coalesce(nullif(r.subject,''),r.resolution_no)::text title,r.total_payment_amount amount,
   r.created_at,r.updated_at,r.actual_expense_date::text used_at,r.accounting_date::text accounting_date,null::text budget_month,r.approval_status::text approval_status,r.payment_status::text payment_status,
   r.author_label::text author_label,coalesce(r.resolution_data->>'paymentTarget',r.resolution_data->>'accountHolder')::text counterparty
  from finance.expense_resolutions r where staff and r.organization_id=p_org and r.deleted_at is null
  union all
  select 'QUICK',q.id::text,null,q.usage_description,q.amount,q.created_at,q.updated_at,q.occurred_at::text,null,null,q.record_status,null,q.recorded_by_label,q.counterparty
  from finance.quick_expense_records q where staff and q.organization_id=p_org
  union all
  select 'PERSONAL',p.id::text,null,p.merchant||' · '||p.purpose,p.amount,p.submitted_at,p.submitted_at,p.used_on::text,null,p.budget_month::text,p.status,
   case when p.status='PAID' then '지급완료' else null end,m.display_name,p.merchant
  from finance.personal_reimbursements p left join finance.reimbursement_members m on m.organization_id=p.organization_id and m.user_id=p.applicant_id
  where p.organization_id=p_org and (staff or p.applicant_id=p_actor)
 )
 select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('transaction_id',t.id,'can_connect',t.id is null,
  'amounts',case when t.id is null then null else finance.workflow_transaction_amounts(p_org,t.id) end,
  'evidence_files',case when o.source_kind<>'QUICK' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
    'ocr_job_id',j.id,'file_name',j.original_filename,'content_type',j.content_type,'storage_path',j.storage_path,
    'evidence_type',j.evidence_type,'status',j.status,'stage',j.stage,'progress',j.progress,'result_data',j.result_data,'error_message',j.error_message,'created_at',e.created_at) order by e.created_at desc)
    from finance.quick_expense_evidence e join finance.expense_evidence_ocr_jobs j on j.id=e.ocr_job_id
    where e.organization_id=p_org and e.quick_expense_id=o.source_id::uuid),'[]'::jsonb) end,
  'trust_items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'request_id',i.request_id,'request_no',r.request_no,'status',i.status,'requested_amount',i.requested_amount,'approved_amount',i.approved_amount,'paid_amount',finance.trust_item_paid(p_org,i.id),'needs_review',i.needs_review) order by r.created_at desc,i.id)
   from finance.workflow_trust_items i join finance.workflow_trust_requests r on r.id=i.request_id and r.organization_id=p_org where i.organization_id=p_org and i.transaction_id=t.id),'[]'),
  'vouchers',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'voucher_no',v.voucher_no,'status',v.approval_status,'source_kind',l.source_kind) order by v.voucher_date desc,v.id)
   from finance.vouchers v left join finance.workflow_voucher_links l on l.voucher_id=v.id and l.organization_id=p_org
   where v.organization_id=p_org and v.deleted_at is null and ((o.source_kind='RESOLUTION' and v.expense_resolution_id=o.source_id) or
    (l.source_kind='RECOGNITION' and l.source_id=t.id) or (l.source_kind='PAYMENT' and exists(select 1 from finance.workflow_allocations a where a.organization_id=p_org and a.payment_id=l.source_id and a.transaction_id=t.id)))),'[]')) order by o.created_at desc,o.source_kind,o.source_id),'[]') into records
 from originals o left join finance.workflow_transactions t on t.organization_id=p_org and t.source_kind=o.source_kind and t.source_id=o.source_id;
 return jsonb_build_object('records',records,'staff',staff);
end $$;
notify pgrst, 'reload schema';
