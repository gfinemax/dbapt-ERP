-- Unknown attribution is not zero outstanding work. Keep it visible without
-- charging its amount to an invented month or unrelated identified budget.
create or replace function finance.reimbursement_budget_rows(p_org uuid,p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
 with entries as materialized(select * from finance.budget_effective_entries(p_org)),
 review as materialized(select x from jsonb_array_elements(finance.budget_review_queue(p_org)) x where (x->>'needs_review')::boolean),
 unresolved as (
  select b.id,count(*) as n,
   count(*) filter(where r.x->>'suggested_month' is null and jsonb_array_length(coalesce(r.x->'lines','[]'))=0) as unknown_month
  from approval.budgets b cross join review r
  where b.organization_id=p_org and b.fiscal_year=extract(year from p_month)
   and (r.x->>'source_kind'<>'MANUAL' or r.x->>'source_id'=b.id::text)
   and (
    (r.x->>'suggested_budget'=b.budget_item and r.x->>'suggested_month'=p_month::text)
    or exists(select 1 from jsonb_array_elements(coalesce(r.x->'lines','[]')) l where l->>'budget_id'=b.id::text and l->>'month'=p_month::text)
    or (jsonb_array_length(coalesce(r.x->'lines','[]'))=0
     and (nullif(r.x->>'suggested_budget','') is null or r.x->>'suggested_budget'=b.budget_item)
     and (r.x->>'suggested_month' is null or r.x->>'suggested_month'=p_month::text))
   ) group by b.id
 ), rows as (
 select b.id,b.budget_item,b.monthly_amount,b.approved_amount,b.executed_amount as annual_recorded_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='QUICK'),0) as quick_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='PERSONAL'),0) as personal_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='RESOLUTION'),0) as resolution_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='MANUAL'),0) as manual_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.paid_at is null and e.source_kind<>'MANUAL'),0) as unpaid_amount,
 coalesce(sum(e.amount) filter(where e.state='RESERVED'),0) as reserved_amount,
 coalesce(sum(e.amount) filter(where e.state='PENDING'),0) as pending_amount,
 coalesce((select n from unresolved u where u.id=b.id),0) as unresolved_count,
 coalesce((select unknown_month from unresolved u where u.id=b.id),0) as unresolved_unknown_month_count,
 coalesce((select sum(a.amount) from entries a where a.budget_id=b.id and a.state='USED'),0) as annual_used_amount,
 coalesce((select sum(a.amount) from entries a where a.budget_id=b.id and a.state='RESERVED'),0) as annual_reserved_amount
 from approval.budgets b left join entries e on e.budget_id=b.id and e.month=p_month
 where b.organization_id=p_org and b.fiscal_year=extract(year from p_month)
 group by b.id)
 select coalesce(jsonb_agg(to_jsonb(rows) order by budget_item),'[]') from rows;
$$;
revoke all on function finance.reimbursement_budget_rows(uuid,date) from public,anon,authenticated;
grant execute on function finance.reimbursement_budget_rows(uuid,date) to service_role;

-- The close transition must enforce the same unknown-month rule. A displayed
-- warning alone cannot protect a month-end snapshot from silently omitting costs.
create function finance.guard_unknown_month_close() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status='CLOSED' and old.status<>'CLOSED' and exists (
  select 1 from jsonb_array_elements(finance.budget_review_queue(new.organization_id)) x
  where (x->>'needs_review')::boolean and x->>'suggested_month' is null
   and jsonb_array_length(coalesce(x->'lines','[]'))=0
   and (x->>'source_kind'<>'MANUAL' or exists (
    select 1 from approval.budgets b where b.organization_id=new.organization_id
     and b.id::text=x->>'source_id' and b.fiscal_year=extract(year from new.month)
   ))
 ) then raise exception '귀속월을 확인하지 않은 원본을 먼저 배정해주세요.'; end if;
 return new;
end $$;
create trigger guard_unknown_month_close before update of status on finance.reimbursement_periods
for each row execute function finance.guard_unknown_month_close();
revoke all on function finance.guard_unknown_month_close() from public,anon,authenticated;
grant execute on function finance.guard_unknown_month_close() to service_role;
