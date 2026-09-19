begin;
do $$
declare
 org uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); payer_id uuid:=gen_random_uuid(); batch jsonb; applied jsonb; duplicate_preview jsonb; update_preview jsonb; stale_preview jsonb; assessment_id uuid;
 rows jsonb:=jsonb_build_array(jsonb_build_object('row_number',2,'external_member_id','peopleon-1','member_no','M-1','member_name_snapshot','Member One','assessment_code','2026-09','due_date','2026-09-30','assessed_amount',1000));
begin
 insert into core.organizations(id,name,status) values(org,'CSV import test','active');
 insert into auth.users(id) values(admin_id),(payer_id);
 insert into finance.reimbursement_members values(org,admin_id,'Admin',array['ADMIN'],true),(org,payer_id,'Payer',array['PAY'],true);
 begin perform finance.collection_assessment_import_preview(org,payer_id,'denied.csv',repeat('a',64),rows); raise exception 'TEST: payer preview accepted'; exception when others then if sqlerrm not like '%등록 권한%' then raise; end if; end;

 batch:=finance.collection_assessment_import_preview(org,admin_id,'assessments.csv',repeat('a',64),rows);
 if batch->>'create_count'<>'1' or batch->>'error_count'<>'0' then raise exception 'TEST: create preview wrong %',batch; end if;
 applied:=finance.collection_assessment_import_apply(org,admin_id,(batch->>'batch_id')::uuid,'csv-apply-1');
 if applied->>'status'<>'APPLIED' or (select count(*) from finance.collection_assessments where organization_id=org)<>1 then raise exception 'TEST: import not applied %',applied; end if;
 if finance.collection_assessment_import_apply(org,admin_id,(batch->>'batch_id')::uuid,'csv-apply-1')<>applied then raise exception 'TEST: apply retry changed'; end if;
 assessment_id:=(select id from finance.collection_assessments where organization_id=org);

 duplicate_preview:=finance.collection_assessment_import_preview(org,admin_id,'duplicate.csv',repeat('b',64),rows||rows);
 if duplicate_preview->>'error_count'<>'2' then raise exception 'TEST: duplicate rows not blocked %',duplicate_preview; end if;
 begin perform finance.collection_assessment_import_apply(org,admin_id,(duplicate_preview->>'batch_id')::uuid,'csv-duplicate'); raise exception 'TEST: error preview applied'; exception when others then if sqlerrm not like '%오류 행%' then raise; end if; end;

 update_preview:=finance.collection_assessment_import_preview(org,admin_id,'update.csv',repeat('c',64),jsonb_build_array(jsonb_build_object('row_number',2,'external_member_id','peopleon-1','member_no','M-1','member_name_snapshot','Updated Name','assessment_code','2026-09','due_date','2026-09-30','assessed_amount',1200)));
 if update_preview->>'update_count'<>'1' then raise exception 'TEST: update not detected %',update_preview; end if;
 perform finance.collection_ledger_command(org,admin_id,'ASSESSMENT_SAVE',jsonb_build_object('id',assessment_id,'lock_version',1,'external_member_id','peopleon-1','member_no','M-1','member_name_snapshot','Concurrent edit','assessment_code','2026-09','due_date','2026-09-30','assessed_amount',1100),'concurrent-edit');
 stale_preview:=finance.collection_assessment_import_preview(org,admin_id,'atomic.csv',repeat('d',64),jsonb_build_array(
  jsonb_build_object('row_number',2,'external_member_id','peopleon-new','member_no','M-2','member_name_snapshot','New Member','assessment_code','2026-09','due_date','2026-09-30','assessed_amount',1000),
  jsonb_build_object('row_number',3,'external_member_id','peopleon-1','member_no','M-1','member_name_snapshot','Another edit','assessment_code','2026-09','due_date','2026-09-30','assessed_amount',1300)));
 perform finance.collection_ledger_command(org,admin_id,'ASSESSMENT_SAVE',jsonb_build_object('id',assessment_id,'lock_version',2,'external_member_id','peopleon-1','member_no','M-1','member_name_snapshot','Second concurrent edit','assessment_code','2026-09','due_date','2026-09-30','assessed_amount',1150),'concurrent-edit-two');
 begin perform finance.collection_assessment_import_apply(org,admin_id,(stale_preview->>'batch_id')::uuid,'csv-stale'); raise exception 'TEST: stale preview applied'; exception when others then if sqlerrm not like '%새 미리보기%' then raise; end if; end;
 if exists(select 1 from finance.collection_assessments where organization_id=org and external_member_id='peopleon-new') then raise exception 'TEST: atomic rollback failed'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform finance.collection_assessment_import_preview(gen_random_uuid(),gen_random_uuid(),'x.csv',repeat('a',64),'[]'); raise exception 'TEST: direct preview RPC'; exception when insufficient_privilege then null; end;
 begin perform 1 from finance.collection_assessment_import_batches; raise exception 'TEST: direct import table'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
