begin;
do $$
#variable_conflict use_variable
declare org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); writer uuid:=gen_random_uuid(); signer uuid:=gen_random_uuid(); twin uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); id uuid:=gen_random_uuid(); expense_id uuid:=gen_random_uuid(); contract_doc uuid:=gen_random_uuid(); contract_result uuid; payload jsonb; result jsonb; v integer; snap jsonb; step_id uuid; audit_count integer;
begin
 insert into core.organizations(id,name,status) values(org,'Approval auth','active'),(other_org,'Other approval','active');
 insert into auth.users(id) values(writer),(signer),(twin),(other);
 insert into finance.reimbursement_members values(org,writer,'Writer',array['ADMIN'],true),(org,signer,'Same Name',array['APPROVE'],true),(org,twin,'Same Name',array['APPROVE'],true),(other_org,other,'Other',array['ADMIN'],true);
 payload:=jsonb_build_object('document',jsonb_build_object('documentType','GENERAL','title','Test document','body','Body','departmentLabel','Operations','purpose','Purpose','drafterLabel','Forged','amount',100,'meetingStatus','NOT_REQUIRED','recommendedMeetingBody','INTERNAL','recommendationReason','Reason','regulationReference','Rule','paymentSchedule','[]'::jsonb),'steps',jsonb_build_array(jsonb_build_object('order',1,'approverLabel','Same Name','approverRole','Signer')),'lines',jsonb_build_array(jsonb_build_object('supplyAmount',100,'vatAmount',0,'description','Line')));
 result:=approval.document_command(org,writer,'CREATE',id,0,payload,'create');v:=(result->>'version')::integer;
 if (select approval_status from approval.documents where documents.id=id)<>'DRAFT' or (select drafter_label from approval.documents where documents.id=id)<>'Writer' or (select recommendation_reason from approval.documents where documents.id=id)<>'Reason' then raise exception 'TEST: draft/auth/metadata persistence';end if;
 if approval.document_command(org,writer,'CREATE',id,0,payload,'create')<>result then raise exception 'TEST: create retry';end if;
 begin perform approval.document_command(org,writer,'SUBMIT',id,v,'{}','unbound-submit');raise exception 'TEST: unresolved signer';exception when others then if sqlerrm not like '%UUID 연결%' then raise;end if;end;
 select to_jsonb(d) into snap from approval.documents d where d.id=id;
 result:=approval.document_command(org,writer,'BIND',id,v,jsonb_build_object('drafter_user_id',writer,'steps',jsonb_build_array(jsonb_build_object('order',1,'user_id',signer)),'reason','Explicit identity'),'bind');v:=(result->>'version')::integer;
 if (select to_jsonb(d) from approval.documents d where d.id=id)<>snap then raise exception 'TEST: binding rewrote document';end if;
 if not exists(select 1 from approval.audit_logs where document_id=id and action_type='AUTH:BIND' and after_data#>>'{binding,steps,0,user_id}'=signer::text) then raise exception 'TEST: selected UUID missing from audit';end if;
 update finance.reimbursement_members set permissions=array['PAY'] where organization_id=org and user_id=signer;
 begin perform approval.document_command(org,writer,'SUBMIT',id,v,'{}','pay-signer-submit');raise exception 'TEST: PAY signer submitted';exception when others then if sqlerrm not like '%결재자 계정 권한%' then raise;end if;end;
 begin perform approval.document_command(org,writer,'BIND',id,v,jsonb_build_object('drafter_user_id',writer,'steps',jsonb_build_array(jsonb_build_object('order',1,'user_id',signer)),'reason','Ineligible'),'pay-signer-bind');raise exception 'TEST: PAY signer bound';exception when others then if sqlerrm not like '%결재자 계정 권한%' then raise;end if;end;
 update finance.reimbursement_members set permissions=array['APPROVE'] where organization_id=org and user_id=signer;
 begin perform approval.document_command(other_org,other,'SUBMIT',id,v,'{}','foreign');raise exception 'TEST: cross org';exception when others then if sqlerrm not like '%조직의 기안%' then raise;end if;end;
 result:=approval.document_command(org,writer,'SUBMIT',id,v,'{}','submit');v:=(result->>'version')::integer;
 if (select count(*) from jsonb_array_elements(finance.finance_task_sources(org,signer))x where x->>'kind'='MY_APPROVAL' and x->>'href'='/approval/'||id::text)<>1 then raise exception 'TEST: bound signer task missing with null legacy profile FK';end if;
 if exists(select 1 from jsonb_array_elements(finance.finance_task_sources(org,twin))x where x->>'kind'='MY_APPROVAL') then raise exception 'TEST: same label different UUID sees signer task';end if;
 select steps into snap from approval.document_authorization_bindings where document_id=id;
 update approval.document_authorization_bindings set steps=jsonb_set(steps,'{0,legacy_step,approver_label}','"Stale name"') where document_id=id;
 if exists(select 1 from jsonb_array_elements(finance.finance_task_sources(org,signer))x where x->>'kind'='MY_APPROVAL') then raise exception 'TEST: stale binding task eligible';end if;
 update approval.document_authorization_bindings set steps=snap where document_id=id;
 update finance.reimbursement_members set permissions=array['PAY'] where organization_id=org and user_id=signer;
 if exists(select 1 from jsonb_array_elements(finance.finance_task_sources(org,signer))x where x->>'kind'='MY_APPROVAL') then raise exception 'TEST: revoked approval role still has task';end if;
 begin perform approval.document_command(org,signer,'APPROVE',id,v,'{}','role-revoked');raise exception 'TEST: role-revoked signer approved';exception when others then if sqlerrm not like '%결재 실행 권한%' then raise;end if;end;
 update finance.reimbursement_members set permissions=array['APPROVE'] where organization_id=org and user_id=signer;
 begin perform approval.document_command(org,twin,'APPROVE',id,v,'{}','twin');raise exception 'TEST: same name approved';exception when others then if sqlerrm not like '%UUID 결재자%' then raise;end if;end;
 result:=approval.document_command(org,signer,'REJECT',id,v,'{"comment":"Revise"}','reject');v:=(result->>'version')::integer;
 result:=approval.document_command(org,writer,'RESUBMIT',id,v,'{"changes":{"title":"Revised"}}','resubmit');v:=(result->>'version')::integer;
 result:=approval.document_command(org,signer,'APPROVE',id,v,'{}','approve');
 if result->>'approval_status'<>'APPROVED' then raise exception 'TEST: final approval';end if;
 if (select reserved_amount from approval.documents where documents.id=id)<>0 or (select execution_status from approval.documents where documents.id=id)='BUDGET_RESERVED' then raise exception 'TEST: GENERAL false budget reservation';end if;
 begin perform approval.document_command(org,signer,'APPROVE',id,v,'{}','stale');raise exception 'TEST: stale version';exception when others then if sqlerrm not like '%기안이 변경%' then raise;end if;end;
 if not exists(select 1 from approval.audit_logs where document_id=id and auth_actor_id=signer and action_type='AUTH:APPROVE') then raise exception 'TEST: UUID audit missing';end if;
 -- Binding an approved historical document never writes signer fields or approval history.
 select count(*) into audit_count from approval.audit_logs where document_id=id and action_type='AUTH:APPROVE';
 perform approval.document_command(org,writer,'BIND',id,(result->>'version')::integer,jsonb_build_object('drafter_user_id',writer,'steps',jsonb_build_array(jsonb_build_object('order',1,'user_id',twin)),'reason','Display identity only'),'rebind-approved');
 if exists(select 1 from approval.approval_steps where document_id=id and approver_id is not null) or (select count(*) from approval.audit_logs where document_id=id and action_type='AUTH:APPROVE')<>audit_count then raise exception 'TEST: retroactive signature';end if;
 -- Missing budget final approval rolls back both signer status and version.
 payload:=jsonb_set(payload,'{document,documentType}','"EXPENSE"');payload:=jsonb_set(payload,'{document,budgetItem}','"Missing"');
 result:=approval.document_command(org,writer,'CREATE',expense_id,0,payload,'expense-create');
 result:=approval.document_command(org,writer,'BIND',expense_id,(result->>'version')::integer,jsonb_build_object('drafter_user_id',writer,'steps',jsonb_build_array(jsonb_build_object('order',1,'user_id',signer)),'reason','Explicit'),'expense-bind');
 result:=approval.document_command(org,writer,'SUBMIT',expense_id,(result->>'version')::integer,'{}','expense-submit');v:=(result->>'version')::integer;
 begin perform approval.document_command(org,signer,'APPROVE',expense_id,v,'{}','missing-budget');raise exception 'TEST: missing budget reserved';exception when others then if sqlerrm not like '%조직·연도 예산%' then raise;end if;end;
 if (select version from approval.document_authorization_bindings where document_id=expense_id)<>v or (select status from approval.approval_steps where document_id=expense_id)<>'PENDING' or exists(select 1 from approval.budget_reservations where document_id=expense_id) then raise exception 'TEST: partial failed approval';end if;
 insert into approval.budgets(organization_id,fiscal_year,budget_item,approved_amount) values(org,extract(year from current_date)::integer,'Missing',1000);
 result:=approval.document_command(org,signer,'APPROVE',expense_id,v,'{}','budget-approved');
 if (select count(*) from approval.budget_reservations where document_id=expense_id and amount=100 and status='ACTIVE')<>1 then raise exception 'TEST: reservation missing';end if;
 result:=approval.document_command(org,writer,'CLOSE',expense_id,(result->>'version')::integer,'{"action":"CANCELLED","reason":"Cancelled before execution"}','close');
 if (select reserved_amount from approval.documents where documents.id=expense_id)<>0 or exists(select 1 from approval.budget_reservations where document_id=expense_id and status='ACTIVE') then raise exception 'TEST: reservation close';end if;
 -- Canonical contractPaymentTerms survives CREATE and the existing contract linkage.
 payload:=jsonb_set(payload,'{document}',(payload->'document')||jsonb_build_object('documentType','CONTRACT','outOfBudget',true,'contractStartDate','2026-03-01','contractEndDate','2026-12-31','contractPaymentTerms','Pay on verified milestones','paymentSchedule',jsonb_build_array(jsonb_build_object('dueDate','2026-03-01','amount',60),jsonb_build_object('dueDate','2026-12-31','amount',40))));
 result:=approval.document_command(org,writer,'CREATE',contract_doc,0,payload,'contract-create');
 result:=approval.document_command(org,writer,'BIND',contract_doc,(result->>'version')::integer,jsonb_build_object('drafter_user_id',writer,'steps',jsonb_build_array(jsonb_build_object('order',1,'user_id',signer)),'reason','Explicit'),'contract-bind');
 result:=approval.document_command(org,writer,'SUBMIT',contract_doc,(result->>'version')::integer,'{}','contract-submit');
 result:=approval.document_command(org,signer,'APPROVE',contract_doc,(result->>'version')::integer,'{}','contract-approve');
 if (select reserved_amount from approval.documents where documents.id=contract_doc)<>0 or (select execution_status from approval.documents where documents.id=contract_doc)='BUDGET_RESERVED' then raise exception 'TEST: out-of-budget false reservation';end if;
 contract_result:=approval.create_contract(contract_doc,'Verified admin','');
 if not exists(select 1 from approval.contracts where contracts.id=contract_result and payment_terms='Pay on verified milestones' and start_date='2026-03-01' and end_date='2026-12-31' and paid_amount=0) or (select sum(requested_amount) from approval.contract_payments where contract_id=contract_result)<>100 or (select count(*) from approval.contract_payments where contract_id=contract_result)<>2 then raise exception 'TEST: contract terms/schedule lost';end if;
 begin perform approval.decide_document(id,'Same Name','APPROVE');raise exception 'TEST: legacy label RPC';exception when others then if sqlerrm not like '%document_command%' then raise;end if;end;
 begin update approval.documents set title='Bypass' where documents.id=id;raise exception 'TEST: direct bound mutation';exception when others then if sqlerrm not like '%문서 명령%' then raise;end if;end;
end $$;
-- Submission validates the stored, updated document and rejects skipped historical stages.
do $$
declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); doc_id uuid:=gen_random_uuid(); r jsonb; v integer; p jsonb; snap jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Submission rules','active');
 insert into auth.users(id) values(actor);
 insert into finance.reimbursement_members values(org,actor,'Actor',array['ADMIN'],true);
 p:=jsonb_build_object('document',jsonb_build_object('documentType','EXPENSE','title','Zero draft','departmentLabel','Operations','purpose','Review','amount',0),'steps','[{"approverLabel":"Actor"},{"approverLabel":"Actor"}]'::jsonb,'lines','[]'::jsonb);
 r:=approval.document_command(org,actor,'CREATE',doc_id,0,p,'create');
 r:=approval.document_command(org,actor,'BIND',doc_id,(r->>'version')::integer,jsonb_build_object('drafter_user_id',actor,'steps',jsonb_build_array(jsonb_build_object('order',1,'user_id',actor),jsonb_build_object('order',2,'user_id',actor)),'reason','Verified'),'bind');v:=(r->>'version')::integer;
 begin perform approval.document_command(org,actor,'SUBMIT',doc_id,v,'{}','zero-submit');raise exception 'TEST: zero expense submitted';exception when others then if sqlerrm not like '%금액이 필요%' then raise;end if;end;
 r:=approval.document_command(org,actor,'UPDATE',doc_id,v,'{"changes":{"amount":100,"purpose":""}}','edit-purpose');v:=(r->>'version')::integer;
 begin perform approval.document_command(org,actor,'SUBMIT',doc_id,v,'{}','empty-purpose');raise exception 'TEST: empty purpose submitted';exception when others then if sqlerrm not like '%부서·목적%' then raise;end if;end;
 r:=approval.document_command(org,actor,'UPDATE',doc_id,v,'{"changes":{"purpose":"Review"}}','fix-purpose');
 r:=approval.document_command(org,actor,'SUBMIT',doc_id,(r->>'version')::integer,'{}','submit');
 r:=approval.document_command(org,actor,'REJECT',doc_id,(r->>'version')::integer,'{"comment":"Review"}','reject');v:=(r->>'version')::integer;
 select to_jsonb(d) into snap from approval.documents d where id=doc_id;
 begin perform approval.document_command(org,actor,'RESUBMIT',doc_id,v,'{"changes":{"amount":0}}','zero-resubmit');raise exception 'TEST: updated zero amount resubmitted';exception when others then if sqlerrm not like '%금액이 필요%' then raise;end if;end;
 if (select to_jsonb(d) from approval.documents d where id=doc_id)<>snap or (select version from approval.document_authorization_bindings where document_id=doc_id)<>v then raise exception 'TEST: failed resubmit retained partial update';end if;
 begin perform approval.document_command(org,actor,'UPDATE',doc_id,v,'{"changes":{},"lines":[{"supplyAmount":-1,"vatAmount":101}]}','negative-line');raise exception 'TEST: negative line saved';exception when check_violation then null;end;
 begin perform approval.document_command(org,actor,'UPDATE',doc_id,v,'{"changes":{"amount":"NaN"}}','nan-amount');raise exception 'TEST: nonfinite amount saved';exception when others then if sqlerrm not like '%기안 금액%' then raise;end if;end;
 r:=approval.document_command(org,actor,'RESUBMIT',doc_id,v,'{"changes":{"amount":200}}','positive-resubmit');
 -- Reproduce historical inconsistent order without inventing a second current signer.
 perform set_config('approval.document_command_org',org::text,true);perform set_config('approval.document_command_id',doc_id::text,true);
 update approval.approval_steps set status=case when step_order=1 then 'WAITING' else 'PENDING' end where document_id=doc_id;
 perform set_config('approval.document_command_org','',true);perform set_config('approval.document_command_id','',true);
 select version into v from approval.document_authorization_bindings where document_id=doc_id;
 begin perform approval.document_command(org,actor,'APPROVE',doc_id,v,'{}','skip-prior-approve');raise exception 'TEST: prior stage skipped';exception when others then if sqlerrm not like '%이전 결재 단계%' then raise;end if;end;
 begin perform approval.document_command(org,actor,'REJECT',doc_id,v,'{}','skip-prior-reject');raise exception 'TEST: prior stage skipped reject';exception when others then if sqlerrm not like '%이전 결재 단계%' then raise;end if;end;
 if exists(select 1 from jsonb_array_elements(finance.finance_task_sources(org,actor))x where x->>'kind'='MY_APPROVAL') then raise exception 'TEST: inconsistent prior stage exposed as task';end if;
