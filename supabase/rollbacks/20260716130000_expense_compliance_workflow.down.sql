-- Apply manually only when rolling back 20260716130000.
-- Existing legacy expense_resolutions, vouchers and bank transaction rows remain.
drop index if exists finance.vouchers_bank_transaction_unique_idx;
alter table finance.vouchers drop column if exists bank_transaction_id, drop column if exists detail_transaction_id, drop column if exists expense_resolution_id;
drop table if exists finance.expense_supporting_files;
alter table if exists finance.expense_detail_transactions drop constraint if exists expense_detail_fact_confirmation_fk;
drop table if exists finance.expense_fact_confirmations;
drop table if exists finance.expense_detail_transactions;
drop table if exists finance.expense_compliance_settings;

drop index if exists finance.expense_resolutions_bank_transaction_unique_idx;
drop index if exists finance.bank_transactions_uid_unique_idx;

alter table finance.expense_resolutions
  drop column if exists expense_kind,
  drop column if exists accounting_date,
  drop column if exists actual_expense_date,
  drop column if exists drafted_at,
  drop column if exists approved_at,
  drop column if exists disbursed_at,
  drop column if exists is_post_approval,
  drop column if exists post_approval_reason,
  drop column if exists evidence_kind,
  drop column if exists evidence_status,
  drop column if exists missing_evidence_reason,
  drop column if exists actual_spender_label,
  drop column if exists settlement_recipient_label,
  drop column if exists settlement_amount,
  drop column if exists settlement_completed_at,
  drop column if exists bank_transaction_id;

alter table finance.bank_transactions
  drop column if exists bank_transaction_uid,
  drop column if exists resolution_status;

alter table finance.expense_workflow_operations drop constraint if exists expense_workflow_operations_command_check;
alter table finance.expense_workflow_operations add constraint expense_workflow_operations_command_check check (command in ('PAYMENT_COMPLETE','ITEM_PAYMENT_COMPLETE','PAYMENT_HOLD','VOUCHER_CREATE','VOUCHER_CONFIRM'));
