-- Run inside BEGIN/ROLLBACK. Every fixture is isolated; no operational rows are changed.
do $$
declare
 org uuid:=gen_random_uuid(); applicant uuid:=gen_random_uuid(); approver uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 budget uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); bank uuid:=gen_random_uuid(); acct uuid:=gen_random_uuid(); source_id uuid:=gen_random_uuid(); second_req uuid:=gen_random_uuid();
 yr text:=extract(year from now() at time zone 'Asia/Seoul')::text;
 month date; used date; path text; payload jsonb; result jsonb; n integer; total numeric;
begin
 month:=(yr||'-03-01')::date; used:=(yr||'-03-15')::date;
 insert into core.organizations(id,name,status) values(org,'Reimbursement rollback verification','active');
 insert into auth.users(id) values(applicant),(approver),(outsider);
 insert into finance.reimbursement_members values(org,applicant,'Applicant','{}',true),(org,approver,'Approver',array['ADMIN'],true);
 insert into approval.budgets(id,organization_id,fiscal_year,budget_item,approved_amount,executed_amount,monthly_amount)
 values(budget,org,yr::int,'Test budget',1200000,0,100000);
 insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,approval_skip_reason,direct_expense_decision,record_status,recorded_by_label)
 values(source_id,org,'MANUAL','PERSONAL_PREPAID',(yr||'-03-20T12:00:00+09:00')::timestamptz,20000,'Source merchant','Supplies','Test budget','Daily expense','ALLOWED','RECORDED','Approver');
 perform finance.reimbursement_command(org,approver,'POLICY','{"submission_day":5,"completion_day":10,"long_delay_days":60}');
 perform finance.reimbursement_command(org,approver,'OPEN',jsonb_build_object('month',month));
 perform finance.reimbursement_command(org,approver,'CLOSE',jsonb_build_object('month',month,'reason','Initial close'));
 path:=org||'/'||applicant||'/'||req||'/receipt';
 insert into storage.objects(bucket_id,name) values('personal-reimbursements',path);
 payload:=jsonb_build_object('id',req,'used_on',used,'budget_id',budget,'amount',80000,'merchant','Test merchant','purpose','Office supplies','evidence_path',path,'evidence_hash',repeat('a',64),'delay_reason','Late receipt');
 perform finance.reimbursement_command(org,applicant,'SUBMIT',payload);
 -- Repeating the same operation cannot create another claim.
 perform finance.reimbursement_command(org,applicant,'SUBMIT',payload);
 select count(*) into n from finance.personal_reimbursements where organization_id=org;
 if n<>1 then raise exception 'TEST: duplicate submit'; end if;
 begin perform finance.reimbursement_command(org,outsider,'APPROVE',jsonb_build_object('id',req,'reason','unauthorized')); raise exception 'TEST: unauthorized accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 begin perform finance.reimbursement_command(org,applicant,'APPROVE',jsonb_build_object('id',req,'reason','self')); raise exception 'TEST: self approval accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 begin perform finance.reimbursement_command(org,approver,'APPROVE',jsonb_build_object('id',req,'reason','premature')); raise exception 'TEST: missing exception accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 perform finance.reimbursement_command(org,approver,'EXCEPTION',jsonb_build_object('id',req,'reason','Verified reason'));
 begin perform finance.reimbursement_command(org,approver,'APPROVE',jsonb_build_object('id',req,'reason','premature')); raise exception 'TEST: missing senior accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 perform finance.reimbursement_command(org,approver,'SENIOR',jsonb_build_object('id',req,'reason','Verified long delay'));
 perform finance.reimbursement_command(org,approver,'APPROVE',jsonb_build_object('id',req,'reason','March amendment'));
 select (snapshot->'budgets'->0->>'personal_amount')::numeric into total from finance.reimbursement_reports where organization_id=org and revision=1;
 if total<>0 then raise exception 'TEST: original report overwritten'; end if;
 select (snapshot->'budgets'->0->>'personal_amount')::numeric into total from finance.reimbursement_reports where organization_id=org and revision=2;
 if total<>80000 then raise exception 'TEST: amended amount mismatch'; end if;
 insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status) values(acct,org,'Test bank','Test account','TEST-ROLLBACK','운영계좌','사용');
 insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,description,withdrawal_amount,deposit_amount,balance_amount)
 values(bank,org,acct,(yr||'-06-15T12:00:00+09:00')::timestamptz,'Test reimbursement',80000,0,0);
 perform finance.reimbursement_command(org,approver,'PAY',jsonb_build_object('id',req,'bank_transaction_id',bank,'reason','Verified transfer recipient'));
 select to_jsonb(r) into result from finance.personal_reimbursements r where id=req;
 if result->>'status'<>'PAID' or (result->>'paid_at')::timestamptz<>(yr||'-06-15T12:00:00+09:00')::timestamptz then raise exception 'TEST: actual payment date lost'; end if;
 select (finance.reimbursement_budget_rows(org,month)->0->>'personal_amount')::numeric into total;
 if total<>80000 then raise exception 'TEST: paid counted twice'; end if;
 select count(*) into n from finance.reimbursement_reports where organization_id=org;
 if n<>2 then raise exception 'TEST: payment modified budget report'; end if;
 begin update finance.bank_transactions set withdrawal_amount=1 where id=bank; raise exception 'TEST: linked bank mutable';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 begin perform finance.reimbursement_command(org,approver,'CANCEL',jsonb_build_object('id',req,'reason','cancel paid')); raise exception 'TEST: paid cancel accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 perform finance.reimbursement_command(org,approver,'REVERSE_PAYMENT',jsonb_build_object('id',req,'reason','Mistaken link'));
 perform finance.reimbursement_command(org,approver,'CANCEL',jsonb_build_object('id',req,'reason','Cancellation correction'));
 select (snapshot->'budgets'->0->>'personal_amount')::numeric into total from finance.reimbursement_reports where organization_id=org and revision=3;
 if total<>0 then raise exception 'TEST: cancellation did not restore budget'; end if;
 begin update finance.reimbursement_reports set reason='overwrite' where organization_id=org; raise exception 'TEST: report mutable';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 begin delete from finance.reimbursement_audit where organization_id=org; raise exception 'TEST: audit mutable';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 -- Existing personal advance is counted once after conversion, not added to itself.
 path:=org||'/'||approver||'/'||second_req||'/receipt';
 insert into storage.objects(bucket_id,name) values('personal-reimbursements',path);
 perform finance.reimbursement_command(org,approver,'SUBMIT',jsonb_build_object('id',second_req,'used_on',yr||'-03-20','budget_id',budget,'amount',20000,'merchant','Source merchant','purpose','Supplies','source_quick_id',source_id,'evidence_path',path,'evidence_hash',repeat('b',64),'delay_reason','Late source'));
 update finance.reimbursement_members set permissions=array['ADMIN'] where user_id=applicant and organization_id=org;
 perform finance.reimbursement_command(org,applicant,'EXCEPTION',jsonb_build_object('id',second_req,'reason','Verified'));
 perform finance.reimbursement_command(org,applicant,'SENIOR',jsonb_build_object('id',second_req,'reason','Verified'));
 perform finance.reimbursement_command(org,applicant,'APPROVE',jsonb_build_object('id',second_req,'reason','Convert source'));
 result:=finance.reimbursement_budget_rows(org,month)->0;
 if (result->>'quick_amount')::numeric<>0 or (result->>'personal_amount')::numeric<>20000 then raise exception 'TEST: source counted twice'; end if;
 -- An over-budget exception is independent of late submission approval.
 req:=gen_random_uuid(); path:=org||'/'||applicant||'/'||req||'/receipt';
 insert into storage.objects(bucket_id,name) values('personal-reimbursements',path);
 perform finance.reimbursement_command(org,applicant,'SUBMIT',jsonb_build_object('id',req,'used_on',used,'budget_id',budget,'amount',150000,'merchant','Over budget merchant','purpose','Supplies','evidence_path',path,'evidence_hash',repeat('c',64),'delay_reason','Late'));
 perform finance.reimbursement_command(org,approver,'EXCEPTION',jsonb_build_object('id',req,'reason','Verified'));
 perform finance.reimbursement_command(org,approver,'SENIOR',jsonb_build_object('id',req,'reason','Verified'));
 begin perform finance.reimbursement_command(org,approver,'APPROVE',jsonb_build_object('id',req,'reason','Over budget')); raise exception 'TEST: over budget accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 perform finance.reimbursement_command(org,approver,'OVER_BUDGET',jsonb_build_object('id',req,'reason','Separate budget authorization'));
 perform finance.reimbursement_command(org,approver,'APPROVE',jsonb_build_object('id',req,'reason','Approved exception'));
 if (finance.reimbursement_budget_rows(org,month)->0->>'personal_amount')::numeric<>170000 then raise exception 'TEST: authorized over-budget mismatch'; end if;
end $$;
