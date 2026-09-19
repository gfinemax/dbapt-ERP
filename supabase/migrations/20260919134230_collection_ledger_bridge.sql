-- Explicit, organization-scoped collection/refund ledger.
-- Member identity is supplied as an authoritative external ID; names are snapshots only.
create table finance.collection_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  external_member_id text not null check(length(trim(external_member_id)) between 1 and 200),
  member_no text,
  member_name_snapshot text not null check(length(trim(member_name_snapshot)) between 1 and 200),
  assessment_code text not null check(length(trim(assessment_code)) between 1 and 100),
  due_date date,
  assessed_amount numeric(16,0) not null check(assessed_amount>0),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','CANCELLED')),
  lock_version integer not null default 1 check(lock_version>0),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,external_member_id,assessment_code),
  unique(organization_id,id)
);

create table finance.collection_receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  assessment_id uuid not null,
  bank_transaction_id uuid not null references finance.bank_transactions(id) on delete restrict,
  amount numeric(16,0) not null check(amount>0),
  reason text not null check(length(trim(reason)) between 1 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,assessment_id,bank_transaction_id),
  foreign key(organization_id,assessment_id) references finance.collection_assessments(organization_id,id)
);

create table finance.collection_receipt_reversals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  allocation_id uuid not null unique,
  reason text not null check(length(trim(reason)) between 1 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(organization_id,allocation_id) references finance.collection_receipt_allocations(organization_id,id)
);

create table finance.collection_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_allocation_id uuid not null,
  external_member_id text not null,
  member_name_snapshot text not null,
  reason text not null check(length(trim(reason)) between 1 and 500),
  requested_amount numeric(16,0) not null check(requested_amount>0),
  status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','PAID','CANCELLED')),
  bank_transaction_id uuid unique references finance.bank_transactions(id) on delete restrict,
  lock_version integer not null default 1 check(lock_version>0),
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  paid_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,source_allocation_id) references finance.collection_receipt_allocations(organization_id,id),
  check((status='DRAFT' and approved_by is null and approved_at is null and bank_transaction_id is null and paid_by is null and paid_at is null)
    or (status='APPROVED' and approved_by is not null and approved_at is not null and bank_transaction_id is null and paid_by is null and paid_at is null)
    or (status='PAID' and approved_by is not null and approved_at is not null and bank_transaction_id is not null and paid_by is not null and paid_at is not null)
    or status='CANCELLED')
);
create unique index collection_refund_open_source_idx on finance.collection_refunds(organization_id,source_allocation_id) where status<>'CANCELLED';

create table finance.collection_ledger_operations (
  organization_id uuid not null references core.organizations(id) on delete restrict,
  operation_key text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  command text not null,
  input jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(organization_id,operation_key)
);

create table finance.collection_ledger_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  entity_id uuid not null,
  action text not null,
  reason text not null default '',
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);

create index collection_assessment_member_idx on finance.collection_assessments(organization_id,external_member_id,created_at desc);
create index collection_allocation_bank_idx on finance.collection_receipt_allocations(organization_id,bank_transaction_id);
create index collection_refund_status_idx on finance.collection_refunds(organization_id,status,created_at desc);

alter table finance.collection_assessments enable row level security;
alter table finance.collection_receipt_allocations enable row level security;
alter table finance.collection_receipt_reversals enable row level security;
alter table finance.collection_refunds enable row level security;
alter table finance.collection_ledger_operations enable row level security;
alter table finance.collection_ledger_events enable row level security;
revoke all on finance.collection_assessments,finance.collection_receipt_allocations,finance.collection_receipt_reversals,finance.collection_refunds,finance.collection_ledger_operations,finance.collection_ledger_events from public,anon,authenticated;
grant select,insert,update on finance.collection_assessments,finance.collection_refunds to service_role;
grant select,insert on finance.collection_receipt_allocations,finance.collection_receipt_reversals,finance.collection_ledger_operations,finance.collection_ledger_events to service_role;
create policy collection_assessments_server on finance.collection_assessments for all to service_role using(true) with check(true);
create policy collection_allocations_server on finance.collection_receipt_allocations for all to service_role using(true) with check(true);
create policy collection_reversals_server on finance.collection_receipt_reversals for all to service_role using(true) with check(true);
create policy collection_refunds_server on finance.collection_refunds for all to service_role using(true) with check(true);
create policy collection_operations_server on finance.collection_ledger_operations for all to service_role using(true) with check(true);
create policy collection_events_server on finance.collection_ledger_events for all to service_role using(true) with check(true);

