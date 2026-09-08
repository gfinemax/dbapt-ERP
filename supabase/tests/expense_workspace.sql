begin;
do $$
declare org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); employee uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid();
 budget uuid:=gen_random_uuid(); personal uuid:=gen_random_uuid(); other_personal uuid:=gen_random_uuid(); tx uuid; pv uuid; v uuid; r jsonb; input jsonb; original_fingerprint text;
 source_id text; req uuid; source jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Expense workspace test','active'),(other_org,'Other expenses','active');
 insert into auth.users(id) values(admin_id),(employee),(other_user);
 insert into finance.reimbursement_members values(org,admin_id,'Admin',array['ADMIN'],true),(org,employee,'Employee','{}',true),(org,other_user,'Other employee','{}',true);
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data)
 select gen_random_uuid()::text,org,'SOURCE-'||n,'Staff','승인대기','지급대기',n,'{"paymentAccountNo":"FULL-PRIVATE-ACCOUNT"}'::jsonb from generate_series(1,105)n;
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data)
 values(gen_random_uuid()::text,other_org,'PRIVATE-OTHER-ORG','Other','승인대기','지급대기',999,'{}');
 select id into source_id from finance.expense_resolutions where organization_id=org and resolution_no='SOURCE-1';
 select md5(string_agg(to_jsonb(e)::text,'' order by id)) into original_fingerprint from finance.expense_resolutions e where organization_id=org;
 r:=finance.expense_workspace(org,admin_id);
 if jsonb_array_length(r->'records')<>105 then raise exception 'TEST: truncated source list'; end if;
 if r::text like '%FULL-PRIVATE-ACCOUNT%' or r::text like '%PRIVATE-OTHER-ORG%' then raise exception 'TEST: private account or organization leak'; end if;
 input:=jsonb_build_object('source_kind','RESOLUTION','source_id',source_id);
 tx:=(finance.workflow_command(org,admin_id,'ENROLL',input,'workspace-connect')->>'id')::uuid;
 if (finance.workflow_command(org,admin_id,'ENROLL',input,'workspace-connect')->>'id')::uuid<>tx or (finance.workflow_command(org,admin_id,'ENROLL',input,'workspace-new-key')->>'id')::uuid<>tx then raise exception 'TEST: duplicated original'; end if;
 if original_fingerprint<>(select md5(string_agg(to_jsonb(e)::text,'' order by id)) from finance.expense_resolutions e where organization_id=org) then raise exception 'TEST: enrollment modified originals'; end if;
 source:=finance.accounting_source(org,'RECOGNITION',tx);
 v:=(finance.accounting_command(org,admin_id,'DRAFT_CREATE',jsonb_build_object('source_kind','RECOGNITION','source_id',tx,'source_signature',source->>'signature','voucher_date','2026-09-01','lines','[]'::jsonb),'workspace-voucher')->>'id')::uuid;
 req:=(finance.trust_command(org,admin_id,'REQUEST_SAVE',jsonb_build_object('title','Draft linked request','items',jsonb_build_array(jsonb_build_object('transaction_id',tx,'requested_amount',1))),'workspace-trust')->>'id')::uuid;
 select row_data into r from jsonb_array_elements(finance.expense_workspace(org,admin_id)->'records') row_data where row_data->>'source_id'=source_id;
 if r->>'transaction_id'<>tx::text or (r->>'can_connect')::boolean or r#>>'{vouchers,0,id}'<>v::text or r#>>'{trust_items,0,request_id}'<>req::text then raise exception 'TEST: saved workflow links not reloaded'; end if;
 if jsonb_array_length(finance.expense_workspace(org,employee)->'records')<>0 then raise exception 'TEST: employee sees staff originals'; end if;
 insert into approval.budgets(id,organization_id,fiscal_year,budget_item,approved_amount,executed_amount,monthly_amount) values(budget,org,2026,'Test',12000,0,1000);
 insert into finance.reimbursement_periods(organization_id,month,submission_deadline,completion_deadline,long_delay_days) values(org,'2026-09-01','2026-10-05','2026-10-10',60);
 insert into finance.personal_reimbursements(id,organization_id,applicant_id,budget_id,used_on,budget_month,amount,merchant,purpose,evidence_path,evidence_hash,needs_exception,needs_senior)
 values(personal,org,employee,budget,'2026-09-01','2026-09-01',100,'Own merchant','Own use','PRIVATE-PATH-1','hash-one',false,false),(other_personal,org,other_user,budget,'2026-09-01','2026-09-01',200,'Other merchant','Other use','PRIVATE-PATH-2','hash-two',false,false);
 r:=finance.expense_workspace(org,employee);
 if jsonb_array_length(r->'records')<>1 or r#>>'{records,0,source_id}'<>personal::text or r::text like '%PRIVATE-PATH%' or r::text like '%Other merchant%' then raise exception 'TEST: employee own scope'; end if;
 pv:=(finance.workflow_command(org,employee,'ENROLL',jsonb_build_object('source_kind','PERSONAL','source_id',personal),'own-connect')->>'id')::uuid;
 if finance.expense_workspace(org,employee)#>>'{records,0,transaction_id}'<>pv::text then raise exception 'TEST: employee own connection'; end if;
 begin perform finance.workflow_command(org,employee,'ENROLL',jsonb_build_object('source_kind','PERSONAL','source_id',other_personal),'other-connect'); raise exception 'TEST: employee other connection'; exception when others then if sqlerrm not like '%본인의 원본%' then raise; end if; end;
 begin perform finance.expense_workspace(other_org,employee); raise exception 'TEST: foreign org workspace'; exception when others then if sqlerrm not like '%조직 권한%' then raise; end if; end;
 update finance.reimbursement_members set active=false where organization_id=org and user_id=employee;
 begin perform finance.expense_workspace(org,employee); raise exception 'TEST: inactive workspace'; exception when others then if sqlerrm not like '%조직 권한%' then raise; end if; end;
end $$;
set local role authenticated;
do $$ begin
 begin perform finance.expense_workspace(gen_random_uuid(),gen_random_uuid()); raise exception 'TEST: direct RPC accessible'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
