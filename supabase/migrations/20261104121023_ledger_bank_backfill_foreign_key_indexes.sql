-- Cover foreign-key lookups used by mapping changes, reconciliation, and cleanup.
create index ledger_bank_account_mappings_bank_account_idx
  on finance.ledger_bank_account_mappings(bank_account_id);
create index ledger_bank_account_mappings_mapped_by_idx
  on finance.ledger_bank_account_mappings(mapped_by);

create index ledger_bank_transaction_sources_account_source_idx
  on finance.ledger_bank_transaction_sources(organization_id,source_system,ledger_account_id);
create index ledger_bank_transaction_sources_bank_transaction_idx
  on finance.ledger_bank_transaction_sources(bank_transaction_id);

create index ledger_bank_transaction_sync_runs_actor_idx
  on finance.ledger_bank_transaction_sync_runs(actor_id);
create index ledger_bank_transaction_sync_runs_organization_idx
  on finance.ledger_bank_transaction_sync_runs(organization_id);

create index ledger_bank_transaction_sync_state_updated_by_idx
  on finance.ledger_bank_transaction_sync_state(updated_by);