create function finance.collection_ledger_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception '수납·환급 연결과 감사 기록은 덮어쓰거나 삭제할 수 없습니다.'; end $$;
create trigger collection_allocation_immutable before update or delete on finance.collection_receipt_allocations for each row execute function finance.collection_ledger_immutable();
create trigger collection_reversal_immutable before update or delete on finance.collection_receipt_reversals for each row execute function finance.collection_ledger_immutable();
create trigger collection_operation_immutable before update or delete on finance.collection_ledger_operations for each row execute function finance.collection_ledger_immutable();
create trigger collection_event_immutable before update or delete on finance.collection_ledger_events for each row execute function finance.collection_ledger_immutable();

create function finance.collection_ledger_read(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members; assessments jsonb; allocations jsonb; refunds jsonb; deposits jsonb; withdrawals jsonb;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not (m.permissions && array['ADMIN','CLOSE','PAY','APPROVE','SENIOR']) then raise exception '수납·환급 원장 조회 권한이 필요합니다.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'external_member_id',a.external_member_id,'member_no',a.member_no,'member_name_snapshot',a.member_name_snapshot,
  'assessment_code',a.assessment_code,'due_date',a.due_date,'assessed_amount',a.assessed_amount,'status',a.status,'lock_version',a.lock_version,
  'allocated_amount',coalesce((select sum(x.amount) from finance.collection_receipt_allocations x left join finance.collection_receipt_reversals r on r.allocation_id=x.id where x.organization_id=p_org and x.assessment_id=a.id and r.id is null),0)) order by a.created_at desc),'[]') into assessments
 from finance.collection_assessments a where a.organization_id=p_org;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'assessment_id',x.assessment_id,'bank_transaction_id',x.bank_transaction_id,'amount',x.amount,'reason',x.reason,
  'created_at',x.created_at,'reversed',r.id is not null,'reversal_reason',r.reason,'bank_date',b.transacted_at,'bank_description',b.description) order by x.created_at desc),'[]') into allocations
 from finance.collection_receipt_allocations x join finance.bank_transactions b on b.id=x.bank_transaction_id and b.organization_id=p_org left join finance.collection_receipt_reversals r on r.allocation_id=x.id
 where x.organization_id=p_org;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'source_allocation_id',f.source_allocation_id,'external_member_id',f.external_member_id,'member_name_snapshot',f.member_name_snapshot,
  'reason',f.reason,'requested_amount',f.requested_amount,'status',f.status,'bank_transaction_id',f.bank_transaction_id,'lock_version',f.lock_version,'created_by',f.created_by,
  'approved_at',f.approved_at,'paid_at',f.paid_at,'created_at',f.created_at) order by f.created_at desc),'[]') into refunds from finance.collection_refunds f where f.organization_id=p_org;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'transacted_at',b.transacted_at,'description',b.description,'counterparty',b.counterparty,'amount',b.deposit_amount,
  'available_amount',b.deposit_amount-coalesce((select sum(x.amount) from finance.collection_receipt_allocations x left join finance.collection_receipt_reversals r on r.allocation_id=x.id where x.organization_id=p_org and x.bank_transaction_id=b.id and r.id is null),0)) order by b.transacted_at desc,b.id),'[]') into deposits
 from finance.bank_transactions b where b.organization_id=p_org and b.deleted_at is null and b.deposit_amount>0 and not exists(select 1 from finance.workflow_payments p where p.organization_id=p_org and p.bank_transaction_id=b.id)
 and b.deposit_amount>coalesce((select sum(x.amount) from finance.collection_receipt_allocations x left join finance.collection_receipt_reversals r on r.allocation_id=x.id where x.organization_id=p_org and x.bank_transaction_id=b.id and r.id is null),0);
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'transacted_at',b.transacted_at,'description',b.description,'counterparty',b.counterparty,'amount',b.withdrawal_amount) order by b.transacted_at desc,b.id),'[]') into withdrawals
 from finance.bank_transactions b where b.organization_id=p_org and b.deleted_at is null and b.withdrawal_amount>0
 and not exists(select 1 from finance.workflow_payments p where p.organization_id=p_org and p.bank_transaction_id=b.id)
 and not exists(select 1 from finance.collection_refunds f where f.organization_id=p_org and f.bank_transaction_id=b.id);
 return jsonb_build_object('assessments',assessments,'allocations',allocations,'refunds',refunds,'deposit_candidates',deposits,'withdrawal_candidates',withdrawals);
