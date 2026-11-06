do $$
declare
  org uuid:=gen_random_uuid();
  actor uuid:=gen_random_uuid();
  bank_account_id uuid;
  bank_id uuid;
  assessment_id uuid;
  workspace jsonb;
  report jsonb;
  sync_result jsonb;
begin
  insert into auth.users(id) values(actor);
  insert into core.organizations(id) values(org);
  insert into finance.reimbursement_members(organization_id,user_id,permissions)
    values(org,actor,array['ADMIN']);
  insert into finance.bank_accounts(organization_id,bank_name,account_name,account_no,account_type)
    values(org,'테스트은행','외부 인정 검증','000-000','운영') returning id into bank_account_id;

  perform finance.sync_ledger_contribution_assessments(
    org,actor,'dbapt-ledger',0,1,
    jsonb_build_array(jsonb_build_object(
      'source_assessment_id','assessment-1','source_version',1,
      'external_member_id','peopleon-1','ledger_member_id',1,
      'member_name_snapshot','외부인정 조합원','assessment_code','BURDEN-1',
      'due_date','2026-11-30','assessed_amount',1000,'status','ACTIVE',
      'source_updated_at','2026-11-01T00:00:00Z','payload_hash',repeat('a',64)
    ))
  );
  select id into assessment_id from finance.collection_assessments
    where organization_id=org and source_assessment_id='assessment-1';

  sync_result:=finance.sync_ledger_external_recognitions(
    org,actor,'dbapt-ledger',0,1,
    jsonb_build_array(jsonb_build_object(
      'cursor',1,'source_recognition_id','recognition-1','source_version',1,
      'source_assessment_id','assessment-1','external_member_id','peopleon-1',
      'recognized_on','2026-11-02','recognized_amount',300,'recognition_type','OFFSET',
      'reason','기존 채권 상계','status','ACTIVE','source_updated_at','2026-11-02T00:00:00Z',
      'payload_hash',repeat('b',64)
    ))
  );
  if (sync_result->>'applied_count')::integer<>1 then
    raise exception 'external recognition was not applied';
  end if;

  workspace:=finance.collection_ledger_read(org,actor);
  if (workspace#>>'{assessments,0,cash_allocated_amount}')::numeric<>0
     or (workspace#>>'{assessments,0,external_recognized_amount}')::numeric<>300
     or (workspace#>>'{assessments,0,satisfied_amount}')::numeric<>300 then
    raise exception 'collection amounts did not keep cash and recognition separate: %',workspace;
  end if;
  if jsonb_array_length(workspace->'external_recognitions')<>1 then
    raise exception 'external recognition detail is missing';
  end if;

  insert into finance.bank_transactions(
    organization_id,bank_account_id,transacted_at,description,deposit_amount,withdrawal_amount,classification_status)
  values(org,bank_account_id,'2026-11-03T09:00:00Z','실제 입금',1000,0,'UNREVIEWED') returning id into bank_id;
  begin
    insert into finance.collection_receipt_allocations(
      organization_id,assessment_id,bank_transaction_id,amount,reason,created_by)
    values(org,assessment_id,bank_id,701,'외부 인정과 합산 초과',actor);
    raise exception 'cash plus external recognition exceeded the assessment';
  exception when raise_exception then
    if sqlerrm not like '실제 수납과 외부 인정액 합계%' then raise; end if;
  end;
  insert into finance.collection_receipt_allocations(
    organization_id,assessment_id,bank_transaction_id,amount,reason,created_by)
  values(org,assessment_id,bank_id,700,'실제 입금 확인',actor);

  report:=finance.financial_report_live(org,actor);
  if (report#>>'{quarterly,receipt_total}')::numeric<>700
     or (report#>>'{quarterly,external_recognition_total}')::numeric<>300
     or (report#>>'{quarterly,satisfied_total}')::numeric<>1000
     or (report#>>'{monthly,deposit_total}')::numeric<>1000 then
    raise exception 'financial report mixed recognition with cash: %',report;
  end if;

  perform finance.sync_ledger_external_recognitions(
    org,actor,'dbapt-ledger',1,2,
    jsonb_build_array(jsonb_build_object(
      'cursor',2,'source_recognition_id','recognition-1','source_version',2,
      'status','CANCELLED','source_updated_at','2026-11-04T00:00:00Z','payload_hash',repeat('c',64)
    ))
  );
  workspace:=finance.collection_ledger_read(org,actor);
  if (workspace#>>'{assessments,0,external_recognized_amount}')::numeric<>0
     or (workspace#>>'{assessments,0,satisfied_amount}')::numeric<>700 then
    raise exception 'recognition cancellation did not restore the balance';
  end if;

  perform finance.sync_ledger_external_recognitions(
    org,actor,'dbapt-ledger',2,3,
    jsonb_build_array(jsonb_build_object(
      'cursor',3,'source_recognition_id','recognition-2','source_version',1,
      'source_assessment_id','assessment-2','external_member_id','peopleon-2',
      'recognized_on','2026-11-05','recognized_amount',200,'recognition_type','IN_KIND',
      'reason','대물 납입 인정','status','ACTIVE','source_updated_at','2026-11-05T00:00:00Z',
      'payload_hash',repeat('d',64)
    ))
  );
  if not exists(select 1 from finance.ledger_external_recognition_sync_issues
    where organization_id=org and source_recognition_id='recognition-2'
      and issue_code='UNKNOWN_ASSESSMENT' and resolved_at is null) then
    raise exception 'unknown assessment issue was not recorded';
  end if;
  if not exists(select 1 from finance.collection_external_recognitions
    where organization_id=org and source_recognition_id='recognition-2'
      and assessment_id is null and linkage_status='ASSESSMENT_MISSING') then
    raise exception 'unlinked source recognition was not preserved in the ERP registry';
  end if;

  perform finance.sync_ledger_contribution_assessments(
    org,actor,'dbapt-ledger',1,2,
    jsonb_build_array(jsonb_build_object(
      'source_assessment_id','assessment-2','source_version',1,
      'external_member_id','peopleon-2','ledger_member_id',2,
      'member_name_snapshot','재처리 조합원','assessment_code','BURDEN-2',
      'due_date','2026-12-31','assessed_amount',200,'status','ACTIVE',
      'source_updated_at','2026-11-06T00:00:00Z','payload_hash',repeat('e',64)
    ))
  );
  sync_result:=finance.sync_ledger_external_recognitions(org,actor,'dbapt-ledger',3,3,'[]'::jsonb);
  if (sync_result->>'reconciled_count')::integer<>1
     or (sync_result->>'unresolved_issue_count')::integer<>0 then
    raise exception 'pending recognition was not reconciled: %',sync_result;
  end if;

  perform finance.sync_ledger_external_recognitions(
    org,actor,'dbapt-ledger',3,4,
    jsonb_build_array(jsonb_build_object(
      'cursor',4,'source_recognition_id','recognition-1',
      'source_root_recognition_id','recognition-1',
      'source_current_recognition_id','recognition-1-correction','source_version',4,
      'event_type','UPSERT','sync_reason','CORRECTION',
      'source_assessment_id','assessment-1','external_member_id','peopleon-1',
      'recognized_on','2026-11-06','recognized_amount',250,'recognition_type','OFFSET',
      'reason','이사회 정정 인정','status','ACTIVE','source_updated_at','2026-11-06T01:00:00Z',
      'payload_hash',repeat('f',64)
    ))
  );
  if (select count(*) from finance.collection_external_recognitions
      where organization_id=org and source_recognition_id='recognition-1')<>1 then
    raise exception 'correction created a duplicate current recognition';
  end if;
  if not exists(select 1 from finance.collection_external_recognitions
    where organization_id=org and source_recognition_id='recognition-1'
      and source_current_recognition_id='recognition-1-correction'
      and recognized_amount=250 and source_version=4) then
    raise exception 'correction did not update the current recognition projection';
  end if;
  if (select count(*) from finance.ledger_external_recognition_events
      where organization_id=org and source_recognition_id='recognition-1')<>3 then
    raise exception 'recognition event history was not preserved';
  end if;
end $$;
