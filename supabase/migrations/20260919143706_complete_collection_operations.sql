-- Complete the audited collection workflow without deleting or overwriting source records.

drop index if exists finance.collection_refund_open_source_idx;
create unique index collection_refund_open_source_idx
on finance.collection_refunds(organization_id,source_allocation_id)
where status in ('DRAFT','APPROVED');

alter table finance.collection_assessment_import_batches
  drop constraint collection_assessment_import_batches_status_check,
  drop constraint collection_assessment_import_batches_check,
  add column cancelled_by uuid references auth.users(id) on delete restrict,
  add column cancelled_at timestamptz,
  add column cancel_reason text,
  add constraint collection_assessment_import_batches_status_check check(status in ('PREVIEW','APPLIED','CANCELLED')),
  add constraint collection_assessment_import_batches_state_check check(
    (status='PREVIEW' and applied_by is null and applied_at is null and cancelled_by is null and cancelled_at is null and cancel_reason is null)
    or (status='APPLIED' and applied_by is not null and applied_at is not null and cancelled_by is null and cancelled_at is null and cancel_reason is null)
    or (status='CANCELLED' and applied_by is null and applied_at is null and cancelled_by is not null and cancelled_at is not null and length(trim(cancel_reason)) between 1 and 500)
  );
create index collection_assessment_import_batches_cancelled_by_idx
on finance.collection_assessment_import_batches(cancelled_by) where cancelled_by is not null;

create or replace function finance.collection_assessment_import_result(p_org uuid,p_batch uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'batch_id',b.id,'file_name',b.original_file_name,'content_hash',b.content_hash,'status',b.status,'row_count',b.row_count,
  'created_at',b.created_at,'applied_at',b.applied_at,'cancelled_at',b.cancelled_at,'cancel_reason',b.cancel_reason,
  'create_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='CREATE'),
  'update_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='UPDATE'),
  'unchanged_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='UNCHANGED'),
  'error_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='ERROR'),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('row_number',r.row_number,'external_member_id',r.external_member_id,'member_no',r.member_no,
    'member_name_snapshot',r.member_name_snapshot,'assessment_code',r.assessment_code,'due_date',r.due_date,'assessed_amount',r.assessed_amount,
    'action',r.action,'issue',r.issue) order by r.row_number) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id),'[]'::jsonb)
 ) from finance.collection_assessment_import_batches b where b.organization_id=p_org and b.id=p_batch
$$;

