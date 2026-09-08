create or replace function finance.quick_expense_command(p_org uuid,p_actor uuid,p_command text,p_id uuid,p_data jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; q finance.quick_expense_records; op finance.quick_expense_operations;
 job finance.expense_evidence_ocr_jobs; before_value jsonb; result jsonb; description text; counterparty_value text;
 detail_id uuid; budget_value text;
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
 before_value:=jsonb_build_object('usage_description',q.usage_description,'counterparty',q.counterparty,'budget_item',q.budget_item,'expense_detail_id',q.expense_detail_id,'evidence_status',q.evidence_status,'updated_at',q.updated_at);
 if p_command='UPDATE_DETAILS' then
  if p_data->>'expected_updated_at' is distinct from q.updated_at::text then raise exception '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 확인해주세요.'; end if;
  description:=trim(coalesce(p_data->>'usage_description',''));
  counterparty_value:=trim(coalesce(p_data->>'counterparty',''));
  detail_id:=case when p_data ? 'expense_detail_id' then nullif(trim(p_data->>'expense_detail_id'),'')::uuid else q.expense_detail_id end;
  budget_value:=case when p_data ? 'budget_item' then trim(coalesce(p_data->>'budget_item','')) else q.budget_item end;
  if length(description) not between 1 and 500 then raise exception '사용내용은 1자 이상 500자 이하로 입력해주세요.'; end if;
  if length(counterparty_value)>200 then raise exception '거래처는 200자 이하로 입력해주세요.'; end if;
  if detail_id is null or length(budget_value)=0 then raise exception '지출 세부항목과 승인 예산을 확인해주세요.'; end if;
  update finance.quick_expense_records set usage_description=description,counterparty=counterparty_value,
    expense_detail_id=detail_id,budget_item=budget_value,updated_at=clock_timestamp()
    where id=q.id returning * into q;
  result:=jsonb_build_object('id',q.id,'usage_description',q.usage_description,'counterparty',q.counterparty,'budget_item',q.budget_item,'expense_detail_id',q.expense_detail_id,'record_status',q.record_status,'updated_at',q.updated_at);
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
notify pgrst, 'reload schema';
