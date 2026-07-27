alter table finance.expense_compliance_settings
  add column if not exists direct_expense_recommended_keywords text[] not null default array['신규 사업','신규 거래처','비정기','자산 취득'],
  add column if not exists allow_other_approval_skip_reason boolean not null default true;