end $$;
set local role service_role;
do $$begin
 begin perform approval.create_document('{}','[]','[]',true);raise exception 'TEST: service legacy create';exception when others then if sqlerrm not like '%document_command%' then raise;end if;end;
 begin insert into approval.documents(id,organization_id,document_no,document_type,title,drafter_label) values(gen_random_uuid(),gen_random_uuid(),'SERVICE-BYPASS','GENERAL','Bypass','Forged');raise exception 'TEST: service direct create';exception when others then if sqlerrm not like '%문서 명령%' then raise;end if;end;
end $$;
reset role;
set local role authenticated;
do $$begin
 begin perform approval.create_document('{}','[]','[]',true);raise exception 'TEST: public create';exception when insufficient_privilege then null;end;
 begin perform approval.create_meeting_agenda(gen_random_uuid(),'Forged','BOARD');raise exception 'TEST: public meeting';exception when insufficient_privilege then null;end;
 begin perform 1 from approval.document_authorization_bindings;raise exception 'TEST: public bindings';exception when insufficient_privilege then null;end;
 begin perform 1 from approval.documents;raise exception 'TEST: public documents';exception when insufficient_privilege then null;end;
 begin perform 1 from approval.approval_steps;raise exception 'TEST: public steps';exception when insufficient_privilege then null;end;
 begin perform 1 from approval.document_lines;raise exception 'TEST: public lines';exception when insufficient_privilege then null;end;
 begin perform 1 from approval.audit_logs;raise exception 'TEST: public audit';exception when insufficient_privilege then null;end;
 begin perform 1 from approval.attachments;raise exception 'TEST: public attachments';exception when insufficient_privilege then null;end;
end $$;
rollback;
