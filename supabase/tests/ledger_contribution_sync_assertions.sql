insert into auth.users(id) values('10000000-0000-0000-0000-000000000001');
insert into core.organizations(id) values('20000000-0000-0000-0000-000000000001');
insert into finance.reimbursement_members(organization_id,user_id,permissions) values(
  '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',array['ADMIN']);
insert into finance.account_subjects(id,name) values('40000000-0000-0000-0000-000000000001','조합원 분담금');
insert into finance.bank_transactions(organization_id,transacted_at,description,counterparty,deposit_amount,withdrawal_amount,
  confirmed_account_subject_id,classification_status) values
('20000000-0000-0000-0000-000000000001','2026-10-01T09:00:00Z','분담금 입금','홍길동',100000,0,'40000000-0000-0000-0000-000000000001','CONFIRMED'),
('20000000-0000-0000-0000-000000000001','2026-10-02T09:00:00Z','임대료','IFC',0,20000,null,'UNREVIEWED');

select finance.sync_ledger_contribution_assessments(
  '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  'dbapt-ledger',0,1,
  '[{"source_assessment_id":"10","source_version":1,"external_member_id":"peopleon-7","ledger_member_id":7,"member_name_snapshot":"홍길동","assessment_code":"BURDEN-1-1","due_date":"2026-12-31","assessed_amount":100000,"status":"ACTIVE","source_updated_at":"2026-11-04T00:00:00Z","payload_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb
);
do $$ begin
  if not exists(select 1 from finance.collection_assessments where source_system='dbapt-ledger' and source_assessment_id='10' and external_member_id='peopleon-7') then
    raise exception 'active assessment was not synced';
  end if;
  begin
    update finance.collection_assessments set assessed_amount=1 where source_assessment_id='10';
    raise exception 'source guard did not reject manual update';
  exception when raise_exception then
    if sqlerrm not like 'ledger에서%' then raise; end if;
  end;
end $$;
do $$ declare live jsonb; generated jsonb; begin
  live:=finance.financial_report_live('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
  if (live#>>'{monthly,deposit_total}')::numeric<>100000 or (live#>>'{monthly,withdrawal_total}')::numeric<>20000 then
    raise exception 'live financial report totals mismatch';
  end if;
  if (live#>>'{monthly,unclassified_count}')::integer<>1 then raise exception 'unclassified count mismatch'; end if;
  generated:=finance.generate_financial_reports('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','test generation',array['MONTHLY_CASH','QUARTERLY_PERFORMANCE']);
  if jsonb_array_length(generated->'reports')<>2 or (select count(*) from finance.financial_report_runs)<>2 then
    raise exception 'financial report snapshots mismatch';
  end if;
  perform finance.generate_financial_reports('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','same source rerun',array['MONTHLY_CASH','QUARTERLY_PERFORMANCE']);
  if (select count(*) from finance.financial_report_runs)<>2 then raise exception 'unchanged source created duplicate report versions'; end if;
end $$;

insert into finance.collection_receipt_allocations(
  organization_id,assessment_id,bank_transaction_id,amount,reason,created_by)
select organization_id,id,'30000000-0000-0000-0000-000000000001',50000,'입금 확인',
  '10000000-0000-0000-0000-000000000001' from finance.collection_assessments where source_assessment_id='10';
insert into finance.collection_receipt_reversals(organization_id,allocation_id,reason,created_by)
select organization_id,id,'입금자 오인식','10000000-0000-0000-0000-000000000001'
from finance.collection_receipt_allocations limit 1;
do $$ declare batch jsonb; begin
  batch:=finance.ledger_allocation_feedback_batch(
    '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',200);
  if jsonb_array_length(batch)<>2 then raise exception 'allocation feedback outbox mismatch'; end if;
  if finance.ledger_allocation_feedback_ack(
    '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',array[1,2])<>2 then
    raise exception 'allocation feedback ack mismatch';
  end if;
end $$;

select finance.sync_ledger_contribution_assessments(
  '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  'dbapt-ledger',1,2,
  '[{"source_assessment_id":"10","source_version":2,"status":"CANCELLED","source_updated_at":"2026-11-04T01:00:00Z","payload_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]'::jsonb
);
select finance.sync_ledger_contribution_assessments(
  '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  'dbapt-ledger',2,3,
  '[{"source_assessment_id":"11","source_version":3,"external_member_id":null,"member_name_snapshot":"미연결","assessment_code":"BURDEN-1-2","assessed_amount":100000,"status":"ACTIVE","source_updated_at":"2026-11-04T02:00:00Z","payload_hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}]'::jsonb
);
do $$ begin
  if (select status from finance.collection_assessments where source_assessment_id='10')<>'CANCELLED' then raise exception 'cancel was not synced'; end if;
  if not exists(select 1 from finance.ledger_contribution_sync_issues where source_assessment_id='11' and issue_code='MISSING_EXTERNAL_MEMBER_ID') then raise exception 'missing member issue was not recorded'; end if;
  if (select last_cursor from finance.ledger_contribution_sync_state where source_system='dbapt-ledger')<>3 then raise exception 'cursor was not advanced'; end if;
end $$;
