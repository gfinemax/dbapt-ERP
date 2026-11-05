-- Ledger 계정과목 동기화도 auth.users 기반 작성자 정규화 대상에 포함한다.
-- legacy actor_user_id는 core.user_profiles FK이므로 Auth UUID를 직접 보관하지 않는다.
drop trigger if exists normalize_ledger_bank_auth_actor on audit.audit_logs;
create trigger normalize_ledger_bank_auth_actor
before insert on audit.audit_logs
for each row
when (new.action in (
  'LEDGER_BANK_BACKFILL_SYNC',
  'LEDGER_BANK_ACCOUNT_MAP',
  'LEDGER_ACCOUNT_SUBJECTS_SYNC'
))
execute function audit.normalize_ledger_bank_auth_actor();
