create index if not exists expense_resolutions_budget_id_idx
  on finance.expense_resolutions(budget_id)
  where budget_id is not null;
