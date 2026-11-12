-- Execute inside BEGIN/ROLLBACK. Open resolutions must change the monthly projection immediately.
do $$
declare
  org uuid:=gen_random_uuid();
  budget uuid:=gen_random_uuid();
  first_resolution text:='live-budget-first-'||gen_random_uuid()::text;
  second_resolution text:='live-budget-second-'||gen_random_uuid()::text;
  month_start date:=date '2026-01-01';
  pending numeric;
begin
  insert into core.organizations(id,name,status) values(org,'Live budget projection rollback test','active');
  insert into approval.budgets(id,organization_id,fiscal_year,budget_item,approved_amount,monthly_amount,executed_amount)
  values(budget,org,2026,'복리후생비',7800000,650000,0);

  insert into finance.expense_resolutions(
    id,organization_id,resolution_no,author_label,approval_status,payment_status,
    total_payment_amount,resolution_data,subject,budget_id,budget_month
  ) values
    (first_resolution,org,'TEST-LIVE-1','작성자','작성중','지급전',33000,'{"budgetItem":"운영비 > 복리후생비(식대)"}','첫 지출',budget,month_start),
    (second_resolution,org,'TEST-LIVE-2','작성자','작성중','지급전',252000,'{"budgetItem":"운영비 > 복리후생비(식대)"}','둘째 지출',budget,month_start);

  select coalesce(sum(amount),0) into pending
  from finance.budget_effective_entries(org)
  where budget_id=budget and month=month_start and state='PENDING';
  if pending<>285000 then raise exception 'TEST: same-month open resolutions were not aggregated'; end if;

  update finance.expense_resolutions
  set total_payment_amount=300000,resolution_data=resolution_data||'{"totalPaymentAmount":300000}'::jsonb
  where id=second_resolution;
  select coalesce(sum(amount),0) into pending
  from finance.budget_effective_entries(org)
  where budget_id=budget and month=month_start and state='PENDING';
  if pending<>333000 then raise exception 'TEST: edited resolution did not refresh projection'; end if;

  update finance.expense_resolutions set deleted_at=now() where id=first_resolution;
  select coalesce(sum(amount),0) into pending
  from finance.budget_effective_entries(org)
  where budget_id=budget and month=month_start and state='PENDING';
  if pending<>300000 then raise exception 'TEST: deleted resolution remained in projection'; end if;
end $$;
