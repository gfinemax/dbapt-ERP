begin;
do $$
declare
 org uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); approver_id uuid:=gen_random_uuid(); payer_id uuid:=gen_random_uuid(); reader_id uuid:=gen_random_uuid();
 account_id uuid:=gen_random_uuid(); deposit_id uuid:=gen_random_uuid(); deposit2_id uuid:=gen_random_uuid(); withdrawal_id uuid:=gen_random_uuid(); withdrawal2_id uuid:=gen_random_uuid(); wrong_withdrawal_id uuid:=gen_random_uuid();
 saved jsonb; retried jsonb; allocation jsonb; second_allocation jsonb; refund jsonb; refund2 jsonb; approved jsonb; paid jsonb; close_state jsonb; assessment uuid; cancellable uuid; allocation_id uuid; refund_id uuid;
begin
 insert into core.organizations(id,name,status) values(org,'Collection ledger test','active');
 insert into auth.users(id) values(admin_id),(approver_id),(payer_id),(reader_id);
 insert into finance.reimbursement_members values
  (org,admin_id,'Admin',array['ADMIN'],true),(org,approver_id,'Approver',array['APPROVE'],true),(org,payer_id,'Payer',array['PAY'],true),(org,reader_id,'Reader','{}',true);
 insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status)
 values(account_id,org,'Bank','Collection','PRIVATE-ACCOUNT','운영계좌','사용');
 insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,transaction_kind,description,deposit_amount,withdrawal_amount) values
  (deposit_id,org,account_id,'2026-09-03','입금','Member receipt',1000,0),
  (deposit2_id,org,account_id,'2026-09-04','입금','Second receipt',100,0),
  (withdrawal_id,org,account_id,'2026-09-10','출금','Approved refund',0,300),
  (withdrawal2_id,org,account_id,'2026-09-11','출금','Second partial refund',0,200),
  (wrong_withdrawal_id,org,account_id,'2026-09-10','출금','Wrong refund',0,301);

 saved:=finance.collection_ledger_command(org,admin_id,'ASSESSMENT_SAVE',jsonb_build_object('external_member_id','peopleon-42','member_no','M-42','member_name_snapshot','Member snapshot','assessment_code','2026-09-01','due_date','2026-09-30','assessed_amount',1000),'assessment-create');
 retried:=finance.collection_ledger_command(org,admin_id,'ASSESSMENT_SAVE',jsonb_build_object('external_member_id','peopleon-42','member_no','M-42','member_name_snapshot','Member snapshot','assessment_code','2026-09-01','due_date','2026-09-30','assessed_amount',1000),'assessment-create');
 if retried<>saved then raise exception 'TEST: assessment retry changed'; end if;
 assessment:=(saved->>'id')::uuid;
 allocation:=finance.collection_ledger_command(org,payer_id,'RECEIPT_ALLOCATE',jsonb_build_object('assessment_id',assessment,'bank_transaction_id',deposit_id,'amount',700,'reason','Matched authoritative member ID'),'receipt-allocate');
 allocation_id:=(allocation->>'id')::uuid;
 begin perform finance.collection_ledger_command(org,payer_id,'RECEIPT_ALLOCATE',jsonb_build_object('assessment_id',assessment,'bank_transaction_id',deposit2_id,'amount',301,'reason','Over assessment'),'over-assessment'); raise exception 'TEST: over assessment accepted'; exception when others then if sqlerrm not like '%부과액%' then raise; end if; end;
 second_allocation:=finance.collection_ledger_command(org,payer_id,'RECEIPT_ALLOCATE',jsonb_build_object('assessment_id',assessment,'bank_transaction_id',deposit2_id,'amount',100,'reason','Second partial receipt'),'receipt-two');
 perform finance.collection_ledger_command(org,payer_id,'RECEIPT_REVERSE',jsonb_build_object('id',second_allocation->>'id','reason','Wrong installment'),'receipt-reverse');

 refund:=finance.collection_ledger_command(org,admin_id,'REFUND_SAVE',jsonb_build_object('source_allocation_id',allocation_id,'requested_amount',300,'reason','Confirmed overpayment'),'refund-save');
 refund_id:=(refund->>'id')::uuid;
 begin perform finance.collection_ledger_command(org,admin_id,'REFUND_APPROVE',jsonb_build_object('id',refund_id,'lock_version',1,'reason','Self approval'),'refund-self'); raise exception 'TEST: self approval accepted'; exception when others then if sqlerrm not like '%분리 승인자%' then raise; end if; end;
 approved:=finance.collection_ledger_command(org,approver_id,'REFUND_APPROVE',jsonb_build_object('id',refund_id,'lock_version',1,'reason','Independent review'),'refund-approve');
 begin perform finance.collection_ledger_command(org,payer_id,'REFUND_PAY',jsonb_build_object('id',refund_id,'lock_version',approved->>'lock_version','bank_transaction_id',wrong_withdrawal_id),'refund-wrong'); raise exception 'TEST: wrong payment amount accepted'; exception when others then if sqlerrm not like '%같은 실제 출금%' then raise; end if; end;
 paid:=finance.collection_ledger_command(org,payer_id,'REFUND_PAY',jsonb_build_object('id',refund_id,'lock_version',approved->>'lock_version','bank_transaction_id',withdrawal_id),'refund-pay');
 if paid->>'status'<>'PAID' then raise exception 'TEST: refund not paid %',paid; end if;
 refund2:=finance.collection_ledger_command(org,admin_id,'REFUND_SAVE',jsonb_build_object('source_allocation_id',allocation_id,'requested_amount',200,'reason','Second partial refund'),'refund-save-two');
 begin perform finance.collection_ledger_command(org,admin_id,'REFUND_SAVE',jsonb_build_object('source_allocation_id',allocation_id,'requested_amount',1,'reason','Concurrent open refund'),'refund-open-two'); raise exception 'TEST: concurrent open refund accepted'; exception when unique_violation then null; end;
 approved:=finance.collection_ledger_command(org,approver_id,'REFUND_APPROVE',jsonb_build_object('id',refund2->>'id','lock_version',1,'reason','Second independent review'),'refund-approve-two');
 paid:=finance.collection_ledger_command(org,payer_id,'REFUND_PAY',jsonb_build_object('id',refund2->>'id','lock_version',approved->>'lock_version','bank_transaction_id',withdrawal2_id),'refund-pay-two');
 begin perform finance.collection_ledger_command(org,admin_id,'REFUND_SAVE',jsonb_build_object('source_allocation_id',allocation_id,'requested_amount',201,'reason','Over remaining refund'),'refund-over-remaining'); raise exception 'TEST: cumulative over-refund accepted'; exception when others then if sqlerrm not like '%남은 금액%' then raise; end if; end;
 saved:=finance.collection_ledger_command(org,admin_id,'ASSESSMENT_SAVE',jsonb_build_object('external_member_id','peopleon-cancel','member_name_snapshot','Cancel Member','assessment_code','2026-09-02','assessed_amount',100),'assessment-cancellable');
 cancellable:=(saved->>'id')::uuid;
 perform finance.collection_ledger_command(org,admin_id,'ASSESSMENT_CANCEL',jsonb_build_object('id',cancellable,'lock_version',1,'reason','Duplicate external notice'),'assessment-cancel');
 begin perform finance.collection_ledger_command(org,admin_id,'ASSESSMENT_CANCEL',jsonb_build_object('id',assessment,'lock_version',1,'reason','Has active allocation'),'assessment-cancel-blocked'); raise exception 'TEST: assessment with receipt cancelled'; exception when others then if sqlerrm not like '%수납 배분%' then raise; end if; end;
 if finance.collection_ledger_read(org,admin_id)::text like '%PRIVATE-ACCOUNT%' then raise exception 'TEST: bank account number exposed'; end if;
 if (finance.collection_ledger_read(org,admin_id)#>>'{assessments,0,allocated_amount}')::numeric<>700 then raise exception 'TEST: reversed allocation counted'; end if;
 close_state:=finance.month_close_read(org,admin_id,'2026-09-01');
 if (select (x->>'count')::integer from jsonb_array_elements(close_state->'checks') x where x->>'key'='collection')<>1 then raise exception 'TEST: unpaid assessment missing from close %',close_state; end if;
 if (select (x->>'count')::integer from jsonb_array_elements(close_state->'checks') x where x->>'key'='refund')<>0 then raise exception 'TEST: paid refund blocks close %',close_state; end if;
 if (select count(*) from finance.collection_ledger_events where organization_id=org)<>12 then raise exception 'TEST: audit events missing'; end if;
 begin perform finance.collection_ledger_read(org,reader_id); raise exception 'TEST: reader access'; exception when others then if sqlerrm not like '%조회 권한%' then raise; end if; end;
end $$;
set local role authenticated;
do $$ begin
 begin perform finance.collection_ledger_read(gen_random_uuid(),gen_random_uuid()); raise exception 'TEST: direct RPC'; exception when insufficient_privilege then null; end;
 begin perform 1 from finance.collection_assessments; raise exception 'TEST: direct table'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
