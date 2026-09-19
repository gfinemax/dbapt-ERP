begin;
do $$
declare
 org uuid:=gen_random_uuid(); author uuid:=gen_random_uuid(); approver uuid:=gen_random_uuid(); acct uuid:=gen_random_uuid();
 resolution text:=gen_random_uuid()::text; quick_id uuid:=gen_random_uuid(); bank uuid:=gen_random_uuid(); payment uuid:=gen_random_uuid(); allocation uuid:=gen_random_uuid(); evidence uuid:=gen_random_uuid();
 tx uuid; src jsonb; used jsonb; input jsonb; draft uuid; result jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Advance lifecycle','active');
 insert into auth.users(id) values(author),(approver);
 insert into finance.reimbursement_members values(org,author,'Author',array['ADMIN'],true),(org,approver,'Approver',array['APPROVE','CLOSE'],true);
 insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status) values(acct,org,'Bank','Operating','PRIVATE','운영계좌','사용');
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,expense_timing,execution_method,resolution_data)
 values(resolution,org,'ADV-LIFE','Author','승인완료','지급대기',1000,'ADVANCE','EMPLOYEE_ADVANCE','{}');
 tx:=(finance.workflow_command(org,author,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',resolution),'enroll')->>'id')::uuid;
 insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,description,withdrawal_amount,deposit_amount) values(bank,org,acct,'2026-09-01','Advance',1000,0);
 insert into finance.workflow_payments(id,organization_id,bank_transaction_id,method,flow,amount,paid_at,counterparty,reason,created_by) values(payment,org,bank,'BANK','OUT',1000,'2026-09-01','Staff','Actual advance',author);
 insert into finance.workflow_allocations(id,organization_id,payment_id,transaction_id,purpose,amount,reason,created_by) values(allocation,org,payment,tx,'DISBURSEMENT',1000,'Initial advance',author);
 insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,approval_skip_reason,direct_expense_decision,record_status,recorded_by_label)
 values(quick_id,org,'MANUAL','CASH','2026-09-10',1000,'Shop','Advance-funded use','Operating','Confirmed','REQUIRED','NEEDS_RESOLUTION','Author');
 insert into finance.workflow_files(id,organization_id,purpose,bucket,path,file_name,content_hash,uploaded_by) values(evidence,org,'EVIDENCE','finance-workflow','advance/lifecycle','receipt.pdf',repeat('c',64),author);
 src:=finance.advance_settlement_source(org,tx); used:=finance.advance_settlement_usage_source(org,'QUICK',quick_id::text);
 input:=jsonb_build_object('transaction_id',tx,'source_signature',src->>'signature','title','Advance lifecycle settlement','memo','Reviewed',
  'funding',jsonb_build_array(jsonb_build_object('allocation_id',allocation,'kind','INITIAL')),
  'usage',jsonb_build_array(jsonb_build_object('source_kind','QUICK','source_id',quick_id,'signature',used->>'signature','evidence_file_id',evidence)));
 result:=finance.advance_settlement_command(org,author,'DRAFT_SAVE',input,'draft'); draft:=(result->>'id')::uuid;
 if finance.advance_settlement_review(org,draft)->>'ready'<>'true' or (finance.advance_settlement_review(org,draft)#>>'{totals,balance}')::numeric<>0 then raise exception 'TEST: ready review %',finance.advance_settlement_review(org,draft); end if;
 result:=finance.advance_settlement_transition(org,author,'SUBMIT',jsonb_build_object('id',draft,'lock_version',1),'submit');
 begin perform finance.advance_settlement_command(org,author,'DRAFT_SAVE',input||jsonb_build_object('id',draft,'lock_version',2),'mutate-submitted'); raise exception 'TEST: submitted child mutation'; exception when others then if sqlerrm not like '%초안으로 되돌린%' then raise; end if; end;
 begin perform finance.advance_settlement_transition(org,author,'APPROVE',jsonb_build_object('id',draft,'lock_version',2,'reason','Self approval'),'self'); raise exception 'TEST: self approval'; exception when others then if sqlerrm not like '%본인은%' then raise; end if; end;
 result:=finance.advance_settlement_transition(org,approver,'APPROVE',jsonb_build_object('id',draft,'lock_version',2,'reason','Evidence reviewed'),'approve');
 if result->>'status'<>'APPROVED' then raise exception 'TEST: approval status'; end if;
 result:=finance.advance_settlement_transition(org,approver,'SETTLE',jsonb_build_object('id',draft,'lock_version',3,'reason','Balance reconciled'),'settle');
 if result->>'status'<>'SETTLED' then raise exception 'TEST: settled status'; end if;
 if finance.advance_settlement_transition(org,approver,'SETTLE',jsonb_build_object('id',draft,'lock_version',3,'reason','Balance reconciled'),'settle')<>result then raise exception 'TEST: transition retry'; end if;
 if (select count(*) from finance.workflow_events where organization_id=org and action in ('ADVANCE:SUBMIT','ADVANCE:APPROVE','ADVANCE:SETTLE'))<>3 then raise exception 'TEST: lifecycle audit'; end if;
 if (select count(*) from finance.budget_source_assignments where organization_id=org)<>0 then raise exception 'TEST: settlement duplicated budget posting'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform finance.advance_settlement_transition(gen_random_uuid(),gen_random_uuid(),'SUBMIT','{}','x'); raise exception 'TEST: direct transition'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
