-- 통장 원장 보정 감사도 Auth 사용자 UUID를 auth_actor_id로 정규화한다.
-- actor_user_id는 core.user_profiles FK이므로 Auth UUID를 직접 넣지 않는다.
drop trigger if exists normalize_ledger_bank_auth_actor on audit.audit_logs;
create trigger normalize_ledger_bank_auth_actor
before insert on audit.audit_logs
for each row
when (new.action in (
  'LEDGER_BANK_BACKFILL_SYNC',
  'LEDGER_BANK_ACCOUNT_MAP',
  'LEDGER_ACCOUNT_SUBJECTS_SYNC',
  'BANK_LEDGER_REPLACED',
  'BANK_REPLACEMENTS_REVERTED_TO_METADATA'
))
execute function audit.normalize_ledger_bank_auth_actor();
