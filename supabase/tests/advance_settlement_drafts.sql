begin;
do $$
declare org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); reader uuid:=gen_random_uuid(); employee uuid:=gen_random_uuid(); acct uuid:=gen_random_uuid();
 rid text:=gen_random_uuid()::text; rid2 text:=gen_random_uuid()::text; vendor text:=gen_random_uuid()::text; tx uuid; tx2 uuid; vendor_tx uuid;
 qid uuid:=gen_random_uuid(); qid2 uuid:=gen_random_uuid(); bank1 uuid:=gen_random_uuid(); bank2 uuid:=gen_random_uuid(); bank3 uuid:=gen_random_uuid(); bank4 uuid:=gen_random_uuid();
 pay1 uuid:=gen_random_uuid(); pay2 uuid:=gen_random_uuid(); pay3 uuid:=gen_random_uuid(); pay4 uuid:=gen_random_uuid(); alloc1 uuid:=gen_random_uuid(); alloc2 uuid:=gen_random_uuid(); alloc3 uuid:=gen_random_uuid(); ret uuid:=gen_random_uuid();
 evidence uuid:=gen_random_uuid(); evidence_clone uuid:=gen_random_uuid(); foreign_file uuid:=gen_random_uuid(); src jsonb; usage_src jsonb; input jsonb; result jsonb; totals jsonb; draft uuid; fingerprint text; old_input jsonb; saved_version integer;
