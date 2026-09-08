-- Require a second person to approve substitute evidence for a quick expense.
create or replace function finance.quick_expense_evidence_command(p_org uuid,p_actor uuid,p_id uuid,p_decision text,p_reason text,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; q finance.quick_expense_records; op finance.quick_expense_operations; before_value jsonb; result jsonb; has_receipt boolean; target_status text; operation_input jsonb;
begin
 if p_decision not in ('APPROVE','SUPPLEMENT') or coalesce(length(trim(p_reason)),0)=0 or coalesce(length(trim(p_key)),0) not between 1 and 200 then raise exception '증빙 처리 정보가 올바르지 않습니다.'; end if;
 m:=finance.workflow_actor(p_org,p_actor);
 if not (m.permissions && array['ADMIN','APPROVE']) then raise exception '증빙 확인 권한이 없습니다.'; end if;
 operation_input:=jsonb_build_object('reason',trim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_id::text,742));
 select * into op from finance.quick_expense_operations where organization_id=p_org and operation_key=p_key;
 if found then
   if op.actor_id<>p_actor or op.command<>'EVIDENCE_'||p_decision or op.input is distinct from operation_input then raise exception '다른 처리에 사용된 처리키입니다.'; end if;
   return op.result;
 end if;
 select * into q from finance.quick_expense_records where organization_id=p_org and id=p_id for update;
 if not found or q.record_status='CONVERTED' then raise exception '처리할 간편지출을 찾을 수 없습니다.'; end if;
 before_value:=to_jsonb(q);
 if p_decision='APPROVE' then
   if not exists(select 1 from finance.quick_expense_evidence where organization_id=p_org and quick_expense_id=p_id) then raise exception '영수증 또는 대체증빙 파일을 먼저 첨부해주세요.'; end if;
   select exists(select 1 from finance.quick_expense_evidence e join finance.expense_evidence_ocr_jobs j on j.id=e.ocr_job_id where e.organization_id=p_org and e.quick_expense_id=p_id and j.evidence_type='영수증') into has_receipt;
   if not has_receipt and exists(select 1 from finance.quick_expense_evidence where organization_id=p_org and quick_expense_id=p_id and created_by=p_actor) then raise exception '본인이 제출한 대체증빙은 다른 승인자가 확인해야 합니다.'; end if;
   if not has_receipt and coalesce(trim(q.missing_evidence_reason),'')='' then update finance.quick_expense_records set missing_evidence_reason=trim(p_reason) where id=p_id; end if;
   target_status:=case when q.direct_expense_decision<>'ALLOWED' then 'NEEDS_RESOLUTION' when q.payment_method='CORPORATE_CARD' and q.corporate_card_transaction_id is null then 'SOURCE_PENDING' else 'RECORDED' end;
   update finance.quick_expense_records set evidence_status=case when has_receipt then 'QUALIFIED' else 'ALTERNATIVE' end,
     evidence_kind=case when has_receipt then 'RECEIPT' else 'ALTERNATIVE' end,evidence_review_status='APPROVED',evidence_reviewed_at=now(),evidence_reviewed_by=p_actor,evidence_review_note=trim(p_reason),record_status=target_status,updated_at=clock_timestamp() where id=p_id returning to_jsonb(quick_expense_records.*) into result;
 else
   update finance.quick_expense_records set evidence_review_status='SUPPLEMENT_REQUIRED',evidence_reviewed_at=now(),evidence_reviewed_by=p_actor,evidence_review_note=trim(p_reason),record_status=case when record_status='SOURCE_PENDING' then record_status else 'EVIDENCE_PENDING' end,updated_at=clock_timestamp() where id=p_id returning to_jsonb(quick_expense_records.*) into result;
 end if;
 insert into finance.quick_expense_audit(organization_id,quick_expense_id,actor_id,action,before_data,after_data) values(p_org,p_id,p_actor,'EVIDENCE_'||p_decision,before_value,result);
 insert into finance.quick_expense_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,p_key,p_actor,'EVIDENCE_'||p_decision,operation_input,result);
 return result;
end $$;
revoke all on function finance.quick_expense_evidence_command(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function finance.quick_expense_evidence_command(uuid,uuid,uuid,text,text,text) to service_role;

notify pgrst, 'reload schema';

