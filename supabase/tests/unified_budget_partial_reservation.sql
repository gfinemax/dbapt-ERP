-- Execute inside BEGIN/ROLLBACK. A later-month use must also revise an affected closed reservation month.
do $$
declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); approver uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); doc uuid:=gen_random_uuid(); reservation uuid:=gen_random_uuid(); resolution text:=gen_random_uuid()::text;
 yr int:=extract(year from now() at time zone 'Asia/Seoul'); march date; april date; reserve_payload jsonb; use_payload jsonb; sig text; amount numeric;
begin
 march:=make_date(yr,3,1);april:=make_date(yr,4,1);
 insert into core.organizations(id,name,status) values(org,'Partial reservation rollback test','active');
 insert into auth.users(id) values(actor),(approver);
 insert into finance.reimbursement_members values(org,actor,'Admin',array['ADMIN'],true),(org,approver,'Approver',array['APPROVE'],true);
 insert into approval.budgets(id,organization_id,fiscal_year,budget_item,approved_amount,monthly_amount,executed_amount) values(b,org,yr,'Office',1200000,100000,0);
 perform finance.reimbursement_command(org,actor,'POLICY','{"submission_day":5,"completion_day":10,"long_delay_days":60}');
 perform finance.reimbursement_command(org,actor,'OPEN',jsonb_build_object('month',march));
 perform finance.reimbursement_command(org,actor,'OPEN',jsonb_build_object('month',april));
 insert into approval.documents(id,organization_id,document_no,document_type,title,drafter_label,approval_status,amount) values(doc,org,'PARTIAL-'||doc,'EXPENSE','Partial use','Admin','APPROVED',80000);
 insert into approval.budget_reservations(id,document_id,budget_id,amount) values(reservation,doc,b,80000);
 select signature into sig from finance.budget_sources(org) where source_id=reservation::text;
 reserve_payload:=jsonb_build_object('source_kind','RESERVATION','source_id',reservation,'signature',sig,'revision',0,'state','RESERVED','reason','March planned budget','lines',jsonb_build_array(jsonb_build_object('budget_id',b,'month',march,'amount',80000)));
 perform finance.budget_assign_source(org,actor,reserve_payload);
 perform finance.reimbursement_command(org,actor,'CLOSE',jsonb_build_object('month',march,'reason','Original reservation report'));
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data,approval_document_id)
 values(resolution,org,'PARTIAL-'||resolution,'Admin','승인완료','지급전',30000,'{"budgetItem":"Office"}',doc);
 select signature into sig from finance.budget_sources(org) where source_id=resolution;
 use_payload:=jsonb_build_object('source_kind','RESOLUTION','source_id',resolution,'signature',sig,'revision',0,'state','USED','evidence_verified',true,'reason','Actual April use, partial amount','lines',jsonb_build_array(jsonb_build_object('budget_id',b,'month',april,'used_on',april+14,'amount',30000)));
 begin perform finance.budget_assign_source(org,approver,use_payload);raise exception 'TEST: indirect closed-month change accepted without permission';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform finance.budget_assign_source(org,actor,use_payload);
 if (finance.reimbursement_budget_rows(org,march)->0->>'reserved_amount')::numeric<>50000 then raise exception 'TEST: entire reservation released for partial use';end if;
 if (finance.reimbursement_budget_rows(org,april)->0->>'resolution_amount')::numeric<>30000 then raise exception 'TEST: April use missing';end if;
 select (snapshot->'budgets'->0->>'reserved_amount')::numeric into amount from finance.reimbursement_reports where organization_id=org and month=march and revision=1;
 if amount<>80000 then raise exception 'TEST: original reservation report changed';end if;
 select (snapshot->'budgets'->0->>'reserved_amount')::numeric into amount from finance.reimbursement_reports where organization_id=org and month=march and revision=2;
 if amount is distinct from 50000 then raise exception 'TEST: indirect closed month not snapshotted';end if;
 begin update finance.expense_resolutions set payment_status='지급완료',disbursed_at=make_date(yr,6,15)::timestamptz where id=resolution;raise exception 'TEST: cash settlement silently released closed reservation';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform finance.budget_assign_source(org,actor,reserve_payload||'{"revision":1,"state":"CANCELLED","reason":"Remaining purchase cancelled; release residual reservation"}'::jsonb);
 update finance.expense_resolutions set payment_status='지급완료',disbursed_at=make_date(yr,6,15)::timestamptz where id=resolution;
 if (finance.reimbursement_budget_rows(org,april)->0->>'resolution_amount')::numeric<>30000 or (finance.reimbursement_budget_rows(org,march)->0->>'reserved_amount')::numeric<>0 then raise exception 'TEST: partial cash settlement totals';end if;
end $$;
