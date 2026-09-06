-- Aggregate on the server rather than relying on the PostgREST row limit.
create function finance.reimbursement_budget_totals(p_month date)
returns table(budget_id uuid,annual_personal numeric,monthly_personal numeric,monthly_quick numeric)
language sql stable security invoker set search_path='' as $$
 select b.id,
 coalesce((select sum(r.amount) from finance.personal_reimbursements r where r.budget_id=b.id and r.status in ('APPROVED','PAID')),0),
 coalesce((select sum(r.amount) from finance.personal_reimbursements r where r.budget_id=b.id and r.budget_month=p_month and r.status in ('APPROVED','PAID')),0),
 coalesce((select sum(q.amount) from finance.quick_expense_records q where q.organization_id=b.organization_id and q.budget_item=b.budget_item and q.record_status='RECORDED'
   and date_trunc('month',q.occurred_at at time zone 'Asia/Seoul')::date=p_month and b.fiscal_year=extract(year from p_month)),0)
 from approval.budgets b;
$$;
revoke all on function finance.reimbursement_budget_totals(date) from public,anon,authenticated;
grant execute on function finance.reimbursement_budget_totals(date) to service_role;