end $$;

create function finance.collection_ledger_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; saved finance.collection_ledger_operations; a finance.collection_assessments; x finance.collection_receipt_allocations; b finance.bank_transactions; f finance.collection_refunds;
 result jsonb; before_value jsonb; entity uuid; amount_value numeric; allocated numeric; reason_value text; version_value integer;
begin
 if p_org is null or p_actor is null or jsonb_typeof(p_data) is distinct from 'object' or coalesce(length(trim(p_key)),0) not between 1 and 200 then raise exception '처리 정보를 확인해주세요.'; end if;
 m:=finance.workflow_actor(p_org,p_actor);
 if p_command in ('ASSESSMENT_SAVE','REFUND_SAVE','REFUND_APPROVE','REFUND_CANCEL') then
  if not (m.permissions && array['ADMIN','CLOSE','APPROVE']) then raise exception '수납·환급 결정 권한이 필요합니다.'; end if;
 elsif p_command in ('RECEIPT_ALLOCATE','RECEIPT_REVERSE','REFUND_PAY') then
  if not (m.permissions && array['ADMIN','PAY']) then raise exception '실제 입출금 연결 권한이 필요합니다.'; end if;
 else raise exception '지원하지 않는 수납·환급 처리입니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_key,912));
 select * into saved from finance.collection_ledger_operations where organization_id=p_org and operation_key=p_key;
 if found then
  if saved.actor_id<>p_actor or saved.command<>p_command or saved.input<>p_data then raise exception '다른 처리에 사용된 처리키입니다.'; end if;
  return saved.result;
 end if;
 reason_value:=trim(coalesce(p_data->>'reason',''));
 if p_command='ASSESSMENT_SAVE' then
  amount_value:=nullif(p_data->>'assessed_amount','')::numeric;
  if coalesce(length(trim(p_data->>'external_member_id')),0) not between 1 and 200 or coalesce(length(trim(p_data->>'member_name_snapshot')),0) not between 1 and 200
    or coalesce(length(trim(p_data->>'assessment_code')),0) not between 1 and 100 or amount_value<=0 then raise exception '고유 조합원 ID와 부과 정보를 확인해주세요.'; end if;
  if p_data->>'id' is null then
   insert into finance.collection_assessments(organization_id,external_member_id,member_no,member_name_snapshot,assessment_code,due_date,assessed_amount,created_by,updated_by)
   values(p_org,trim(p_data->>'external_member_id'),nullif(trim(coalesce(p_data->>'member_no','')),''),trim(p_data->>'member_name_snapshot'),trim(p_data->>'assessment_code'),nullif(p_data->>'due_date','')::date,amount_value,p_actor,p_actor) returning * into a;
   before_value:=null;
  else
   select * into a from finance.collection_assessments where organization_id=p_org and id=(p_data->>'id')::uuid for update;
   if not found or a.status<>'ACTIVE' or a.lock_version<>coalesce((p_data->>'lock_version')::integer,0) then raise exception '최신 부과 원본을 확인해주세요.'; end if;
   select coalesce(sum(y.amount),0) into allocated from finance.collection_receipt_allocations y left join finance.collection_receipt_reversals r on r.allocation_id=y.id where y.organization_id=p_org and y.assessment_id=a.id and r.id is null;
   if amount_value<allocated then raise exception '이미 배분한 수납액보다 부과액을 줄일 수 없습니다.'; end if;
   before_value:=to_jsonb(a);
   update finance.collection_assessments set external_member_id=trim(p_data->>'external_member_id'),member_no=nullif(trim(coalesce(p_data->>'member_no','')),''),member_name_snapshot=trim(p_data->>'member_name_snapshot'),assessment_code=trim(p_data->>'assessment_code'),due_date=nullif(p_data->>'due_date','')::date,assessed_amount=amount_value,lock_version=lock_version+1,updated_by=p_actor,updated_at=clock_timestamp() where id=a.id returning * into a;
  end if;
  entity:=a.id; result:=jsonb_build_object('id',a.id,'status',a.status,'lock_version',a.lock_version);
 elsif p_command='RECEIPT_ALLOCATE' then
  amount_value:=nullif(p_data->>'amount','')::numeric;
  if amount_value<=0 or length(reason_value)<1 then raise exception '배분 금액과 확인 사유가 필요합니다.'; end if;
  select * into a from finance.collection_assessments where organization_id=p_org and id=(p_data->>'assessment_id')::uuid and status='ACTIVE' for update;
  select * into b from finance.bank_transactions where organization_id=p_org and id=(p_data->>'bank_transaction_id')::uuid and deleted_at is null for update;
  if a.id is null or b.id is null or b.deposit_amount<=0 or exists(select 1 from finance.workflow_payments p where p.organization_id=p_org and p.bank_transaction_id=b.id) then raise exception '수납 부과 또는 실제 입금 원본을 확인해주세요.'; end if;
  select coalesce(sum(y.amount),0) into allocated from finance.collection_receipt_allocations y left join finance.collection_receipt_reversals r on r.allocation_id=y.id where y.organization_id=p_org and y.assessment_id=a.id and r.id is null;
  if allocated+amount_value>a.assessed_amount then raise exception '부과액을 초과해 수납 배분할 수 없습니다.'; end if;
  select coalesce(sum(y.amount),0) into allocated from finance.collection_receipt_allocations y left join finance.collection_receipt_reversals r on r.allocation_id=y.id where y.organization_id=p_org and y.bank_transaction_id=b.id and r.id is null;
  if allocated+amount_value>b.deposit_amount then raise exception '실제 입금액을 초과해 배분할 수 없습니다.'; end if;
  insert into finance.collection_receipt_allocations(organization_id,assessment_id,bank_transaction_id,amount,reason,created_by) values(p_org,a.id,b.id,amount_value,reason_value,p_actor) returning * into x;
  entity:=x.id; result:=jsonb_build_object('id',x.id,'status','ALLOCATED','lock_version',1); before_value:=null;
 elsif p_command='RECEIPT_REVERSE' then
  if length(reason_value)<1 then raise exception '수납 배분 취소 사유가 필요합니다.'; end if;
  select * into x from finance.collection_receipt_allocations where organization_id=p_org and id=(p_data->>'id')::uuid;
  if not found or exists(select 1 from finance.collection_receipt_reversals r where r.organization_id=p_org and r.allocation_id=x.id) or exists(select 1 from finance.collection_refunds rf where rf.organization_id=p_org and rf.source_allocation_id=x.id and rf.status<>'CANCELLED') then raise exception '취소 가능한 수납 배분을 확인해주세요.'; end if;
  insert into finance.collection_receipt_reversals(organization_id,allocation_id,reason,created_by) values(p_org,x.id,reason_value,p_actor);
  entity:=x.id; result:=jsonb_build_object('id',x.id,'status','REVERSED','lock_version',1); before_value:=to_jsonb(x);
 elsif p_command='REFUND_SAVE' then
  amount_value:=nullif(p_data->>'requested_amount','')::numeric;
  if amount_value<=0 or length(reason_value)<1 then raise exception '환급 금액과 결정 근거가 필요합니다.'; end if;
  select * into x from finance.collection_receipt_allocations where organization_id=p_org and id=(p_data->>'source_allocation_id')::uuid;
  if not found or exists(select 1 from finance.collection_receipt_reversals r where r.organization_id=p_org and r.allocation_id=x.id) or amount_value>x.amount then raise exception '환급할 원수납 배분과 금액을 확인해주세요.'; end if;
  select * into a from finance.collection_assessments where organization_id=p_org and id=x.assessment_id;
  insert into finance.collection_refunds(organization_id,source_allocation_id,external_member_id,member_name_snapshot,reason,requested_amount,created_by)
  values(p_org,x.id,a.external_member_id,a.member_name_snapshot,reason_value,amount_value,p_actor) returning * into f;
  entity:=f.id; result:=jsonb_build_object('id',f.id,'status',f.status,'lock_version',f.lock_version); before_value:=null;
 elsif p_command in ('REFUND_APPROVE','REFUND_PAY','REFUND_CANCEL') then
  select * into f from finance.collection_refunds where organization_id=p_org and id=(p_data->>'id')::uuid for update;
  version_value:=coalesce((p_data->>'lock_version')::integer,0);
  if not found or f.lock_version<>version_value then raise exception '최신 환급 원장을 확인해주세요.'; end if;
  before_value:=to_jsonb(f); entity:=f.id;
  if p_command='REFUND_APPROVE' then
   if f.status<>'DRAFT' or f.created_by=p_actor or length(reason_value)<1 then raise exception '환급 승인 상태, 분리 승인자와 근거를 확인해주세요.'; end if;
   update finance.collection_refunds set status='APPROVED',approved_by=p_actor,approved_at=now(),lock_version=lock_version+1,updated_at=clock_timestamp() where id=f.id returning * into f;
  elsif p_command='REFUND_PAY' then
   select * into b from finance.bank_transactions where organization_id=p_org and id=(p_data->>'bank_transaction_id')::uuid and deleted_at is null for update;
   if f.status<>'APPROVED' or b.id is null or b.withdrawal_amount<>f.requested_amount or exists(select 1 from finance.workflow_payments p where p.organization_id=p_org and p.bank_transaction_id=b.id) then raise exception '승인된 환급액과 같은 실제 출금 원본이 필요합니다.'; end if;
   update finance.collection_refunds set status='PAID',bank_transaction_id=b.id,paid_by=p_actor,paid_at=b.transacted_at,lock_version=lock_version+1,updated_at=clock_timestamp() where id=f.id returning * into f;
  else
   if f.status not in ('DRAFT','APPROVED') or length(reason_value)<1 then raise exception '취소 가능한 환급과 사유를 확인해주세요.'; end if;
   update finance.collection_refunds set status='CANCELLED',lock_version=lock_version+1,updated_at=clock_timestamp() where id=f.id returning * into f;
  end if;
  result:=jsonb_build_object('id',f.id,'status',f.status,'lock_version',f.lock_version);
 end if;
 insert into finance.collection_ledger_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data) values(p_org,p_actor,entity,p_command,reason_value,before_value,result);
 insert into finance.collection_ledger_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,p_key,p_actor,p_command,p_data,result);
 return result;
