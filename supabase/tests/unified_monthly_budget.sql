-- Execute in BEGIN/ROLLBACK: fixtures never persist or alter operational documents.
do $$
declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 doc uuid:=gen_random_uuid(); reservation uuid:=gen_random_uuid(); quick uuid:=gen_random_uuid(); resolution text:='budget-test-'||gen_random_uuid()::text; pending_resolution text:='budget-pending-'||gen_random_uuid()::text;
 yr int:=extract(year from now() at time zone 'Asia/Seoul'); march date; april date; payload jsonb; data jsonb; sig text; report_count int; total numeric;
begin
 march:=make_date(yr,3,1);april:=make_date(yr,4,1);
 insert into core.organizations(id,name,status) values(org,'Unified budget rollback test','active');
 insert into auth.users(id) values(actor),(outsider);
 insert into finance.reimbursement_members values(org,actor,'Budget admin',array['ADMIN'],true),(org,outsider,'Reader','{}',true);
 insert into approval.budgets(id,organization_id,fiscal_year,budget_item,approved_amount,monthly_amount,executed_amount) values(b,org,yr,'Office',1200000,100000,90000);
 perform finance.reimbursement_command(org,actor,'POLICY','{"submission_day":5,"completion_day":10,"long_delay_days":60}');
 perform finance.reimbursement_command(org,actor,'OPEN',jsonb_build_object('month',march));
 perform finance.reimbursement_command(org,actor,'OPEN',jsonb_build_object('month',april));
 insert into approval.documents(id,organization_id,document_no,document_type,title,drafter_label,approval_status,amount,budget_item,budget_year)
 values(doc,org,'TEST-'||doc,'EXPENSE','Office supplies','Budget admin','APPROVED',80000,'Office',yr);
 insert into approval.budget_reservations(id,document_id,budget_id,amount) values(reservation,doc,b,80000);
 select signature into sig from finance.budget_sources(org) where source_id=reservation::text;
 payload:=jsonb_build_object('source_kind','RESERVATION','source_id',reservation,'signature',sig,'revision',0,'state','RESERVED','reason','Verified planned month','lines',jsonb_build_array(jsonb_build_object('budget_id',b,'month',march,'amount',80000)));
 begin perform finance.budget_assign_source(org,outsider,payload);raise exception 'TEST: reader could allocate';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 begin perform finance.budget_assign_source(org,actor,payload||'{"lines":[{"amount":80000}]}'::jsonb);raise exception 'TEST: null month accepted';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform finance.budget_assign_source(org,actor,payload);
 if (finance.reimbursement_budget_rows(org,march)->0->>'reserved_amount')::numeric<>80000 then raise exception 'TEST: reservation missing';end if;
 begin perform finance.budget_assign_source(org,actor,payload);raise exception 'TEST: stale revision accepted';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data,approval_document_id,subject)
 values(resolution,org,'TEST-'||resolution,'Budget admin','승인완료','지급전',80000,'{"budgetItem":"Office"}',doc,'Office purchase');
 if (finance.reimbursement_budget_rows(org,march)->0->>'unresolved_count')::int<>2 then raise exception 'TEST: legacy missing allocation not flagged';end if;
 begin perform finance.reimbursement_command(org,actor,'CLOSE',jsonb_build_object('month',march,'reason','Too early'));raise exception 'TEST: unresolved close accepted';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 select signature into sig from finance.budget_sources(org) where source_id=resolution;
 payload:=jsonb_build_object('source_kind','RESOLUTION','source_id',resolution,'signature',sig,'revision',0,'state','USED','evidence_verified',true,'reason','Receipts checked','lines',jsonb_build_array(jsonb_build_object('budget_id',b,'month',march,'used_on',march+14,'amount',60000),jsonb_build_object('budget_id',b,'month',april,'used_on',april+14,'amount',20000)));
 begin perform finance.budget_assign_source(org,actor,payload||'{"evidence_verified":false}'::jsonb);raise exception 'TEST: unverified use accepted';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform finance.budget_assign_source(org,actor,payload);
 data:=finance.reimbursement_budget_rows(org,march)->0;
 if (data->>'resolution_amount')::numeric<>60000 or (data->>'reserved_amount')::numeric<>0 or (data->>'annual_used_amount')::numeric<>80000 then raise exception 'TEST: resolution reservation counted twice';end if;
 if (finance.reimbursement_budget_rows(org,april)->0->>'resolution_amount')::numeric<>20000 then raise exception 'TEST: split month missing';end if;
 -- A linked quick record never counts again and never stays in the unresolved queue.
 insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,approval_skip_reason,direct_expense_decision,record_status,recorded_by_label,linked_resolution_id)
 values(quick,org,'MANUAL','CASH',(march+14)::timestamptz,80000,'Office','Office purchase','Office','Approved resolution','REQUIRED','NEEDS_RESOLUTION','Budget admin',resolution);
 if exists(select 1 from finance.budget_effective_entries(org) where source_kind='QUICK') then raise exception 'TEST: linked quick counted twice';end if;
 if exists(select 1 from jsonb_array_elements(finance.budget_review_queue(org))x where (x->>'needs_review')::boolean and x->>'source_kind'<>'MANUAL') then raise exception 'TEST: linked chain unresolved';end if;
 -- Manual total includes an already recorded resolution: only the unexplained difference is new use.
 select signature into sig from finance.budget_sources(org) where source_kind='MANUAL';
 perform finance.budget_assign_source(org,actor,jsonb_build_object('source_kind','MANUAL','source_id',b,'signature',sig,'revision',0,'state','USED','evidence_verified',true,'covered_amount',80000,'reason','80,000 covered by resolution ID '||resolution,'lines',jsonb_build_array(jsonb_build_object('budget_id',b,'month',march,'amount',10000))));
 data:=finance.reimbursement_budget_rows(org,march)->0;
 if (data->>'manual_amount')::numeric<>10000 or (data->>'annual_used_amount')::numeric<>90000 then raise exception 'TEST: raw manual counted twice';end if;
 perform finance.reimbursement_command(org,actor,'CLOSE',jsonb_build_object('month',march,'reason','Original report'));
 -- Editing an allocation preserves the original report and does not backdate payment.
 select signature into sig from finance.budget_sources(org) where source_id=resolution;
 payload:=payload||jsonb_build_object('signature',sig,'revision',1,'reason','Correct item timing','lines',jsonb_build_array(jsonb_build_object('budget_id',b,'month',march,'used_on',march+14,'amount',50000),jsonb_build_object('budget_id',b,'month',april,'used_on',april+14,'amount',30000)));
 update finance.reimbursement_members set permissions=array['APPROVE'] where organization_id=org and user_id=outsider;
 begin perform finance.budget_assign_source(org,outsider,payload);raise exception 'TEST: missing close permission accepted';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform finance.budget_assign_source(org,actor,payload);
 select (snapshot->'budgets'->0->>'resolution_amount')::numeric into total from finance.reimbursement_reports where organization_id=org and month=march and revision=1;
 if total<>60000 then raise exception 'TEST: original report overwritten';end if;
 select (snapshot->'budgets'->0->>'resolution_amount')::numeric into total from finance.reimbursement_reports where organization_id=org and month=march and revision=2;
 if total<>50000 then raise exception 'TEST: amendment missing';end if;
 update finance.expense_resolutions set disbursed_at=make_date(yr,6,15)::timestamptz,payment_status='지급완료' where id=resolution;
 if (finance.reimbursement_budget_rows(org,march)->0->>'resolution_amount')::numeric<>50000 then raise exception 'TEST: cash payment deducted again';end if;
 select count(*) into report_count from finance.reimbursement_reports where organization_id=org and month=march;
 if report_count<>2 then raise exception 'TEST: payment revised budget history';end if;
 begin update finance.expense_resolutions set total_payment_amount=1 where id=resolution;raise exception 'TEST: closed source amount mutable';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 begin update approval.budgets set monthly_amount=1 where id=b;raise exception 'TEST: closed budget definition mutable';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 begin perform finance.budget_assign_source(org,actor,payload||'{"revision":2,"state":"CANCELLED"}'::jsonb);raise exception 'TEST: paid use cancelled';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 -- Direct expense checks include formal usage and cannot exceed common availability.
 begin
 insert into finance.quick_expense_records(organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,approval_skip_reason,direct_expense_decision,record_status,recorded_by_label)
 values(org,'MANUAL','CASH',(april+15)::timestamptz,80000,'Other','Exceeds common balance','Office','Daily','ALLOWED','RECORDED','Budget admin');
 raise exception 'TEST: direct expense ignored formal use';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 if not exists(select 1 from finance.reimbursement_audit where organization_id=org and action='BUDGET_ASSIGNMENT' and actor_id=actor) then raise exception 'TEST: actor audit missing';end if;
 -- Pending records must be processed before first close; cancellation releases only their own allocation.
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data,subject)
 values(pending_resolution,org,'TEST-'||pending_resolution,'Budget admin','승인대기','지급전',10000,'{"budgetItem":"Office"}','Pending purchase');
 select signature into sig from finance.budget_sources(org) where source_id=pending_resolution;
 payload:=jsonb_build_object('source_kind','RESOLUTION','source_id',pending_resolution,'signature',sig,'revision',0,'state','PENDING','reason','Planned April','lines',jsonb_build_array(jsonb_build_object('budget_id',b,'month',april,'amount',10000)));
 perform finance.budget_assign_source(org,actor,payload);
 begin perform finance.reimbursement_command(org,actor,'CLOSE',jsonb_build_object('month',april,'reason','Pending close'));raise exception 'TEST: pending close accepted';exception when others then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform finance.budget_assign_source(org,actor,payload||'{"revision":1,"state":"CANCELLED","reason":"Withdraw pending request"}'::jsonb);
 if (finance.reimbursement_budget_rows(org,april)->0->>'resolution_amount')::numeric<>30000 or (finance.reimbursement_budget_rows(org,april)->0->>'pending_amount')::numeric<>0 then raise exception 'TEST: cancellation affected other source';end if;
 perform finance.reimbursement_command(org,actor,'CLOSE',jsonb_build_object('month',april,'reason','Pending resolved'));
end $$;
