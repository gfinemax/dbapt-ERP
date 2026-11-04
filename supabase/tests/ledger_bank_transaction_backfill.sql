do $$
declare
  org uuid:='10000000-0000-0000-0000-000000000001';
  actor uuid:='20000000-0000-0000-0000-000000000001';
  bank uuid:='30000000-0000-0000-0000-000000000001';
  result jsonb; tx finance.bank_transactions;
begin
  insert into core.organizations(id) values(org);
  insert into auth.users(id) values(actor);
  insert into finance.reimbursement_members(organization_id,user_id,permissions)
    values(org,actor,array['ADMIN']);
  insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type)
    values(bank,org,'테스트은행','ERP 운영계좌','1234567890','운영계좌');

  result:=finance.sync_ledger_bank_transactions(
    org,actor,'dbapt-ledger',0,1,true,true,
    jsonb_build_array(jsonb_build_object(
      'cursor',1,'source_version',1,'source_system','dbapt-ledger','source_transaction_id','1',
      'ledger_account_id','7','account_name','Ledger 운영계좌','bank_name','테스트은행',
      'account_number','1234567890','transaction_date','2026-10-31','transaction_time','09:15:00',
      'transaction_kind','대체','description','과거 운영비','deposit_amount',0,'withdrawal_amount',15000,
      'balance_amount',985000,'category_group','운영비','category_name','소모품비',
      'ledger_category_id','12','ledger_member_id',null,'external_member_id',null,
      'payment_reflection_status','auto','memo','원본메모','management_memo','관리메모',
      'ledger_source','excel_import','source_created_at','2026-10-31T09:16:00+09:00',
      'source_updated_at','2026-10-31T09:16:00+09:00','payload_hash',repeat('a',64)
    ))
  );
  if result->>'received_count'<>'1' or result->>'imported_count'<>'0' then
    raise exception 'TEST: unmapped source should stage without import: %',result;
  end if;
  if not exists(select 1 from finance.ledger_bank_transaction_sources where organization_id=org
    and source_transaction_id='1' and import_status='PENDING_MAPPING') then
    raise exception 'TEST: pending source missing';
  end if;

  result:=finance.set_ledger_bank_account_mapping(org,actor,'dbapt-ledger','7',bank,'명시적 ID 매핑');
  if result->>'imported_count'<>'1' then raise exception 'TEST: mapped source was not imported: %',result; end if;
  select * into tx from finance.bank_transactions where organization_id=org
    and source_system='dbapt-ledger' and source_transaction_id='1';
  if tx.id is null or tx.bank_account_id<>bank or tx.withdrawal_amount<>15000
    or tx.balance_amount<>985000 or tx.source_readonly is not true
    or tx.classification_status<>'UNREVIEWED' or tx.raw_payload->>'ledger_category_id'<>'12' then
    raise exception 'TEST: imported transaction provenance mismatch';
  end if;

  update finance.bank_transactions set classification_status='DEFERRED' where id=tx.id;
  begin
    update finance.bank_transactions set withdrawal_amount=16000 where id=tx.id;
    raise exception 'TEST: source mutation should be blocked';
  exception when others then
    if sqlerrm not like 'Ledger에서 이관한 통장 원본 필드는 변경할 수 없습니다.%' then raise; end if;
  end;

  result:=finance.sync_ledger_bank_transactions(org,actor,'dbapt-ledger',1,1,true,true,'[]'::jsonb);
  if (select count(*) from finance.bank_transactions where organization_id=org
    and source_system='dbapt-ledger' and source_transaction_id='1')<>1 then
    raise exception 'TEST: retry created a duplicate';
  end if;
  if (finance.ledger_bank_backfill_status(org,actor)->'totals'->>'imported')::integer<>1 then
    raise exception 'TEST: status imported count mismatch';
  end if;
end $$;