end $$;

revoke all on function finance.collection_ledger_read(uuid,uuid),finance.collection_ledger_command(uuid,uuid,text,jsonb,text),finance.collection_ledger_immutable() from public,anon,authenticated;
grant execute on function finance.collection_ledger_read(uuid,uuid),finance.collection_ledger_command(uuid,uuid,text,jsonb,text) to service_role;

create function finance.month_close_read(p_org uuid,p_actor uuid,p_month date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members; month_start date; month_end date; checks jsonb; period_status text; review_count integer;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not (m.permissions && array['ADMIN','CLOSE']) then raise exception '월 마감 점검 권한이 필요합니다.'; end if;
 month_start:=date_trunc('month',p_month)::date; month_end:=(month_start+interval '1 month')::date;
 select status into period_status from finance.reimbursement_periods where organization_id=p_org and month=month_start;
 select count(*) into review_count from jsonb_array_elements(finance.budget_review_queue(p_org)) x
 where coalesce((x->>'needs_review')::boolean,false) and (x->>'suggested_month' is null or x->>'suggested_month'=month_start::text
  or exists(select 1 from jsonb_array_elements(coalesce(x->'lines','[]')) l where l->>'month'=month_start::text));
 checks:=jsonb_build_array(
  jsonb_build_object('key','resolution','label','지출결의 전표·증빙','count',(select count(*) from finance.expense_resolutions r where r.organization_id=p_org and r.deleted_at is null and r.accounting_date>=month_start and r.accounting_date<month_end and (r.voucher_status is distinct from '전표확정' or r.evidence_status in ('NONE','DEFICIENT'))),'href','/finance/expenses?source_kind=RESOLUTION','blocking',true),
  jsonb_build_object('key','accounting-date','label','회계일 미등록','count',(select count(*) from finance.expense_resolutions r where r.organization_id=p_org and r.deleted_at is null and r.accounting_date is null),'href','/finance/month-close?scope=missing-date','blocking',true),
  jsonb_build_object('key','bank','label','미연결 계좌거래','count',(select count(*) from finance.bank_transactions b where b.organization_id=p_org and b.deleted_at is null and b.transacted_at>=month_start and b.transacted_at<month_end
    and not exists(select 1 from finance.vouchers v where v.organization_id=p_org and v.deleted_at is null and v.bank_transaction_id=b.id)
    and not exists(select 1 from finance.workflow_payments p where p.organization_id=p_org and p.bank_transaction_id=b.id)
    and not exists(select 1 from finance.collection_receipt_allocations a left join finance.collection_receipt_reversals r on r.allocation_id=a.id where a.organization_id=p_org and a.bank_transaction_id=b.id and r.id is null)
    and not exists(select 1 from finance.collection_refunds f where f.organization_id=p_org and f.bank_transaction_id=b.id and f.status='PAID')
    and not exists(select 1 from finance.trust_operating_bank_links l where l.organization_id=p_org and l.bank_transaction_id=b.id)
    and not exists(select 1 from finance.workflow_transfers t where t.withdrawal_id=b.id or t.deposit_id=b.id)),'href','/finance/bank-transactions','blocking',true),
  jsonb_build_object('key','voucher','label','미확정 전표','count',(select count(*) from finance.vouchers v where v.organization_id=p_org and v.deleted_at is null and v.voucher_date>=month_start and v.voucher_date<month_end and v.approval_status<>'승인완료'),'href','/finance','blocking',true),
  jsonb_build_object('key','budget','label','예산 귀속 확인','count',review_count,'href','/finance/data-cleanup','blocking',true),
  jsonb_build_object('key','advance','label','선지급 미정산','count',(select count(*) from finance.advance_settlement_drafts d where d.organization_id=p_org and d.created_at<month_end and d.status<>'SETTLED'),'href','/finance/advance-settlements','blocking',true),
  jsonb_build_object('key','operating','label','운영비 미정산','count',(select count(*) from finance.trust_operating_periods p where p.organization_id=p_org and p.month<=month_start and p.status<>'SETTLED'),'href','/finance/trust?view=operating-settlement','blocking',true),
  jsonb_build_object('key','trust','label','사업비 신탁 집행 미완료','count',(select count(*) from finance.workflow_trust_items i join finance.workflow_trust_requests r on r.id=i.request_id and r.organization_id=p_org where i.organization_id=p_org and coalesce(r.request_date,r.created_at::date)<month_end and i.status not in ('REJECTED','WITHDRAWN') and finance.trust_item_paid(p_org,i.id)<i.approved_amount),'href','/finance/trust?view=business','blocking',true),
  jsonb_build_object('key','personal','label','개인 선지출 미지급','count',(select count(*) from finance.personal_reimbursements r where r.organization_id=p_org and r.used_on<month_end and r.status='APPROVED'),'href','/finance/payments?tab=UNPAID','blocking',true),
  jsonb_build_object('key','collection','label','납기 경과 미수납','count',(select count(*) from finance.collection_assessments a where a.organization_id=p_org and a.status='ACTIVE' and a.due_date<month_end and a.assessed_amount>coalesce((select sum(x.amount) from finance.collection_receipt_allocations x left join finance.collection_receipt_reversals rr on rr.allocation_id=x.id where x.organization_id=p_org and x.assessment_id=a.id and rr.id is null),0)),'href','/finance/collections','blocking',true),
  jsonb_build_object('key','refund','label','환급 미완료','count',(select count(*) from finance.collection_refunds f where f.organization_id=p_org and f.created_at<month_end and f.status in ('DRAFT','APPROVED')),'href','/finance/refunds','blocking',true)
 );
 return jsonb_build_object('month',month_start,'period_status',period_status,'checks',checks,'ready',not exists(select 1 from jsonb_array_elements(checks) c where (c->>'blocking')::boolean and (c->>'count')::integer>0));
end $$;
revoke all on function finance.month_close_read(uuid,uuid,date) from public,anon,authenticated;
grant execute on function finance.month_close_read(uuid,uuid,date) to service_role;
notify pgrst, 'reload schema';
