begin;
do $$
declare org uuid:=gen_random_uuid(); foreign_org uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); reviewer uuid:=gen_random_uuid(); employee uuid:=gen_random_uuid();
 account_id uuid:=gen_random_uuid(); source1 uuid:=gen_random_uuid(); source2 uuid:=gen_random_uuid(); tx1 uuid; tx2 uuid; contract_id uuid; req_id uuid; other_request uuid;
 item1 uuid; item2 uuid; document_id uuid; reply_id uuid; contract_file uuid; value jsonb; input jsonb; saved jsonb; fingerprint text; object_path text;
 conditions jsonb:='{"allowed_source_kinds":["RESOLUTION"],"required_document_types":["INVOICE"],"consent_roles":[],"no_limit":true,"operating_allowed":false,"operating_advance_allowed":false}';
begin
 insert into core.organizations(id,name,status) values(org,'Trust test','active'),(foreign_org,'Other trust test','active');
 insert into auth.users(id) values(admin_id),(reviewer),(employee);
 insert into finance.reimbursement_members values(org,admin_id,'Administrator',array['ADMIN'],true),(org,reviewer,'Reviewer',array['APPROVE'],true),(org,employee,'Employee','{}',true);
 insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status) values(account_id,org,'Bank','Trust account','9988776655','신탁계좌','사용');
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data)
 values(source1,org,'TRUST-SOURCE-1','Staff','승인완료','지급대기',1000,'{"accountHolder":"Vendor One","paymentAccountNo":"1122334455"}'),
 (source2,org,'TRUST-SOURCE-2','Staff','승인완료','지급대기',500,'{"accountHolder":"Vendor Two"}');
 tx1:=(finance.workflow_command(org,admin_id,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',source1),'enroll1')->>'id')::uuid;
 tx2:=(finance.workflow_command(org,admin_id,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',source2),'enroll2')->>'id')::uuid;
 input:=jsonb_build_object('title','Draft without contract','items',jsonb_build_array(jsonb_build_object('transaction_id',tx1,'requested_amount',600),jsonb_build_object('transaction_id',tx2,'requested_amount',200)));
 saved:=finance.trust_command(org,reviewer,'REQUEST_SAVE',input,'request-draft'); req_id:=(saved->>'id')::uuid;
 if finance.trust_command(org,reviewer,'REQUEST_SAVE',input,'request-draft')<>saved then raise exception 'TEST: duplicate draft'; end if;
 if (select count(*) from finance.workflow_trust_requests where organization_id=org)<>1 or (select contract_version_id is not null from finance.workflow_trust_requests where id=req_id) then raise exception 'TEST: policy-free draft'; end if;
 if (finance.workflow_transaction_amounts(org,tx1)->>'requestable')::numeric<>1000 then raise exception 'TEST: draft reservation'; end if;
 select id into item1 from finance.workflow_trust_items where request_id=req_id and transaction_id=tx1;
 select id into item2 from finance.workflow_trust_items where request_id=req_id and transaction_id=tx2;
 begin perform finance.trust_command(org,reviewer,'REQUEST_SUBMIT',jsonb_build_object('id',req_id,'lock_version',1,'items',jsonb_build_array(jsonb_build_object('id',item1))),'unconfigured-submit'); raise exception 'TEST: unconfigured submit'; exception when others then if sqlerrm not like '%계약 조건 확인%' then raise; end if; end;
 begin perform finance.trust_read(org,employee); raise exception 'TEST: employee read'; exception when others then if sqlerrm not like '%조회 권한%' then raise; end if; end;
 begin perform finance.trust_read(foreign_org,admin_id); raise exception 'TEST: cross org read'; exception when others then if sqlerrm not like '%조직 권한%' then raise; end if; end;
 begin perform finance.trust_command(org,reviewer,'CONTRACT_SAVE','{}','reviewer-contract'); raise exception 'TEST: contract admin'; exception when others then if sqlerrm not like '%권한%' then raise; end if; end;
 input:=jsonb_build_object('name','Test contract','trustee','Test trustee','reference','Confirmed clause','management_account_id',account_id,'conditions',conditions);
 contract_id:=(finance.trust_command(org,admin_id,'CONTRACT_SAVE',input,'contract-draft')->>'id')::uuid;
 begin perform finance.trust_command(org,admin_id,'CONTRACT_VERIFY',jsonb_build_object('id',contract_id,'lock_version',1,'reason','Reviewed'),'no-contract-file'); raise exception 'TEST: missing contract file'; exception when others then if sqlerrm not like '%계약서 원본%' then raise; end if; end;
 object_path:=org::text||'/'||admin_id::text||'/contract/'||repeat('a',64);
 insert into storage.objects(bucket_id,name) values('finance-workflow',object_path);
 input:=jsonb_build_object('bucket','finance-workflow','path',object_path,'file_name','Contract.pdf','content_hash',repeat('a',64),'purpose','CONTRACT','contract_version_id',contract_id);
 contract_file:=(finance.trust_command(org,admin_id,'FILE_REGISTER',input,'contract-file')->>'id')::uuid;
 if (finance.trust_command(org,admin_id,'FILE_REGISTER',input,'contract-file-again')->>'id')::uuid<>contract_file then raise exception 'TEST: file duplicated'; end if;
 perform finance.trust_command(org,admin_id,'CONTRACT_VERIFY',jsonb_build_object('id',contract_id,'lock_version',1,'reason','Confirmed original contract'),'contract-verify');
 begin update finance.bank_accounts set account_no='replacement' where id=account_id; raise exception 'TEST: verified account replaced'; exception when others then if sqlerrm not like '%계좌 원본은 보존%' then raise; end if; end;
 begin update finance.workflow_contract_versions set reference='changed' where id=contract_id; raise exception 'TEST: immutable verified contract'; exception when others then if sqlerrm not like '%새 버전%' then raise; end if; end;
 perform finance.trust_command(org,admin_id,'ROUTE_ASSIGN',jsonb_build_object('id',tx1,'revision',1,'route','TRUST_DIRECT','contract_version_id',contract_id,'reason','Contract scope'),'route1');
 begin perform finance.trust_command(org,admin_id,'ROUTE_ASSIGN',jsonb_build_object('id',tx1,'revision',1,'route','TRUST_DIRECT','contract_version_id',contract_id,'reason','Stale contract editor'),'route-stale'); raise exception 'TEST: stale route overwrite'; exception when others then if sqlerrm not like '%현재 거래%' then raise; end if; end;
 perform finance.trust_command(org,admin_id,'ROUTE_ASSIGN',jsonb_build_object('id',tx2,'revision',1,'route','TRUST_DIRECT','contract_version_id',contract_id,'reason','Contract scope'),'route2');
 input:=jsonb_build_object('id',req_id,'lock_version',1,'title','Combined request','request_date',current_date,'contract_version_id',contract_id,'items',jsonb_build_array(jsonb_build_object('transaction_id',tx1,'requested_amount',600),jsonb_build_object('transaction_id',tx2,'requested_amount',200)));
 perform finance.trust_command(org,reviewer,'REQUEST_SAVE',input,'request-with-contract');
 begin perform finance.trust_command(org,reviewer,'REQUEST_SAVE',input,'stale-request'); raise exception 'TEST: stale overwrite'; exception when others then if sqlerrm not like '%변경되었습니다%' then raise; end if; end;
 input:=jsonb_build_object('id',req_id,'lock_version',2,'receipt_reference','Receipt #123','items',jsonb_build_array(jsonb_build_object('id',item1),jsonb_build_object('id',item2)),'file_ids','[]'::jsonb);
 begin perform finance.trust_command(org,reviewer,'REQUEST_SUBMIT',input,'no-invoice'); raise exception 'TEST: required documents'; exception when others then if sqlerrm not like '%필수서류%' then raise; end if; end;
 object_path:=org::text||'/'||reviewer::text||'/request/'||repeat('b',64);
 insert into storage.objects(bucket_id,name) values('finance-workflow',object_path);
 document_id:=(finance.trust_command(org,reviewer,'FILE_REGISTER',jsonb_build_object('bucket','finance-workflow','path',object_path,'file_name','Invoice.pdf','content_hash',repeat('b',64),'purpose','REQUEST','document_type','INVOICE','request_id',req_id),'invoice-file')->>'id')::uuid;
 input:=input||jsonb_build_object('file_ids',jsonb_build_array(document_id));
 saved:=finance.trust_command(org,reviewer,'REQUEST_SUBMIT',input,'submit1');
 if finance.trust_command(org,reviewer,'REQUEST_SUBMIT',input,'submit1')<>saved or (saved->>'revision')::integer<>1 then raise exception 'TEST: duplicate submission'; end if;
 if (finance.workflow_transaction_amounts(org,tx1)->>'requestable')::numeric<>400 then raise exception 'TEST: submitted reservation'; end if;
 select md5(snapshot::text) into fingerprint from finance.workflow_submissions where request_id=req_id and revision=1;
 value:=finance.trust_read(org,reviewer);
 if value::text like '%1122334455%' or value::text like '%9988776655%' or value::text not like '%***4455%' then raise exception 'TEST: read leaks account'; end if;
 if value->'events'::text is null then raise exception 'TEST: events missing'; end if;
 if (value->'events')::text like '%"path"%' or (value->'events')::text like '%"bucket"%' then raise exception 'TEST: events leak storage path'; end if;
 if jsonb_array_length(value->'submissions')<>1 then raise exception 'TEST: saved submission read'; end if;
 object_path:=org::text||'/'||reviewer::text||'/reply/'||repeat('c',64);
 insert into storage.objects(bucket_id,name) values('finance-workflow',object_path);
 reply_id:=(finance.trust_command(org,reviewer,'FILE_REGISTER',jsonb_build_object('bucket','finance-workflow','path',object_path,'file_name','Reply.pdf','content_hash',repeat('c',64),'purpose','REPLY','request_id',req_id),'reply-file')->>'id')::uuid;
 input:=jsonb_build_object('id',req_id,'lock_version',3,'reason','Trustee reply','reply_file_id',reply_id,'items',jsonb_build_array(jsonb_build_object('id',item1,'status','PARTIAL','approved_amount',400),jsonb_build_object('id',item2,'status','SUPPLEMENT','reason','Additional invoice','approved_amount',0)));
 perform finance.trust_command(org,reviewer,'REPLY_RECORD',input,'mixed-reply');
 if (select status from finance.workflow_trust_requests where id=req_id)<>'SUPPLEMENT' or (finance.workflow_transaction_amounts(org,tx1)->>'requestable')::numeric<>600 or (finance.workflow_transaction_amounts(org,tx2)->>'pending')::numeric<>200 then raise exception 'TEST: mixed outcome arithmetic'; end if;
 input:=jsonb_build_object('id',req_id,'lock_version',4,'receipt_reference','Receipt #124','items',jsonb_build_array(jsonb_build_object('id',item2,'requested_amount',250)),'file_ids',jsonb_build_array(document_id));
 perform finance.trust_command(org,reviewer,'REQUEST_SUBMIT',input,'submit2');
 if (select jsonb_array_length(snapshot#>'{print,items}') from finance.workflow_submissions where request_id=req_id and revision=2)<>1 or
    (select snapshot#>>'{print,items,0,sourceNo}' from finance.workflow_submissions where request_id=req_id and revision=2)<>'TRUST-SOURCE-2' then raise exception 'TEST: resubmission print includes approved sibling or wrong number'; end if;
 if (select approved_amount from finance.workflow_trust_items where id=item1)<>400 or (select status from finance.workflow_trust_items where id=item1)<>'PARTIAL' or (finance.workflow_transaction_amounts(org,tx2)->>'pending')::numeric<>250 then raise exception 'TEST: resubmit erased sibling'; end if;
 if fingerprint<>(select md5(snapshot::text) from finance.workflow_submissions where request_id=req_id and revision=1) or (select count(*) from finance.workflow_submissions where request_id=req_id)<>2 then raise exception 'TEST: original submission overwritten'; end if;
 -- A separate draft cannot consume the amount already approved or under review.
 other_request:=(finance.trust_command(org,reviewer,'REQUEST_SAVE',jsonb_build_object('title','Duplicate amount','request_date',current_date,'contract_version_id',contract_id,'items',jsonb_build_array(jsonb_build_object('transaction_id',tx2,'requested_amount',300))),'over-draft')->>'id')::uuid;
 select id into item2 from finance.workflow_trust_items where request_id=other_request;
 input:=jsonb_build_object('id',other_request,'lock_version',1,'receipt_reference','Other receipt','items',jsonb_build_array(jsonb_build_object('id',item2)),'file_ids',jsonb_build_array(document_id));
 begin perform finance.trust_command(org,reviewer,'REQUEST_SUBMIT',input,'foreign-request-file'); raise exception 'TEST: unrelated request evidence'; exception when others then if sqlerrm not like '%연결된 첨부%' then raise; end if; end;
 -- Evidence linked directly to the transaction can be reused, but cannot bypass reservations.
 insert into finance.workflow_files(organization_id,transaction_id,purpose,document_type,bucket,path,file_name,content_hash,uploaded_by) values(org,tx2,'EVIDENCE','INVOICE','finance-workflow','fixture-evidence','Transaction.pdf',repeat('d',64),reviewer) returning id into document_id;
 input:=input||jsonb_build_object('file_ids',jsonb_build_array(document_id));
 begin perform finance.trust_command(org,reviewer,'REQUEST_SUBMIT',input,'over-submit'); raise exception 'TEST: reserved amount reused'; exception when others then if sqlerrm not like '%요청 가능액을 초과%' then raise; end if; end;
 perform finance.trust_command(org,reviewer,'WITHDRAW_REQUEST',jsonb_build_object('id',req_id,'lock_version',5,'reason','Trustee withdrawal requested','items',jsonb_build_array(jsonb_build_object('id',item1))),'withdraw-request');
 if (finance.workflow_transaction_amounts(org,tx1)->>'approved_unpaid')::numeric<>400 then raise exception 'TEST: withdrawal released early'; end if;
 perform finance.trust_command(org,reviewer,'WITHDRAW_CONFIRM',jsonb_build_object('id',req_id,'lock_version',6,'reason','Trustee withdrawal confirmed','reply_file_id',reply_id,'items',jsonb_build_array(jsonb_build_object('id',item1))),'withdraw-confirm');
 if (finance.workflow_transaction_amounts(org,tx1)->>'requestable')::numeric<>1000 then raise exception 'TEST: confirmed withdrawal did not release'; end if;
 if exists(select 1 from finance.workflow_payments where organization_id=org) or exists(select 1 from finance.vouchers where organization_id=org) then raise exception 'TEST: trust review generated payment or cost'; end if;
 raise notice 'PASS: configuration-free drafts, verified contract, role/org/version checks, immutable snapshots, mixed results, resubmission, reservations, confirmed withdrawal';
end $$;

do $$
declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); acct uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); source uuid:=gen_random_uuid(); tx uuid;
 q1 uuid; q2 uuid; i1 uuid; i2 uuid; reply1 uuid:=gen_random_uuid(); reply2 uuid:=gen_random_uuid(); bank uuid:=gen_random_uuid(); pay uuid; input jsonb; value jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Changed amount test','active');
 insert into auth.users(id) values(actor);
 insert into finance.reimbursement_members values(org,actor,'Administrator',array['ADMIN'],true);
 insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status) values(acct,org,'Bank','Trust account','ACCOUNT2','신탁계좌','사용');
 insert into finance.workflow_contract_versions(id,organization_id,contract_key,version,name,trustee,reference,management_account_id,status,conditions,created_by)
 values(c,org,c,1,'Test','Trustee','Fixture verified',acct,'VERIFIED','{"allowed_source_kinds":["RESOLUTION"],"required_document_types":[],"consent_roles":[],"no_limit":true,"operating_allowed":false,"operating_advance_allowed":false}',actor);
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data)
 values(source,org,'CHANGE-SOURCE','Staff','승인완료','지급대기',1000,'{"accountHolder":"Original recipient","paymentAccountNo":"123456"}');
 tx:=(finance.workflow_command(org,actor,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',source),'enroll')->>'id')::uuid;
 perform finance.trust_command(org,actor,'ROUTE_ASSIGN',jsonb_build_object('id',tx,'revision',1,'route','TRUST_DIRECT','contract_version_id',c,'reason','Contract scope'),'route');
 q1:=(finance.trust_command(org,actor,'REQUEST_SAVE',jsonb_build_object('title','600 request','request_date',current_date,'contract_version_id',c,'items',jsonb_build_array(jsonb_build_object('transaction_id',tx,'requested_amount',600))),'q1')->>'id')::uuid;
 q2:=(finance.trust_command(org,actor,'REQUEST_SAVE',jsonb_build_object('title','400 request','request_date',current_date,'contract_version_id',c,'items',jsonb_build_array(jsonb_build_object('transaction_id',tx,'requested_amount',400))),'q2')->>'id')::uuid;
 select id into i1 from finance.workflow_trust_items where request_id=q1;
 select id into i2 from finance.workflow_trust_items where request_id=q2;
 perform finance.trust_command(org,actor,'REQUEST_SUBMIT',jsonb_build_object('id',q1,'lock_version',1,'receipt_reference','First receipt','items',jsonb_build_array(jsonb_build_object('id',i1)),'file_ids','[]'::jsonb),'submit1');
 perform finance.trust_command(org,actor,'REQUEST_SUBMIT',jsonb_build_object('id',q2,'lock_version',1,'receipt_reference','Second receipt','items',jsonb_build_array(jsonb_build_object('id',i2)),'file_ids','[]'::jsonb),'submit2');
 insert into finance.workflow_files(id,organization_id,request_id,purpose,bucket,path,file_name,content_hash,uploaded_by) values
 (reply1,org,q1,'REPLY','finance-workflow','test-reply1','Reply1.pdf',repeat('e',64),actor),(reply2,org,q2,'REPLY','finance-workflow','test-reply2','Reply2.pdf',repeat('f',64),actor);
 perform finance.trust_command(org,actor,'REPLY_RECORD',jsonb_build_object('id',q1,'lock_version',2,'reply_file_id',reply1,'reason','Additional material requested','items',jsonb_build_array(jsonb_build_object('id',i1,'status','SUPPLEMENT','approved_amount',0))),'reply1');
 perform finance.trust_command(org,actor,'REPLY_RECORD',jsonb_build_object('id',q2,'lock_version',2,'reply_file_id',reply2,'reason','Approved','items',jsonb_build_array(jsonb_build_object('id',i2,'status','APPROVED','approved_amount',400))),'reply2');
 update finance.expense_resolutions set total_payment_amount=700 where id=source::text;
 perform finance.workflow_command(org,actor,'REFRESH',jsonb_build_object('id',tx,'reason','Changed confirmed amount'),'refresh1');
 input:=jsonb_build_object('id',q1,'lock_version',3,'receipt_reference','Changed receipt','items',jsonb_build_array(jsonb_build_object('id',i1,'requested_amount',600)),'file_ids','[]'::jsonb);
 begin perform finance.trust_command(org,actor,'REQUEST_SUBMIT',input,'bad-reduced'); raise exception 'TEST: clamped requestable bypass'; exception when others then if sqlerrm not like '%요청 가능액을 초과%' then raise; end if; end;
 input:=jsonb_set(input,'{items,0,requested_amount}','300');
 perform finance.trust_command(org,actor,'REQUEST_SUBMIT',input,'reduced-submit');
 -- Reconfirm the affected approval with trustee evidence; original submission and payments persist.
 perform finance.trust_command(org,actor,'REPLY_RECORD',jsonb_build_object('id',q2,'lock_version',3,'reply_file_id',reply2,'reason','Reopen changed approval','items',jsonb_build_array(jsonb_build_object('id',i2,'status','SUPPLEMENT','approved_amount',0))),'reopen1');
 perform finance.trust_command(org,actor,'REQUEST_SUBMIT',jsonb_build_object('id',q2,'lock_version',4,'receipt_reference','Recheck amount','items',jsonb_build_array(jsonb_build_object('id',i2)),'file_ids','[]'::jsonb),'recheck1');
 perform finance.trust_command(org,actor,'REPLY_RECORD',jsonb_build_object('id',q2,'lock_version',5,'reply_file_id',reply2,'reason','Reapproved','items',jsonb_build_array(jsonb_build_object('id',i2,'status','APPROVED','approved_amount',400))),'reapprove1');
 insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,description,withdrawal_amount,deposit_amount) values(bank,org,acct,now(),'Actual partial payment',400,0);
 pay:=(finance.workflow_command(org,actor,'PAYMENT_RECORD',jsonb_build_object('method','BANK','bank_transaction_id',bank,'reason','Actual bank statement'),'payment')->>'id')::uuid;
 perform finance.workflow_command(org,actor,'PAYMENT_ALLOCATE',jsonb_build_object('payment_id',pay,'reason','First part','items',jsonb_build_array(jsonb_build_object('transaction_id',tx,'trust_item_id',i2,'purpose','DISBURSEMENT','amount',250))),'pay250');
 update finance.expense_resolutions set resolution_data=jsonb_set(resolution_data,'{accountHolder}','"Changed recipient"') where id=source::text;
 perform finance.workflow_command(org,actor,'REFRESH',jsonb_build_object('id',tx,'reason','Changed recipient'),'refresh2');
 input:=jsonb_build_object('payment_id',pay,'reason','Remaining part','items',jsonb_build_array(jsonb_build_object('transaction_id',tx,'trust_item_id',i2,'purpose','DISBURSEMENT','amount',150)));
 begin perform finance.workflow_command(org,actor,'PAYMENT_ALLOCATE',input,'bad-stale-payment'); raise exception 'TEST: stale approval paid'; exception when others then if sqlerrm not like '%유효한 신탁 승인%' then raise; end if; end;
 perform finance.trust_command(org,actor,'REPLY_RECORD',jsonb_build_object('id',q2,'lock_version',6,'reply_file_id',reply2,'reason','Reopen recipient review','items',jsonb_build_array(jsonb_build_object('id',i2,'status','SUPPLEMENT','approved_amount',0))),'reopen2');
 value:=finance.workflow_transaction_amounts(org,tx);
 if (value->>'paid')::numeric<>250 or (value->>'pending')::numeric<>450 or (value->>'requestable')::numeric<>0 then raise exception 'TEST: reopened review double counts paid %',value; end if;
 perform finance.trust_command(org,actor,'REQUEST_SUBMIT',jsonb_build_object('id',q2,'lock_version',7,'receipt_reference','Recheck recipient','items',jsonb_build_array(jsonb_build_object('id',i2)),'file_ids','[]'::jsonb),'recheck2');
 perform finance.trust_command(org,actor,'REPLY_RECORD',jsonb_build_object('id',q2,'lock_version',8,'reply_file_id',reply2,'reason','Recipient reapproved','items',jsonb_build_array(jsonb_build_object('id',i2,'status','APPROVED','approved_amount',400))),'reapprove2');
 perform finance.workflow_command(org,actor,'PAYMENT_ALLOCATE',input,'remaining150');
 value:=finance.workflow_transaction_amounts(org,tx);
 if (value->>'paid')::numeric<>400 or (value->>'pending')::numeric<>300 or (value->>'approved_unpaid')::numeric<>0 or (value->>'requestable')::numeric<>0 then raise exception 'TEST: reapproved split payment %',value; end if;
 raise notice 'PASS: reduced source cap, changed recipient re-review, partial payment preservation, reserve only unpaid';
end $$;

do $$ declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); contract uuid; value jsonb; payload jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Contract draft edit regression','active');
 insert into auth.users(id) values(actor);
 insert into finance.reimbursement_members values(org,actor,'Test admin',array['ADMIN'],true);
 contract:=(finance.trust_command(org,actor,'CONTRACT_SAVE','{"name":"Initial","conditions":{"draft_required_document_types":["Original"]}}','edit-create')->>'id')::uuid;
 payload:=jsonb_build_object('id',contract,'lock_version',1,'name','Updated','conditions',jsonb_build_object('required_document_types',jsonb_build_array('Changed'),'operating_allowed',false));
 value:=finance.trust_command(org,actor,'CONTRACT_SAVE',payload,'edit-save');
 if (value->>'lock_version')::integer<>2 then raise exception 'TEST: draft edit lock'; end if;
 if not exists(select 1 from finance.workflow_contract_versions c where c.id=contract and c.name='Updated' and c.conditions=payload->'conditions' and c.lock_version=2) then raise exception 'TEST: changed conditions not persisted'; end if;
 if finance.trust_command(org,actor,'CONTRACT_SAVE',payload,'edit-save')<>value then raise exception 'TEST: duplicate edit result'; end if;
 begin perform finance.trust_command(org,actor,'CONTRACT_SAVE',payload,'edit-stale'); raise exception 'TEST: stale draft edit'; exception when others then if sqlerrm not like '%변경되었습니다%' then raise; end if; end;
 if (select count(*) from finance.workflow_events where organization_id=org and action='TRUST:CONTRACT_SAVE')<>2 then raise exception 'TEST: draft edit duplicate event'; end if;
 raise notice 'PASS: contract draft conditions edit persists, retries once, and rejects stale lock';
end $$;
rollback;