create function finance.collection_assessment_import_history(p_org uuid,p_actor uuid,p_batch uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members; selected jsonb;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not (m.permissions && array['ADMIN','CLOSE','APPROVE']) then raise exception '분담금 부과자료 조회 권한이 필요합니다.'; end if;
 if p_batch is not null then
  selected:=finance.collection_assessment_import_result(p_org,p_batch);
  if selected is null then raise exception '가져오기 이력을 확인하지 못했어.'; end if;
 end if;
 return jsonb_build_object(
  'batches',coalesce((select jsonb_agg(jsonb_build_object(
    'batch_id',b.id,'file_name',b.original_file_name,'status',b.status,'row_count',b.row_count,'created_at',b.created_at,
    'applied_at',b.applied_at,'cancelled_at',b.cancelled_at,'cancel_reason',b.cancel_reason,
    'create_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='CREATE'),
    'update_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='UPDATE'),
    'unchanged_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='UNCHANGED'),
    'error_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='ERROR')
   ) order by b.created_at desc) from (select * from finance.collection_assessment_import_batches where organization_id=p_org order by created_at desc limit 20) b),'[]'::jsonb),
  'selected',selected
 );
end $$;

create function finance.collection_assessment_import_cancel(p_org uuid,p_actor uuid,p_batch uuid,p_reason text,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; batch finance.collection_assessment_import_batches; saved finance.collection_ledger_operations; result jsonb; input_value jsonb;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not (m.permissions && array['ADMIN','CLOSE','APPROVE']) then raise exception '분담금 부과자료 취소 권한이 필요합니다.'; end if;
 if coalesce(length(trim(p_reason)),0) not between 1 and 500 or coalesce(length(trim(p_key)),0) not between 1 and 200 then raise exception '취소 사유와 처리키를 확인해줘.'; end if;
 input_value:=jsonb_build_object('batch_id',p_batch,'reason',trim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_key,914));
 select * into saved from finance.collection_ledger_operations where organization_id=p_org and operation_key=p_key;
 if found then
  if saved.actor_id<>p_actor or saved.command<>'ASSESSMENT_IMPORT_CANCEL' or saved.input<>input_value then raise exception '다른 처리에 사용된 처리키입니다.'; end if;
  return saved.result;
 end if;
 select * into batch from finance.collection_assessment_import_batches where organization_id=p_org and id=p_batch for update;
 if not found or batch.status<>'PREVIEW' then raise exception '취소할 미리보기를 확인해줘.'; end if;
 update finance.collection_assessment_import_batches set status='CANCELLED',cancelled_by=p_actor,cancelled_at=clock_timestamp(),cancel_reason=trim(p_reason) where id=p_batch;
 result:=finance.collection_assessment_import_result(p_org,p_batch);
 insert into finance.collection_ledger_operations(organization_id,operation_key,actor_id,command,input,result)
 values(p_org,p_key,p_actor,'ASSESSMENT_IMPORT_CANCEL',input_value,result);
 return result;
end $$;

revoke all on function finance.collection_assessment_import_history(uuid,uuid,uuid),finance.collection_assessment_import_cancel(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function finance.collection_assessment_import_history(uuid,uuid,uuid),finance.collection_assessment_import_cancel(uuid,uuid,uuid,text,text) to service_role;

create or replace function finance.collection_ledger_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; saved finance.collection_ledger_operations; a finance.collection_assessments; x finance.collection_receipt_allocations; b finance.bank_transactions; f finance.collection_refunds;
 result jsonb; before_value jsonb; entity uuid; amount_value numeric; allocated numeric; reason_value text; version_value integer;
begin
 if p_org is null or p_actor is null or jsonb_typeof(p_data) is distinct from 'object' or coalesce(length(trim(p_key)),0) not between 1 and 200 then raise exception '처리 정보를 확인해주세요.'; end if;
 m:=finance.workflow_actor(p_org,p_actor);
 if p_command in ('ASSESSMENT_SAVE','ASSESSMENT_CANCEL','REFUND_SAVE','REFUND_APPROVE','REFUND_CANCEL') then
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
 elsif p_command='ASSESSMENT_CANCEL' then
  if length(reason_value)<1 then raise exception '부과 취소 사유가 필요합니다.'; end if;
  select * into a from finance.collection_assessments where organization_id=p_org and id=(p_data->>'id')::uuid for update;
  if not found or a.status<>'ACTIVE' or a.lock_version<>coalesce((p_data->>'lock_version')::integer,0) then raise exception '최신 부과 원본을 확인해주세요.'; end if;
  if exists(select 1 from finance.collection_receipt_allocations y left join finance.collection_receipt_reversals r on r.allocation_id=y.id where y.organization_id=p_org and y.assessment_id=a.id and r.id is null) then raise exception '유효한 수납 배분이 있는 부과 원본은 취소할 수 없습니다.'; end if;
  before_value:=to_jsonb(a);
  update finance.collection_assessments set status='CANCELLED',lock_version=lock_version+1,updated_by=p_actor,updated_at=clock_timestamp() where id=a.id returning * into a;
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
  select * into x from finance.collection_receipt_allocations where organization_id=p_org and id=(p_data->>'source_allocation_id')::uuid for update;
  select coalesce(sum(rf.requested_amount),0) into allocated from finance.collection_refunds rf where rf.organization_id=p_org and rf.source_allocation_id=x.id and rf.status<>'CANCELLED';
  if x.id is null or exists(select 1 from finance.collection_receipt_reversals r where r.organization_id=p_org and r.allocation_id=x.id) or allocated+amount_value>x.amount then raise exception '환급할 원수납 배분과 남은 금액을 확인해주세요.'; end if;
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

notify pgrst, 'reload schema';
