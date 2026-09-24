begin;
do $$
declare
 org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); source_one text:=gen_random_uuid()::text; source_two text:=gen_random_uuid()::text;
 debit_account uuid:=gen_random_uuid(); credit_account uuid:=gen_random_uuid(); tx_one uuid; tx_two uuid; voucher_one uuid; voucher_two uuid;
 source jsonb; result jsonb; valid_input jsonb; invalid_input jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Accounting confirmation test','active');
 insert into auth.users(id) values(actor);
 insert into finance.reimbursement_members values(org,actor,'Approver',array['APPROVE'],true);
 insert into finance.account_subjects(id,organization_id,code,name,is_active)
 values(debit_account,org,'501','Reviewed expense',true),(credit_account,org,'201','Reviewed liability',true);
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data)
 values(source_one,org,'CONFIRM-1','Staff','승인완료','지급대기',1000,'{}'),(source_two,org,'CONFIRM-2','Staff','승인완료','지급대기',500,'{}');
 tx_one:=(finance.workflow_command(org,actor,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',source_one),'confirm-enroll-1')->>'id')::uuid;
 tx_two:=(finance.workflow_command(org,actor,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',source_two),'confirm-enroll-2')->>'id')::uuid;
 source:=finance.accounting_source(org,'RECOGNITION',tx_one);
 valid_input:=jsonb_build_object('source_kind','RECOGNITION','source_id',tx_one,'source_signature',source->>'signature','voucher_date','2026-09-24','memo','Complete draft','lines',jsonb_build_array(
  jsonb_build_object('account_subject_id',debit_account,'description','Expense','debit_amount',1000,'credit_amount',0),
  jsonb_build_object('account_subject_id',credit_account,'description','Liability','debit_amount',0,'credit_amount',1000)));
 voucher_one:=(finance.accounting_command(org,actor,'DRAFT_CREATE',valid_input,'confirm-draft-1')->>'id')::uuid;
 source:=finance.accounting_source(org,'RECOGNITION',tx_two);
 invalid_input:=jsonb_build_object('source_kind','RECOGNITION','source_id',tx_two,'source_signature',source->>'signature','voucher_date','2026-09-24','memo','Incomplete draft','lines','[]'::jsonb);
 voucher_two:=(finance.accounting_command(org,actor,'DRAFT_CREATE',invalid_input,'confirm-draft-2')->>'id')::uuid;

 begin
  perform finance.accounting_batch_confirm(org,actor,jsonb_build_object('items',jsonb_build_array(
   jsonb_build_object('id',voucher_one,'lock_version',1),jsonb_build_object('id',voucher_two,'lock_version',1)),'reason','Batch atomic validation'),'invalid-batch');
  raise exception 'TEST: incomplete batch confirmed';
 exception when others then if sqlerrm not like '%차변·대변%' then raise; end if; end;
 if (select approval_status from finance.vouchers where id=voucher_one)<>'승인대기' then raise exception 'TEST: failed batch partially committed'; end if;

 result:=finance.accounting_batch_confirm(org,actor,jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',voucher_one,'lock_version',1)),'reason','원본과 분개 대조 완료'),'valid-batch');
 if result#>>'{confirmed_count}'<>'1' or result#>>'{confirmed_ids,0}'<>voucher_one::text then raise exception 'TEST: confirmation result'; end if;
 if (select approval_status from finance.vouchers where id=voucher_one)<>'승인완료' or (select lock_version from finance.workflow_voucher_controls where voucher_id=voucher_one)<>2 then raise exception 'TEST: voucher not confirmed'; end if;
 if finance.accounting_batch_confirm(org,actor,jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',voucher_one,'lock_version',1)),'reason','원본과 분개 대조 완료'),'valid-batch')<>result then raise exception 'TEST: confirmation retry result'; end if;
 if (select count(*) from finance.workflow_events where entity_id=voucher_one and action='ACCOUNTING_BATCH_CONFIRM')<>1 then raise exception 'TEST: confirmation audit count'; end if;
 begin
  perform finance.accounting_batch_confirm(org,actor,jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',voucher_one,'lock_version',2)),'reason','다른 키 재확정'),'confirm-again');
  raise exception 'TEST: confirmed voucher confirmed again';
 exception when others then if sqlerrm not like '%확정할 수 있는 초안%' then raise; end if; end;
end $$;
set local role authenticated;
do $$ begin
 begin perform finance.accounting_batch_confirm(gen_random_uuid(),gen_random_uuid(),'{}','forged'); raise exception 'TEST: authenticated confirmation RPC accessible'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
