begin;
do $$
declare org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); payer uuid:=gen_random_uuid();
 rid text:=gen_random_uuid()::text; tx uuid; input jsonb; result jsonb; previous jsonb; before_money text;
 advance_id text:=gen_random_uuid()::text; advance_tx uuid; quick_id uuid:=gen_random_uuid(); quick_tx uuid;
 account_id uuid:=gen_random_uuid(); bank_id uuid:=gen_random_uuid(); payment_id uuid:=gen_random_uuid();
begin
 insert into core.organizations(id,name,status) values(org,'Classification test','active'),(other_org,'Other classification','active');
 insert into auth.users(id) values(actor),(payer);
 insert into finance.reimbursement_members values(org,actor,'Admin',array['ADMIN'],true),(org,payer,'Payer',array['PAY'],true);
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data)
 values(rid,org,'CLASSIFY-1','Staff','승인완료','지급대기',20000,'{}');
 tx:=(finance.workflow_command(org,actor,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',rid),'enroll')->>'id')::uuid;
 if exists(select 1 from finance.expense_classifications where organization_id=org) then raise exception 'TEST: invented classification'; end if;
 input:=jsonb_build_object('transaction_id',tx,'expected_version',0,'source_signature',(select source_signature from finance.workflow_transactions where id=tx),
  'cost_category','OPERATING','payment_method','PERSONAL_CARD','funding_origin','PERSONAL','processing_route','RESOLUTION','reason','Reviewed personal paint purchase');
 select md5(jsonb_build_object('original',(select to_jsonb(r) from finance.expense_resolutions r where id=rid),'workflow',(select to_jsonb(t) from finance.workflow_transactions t where id=tx),'payments',(select count(*) from finance.workflow_payments where organization_id=org),'budgets',(select count(*) from finance.budget_source_assignments where organization_id=org))::text) into before_money;
 result:=finance.expense_classification_save(org,actor,input,'one');
 if result->>'funding_origin'<>'PERSONAL' or result->>'payment_method'<>'PERSONAL_CARD' or result->>'budget_state'<>'UNKNOWN' or result->>'version'<>'1' then raise exception 'TEST: axes lost'; end if;
 if finance.expense_classification_save(org,actor,input,'one')<>result then raise exception 'TEST: idempotent retry'; end if;
 if (select count(*) from finance.workflow_events where organization_id=org and action='EXPENSE_CLASSIFY')<>1 then raise exception 'TEST: duplicate audit'; end if;
 if before_money<>(select md5(jsonb_build_object('original',(select to_jsonb(r) from finance.expense_resolutions r where id=rid),'workflow',(select to_jsonb(t) from finance.workflow_transactions t where id=tx),'payments',(select count(*) from finance.workflow_payments where organization_id=org),'budgets',(select count(*) from finance.budget_source_assignments where organization_id=org))::text)) then raise exception 'TEST: classification changed money'; end if;
 begin perform finance.expense_classification_save(org,payer,input,'denied'); raise exception 'TEST: payer classified'; exception when others then if sqlerrm not like '%권한%' then raise; end if; end;
 begin perform finance.expense_classification_save(other_org,actor,input,'foreign'); raise exception 'TEST: foreign org'; exception when others then if sqlerrm not like '%조직 권한%' then raise; end if; end;
 begin perform finance.expense_classification_save(org,actor,input,'stale'); raise exception 'TEST: stale overwrite'; exception when others then if sqlerrm not like '%분류가 변경%' then raise; end if; end;
 begin perform finance.expense_classification_save(org,actor,input||'{"reason":"changed"}','one'); raise exception 'TEST: key reuse'; exception when others then if sqlerrm not like '%처리키%' then raise; end if; end;
 input:=input||'{"expected_version":1}';
 begin perform finance.expense_classification_save(org,actor,input||'{"cost_category":"BUSINESS","processing_route":"SIMPLE"}','business-simple'); raise exception 'TEST: business simple route'; exception when others then if sqlerrm not like '%지출결의로%' then raise; end if; end;
 begin perform finance.expense_classification_save(org,actor,input||'{"budget_state":"WITHIN"}','budget'); raise exception 'TEST: user forged budget evaluation'; exception when others then if sqlerrm not like '%입력 형식%' then raise; end if; end;
 begin perform finance.expense_classification_save(org,actor,input||'{"actor_id":"forged"}','actor'); raise exception 'TEST: actor injected'; exception when others then if sqlerrm not like '%입력 형식%' then raise; end if; end;
 begin perform finance.expense_classification_save(org,actor,input||'{"payment_method":"CORPORATE_CARD"}','corporate'); raise exception 'TEST: corporate card personal funds'; exception when check_violation then null; end;
 begin perform finance.expense_classification_save(org,actor,input||jsonb_build_object('funding_origin','ADVANCE','advance_transaction_id',tx),'self-advance'); raise exception 'TEST: nonadvance source'; exception when others then if sqlerrm not like '%선지급%' then raise; end if; end;
 result:=finance.expense_classification_save(org,actor,input||'{"payment_method":"CASH","funding_origin":"UNKNOWN","processing_route":"UNKNOWN"}','two');
 if result->>'version'<>'2' or result->>'funding_origin'<>'UNKNOWN' then raise exception 'TEST: unknown default lost'; end if;
 select before_data into previous from finance.workflow_events where organization_id=org and action='EXPENSE_CLASSIFY' and after_data->>'version'='2';
 if previous->>'version'<>'1' or previous->>'funding_origin'<>'PERSONAL' then raise exception 'TEST: history lost'; end if;
 update finance.expense_resolutions set total_payment_amount=21000 where id=rid;
 begin perform finance.expense_classification_save(org,actor,input||'{"expected_version":2}','source-stale'); raise exception 'TEST: source changed'; exception when others then if sqlerrm not like '%원본이 변경%' then raise; end if; end;
 -- A personal card does not imply personal funding: actual received advance is valid.
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,expense_timing,execution_method,resolution_data)
 values(advance_id,org,'CLASSIFY-ADVANCE','Staff','승인완료','지급대기',30000,'ADVANCE','EMPLOYEE_ADVANCE','{}');
 advance_tx:=(finance.workflow_command(org,actor,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',advance_id),'advance-enroll')->>'id')::uuid;
 insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status) values(account_id,org,'Test','Operating','CLASSIFY-TEST','운영계좌','사용');
 insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,description,withdrawal_amount,deposit_amount) values(bank_id,org,account_id,'2026-03-01','Advance paid',30000,0);
 insert into finance.workflow_payments(id,organization_id,bank_transaction_id,method,flow,amount,paid_at,counterparty,reason,created_by) values(payment_id,org,bank_id,'BANK','OUT',30000,'2026-03-01','Staff','Actual funding',actor);
 insert into finance.workflow_allocations(organization_id,payment_id,transaction_id,purpose,amount,reason,created_by) values(org,payment_id,advance_tx,'DISBURSEMENT',30000,'Actual funding',actor);
 insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,approval_skip_reason,direct_expense_decision,record_status,recorded_by_label)
 values(quick_id,org,'MANUAL','PERSONAL_PREPAID','2026-03-02',20000,'Paint shop','Paint supplies','Office','Reviewed','REQUIRED','NEEDS_RESOLUTION','Staff');
 quick_tx:=(finance.workflow_command(org,actor,'ENROLL',jsonb_build_object('source_kind','QUICK','source_id',quick_id),'quick-enroll')->>'id')::uuid;
 input:=jsonb_build_object('transaction_id',quick_tx,'expected_version',0,'source_signature',(select source_signature from finance.workflow_transactions where id=quick_tx),
  'cost_category','OPERATING','payment_method','PERSONAL_CARD','funding_origin','ADVANCE','advance_transaction_id',advance_tx,'processing_route','UNKNOWN','reason','Personal card with advance funding');
 result:=finance.expense_classification_save(org,actor,input,'personal-card-advance');
 if result->>'payment_method'<>'PERSONAL_CARD' or result->>'funding_origin'<>'ADVANCE' or result->>'advance_transaction_id'<>advance_tx::text then raise exception 'TEST: advance funded personal card lost'; end if;
 if exists(select 1 from finance.personal_reimbursements where organization_id=org) or (select count(*) from finance.workflow_payments where organization_id=org)<>1 then raise exception 'TEST: classification generated duplicate refund/payment'; end if;
 if has_function_privilege('authenticated','finance.expense_classification_save(uuid,uuid,jsonb,text)','execute') or has_table_privilege('anon','finance.expense_classifications','select') then raise exception 'TEST: public classification API'; end if;
end $$;
rollback;
