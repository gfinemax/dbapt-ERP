begin;
do $$
declare
 org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); payer_id uuid:=gen_random_uuid(); reader_id uuid:=gen_random_uuid();
 management uuid:=gen_random_uuid(); operating uuid:=gen_random_uuid(); contract uuid:=gen_random_uuid();
 receipt_bank uuid:=gen_random_uuid(); spend_bank uuid:=gen_random_uuid(); return_bank uuid:=gen_random_uuid();
 source text:=gen_random_uuid()::text; tx uuid; payment uuid:=gen_random_uuid(); allocation uuid:=gen_random_uuid();
 saved jsonb; submitted jsonb; linked jsonb; usage jsonb; settled jsonb; period uuid; next_period uuid;
begin
 insert into core.organizations(id,name,status) values(org,'Operating fund test','active'),(other_org,'Other operating fund','active');
 insert into auth.users(id) values(admin_id),(payer_id),(reader_id);
 insert into finance.reimbursement_members values
  (org,admin_id,'Admin',array['ADMIN'],true),(org,payer_id,'Payer',array['PAY'],true),(org,reader_id,'Reader','{}',true);
 insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status) values
  (management,org,'Bank','Trust','TRUST-PRIVATE','신탁계좌','사용'),(operating,org,'Bank','Operating','OPERATING-PRIVATE','운영계좌','사용');
 insert into finance.workflow_contract_versions(id,organization_id,contract_key,version,name,trustee,reference,management_account_id,status,conditions,created_by)
 values(contract,org,contract,1,'Monthly operating','Trustee','Article 2',management,'VERIFIED',jsonb_build_object(
  'allowed_source_kinds',jsonb_build_array('RESOLUTION'),'required_document_types','[]'::jsonb,'consent_roles','[]'::jsonb,'no_limit',true,
  'operating_allowed',true,'operating_advance_allowed',true,'operating_basis','Article 2','operating_account_ids',jsonb_build_array(operating),'advance_settlement_terms','Monthly receipts and carryover'),admin_id);

 saved:=finance.trust_operating_command(org,admin_id,'PERIOD_SAVE',jsonb_build_object('month','2026-09-01','contract_version_id',contract,'title','September operating fund','requested_amount',1000,'request_reference','TRUST-MONTH-09'),'save');
 period:=(saved->>'id')::uuid;
 if finance.trust_operating_command(org,admin_id,'PERIOD_SAVE',jsonb_build_object('month','2026-09-01','contract_version_id',contract,'title','September operating fund','requested_amount',1000,'request_reference','TRUST-MONTH-09'),'save')<>saved then raise exception 'TEST: period retry'; end if;
 begin perform finance.trust_operating_command(org,reader_id,'PERIOD_SUBMIT',jsonb_build_object('id',period,'lock_version',1),'denied'); raise exception 'TEST: reader submit'; exception when others then if sqlerrm not like '%권한%' then raise; end if; end;
 submitted:=finance.trust_operating_command(org,admin_id,'PERIOD_SUBMIT',jsonb_build_object('id',period,'lock_version',1),'submit');

 insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,transaction_kind,description,deposit_amount,withdrawal_amount) values
  (receipt_bank,org,operating,'2026-09-01','입금','Trust operating receipt',1000,0),
  (spend_bank,org,operating,'2026-09-05','출금','Office supplies',0,600),
  (return_bank,org,operating,'2026-09-30','출금','Operating return',0,100);
 linked:=finance.trust_operating_command(org,payer_id,'BANK_LINK',jsonb_build_object('period_id',period,'bank_transaction_id',receipt_bank,'kind','RECEIPT','reason','Trust transfer received'),'receipt');
 begin perform finance.trust_operating_command(org,payer_id,'BANK_LINK',jsonb_build_object('period_id',period,'bank_transaction_id',spend_bank,'kind','RECEIPT','reason','Forged direction'),'wrong-flow'); raise exception 'TEST: withdrawal linked as receipt'; exception when others then if sqlerrm not like '%입출금액%' then raise; end if; end;

 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data)
 values(source,org,'OPERATING-USE','Staff','승인완료','지급대기',600,'{}');
 tx:=(finance.workflow_command(org,admin_id,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',source),'enroll')->>'id')::uuid;
 perform finance.trust_command(org,admin_id,'ROUTE_ASSIGN',jsonb_build_object('id',tx,'revision',1,'route','OPERATING','contract_version_id',contract,'reason','Monthly operating expense'),'route');
 insert into finance.workflow_payments(id,organization_id,bank_transaction_id,method,flow,amount,paid_at,counterparty,reason,created_by)
 values(payment,org,spend_bank,'BANK','OUT',600,'2026-09-05','Office shop','Actual operating payment',payer_id);
 insert into finance.workflow_allocations(id,organization_id,payment_id,transaction_id,purpose,amount,reason,created_by)
 values(allocation,org,payment,tx,'DISBURSEMENT',600,'Actual operating use',payer_id);
 usage:=finance.trust_operating_usage_snapshot(org,tx);
 linked:=finance.trust_operating_command(org,admin_id,'USAGE_LINK',jsonb_build_object('period_id',period,'transaction_id',tx,'signature',usage->>'signature','reason','September usage'),'usage');
 linked:=finance.trust_operating_command(org,payer_id,'BANK_LINK',jsonb_build_object('period_id',period,'bank_transaction_id',return_bank,'kind','RETURN','reason','Unused amount returned'),'return');
 if finance.trust_operating_totals(org,period)<>jsonb_build_object('requested',1000,'opening',0,'received',1000,'used',600,'returned',100,'balance',300) then raise exception 'TEST: operating totals %',finance.trust_operating_totals(org,period); end if;

 settled:=finance.trust_operating_command(org,admin_id,'PERIOD_SETTLE',jsonb_build_object('id',period,'lock_version',(linked->>'lock_version')::int,'reason','Month reconciled'),'settle');
 if settled#>>'{totals,balance}'<>'300' or settled->>'status'<>'SETTLED' then raise exception 'TEST: settlement result %',settled; end if;
 saved:=finance.trust_operating_command(org,admin_id,'PERIOD_SAVE',jsonb_build_object('month','2026-10-01','contract_version_id',contract,'title','October operating fund','requested_amount',700,'request_reference','TRUST-MONTH-10'),'next');
 next_period:=(saved->>'id')::uuid;
 if (select opening_balance from finance.trust_operating_periods where id=next_period)<>300 then raise exception 'TEST: carryover not preserved'; end if;
 begin perform finance.trust_operating_command(org,admin_id,'PERIOD_SAVE',jsonb_build_object('month','2026-11-01','contract_version_id',contract,'title','November','requested_amount',1),'overlap'); raise exception 'TEST: overlapping open period'; exception when others then if sqlerrm not like '%먼저 정산%' then raise; end if; end;
 begin perform finance.trust_operating_read(other_org,admin_id); raise exception 'TEST: cross org read'; exception when others then if sqlerrm not like '%조직 권한%' then raise; end if; end;
 if finance.trust_operating_read(org,admin_id)::text like '%OPERATING-PRIVATE%' then raise exception 'TEST: account number exposed'; end if;
 if (select count(*) from finance.workflow_events where organization_id=org and action like 'OPERATING:%')<>7 then raise exception 'TEST: audit events missing'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform finance.trust_operating_read(gen_random_uuid(),gen_random_uuid()); raise exception 'TEST: direct RPC'; exception when insufficient_privilege then null; end;
 begin perform 1 from finance.trust_operating_periods; raise exception 'TEST: direct table'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
