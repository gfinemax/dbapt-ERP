-- 교체로 사용 제외한 Ledger 원본은 이후 원본 동기화가 다시 들어와도
-- PENDING_MAPPING/IMPORTED 상태로 되돌아가지 않게 한다.
create function finance.preserve_superseded_ledger_bank_source() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.import_status='SUPERSEDED' then
    new.import_status:=old.import_status;
    new.issue_detail:=old.issue_detail;
    new.bank_transaction_id:=old.bank_transaction_id;
    new.imported_at:=old.imported_at;
  end if;
  return new;
end $$;

create trigger preserve_superseded_ledger_bank_source
before update on finance.ledger_bank_transaction_sources
for each row execute function finance.preserve_superseded_ledger_bank_source();

revoke all on function finance.preserve_superseded_ledger_bank_source()
  from public,anon,authenticated;
grant execute on function finance.preserve_superseded_ledger_bank_source()
  to service_role;
