create index ledger_bank_subject_rules_account_subject_idx
  on finance.ledger_bank_subject_rules(account_subject_id)
  where account_subject_id is not null;
create index ledger_bank_subject_rules_confirmed_by_idx
  on finance.ledger_bank_subject_rules(confirmed_by);
create index ledger_bank_subject_rule_audit_rule_idx
  on finance.ledger_bank_subject_rule_audit_logs(rule_id);
create index ledger_bank_subject_rule_audit_actor_idx
  on finance.ledger_bank_subject_rule_audit_logs(actor_id);
