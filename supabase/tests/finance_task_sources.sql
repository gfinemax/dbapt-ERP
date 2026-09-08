begin;
do $$
declare org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); staff_id uuid:=gen_random_uuid();
 doc uuid:=gen_random_uuid(); other_doc uuid:=gen_random_uuid(); label_doc uuid:=gen_random_uuid(); waiting_doc uuid:=gen_random_uuid(); bank uuid:=gen_random_uuid();
 origin text:=gen_random_uuid()::text; overdue text:=gen_random_uuid()::text; result jsonb; bank_id uuid; payment uuid:=gen_random_uuid(); trust_source text:=gen_random_uuid()::text; tx uuid; contract uuid:=gen_random_uuid();
begin
 insert into core.organizations(id,name,status) values(org,'Tasks local','active'),(other_org,'Tasks other','active');
 insert into auth.users(id) values(actor),(staff_id);
 insert into core.user_profiles(id,organization_id,display_name) values(actor,org,'Same label'),(staff_id,org,'Staff');
 insert into finance.reimbursement_members values(org,actor,'Same label','{}',true),(org,staff_id,'Staff',array['ADMIN'],true);
 insert into approval.documents(id,organization_id,document_no,document_type,title,drafter_label,approval_status) values(doc,org,'TASK-A','GENERAL','Assigned UUID','Staff','SUBMITTED'),(other_doc,other_org,'TASK-B','GENERAL','Other org','Staff','SUBMITTED'),(label_doc,org,'TASK-C','GENERAL','Label only','Staff','SUBMITTED'),(waiting_doc,org,'TASK-D','GENERAL','Later order','Staff','SUBMITTED');
 insert into approval.approval_steps(document_id,step_order,approver_id,approver_label,status) values(doc,1,actor,'Same label','PENDING'),(other_doc,1,actor,'Same label','PENDING'),(label_doc,1,null,'Same label','PENDING'),(waiting_doc,1,staff_id,'Staff','WAITING'),(waiting_doc,2,actor,'Same label','PENDING');
 result:=finance.finance_task_sources(org,actor);
 if jsonb_array_length(result)<>1 or result#>>'{0,title}'<>'TASK-A · Assigned UUID' then raise exception 'TEST: UUID/current-order/org approval scope'; end if;
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,expense_timing,execution_method,total_payment_amount,actual_paid_amount,settlement_due_date,settlement_status,evidence_status,resolution_data)
 values(origin,org,'TASK-RES','Same label','승인완료','지급완료','ADVANCE','VENDOR_DIRECT',100,100,current_date-10,'정산없음','NONE','{}'),
 (overdue,org,'TASK-ADV','Staff','승인완료','지급완료','ADVANCE','EMPLOYEE_ADVANCE',100,100,current_date-10,'정산대기','QUALIFIED','{}');
 insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type) values(bank,org,'Local','Tasks','TASKS-LOCAL','운영계좌');
 insert into finance.bank_transactions(organization_id,bank_account_id,transacted_at,description,withdrawal_amount) select org,bank,now()-interval '1 day','Sensitive account should not be returned',100 from generate_series(1,205);
 select id into bank_id from finance.bank_transactions where bank_account_id=bank limit 1;
 insert into finance.workflow_payments(id,organization_id,bank_transaction_id,method,flow,amount,paid_at,counterparty,reason,created_by) values(payment,org,bank_id,'BANK','OUT',100,now(),'Private name','Test',staff_id);
 result:=finance.finance_task_sources(org,staff_id);
 if (select count(*) from jsonb_array_elements(result) x where x->>'kind'='BANK_UNMATCHED')<>204 then raise exception 'TEST: bank full-range/payment exclusion'; end if;
 if (select count(*) from jsonb_array_elements(result) x where x->>'kind'='SETTLEMENT_OVERDUE')<>1 then raise exception 'TEST: employee advance only'; end if;
 if (select count(*) from jsonb_array_elements(result) x where x->>'kind'='EVIDENCE_REVIEW')<>1 then raise exception 'TEST: missing evidence'; end if;
 if result::text like '%Sensitive account%' or result::text like '%Private name%' or result::text like '%TASKS-LOCAL%' then raise exception 'TEST: minimal masked DTO'; end if;
 if jsonb_array_length(finance.finance_task_sources(org,actor))<>1 then raise exception 'TEST: ordinary user sees organization finance'; end if;
 update finance.expense_resolutions set settlement_status='정산완료' where id=overdue;
 result:=finance.finance_task_sources(org,staff_id);
 if exists(select 1 from jsonb_array_elements(result) x where x->>'kind'='SETTLEMENT_OVERDUE') then raise exception 'TEST: completed still overdue'; end if;
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data)
 values(trust_source,org,'TRUST-PREP','Staff','승인완료','지급대기',1000,'{}');
 tx:=(finance.workflow_command(org,staff_id,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',trust_source),'task-trust-enroll')->>'id')::uuid;
 insert into finance.workflow_contract_versions(id,organization_id,contract_key,version,name,trustee,reference,management_account_id,status,created_by) values(contract,org,gen_random_uuid(),1,'Test','Trust','Test',bank,'VERIFIED',staff_id);
 update finance.workflow_transactions set route='TRUST_DIRECT',contract_version_id=contract where id=tx;
 result:=finance.finance_task_sources(org,staff_id);
 if not exists(select 1 from jsonb_array_elements(result) x where x->>'kind'='TRUST_READY' and x->>'detail' like '%1,000원%서류/제출조건%') then raise exception 'TEST: trust preparation missing'; end if;
 update finance.workflow_transactions set payment_review_required=true where id=tx;
 if exists(select 1 from jsonb_array_elements(finance.finance_task_sources(org,staff_id)) x where x->>'kind'='TRUST_READY') then raise exception 'TEST: legacy unverified trust ready'; end if;
 update finance.workflow_transactions set payment_review_required=false,source_signature='stale' where id=tx;
 if exists(select 1 from jsonb_array_elements(finance.finance_task_sources(org,staff_id)) x where x->>'kind'='TRUST_READY') then raise exception 'TEST: stale trust ready'; end if;
 begin perform finance.finance_task_sources(other_org,actor); raise exception 'TEST: forged org'; exception when others then if sqlerrm not like '%조직 권한%' then raise; end if; end;
 update finance.reimbursement_members set active=false where organization_id=org and user_id=actor;
 begin perform finance.finance_task_sources(org,actor); raise exception 'TEST: inactive'; exception when others then if sqlerrm not like '%조직 권한%' then raise; end if; end;
 if has_function_privilege('authenticated','finance.finance_task_sources(uuid,uuid)','EXECUTE') then raise exception 'TEST: authenticated callable'; end if;
end;
$$;
rollback;