begin
 insert into core.organizations(id,name,status) values(org,'Advance draft test','active'),(other_org,'Other advance','active');
 insert into auth.users(id) values(admin_id),(reader),(employee);
 insert into finance.reimbursement_members values(org,admin_id,'Admin',array['ADMIN'],true),(org,reader,'Payer',array['PAY'],true),(org,employee,'Employee','{}',true);
 insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status) values(acct,org,'Bank','Operating','PRIVATE-ACCOUNT','운영계좌','사용');
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,expense_timing,execution_method,resolution_data)
 values(rid,org,'ADVANCE-1','Staff','승인완료','지급대기',1500,'ADVANCE','EMPLOYEE_ADVANCE','{}'),(rid2,org,'ADVANCE-2','Staff','승인완료','지급대기',1000,'ADVANCE','EMPLOYEE_ADVANCE','{}'),(vendor,org,'VENDOR','Staff','승인완료','지급대기',1000,'ADVANCE','VENDOR_DIRECT','{}');
 tx:=(finance.workflow_command(org,admin_id,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',rid),'advance-enroll1')->>'id')::uuid;
 tx2:=(finance.workflow_command(org,admin_id,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',rid2),'advance-enroll2')->>'id')::uuid;
 vendor_tx:=(finance.workflow_command(org,admin_id,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',vendor),'vendor-enroll')->>'id')::uuid;
 if jsonb_array_length(finance.advance_settlement_workspace(org,admin_id)->'candidates')<>0 then raise exception 'TEST: approval amount treated as actual advance'; end if;
 insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,description,withdrawal_amount,deposit_amount) values(bank1,org,acct,'2026-03-01','Initial advance',1000,0),(bank2,org,acct,'2026-06-01','Additional advance',400,0),(bank3,org,acct,'2026-05-01','Return',0,200),(bank4,org,acct,'2026-03-01','Other advance',1000,0);
 insert into finance.workflow_payments(id,organization_id,bank_transaction_id,method,flow,amount,paid_at,counterparty,reason,created_by)
 values(pay1,org,bank1,'BANK','OUT',1000,'2026-03-01','Staff one','Verified fixture',admin_id),(pay4,org,bank4,'BANK','OUT',1000,'2026-03-01','Staff two','Verified fixture',admin_id);
 insert into finance.workflow_allocations(id,organization_id,payment_id,transaction_id,purpose,amount,reason,created_by) values(alloc1,org,pay1,tx,'DISBURSEMENT',1000,'Actual advance',admin_id),(alloc3,org,pay4,tx2,'DISBURSEMENT',1000,'Actual advance',admin_id);
 insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,approval_skip_reason,direct_expense_decision,record_status,recorded_by_label)
 values(qid,org,'MANUAL','CASH','2026-03-15',800,'Shop','Used supplies','Test','Reviewed','REQUIRED','NEEDS_RESOLUTION','Staff'),(qid2,org,'MANUAL','CASH','2026-03-16',50,'Shop2','Other supplies','Test','Reviewed','REQUIRED','NEEDS_RESOLUTION','Staff');
 insert into finance.workflow_files(id,organization_id,purpose,bucket,path,file_name,content_hash,uploaded_by) values(evidence,org,'EVIDENCE','finance-workflow','test/one','receipt.pdf',repeat('a',64),admin_id),(evidence_clone,org,'EVIDENCE','finance-workflow','test/two','same-receipt.pdf',repeat('a',64),admin_id),(foreign_file,other_org,'EVIDENCE','finance-workflow','test/foreign','foreign.pdf',repeat('b',64),admin_id);
 src:=finance.advance_settlement_source(org,tx); usage_src:=finance.advance_settlement_usage_source(org,'QUICK',qid::text);
 input:=jsonb_build_object('transaction_id',tx,'source_signature',src->>'signature','title','Staff advance settlement','memo','Verified draft','funding',jsonb_build_array(jsonb_build_object('allocation_id',alloc1,'kind','INITIAL')),'usage',jsonb_build_array(jsonb_build_object('source_kind','QUICK','source_id',qid,'signature',usage_src->>'signature','evidence_file_id',evidence)));
 select md5(jsonb_build_object('originals',(select jsonb_agg(to_jsonb(r) order by r.id) from finance.expense_resolutions r where organization_id=org),'payments',(select jsonb_agg(to_jsonb(p) order by p.id) from finance.workflow_payments p where organization_id=org),'vouchers',(select count(*) from finance.vouchers where organization_id=org),'budgets',(select count(*) from finance.budget_source_assignments where organization_id=org))::text) into fingerprint;
 result:=finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',input,'draft1'); draft:=(result->>'id')::uuid;
 if finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',input,'draft1')<>result then raise exception 'TEST: retry duplicate'; end if;
 if fingerprint<>(select md5(jsonb_build_object('originals',(select jsonb_agg(to_jsonb(r) order by r.id) from finance.expense_resolutions r where organization_id=org),'payments',(select jsonb_agg(to_jsonb(p) order by p.id) from finance.workflow_payments p where organization_id=org),'vouchers',(select count(*) from finance.vouchers where organization_id=org),'budgets',(select count(*) from finance.budget_source_assignments where organization_id=org))::text)) then raise exception 'TEST: draft changed originals or money'; end if;
 totals:=finance.advance_settlement_totals(org,draft);
 if totals<>jsonb_build_object('initial_paid',1000,'additional_paid',0,'returned',0,'draft_used',800,'balance',200) then raise exception 'TEST: 1000-800 expected 200, got %',totals; end if;
 begin perform finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',input,'duplicate-advance'); raise exception 'TEST: duplicate principal'; exception when others then if sqlerrm not like '%이미 정산 초안%' then raise; end if; end;
 begin perform finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',input||'{"memo":"changed"}','draft1'); raise exception 'TEST: changed retry key'; exception when others then if sqlerrm not like '%처리키%' then raise; end if; end;
 begin perform finance.advance_settlement_command(org,reader,'DRAFT_SAVE',input,'reader-save'); raise exception 'TEST: reader save'; exception when others then if sqlerrm not like '%권한%' then raise; end if; end;
 begin perform finance.advance_settlement_workspace(org,employee); raise exception 'TEST: staff identity inferred from name'; exception when others then if sqlerrm not like '%조회 권한%' then raise; end if; end;
 begin perform finance.advance_settlement_workspace(other_org,admin_id); raise exception 'TEST: cross-org read'; exception when others then if sqlerrm not like '%조직 권한%' then raise; end if; end;
 begin perform finance.advance_settlement_command(org,admin_id,'APPROVE',input,'approve'); raise exception 'TEST: undefined approval'; exception when others then if sqlerrm not like '%정책 확인%' then raise; end if; end;
 begin perform finance.advance_settlement_source(org,vendor_tx); raise exception 'TEST: vendor advance eligible'; exception when others then if sqlerrm not like '%담당자 선지급%' then raise; end if; end;
 -- An actual return changes money; the draft never invents it and stale saves fail.
 insert into finance.workflow_payments(id,organization_id,bank_transaction_id,method,flow,amount,paid_at,counterparty,reason,created_by) values(pay3,org,bank3,'BANK','IN',200,'2026-05-01','Staff one','Actual return',admin_id);
 insert into finance.workflow_allocations(id,organization_id,payment_id,transaction_id,purpose,amount,original_allocation_id,reason,created_by) values(ret,org,pay3,tx,'RETURN',200,alloc1,'Actual return',admin_id);
 if (finance.advance_settlement_totals(org,draft)->>'balance')::numeric<>0 then raise exception 'TEST: return double counted'; end if;
 input:=input||jsonb_build_object('id',draft,'lock_version',1);
 begin perform finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',input,'stale-return'); raise exception 'TEST: stale return save'; exception when others then if sqlerrm not like '%원지급 또는 반환%' then raise; end if; end;
 src:=finance.advance_settlement_source(org,tx); input:=input||jsonb_build_object('source_signature',src->>'signature');
 result:=finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',input,'review-return');
 begin perform finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',input,'stale-version'); raise exception 'TEST: stale editor'; exception when others then if sqlerrm not like '%다른 사용자%' then raise; end if; end;
 update finance.quick_expense_records set amount=1200 where id=qid;
 if (finance.advance_settlement_totals(org,draft)->>'draft_used')::numeric<>800 then raise exception 'TEST: original edit silently changed saved use'; end if;
 usage_src:=finance.advance_settlement_usage_source(org,'QUICK',qid::text); input:=jsonb_set(input||'{"lock_version":2}','{usage,0,signature}',to_jsonb(usage_src->>'signature'));
 result:=finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',input,'review-use');
 if (finance.advance_settlement_totals(org,draft)->>'balance')::numeric<>-400 then raise exception 'TEST: 1000-200-1200 expected -400'; end if;
 -- Additional payout is another explicit actual allocation, classified once.
 insert into finance.workflow_payments(id,organization_id,bank_transaction_id,method,flow,amount,paid_at,counterparty,reason,created_by) values(pay2,org,bank2,'BANK','OUT',400,'2026-06-01','Staff one','Actual additional',admin_id);
 insert into finance.workflow_allocations(id,organization_id,payment_id,transaction_id,purpose,amount,reason,created_by) values(alloc2,org,pay2,tx,'DISBURSEMENT',400,'Actual additional',admin_id);
 src:=finance.advance_settlement_source(org,tx); input:=input||jsonb_build_object('lock_version',3,'source_signature',src->>'signature','funding',jsonb_build_array(jsonb_build_object('allocation_id',alloc1,'kind','INITIAL'),jsonb_build_object('allocation_id',alloc2,'kind','ADDITIONAL')));
 result:=finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',input,'review-additional');
 totals:=finance.advance_settlement_totals(org,draft);
 if totals<>jsonb_build_object('initial_paid',1000,'additional_paid',400,'returned',200,'draft_used',1200,'balance',0) then raise exception 'TEST: additional duplicate, got %',totals; end if;
 old_input:=input; saved_version:=4;
 src:=finance.advance_settlement_source(org,tx2);
 input:=jsonb_build_object('transaction_id',tx2,'source_signature',src->>'signature','title','Second draft','funding',jsonb_build_array(jsonb_build_object('allocation_id',alloc3,'kind','INITIAL')),'usage',old_input->'usage');
 begin perform finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',input,'duplicate-use'); raise exception 'TEST: usage reused'; exception when others then if sqlerrm not like '%사용 원본이 정산%' then raise; end if; end;
 if (select count(*) from finance.advance_settlement_drafts where organization_id=org)<>1 then raise exception 'TEST: failed create left draft'; end if;
 usage_src:=finance.advance_settlement_usage_source(org,'QUICK',qid2::text);
 input:=input||jsonb_build_object('usage',jsonb_build_array(jsonb_build_object('source_kind','QUICK','source_id',qid2,'signature',usage_src->>'signature','evidence_file_id',evidence_clone)));
 begin perform finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',input,'same-receipt'); raise exception 'TEST: same receipt bytes reused'; exception when others then if sqlerrm not like '%같은 증빙%' then raise; end if; end;
 begin perform finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',jsonb_set(input,'{usage,0,evidence_file_id}',to_jsonb(foreign_file)),'foreign-file'); raise exception 'TEST: foreign evidence'; exception when others then if sqlerrm not like '%조직의 사용 증빙%' then raise; end if; end;
 begin delete from finance.workflow_files where id=evidence; raise exception 'TEST: evidence deleted'; exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 result:=finance.advance_settlement_workspace(org,reader);
 if result::text like '%PRIVATE-ACCOUNT%' or result::text like '%test/one%' or result#>>'{policy,approval_enabled}'<>'false' then raise exception 'TEST: private data or policy'; end if;
 perform finance.workflow_command(org,admin_id,'ALLOCATION_REVERSE',jsonb_build_object('id',ret,'reason','Mistaken return link'),'reverse-return');
 if (finance.advance_settlement_totals(org,draft)->>'balance')::numeric<>200 then raise exception 'TEST: reversal not reflected'; end if;
 if (select lock_version from finance.advance_settlement_drafts where id=draft)<>saved_version then raise exception 'TEST: rejected saves changed draft'; end if;
 -- Independently paid/card use remains a review item even with valid evidence.
 update finance.quick_expense_records set payment_method='CORPORATE_CARD' where id=qid;
 usage_src:=finance.advance_settlement_usage_source(org,'QUICK',qid::text);
 if usage_src->>'review_reason' is null then raise exception 'TEST: separately paid use missing warning'; end if;
 src:=finance.advance_settlement_source(org,tx);
 old_input:=jsonb_set(old_input||jsonb_build_object('lock_version',saved_version,'source_signature',src->>'signature'),'{usage,0,signature}',to_jsonb(usage_src->>'signature'));
 perform finance.advance_settlement_command(org,admin_id,'DRAFT_SAVE',old_input,'review-card-use');
 result:=finance.advance_settlement_workspace(org,admin_id);
 if not exists(select 1 from jsonb_array_elements(result->'drafts') d where d->>'id'=draft::text and (d->>'needs_review')::boolean) then raise exception 'TEST: card use with evidence incorrectly cleared review'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform finance.advance_settlement_workspace(gen_random_uuid(),gen_random_uuid()); raise exception 'TEST: direct RPC'; exception when insufficient_privilege then null; end;
 begin perform 1 from finance.advance_settlement_usage; raise exception 'TEST: direct claims'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
