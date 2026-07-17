create index if not exists expense_detail_fact_confirmation_idx
  on finance.expense_detail_transactions(fact_confirmation_id)
  where fact_confirmation_id is not null;

create index if not exists expense_fact_confirmations_resolution_idx
  on finance.expense_fact_confirmations(resolution_id, is_current)
  where deleted_at is null;

create index if not exists expense_fact_confirmations_detail_idx
  on finance.expense_fact_confirmations(detail_transaction_id)
  where detail_transaction_id is not null and deleted_at is null;

create index if not exists expense_supporting_files_resolution_idx
  on finance.expense_supporting_files(resolution_id);

create index if not exists expense_supporting_files_detail_idx
  on finance.expense_supporting_files(detail_transaction_id)
  where detail_transaction_id is not null;

create index if not exists expense_supporting_files_fact_idx
  on finance.expense_supporting_files(fact_confirmation_id)
  where fact_confirmation_id is not null;

create index if not exists vouchers_expense_resolution_idx
  on finance.vouchers(expense_resolution_id)
  where expense_resolution_id is not null and deleted_at is null;

create index if not exists vouchers_detail_transaction_idx
  on finance.vouchers(detail_transaction_id)
  where detail_transaction_id is not null and deleted_at is null;

create index if not exists voucher_lines_voucher_idx
  on finance.voucher_lines(voucher_id);
