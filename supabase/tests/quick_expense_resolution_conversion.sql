begin;
do $$
declare
 org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); denied uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 qid uuid:=gen_random_uuid(); forged_qid uuid:=gen_random_uuid(); card_id uuid:=gen_random_uuid(); rid text:=gen_random_uuid()::text; forged_rid text:=gen_random_uuid()::text;
 job_id uuid:=gen_random_uuid(); snapshot jsonb; stale jsonb; doc jsonb; payload jsonb; forged_payload jsonb; correction_input jsonb; first_result jsonb; result jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Quick conversion test','active'),(other_org,'Other conversion org','active');
 insert into auth.users(id) values(actor),(denied),(outsider);
 insert into finance.reimbursement_members values
  (org,actor,'Conversion author',array['ADMIN'],true),(org,denied,'Denied user','{}',true),(other_org,outsider,'Other admin',array['ADMIN'],true);
 insert into finance.corporate_card_transactions(id,organization_id,transaction_uid,approved_at,amount,merchant_name,card_name,card_last_four)
 values(card_id,org,'CONVERSION-CARD','2026-09-19 10:00+09',32000,'Paint vendor','Test card','1234');
 insert into finance.quick_expense_records(id,organization_id,source_type,corporate_card_transaction_id,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,
  evidence_status,approval_skip_reason,direct_expense_decision,direct_expense_reasons,record_status,recorded_by_label)
 values(qid,org,'CORPORATE_CARD',card_id,'CORPORATE_CARD','2026-09-19 10:00+09',32000,'Paint vendor','Paint supplies','Operating supplies','GENERAL','Policy requires resolution','REQUIRED','{}','NEEDS_RESOLUTION','Untrusted label'),
  (forged_qid,org,'MANUAL',null,'CASH','2026-09-19 11:00+09',5000,'Other vendor','Other expense','Operating supplies','GENERAL','Policy requires resolution','REQUIRED','{}','NEEDS_RESOLUTION','Untrusted label');
 insert into storage.buckets(id,name,public) values('expense-evidence','expense-evidence',false) on conflict(id) do nothing;
 insert into storage.objects(bucket_id,name,metadata,owner) values('expense-evidence','quick/receipt.jpg','{"size":120,"mimetype":"image/jpeg"}',actor);
 insert into finance.expense_evidence_ocr_jobs(id,resolution_no,storage_bucket,storage_path,original_filename,content_type,evidence_type,status,stage,progress,result_data,organization_id,created_by)
 values(job_id,'QUICK-'||qid,'expense-evidence','quick/receipt.jpg','receipt.jpg','image/jpeg','영수증','COMPLETED','COMPLETED',100,'{"issuer":"Paint vendor"}',org,actor);
 insert into finance.quick_expense_evidence(ocr_job_id,organization_id,quick_expense_id,created_by) values(job_id,org,qid,actor);
 snapshot:=finance.quick_expense_conversion_snapshot(org,actor,qid);
 doc:=jsonb_build_object('id',rid,'resolutionNo','DRAFT-QUICK-1','author','Untrusted label','createdAt','2026-09-19','approvalStatus','작성중',
  'paymentStatus','지급전','settlementStatus','정산없음','totalPaymentAmount',32000,'resolutionType','SINGLE','expenseTiming','REIMBURSEMENT',
  'subject','Paint supplies','vendorName','Paint vendor','budgetItem','Operating supplies','actualExpenseDate','2026-09-19',
  'cardTransactionId',card_id,
  'expenseItems','[]'::jsonb,'history','[]'::jsonb,'approvalLine','[]'::jsonb);
 payload:=jsonb_build_object('row',jsonb_build_object('id',rid,'resolution_no','DRAFT-QUICK-1','author_label','Untrusted label','approval_status','작성중',
  'payment_status','지급전','settlement_status','정산없음','subject','Paint supplies','expense_detail_id',null,'actual_expense_date','2026-09-19',
  'total_payment_amount',32000,'resolution_data',doc,'actual_paid_amount',null,'voucher_no',null,'voucher_status',null,'disbursed_at',null),
  'items',jsonb_build_array(jsonb_build_object('id','item-'||rid,'resolution_id',rid,'item_kind','SINGLE','item_no',1,'supply_amount',32000,'vat_amount',0,'total_amount',32000,'item_data','{}')),
  'allocations','[]'::jsonb,'evidence',jsonb_build_array(jsonb_build_object('id','evidence-'||rid,'resolution_id',rid,'item_id',null,
   'storage_bucket','expense-evidence','storage_path','quick/receipt.jpg','original_filename','receipt.jpg','content_type','image/jpeg','evidence_type','영수증',
   'file_size',999,'ocr_status','FAILED','ocr_data','{"forged":true}'::jsonb,'uploaded_by_label','Forged label','uploaded_at','2000-01-01')),
  'details','[]'::jsonb,'expected_binding_version',0);
 begin perform finance.quick_expense_conversion_snapshot(org,denied,qid); raise exception 'TEST: denied snapshot'; exception when others then if sqlerrm not like '%권한%' then raise; end if; end;
 begin perform finance.quick_expense_conversion_snapshot(other_org,outsider,qid); raise exception 'TEST: foreign snapshot'; exception when others then if sqlerrm not like '%찾을 수%' then raise; end if; end;
 forged_payload:=jsonb_set(payload,'{row,id}',to_jsonb(forged_rid));
 forged_payload:=jsonb_set(forged_payload,'{row,resolution_data,id}',to_jsonb(forged_rid));
 forged_payload:=jsonb_set(forged_payload,'{row,total_payment_amount}','999');
 begin perform finance.quick_expense_convert_resolution(org,actor,forged_qid,finance.quick_expense_conversion_snapshot(org,actor,forged_qid),forged_payload,'forged'); raise exception 'TEST: forged amount'; exception when others then if sqlerrm not like '%유지해야%' then raise; end if; end;
 if exists(select 1 from finance.expense_resolutions where id=forged_rid) then raise exception 'TEST: failed conversion left resolution'; end if;
 first_result:=finance.quick_expense_convert_resolution(org,actor,qid,snapshot,payload,'convert-once');
 if first_result->>'resolution_id'<>rid then raise exception 'TEST: result resolution ID'; end if;
 if not exists(select 1 from finance.quick_expense_records where id=qid and record_status='CONVERTED' and linked_resolution_id=rid) then raise exception 'TEST: source not linked'; end if;
 if not exists(select 1 from finance.corporate_card_transactions where id=card_id and linked_resolution_id=rid and resolution_status='DRAFTING') then raise exception 'TEST: card handoff failed'; end if;
 if not exists(select 1 from finance.expense_resolutions where id=rid and approval_status='작성중' and payment_status='지급전' and total_payment_amount=32000 and actual_paid_amount is null) then raise exception 'TEST: draft invented result'; end if;
 if not exists(select 1 from finance.expense_resolution_evidence where resolution_id=rid and storage_path='quick/receipt.jpg' and original_filename='receipt.jpg'
  and file_size=120 and uploaded_by_label='Conversion author' and ocr_status='EXTRACTED' and ocr_data->>'issuer'='Paint vendor')
  then raise exception 'TEST: authoritative evidence metadata not preserved'; end if;
 if not exists(select 1 from finance.quick_expense_evidence where quick_expense_id=qid and ocr_job_id=job_id) then raise exception 'TEST: original evidence link removed'; end if;
 if (select author_user_id from finance.expense_authorization_bindings where resolution_id=rid)<>actor
  or (select author_label from finance.expense_resolutions where id=rid)<>'Conversion author' then raise exception 'TEST: authenticated author not bound'; end if;
 if finance.quick_expense_convert_resolution(org,actor,qid,snapshot,payload,'convert-once') is distinct from first_result then raise exception 'TEST: idempotent retry changed'; end if;
 if (select count(*) from finance.expense_resolutions where id=rid)<>1 then raise exception 'TEST: retry duplicated resolution'; end if;
 begin update finance.quick_expense_records set usage_description='Rewrite original' where id=qid; raise exception 'TEST: linked original changed'; exception when others then if sqlerrm not like '%감사 정정%' then raise; end if; end;
 correction_input:=jsonb_build_object('amount',33000,'reason','영수증 금액 정정','expected_updated_at',(select updated_at::text from finance.quick_expense_records where id=qid));
 result:=finance.quick_expense_correct_converted(org,actor,qid,correction_input,'correct-linked');
 if (result->>'amount')::numeric<>33000 or (select amount from finance.quick_expense_records where id=qid)<>33000 then raise exception 'TEST: audited correction missing'; end if;
 if finance.quick_expense_correct_converted(org,actor,qid,correction_input,'correct-linked') is distinct from result then raise exception 'TEST: correction retry changed'; end if;
 if not exists(select 1 from finance.quick_expense_audit where quick_expense_id=qid and action='CONVERT_RESOLUTION' and after_data->>'resolution_id'=rid) then raise exception 'TEST: conversion audit missing'; end if;
 if not exists(select 1 from finance.quick_expense_audit where quick_expense_id=qid and action like 'CORRECT_CONVERTED:%') then raise exception 'TEST: correction audit missing'; end if;
 stale:=jsonb_set(finance.quick_expense_conversion_snapshot(org,actor,forged_qid),'{source,usage_description}','"Stale"');
 begin perform finance.quick_expense_convert_resolution(org,actor,forged_qid,stale,forged_payload,'stale'); raise exception 'TEST: stale source'; exception when others then if sqlerrm not like '%변경되었습니다%' then raise; end if; end;
end $$;
rollback;
