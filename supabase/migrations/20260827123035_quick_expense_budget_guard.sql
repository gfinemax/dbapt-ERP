create or replace function finance.guard_quick_expense_budget()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_budget approval.budgets%rowtype;
  v_quick_used numeric(18,2);
begin
  if new.record_status <> 'RECORDED' then return new; end if;
  select * into v_budget from approval.budgets
    where organization_id = new.organization_id
      and fiscal_year = extract(year from new.occurred_at)::integer
      and budget_item = new.budget_item
    for update;
  if not found then raise exception '승인된 예산항목을 찾을 수 없어 정식 지출결의가 필요합니다.'; end if;
  select coalesce(sum(amount), 0) into v_quick_used
    from finance.quick_expense_records
    where organization_id = new.organization_id and budget_item = new.budget_item
      and extract(year from occurred_at) = extract(year from new.occurred_at)
      and record_status = 'RECORDED' and id <> new.id;
  if v_budget.approved_amount - v_budget.executed_amount - v_quick_used < new.amount then
    raise exception '승인예산 잔액을 초과해 정식 지출결의가 필요합니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists quick_expense_budget_guard on finance.quick_expense_records;
create trigger quick_expense_budget_guard before insert or update of amount,budget_item,occurred_at,record_status
on finance.quick_expense_records for each row execute function finance.guard_quick_expense_budget();
