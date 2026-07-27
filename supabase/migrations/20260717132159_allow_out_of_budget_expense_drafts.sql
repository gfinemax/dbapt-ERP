-- A linked expense resolution starts as a draft. Creating it does not execute
-- a payment, so out-of-budget approvals must be allowed to reach this stage.
create or replace function approval.create_expense_draft(p_document_id uuid,p_actor_label text,p_resolution_data jsonb)
returns text language plpgsql security definer set search_path=approval,finance,public as $$
declare v_document approval.documents%rowtype; v_year text; v_seq integer; v_no text; v_id text; v_data jsonb;
begin
  select * into v_document from approval.documents where id=p_document_id and deleted_at is null for update;
  if not found then raise exception '기안 문서를 찾을 수 없습니다.'; end if;
  if v_document.approval_status<>'APPROVED' or v_document.meeting_status not in ('NOT_REQUIRED','APPROVED') then raise exception '내부결재와 필요한 의결이 완료되어야 합니다.'; end if;
  if v_document.expense_resolution_id is not null then return v_document.expense_resolution_id; end if;
  perform pg_advisory_xact_lock(hashtext('finance.expense_resolution_no'));
  v_year:=to_char(current_date,'YYYY');
  select coalesce(max((regexp_match(resolution_no,'^지결-'||v_year||'-(\d+)$'))[1]::integer),0)+1 into v_seq from finance.expense_resolutions where resolution_no like '지결-'||v_year||'-%';
  v_no:='지결-'||v_year||'-'||lpad(v_seq::text,4,'0'); v_id:='approval-expense-'||p_document_id::text;
  v_data:=p_resolution_data||jsonb_build_object('id',v_id,'resolutionNo',v_no);
  insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,current_approver_label,approval_status,payment_status,resolution_mode,expense_timing,input_method,execution_method,project_name,subject,total_payment_amount,settlement_status,resolution_data,approval_document_id)
  values(v_id,v_document.organization_id,v_no,v_document.drafter_label,null,'작성중','지급전','SINGLE','ADVANCE','MANUAL','VENDOR_DIRECT',v_document.project_name,v_document.title,v_document.amount,'정산없음',v_data,p_document_id);
  update approval.documents set expense_resolution_id=v_id,execution_status='EXPENSE_DRAFT',updated_at=now() where id=p_document_id;
  insert into approval.audit_logs(document_id,action_type,actor_label,after_data) values(p_document_id,'EXPENSE_DRAFT_CREATED',p_actor_label,jsonb_build_object('resolution_id',v_id,'resolution_no',v_no,'out_of_budget',v_document.is_out_of_budget));
  return v_id;
end; $$;
grant execute on function approval.create_expense_draft(uuid,text,jsonb) to service_role;

-- Enforce the budget rule at the irreversible boundary: payment completion.
-- A budget amendment clears is_out_of_budget; otherwise meeting approval is required.
create or replace function approval.sync_expense_execution() returns trigger language plpgsql security definer set search_path=approval,finance,public as $$
declare v_doc approval.documents%rowtype; v_paid numeric(16,0);
begin
  if new.approval_document_id is null then return new; end if;
  select * into v_doc from approval.documents where id=new.approval_document_id for update;
  v_paid:=coalesce(new.actual_paid_amount,new.total_payment_amount,0);
  if new.payment_status='지급완료' and old.payment_status is distinct from new.payment_status then
    if v_doc.is_out_of_budget and v_doc.meeting_status<>'APPROVED' then
      raise exception '예산 외 지출은 예산 변경 또는 의결 완료 전 집행할 수 없습니다.';
    end if;
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
