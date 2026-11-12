-- Treat an approval reservation and every linked expense resolution as one budget chain.
-- A pending resolution immediately replaces the same portion of the reservation so that
-- additions, edits and deletions are reflected without double-counting the approved ceiling.
create or replace function finance.budget_effective_entries(p_org uuid)
returns table(source_kind text,source_id text,title text,budget_id uuid,month date,amount numeric,state text,paid_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with sources as materialized(select * from finance.budget_sources(p_org)),
 assigned as (
 select s.*,a.state as assignment_state,a.lines from sources s join finance.budget_source_assignments a
 on a.organization_id=p_org and a.source_kind=s.source_kind and a.source_id=s.source_id
 ), mapped as (
 select a.source_kind,a.source_id,a.title,(l->>'budget_id')::uuid as budget_id,(l->>'month')::date as month,(l->>'amount')::numeric as amount,
 case when a.source_state='CANCELLED' or a.assignment_state='CANCELLED' then 'CANCELLED' when a.source_state='PENDING' then 'PENDING' else a.assignment_state end as state,a.paid_at,a.link_id
 from assigned a cross join lateral jsonb_array_elements(a.lines) l
 ), normalized as (
 select * from mapped
 union all
 select s.source_kind,s.source_id,s.title,b.id,s.suggested_month,s.amount,case when s.source_state='APPROVED' then 'USED' else 'PENDING' end,s.paid_at,s.link_id
 from sources s join approval.budgets b on b.organization_id=p_org and b.budget_item=s.suggested_budget and b.fiscal_year=extract(year from s.suggested_month)
 where s.source_kind='QUICK' and s.source_state<>'CANCELLED' and not exists(select 1 from assigned a where a.source_kind=s.source_kind and a.source_id=s.source_id)
 union all
 select s.source_kind,s.source_id,s.title,r.budget_id,r.budget_month,s.amount,
 case when s.source_state='APPROVED' then case when r.disbursed_at is not null or r.payment_status='지급완료' then 'USED' else 'RESERVED' end else 'PENDING' end,
 s.paid_at,s.link_id
 from sources s join finance.expense_resolutions r on r.organization_id=p_org and r.id=s.source_id
 where s.source_kind='RESOLUTION' and s.source_state<>'CANCELLED'
   and r.budget_id is not null and r.budget_month is not null
   and not exists(select 1 from assigned a where a.source_kind=s.source_kind and a.source_id=s.source_id)
 ), resolved as (
 select link_id,sum(amount) as amount from normalized
 where source_kind='RESOLUTION' and state in ('USED','RESERVED','PENDING') and link_id is not null
 group by link_id
 ), reservation_lines as (
 select n.*,coalesce(sum(n.amount) over(partition by n.link_id order by n.month,n.budget_id,n.source_id rows between unbounded preceding and 1 preceding),0) as preceding_amount
 from normalized n where n.source_kind='RESERVATION' and n.state<>'CANCELLED'
 ), adjusted as (
 select n.source_kind,n.source_id,n.title,n.budget_id,n.month,
 greatest(0,n.amount-greatest(0,coalesce(r.amount,0)-n.preceding_amount)) as amount,n.state,n.paid_at
 from reservation_lines n left join resolved r on r.link_id=n.link_id
 )
 select n.source_kind,n.source_id,n.title,n.budget_id,n.month,n.amount,n.state,n.paid_at from normalized n
 where n.source_kind<>'RESERVATION' and n.state<>'CANCELLED'
 and not (n.source_kind='QUICK' and exists(select 1 from normalized r where r.source_kind='RESOLUTION' and r.source_id=n.link_id and r.state in ('RESERVED','USED')))
 union all select * from adjusted where amount>0
 union all
 select 'PERSONAL',r.id::text,r.merchant||' '||r.purpose,r.budget_id,r.budget_month,r.amount,case when r.status='SUBMITTED' then 'PENDING' else 'USED' end,r.paid_at
 from finance.personal_reimbursements r where r.organization_id=p_org and r.status in ('SUBMITTED','APPROVED','PAID');
$$;

revoke all on function finance.budget_effective_entries(uuid) from public,anon,authenticated;
grant execute on function finance.budget_effective_entries(uuid) to service_role;

notify pgrst, 'reload schema';
