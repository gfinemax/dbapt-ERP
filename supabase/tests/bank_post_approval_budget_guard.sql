-- Execute inside BEGIN/ROLLBACK. Final approval of an already-withdrawn bank
-- expense may become USED atomically, but ordinary payment remains guarded.
do $$
declare
  org uuid := gen_random_uuid();
  actor uuid := gen_random_uuid();
  budget uuid := gen_random_uuid();
  account uuid := gen_random_uuid();
  bank uuid := gen_random_uuid();
  post_resolution text := 'post-approval-' || gen_random_uuid()::text;
  ordinary_resolution text := 'ordinary-payment-' || gen_random_uuid()::text;
  unlinked_resolution text := 'unlinked-post-approval-' || gen_random_uuid()::text;
  month_start date := date '2026-01-01';
  used_amount numeric;
begin
  insert into core.organizations(id, name, status)
  values(org, 'Bank post-approval budget guard rollback test', 'active');
  insert into auth.users(id) values(actor);
  insert into finance.reimbursement_members
  values(org, actor, 'Budget admin', array['ADMIN'], true);
  insert into approval.budgets(
    id, organization_id, fiscal_year, budget_item,
    approved_amount, monthly_amount, executed_amount
  ) values(budget, org, 2026, '복리후생비(식대)', 7800000, 650000, 0);
  insert into finance.bank_accounts(
    id, organization_id, bank_name, account_name, account_no,
    account_type, account_purpose, opened_at
  ) values(account, org, 'Test', 'Test', 'POST-APPROVAL-' || account, '운영계좌', 'Test', date '2026-01-01');
  insert into finance.bank_transactions(
    id, organization_id, bank_account_id, transacted_at,
    description, withdrawal_amount, deposit_amount
  ) values(bank, org, account, timestamptz '2026-01-30 12:00:00+09', '업무식대', 252000, 0);
  perform finance.reimbursement_command(
    org, actor, 'POLICY',
    '{"submission_day":5,"completion_day":10,"long_delay_days":60}'
  );
  perform finance.reimbursement_command(org, actor, 'OPEN', jsonb_build_object('month', month_start));

  insert into finance.expense_resolutions(
    id, organization_id, resolution_no, author_label,
    approval_status, payment_status, total_payment_amount,
    actual_expense_date, expense_kind, is_post_approval,
    bank_transaction_id, budget_id, budget_month,
    resolution_data, subject
  ) values(
    post_resolution, org, 'TEST-POST-APPROVAL', '작성자',
    '승인대기', '지급전', 252000,
    date '2026-01-30', 'BANK_POST_APPROVAL', true,
    bank, budget, month_start,
    '{"budgetItem":"운영비 > 복리후생비(식대)","expenseKind":"BANK_POST_APPROVAL"}',
    '업무식대 사후결의'
  );

  update finance.expense_resolutions
  set approval_status = '승인완료',
      payment_status = '지급완료',
      disbursed_at = timestamptz '2026-01-30 12:00:00+09'
  where id = post_resolution;

  select coalesce(sum(amount), 0) into used_amount
  from finance.budget_effective_entries(org)
  where source_kind = 'RESOLUTION'
    and source_id = post_resolution
    and budget_id = budget
    and month = month_start
    and state = 'USED';
  if used_amount <> 252000 then
    raise exception 'TEST: final bank post-approval was not projected as actual use';
  end if;

  insert into finance.expense_resolutions(
    id, organization_id, resolution_no, author_label,
    approval_status, payment_status, total_payment_amount,
    actual_expense_date, expense_kind, budget_id, budget_month,
    resolution_data, subject
  ) values(
    ordinary_resolution, org, 'TEST-ORDINARY-PAYMENT', '작성자',
    '승인완료', '지급대기', 10000,
    date '2026-01-30', 'GENERAL', budget, month_start,
    '{"budgetItem":"운영비 > 복리후생비(식대)","expenseKind":"GENERAL"}',
    '일반 지급'
  );
  begin
    update finance.expense_resolutions
    set payment_status = '지급완료', disbursed_at = now()
    where id = ordinary_resolution;
    raise exception 'TEST: ordinary payment bypassed the USED-assignment guard';
  exception when others then
    if sqlerrm like 'TEST:%' then raise; end if;
    if sqlerrm not like '%실제 사용분을 확인한 뒤 지급%' then raise; end if;
  end;

  insert into finance.expense_resolutions(
    id, organization_id, resolution_no, author_label,
    approval_status, payment_status, total_payment_amount,
    actual_expense_date, expense_kind, is_post_approval,
    budget_id, budget_month, resolution_data, subject
  ) values(
    unlinked_resolution, org, 'TEST-UNLINKED-POST', '작성자',
    '승인대기', '지급전', 18000,
    date '2026-01-30', 'BANK_POST_APPROVAL', true,
    budget, month_start,
    '{"budgetItem":"운영비 > 복리후생비(식대)","expenseKind":"BANK_POST_APPROVAL"}',
    '통장거래 미연결 사후결의'
  );
  begin
    update finance.expense_resolutions
    set approval_status = '승인완료',
        payment_status = '지급완료',
        disbursed_at = timestamptz '2026-01-30 12:00:00+09'
    where id = unlinked_resolution;
    raise exception 'TEST: unlinked bank post-approval bypassed the budget guard';
  exception when others then
    if sqlerrm like 'TEST:%' then raise; end if;
    if sqlerrm not like '%실제 사용분을 확인한 뒤 지급%' then raise; end if;
  end;
end $$;
