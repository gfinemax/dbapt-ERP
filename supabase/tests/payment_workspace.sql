begin;
do $$
declare org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); employee uuid:=gen_random_uuid();
 acct uuid:=gen_random_uuid(); bank uuid:=gen_random_uuid(); future_bank uuid:=gen_random_uuid(); foreign_bank uuid:=gen_random_uuid();
 source text:=gen_random_uuid()::text; tx uuid; contract uuid:=gen_random_uuid(); pay uuid; a uuid; result jsonb; original jsonb;
 req uuid:=gen_random_uuid(); trust_item uuid:=gen_random_uuid();
begin
 insert into core.organizations(id,name,status) values(org,'Payment test','active'),(other_org,'Other','active');
 insert into auth.users(id) values(actor),(employee);
 insert into finance.reimbursement_members values(org,actor,'Payer',array['ADMIN'],true),(org,employee,'Employee','{}',true);
 insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status) values(acct,org,'Test','Operating','987654321','운영계좌','사용');
 insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,description,withdrawal_amount,deposit_amount) values
 (bank,org,acct,now()-interval '1 day','Actual',1000,0),(future_bank,org,acct,now()+interval '1 day','Future',1000,0),(foreign_bank,other_org,acct,now(),'Foreign association',1000,0);
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data)
 values(source,org,'PAYMENT-TEST','Staff','승인완료','지급대기',1000,'{}');
 tx:=(finance.workflow_command(org,actor,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',source),'enroll')->>'id')::uuid;
 result:=finance.payment_workspace(org,actor);
 if jsonb_array_length(result->'banks')<>1 or result::text like '%987654321%' or result::text not like '%***4321%' then raise exception 'TEST: eligible masked bank selection'; end if;
 if (result#>>'{eligibility,0,available}')::numeric<>0 or result#>>'{eligibility,0,reason}'<>'계약·집행 경로 설정 필요' then raise exception 'TEST: unconfigured route ready'; end if;
 begin perform finance.payment_workspace(org,employee); raise exception 'TEST: nonstaff read'; exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 begin perform finance.payment_workspace(other_org,actor); raise exception 'TEST: foreign org read'; exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 insert into finance.workflow_contract_versions(id,organization_id,contract_key,version,name,trustee,reference,management_account_id,status,conditions,created_by)
 values(contract,org,contract,1,'Test','Trustee','Test clause',acct,'VERIFIED',jsonb_build_object('operating_allowed',true,'operating_basis','Test clause','operating_account_ids',jsonb_build_array(acct)),actor);
 update finance.workflow_transactions set route='OPERATING',contract_version_id=contract where id=tx;
 if (finance.payment_workspace(org,actor)#>>'{eligibility,0,available}')::numeric<>1000 then raise exception 'TEST: confirmed operating route not ready'; end if;
 insert into finance.workflow_trust_requests(id,organization_id,request_no,title,contract_version_id,status,revision,created_by)
 values(req,org,'TRUST-PAYMENT-TEST','Request',contract,'SUBMITTED',1,actor);
 insert into finance.workflow_trust_items(id,organization_id,request_id,transaction_id,requested_amount,status,source_revision)
 values(trust_item,org,req,tx,600,'REVIEWING',(select revision from finance.workflow_transactions where id=tx));
 if (finance.payment_workspace(org,actor)#>>'{eligibility,0,available}')::numeric<>400 then raise exception 'TEST: pending reservation considered available'; end if;
 update finance.workflow_transactions set route='TRUST_DIRECT' where id=tx;
 if (finance.payment_workspace(org,actor)#>>'{eligibility,0,available}')::numeric<>0 then raise exception 'TEST: unapproved trust request considered payable'; end if;
 update finance.workflow_trust_items set status='PARTIAL',approved_amount=300,needs_review=false,source_revision=(select revision from finance.workflow_transactions where id=tx) where id=trust_item;
 if (finance.payment_workspace(org,actor)#>>'{eligibility,0,available}')::numeric<>300 then raise exception 'TEST: partial approval amount'; end if;
 update finance.workflow_trust_items set needs_review=true where id=trust_item;
 if (finance.payment_workspace(org,actor)#>>'{eligibility,0,available}')::numeric<>0 then raise exception 'TEST: stale approval considered payable'; end if;
 update finance.workflow_trust_items set status='WITHDRAWN',approved_amount=0 where id=trust_item;
 update finance.workflow_trust_requests set status='WITHDRAWN' where id=req;
 update finance.workflow_transactions set route='OPERATING' where id=tx;
 pay:=(finance.workflow_command(org,actor,'PAYMENT_RECORD',jsonb_build_object('method','BANK','bank_transaction_id',bank,'reason','Actual statement'),'record')->>'id')::uuid;
 original:=finance.payment_workspace(org,actor);
 if jsonb_array_length(original->'banks')<>0 or jsonb_array_length(original->'payments')<>1 then raise exception 'TEST: bank not removed on reload'; end if;
 result:=finance.workflow_command(org,actor,'PAYMENT_ALLOCATE',jsonb_build_object('payment_id',pay,'reason','Partial payout','items',jsonb_build_array(jsonb_build_object('transaction_id',tx,'purpose','DISBURSEMENT','amount',400))),'allocate');
 if finance.workflow_command(org,actor,'PAYMENT_ALLOCATE',jsonb_build_object('payment_id',pay,'reason','Partial payout','items',jsonb_build_array(jsonb_build_object('transaction_id',tx,'purpose','DISBURSEMENT','amount',400))),'allocate')<>result then raise exception 'TEST: allocation retry'; end if;
 result:=finance.payment_workspace(org,actor);
 if (result#>>'{eligibility,0,available}')::numeric<>600 or jsonb_array_length(result->'allocations')<>1 or (result#>>'{transactions,0,amounts,paid}')::numeric<>400 then raise exception 'TEST: partial reload amount'; end if;
 update finance.expense_resolutions set subject='Changed recipient request' where id=source;
 result:=finance.payment_workspace(org,actor);
 if (result#>>'{eligibility,0,available}')::numeric<>0 or result#>>'{eligibility,0,reason}'<>'원본 변경 재확인 필요' then raise exception 'TEST: stale source appears ready'; end if;
 if (result#>>'{transactions,0,amounts,paid}')::numeric<>400 then raise exception 'TEST: actual payment lost on source edit'; end if;
 select id into a from finance.workflow_allocations where transaction_id=tx;
 perform finance.workflow_command(org,actor,'ALLOCATION_REVERSE',jsonb_build_object('id',a,'reason','Incorrect allocation'),'reverse');
 result:=finance.payment_workspace(org,actor);
 if jsonb_array_length(result->'payments')<>1 or result#>>'{allocations,0,reversed}'<>'true' or result#>>'{reversals,0,reason}'<>'Incorrect allocation' then raise exception 'TEST: reversal history persistence'; end if;
 if has_function_privilege('authenticated','finance.payment_workspace(uuid,uuid)','EXECUTE') or has_function_privilege('anon','finance.payment_workspace(uuid,uuid)','EXECUTE') then raise exception 'TEST: public RPC access'; end if;
end $$;
rollback;
