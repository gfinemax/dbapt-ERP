drop trigger if exists sync_expense_resolution_bank_transactions
  on finance.expense_resolutions;
drop function if exists finance.sync_expense_resolution_bank_transactions();
drop table if exists finance.expense_resolution_bank_transactions;
