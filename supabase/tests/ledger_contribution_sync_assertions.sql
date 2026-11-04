insert into auth.users(id) values('10000000-0000-0000-0000-000000000001');
insert into core.organizations(id) values('20000000-0000-0000-0000-000000000001');
insert into finance.reimbursement_members(organization_id,user_id,permissions) values(
  '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',array['ADMIN']);

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
