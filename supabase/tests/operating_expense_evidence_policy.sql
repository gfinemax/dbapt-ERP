begin;
do $$
declare org uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); applicant uuid:=gen_random_uuid(); budget_id uuid:=gen_random_uuid(); other_budget_id uuid:=gen_random_uuid(); quick_id uuid:=gen_random_uuid(); scoped_quick_id uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); blocked_id uuid:=gen_random_uuid(); unresolved_resolution text:='unresolved-'||gen_random_uuid()::text; result jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Operating evidence test','active');
 insert into auth.users(id) values(admin_id),(applicant);
 insert into finance.reimbursement_members values(org,admin_id,'Approver',array['ADMIN'],true),(org,applicant,'Applicant',array['APPROVE'],true);
 insert into finance.reimbursement_periods(organization_id,month,status,submission_deadline,completion_deadline,long_delay_days) values(org,'2026-09-01','OPEN','2026-10-05','2026-10-10',60);
 insert into approval.budgets(id,organization_id,fiscal_year,budget_item,approved_amount,executed_amount,monthly_amount) values
 (budget_id,org,2026,'일반운영비>소모품비',3600000,0,300000),
 (other_budget_id,org,2026,'사업비>용역비',12000000,0,1000000);
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data,subject,actual_expense_date)
 values(unresolved_resolution,org,'TEST-'||unresolved_resolution,'Applicant','승인대기','지급전',50000,'{"budgetItem":"사업비>용역비"}','미정리 용역비','2026-09-06');
 if not exists(select 1 from jsonb_array_elements(finance.reimbursement_budget_rows(org,'2026-09-01')) x where x->>'id'=other_budget_id::text and (x->>'unresolved_count')::int>0) then raise exception 'TEST: unresolved source fixture missing'; end if;
 if exists(select 1 from jsonb_array_elements(finance.reimbursement_budget_rows(org,'2026-09-01')) x where x->>'id'=budget_id::text and (x->>'unresolved_count')::int>0) then raise exception 'TEST: unrelated source contaminated allowed budget'; end if;
 insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,evidence_status,evidence_kind,evidence_review_status,approval_skip_reason,direct_expense_decision,direct_expense_reasons,record_status,recorded_by_label)
 values(scoped_quick_id,org,'MANUAL','CASH','2026-09-07',1000,'문구점','파일','일반운영비>소모품비','QUALIFIED','RECEIPT','READY','승인 예산 내 일상 지출','ALLOWED','{}','RECORDED','Applicant');
 insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,evidence_status,evidence_kind,missing_evidence_reason,evidence_review_status,approval_skip_reason,direct_expense_decision,direct_expense_reasons,record_status,recorded_by_label)
 values(quick_id,org,'MANUAL','CASH','2026-09-07',14000,'다이소','사무용품','일반운영비>소모품비','ALTERNATIVE','ALTERNATIVE','영수증 분실','REVIEW_REQUIRED','승인 예산 내 일상 지출','ALLOWED','{}','EVIDENCE_PENDING','Applicant');
 insert into finance.expense_evidence_ocr_jobs(id,resolution_no,storage_bucket,storage_path,original_filename,content_type,evidence_type,status,stage,progress,result_data,organization_id,created_by)
 values(job_id,'QUICK-'||quick_id,'expense-evidence',org||'/'||applicant||'/quick/order.jpg','order.jpg','image/jpeg','주문내역','COMPLETED','COMPLETED',100,'{}',org,applicant);
 insert into finance.quick_expense_evidence(ocr_job_id,organization_id,quick_expense_id,created_by) values(job_id,org,quick_id,applicant);
 begin perform finance.quick_expense_evidence_command(org,applicant,quick_id,'APPROVE','본인 제출 대체증빙','evidence-self-approve'); raise exception 'TEST: quick substitute evidence self approval accepted';
 exception when others then if sqlerrm not like '%다른 승인자%' then raise; end if; end;
 result:=finance.quick_expense_evidence_command(org,admin_id,quick_id,'APPROVE','주문내역과 사용목적 확인','evidence-approve-1');
 if result->>'record_status'<>'RECORDED' or (select evidence_review_status from finance.quick_expense_records where id=quick_id)<>'APPROVED' then raise exception 'TEST: quick alternative evidence was not approved'; end if;
 if finance.quick_expense_evidence_command(org,admin_id,quick_id,'APPROVE','주문내역과 사용목적 확인','evidence-approve-1')<>result then raise exception 'TEST: quick evidence retry changed result'; end if;
 begin perform finance.quick_expense_evidence_command(org,admin_id,quick_id,'APPROVE','다른 사유','evidence-approve-1'); raise exception 'TEST: quick evidence retry accepted different input';
 exception when others then if sqlerrm not like '%다른 처리에 사용된 처리키%' then raise; end if; end;

 insert into finance.personal_reimbursements(id,organization_id,applicant_id,budget_id,used_on,budget_month,amount,merchant,purpose,evidence_path,evidence_hash,status,needs_exception,needs_senior,payment_method,evidence_kind,missing_receipt_reason,evidence_review_status)
 values(request_id,org,applicant,budget_id,'2026-09-07','2026-09-01',8000,'문구점','건전지',org||'/file',repeat('a',64),'SUBMITTED',false,false,'PERSONAL_TRANSFER','BANK_TRANSFER','영수증 미발급','REVIEW_REQUIRED'),
 (blocked_id,org,applicant,budget_id,'2026-09-08','2026-09-01',9000,'문구점','파일',org||'/file2',repeat('b',64),'SUBMITTED',false,false,'PERSONAL_CARD','CARD_STATEMENT','영수증 분실','REVIEW_REQUIRED');
 result:=finance.reimbursement_evidence_command(org,admin_id,request_id,'APPROVE','이체확인증과 거래명세서 확인');
 if result->>'evidence_review_status'<>'APPROVED' then raise exception 'TEST: personal alternative evidence was not approved'; end if;
 update finance.personal_reimbursements set status='APPROVED' where id=request_id;
 begin update finance.personal_reimbursements set status='APPROVED' where id=blocked_id; raise exception 'TEST: unreviewed evidence was approved';
 exception when others then if sqlerrm not like '%대체증빙 승인이 먼저%' then raise; end if; end;
 begin perform finance.reimbursement_evidence_command(org,applicant,blocked_id,'APPROVE','본인 승인'); raise exception 'TEST: self approval accepted';
 exception when others then if sqlerrm not like '%승인 권한%' and sqlerrm not like '%다른 승인자%' then raise; end if; end;
end $$;
rollback;
