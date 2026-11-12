-- Project approved reservations into the intended execution month even before
-- the first expense resolution is drafted. The reservation keeps its real
-- budget UUID; document labels are never used as the authoritative link.
create or replace function finance.budget_sources(p_org uuid)
returns table(source_kind text,source_id text,title text,amount numeric,source_state text,suggested_month date,suggested_budget text,paid_at timestamptz,link_id text,signature text)
language sql stable security invoker set search_path='' as $$
 select 'RESOLUTION',r.id,r.resolution_no||' '||coalesce(r.subject,''),r.total_payment_amount,
 case when r.deleted_at is not null or r.approval_status in ('반려','취소') then 'CANCELLED' when r.approval_status='승인완료' then 'APPROVED' else 'PENDING' end,
 coalesce(r.budget_month,date_trunc('month',r.actual_expense_date)::date),coalesce(b.budget_item,r.resolution_data->>'budgetItem'),r.disbursed_at,r.approval_document_id::text,
 md5(jsonb_build_array(r.total_payment_amount,r.approval_document_id,r.resolution_data->>'budgetItem',r.resolution_data->'accountAllocations',r.approval_status)::text)
 from finance.expense_resolutions r left join approval.budgets b on b.id=r.budget_id where r.organization_id=p_org
 union all
 select 'RESERVATION',r.id::text,d.document_no||' '||d.title,r.amount-r.released_amount,
 case when r.status in ('RELEASED','CONSUMED') then 'CANCELLED' when r.status='ADJUSTMENT_REQUIRED' then 'REVIEW' else 'APPROVED' end,
 date_trunc('month',coalesce(d.desired_execution_date,d.payment_due_date,(d.created_at at time zone 'Asia/Seoul')::date))::date,
 b.budget_item,null,d.id::text,md5(jsonb_build_array(r.amount-r.released_amount,r.budget_id,d.id)::text)
 from approval.budget_reservations r join approval.documents d on d.id=r.document_id left join approval.budgets b on b.id=r.budget_id where d.organization_id=p_org
 union all
 select 'QUICK',q.id::text,q.usage_description,q.amount,
 case when q.record_status='RECORDED' then 'APPROVED' when q.record_status='CONVERTED' then 'CANCELLED' else 'PENDING' end,
 date_trunc('month',q.occurred_at at time zone 'Asia/Seoul')::date,q.budget_item,
 case when q.payment_method<>'PERSONAL_PREPAID' then q.occurred_at else null end,q.linked_resolution_id,
 md5(jsonb_build_array(q.amount,q.budget_item,q.linked_resolution_id)::text)
 from finance.quick_expense_records q where q.organization_id=p_org
 union all
 select 'MANUAL',b.id::text,b.fiscal_year::text||' '||b.budget_item||' 수기 집행액',b.executed_amount,'APPROVED',null,b.budget_item,null,null,md5(jsonb_build_array(b.executed_amount,b.fiscal_year)::text)
 from approval.budgets b where b.organization_id=p_org and b.executed_amount>0;
$$;

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
 select s.source_kind,s.source_id,s.title,r.budget_id,s.suggested_month,s.amount,
 case when s.source_state='APPROVED' then 'RESERVED' else 'PENDING' end,s.paid_at,s.link_id
 from sources s join approval.budget_reservations r on r.id::text=s.source_id
 where s.source_kind='RESERVATION' and s.source_state<>'CANCELLED' and s.suggested_month is not null
   and not exists(select 1 from assigned a where a.source_kind=s.source_kind and a.source_id=s.source_id)
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

revoke all on function finance.budget_sources(uuid) from public,anon,authenticated;
grant execute on function finance.budget_sources(uuid) to service_role;
revoke all on function finance.budget_effective_entries(uuid) from public,anon,authenticated;
grant execute on function finance.budget_effective_entries(uuid) to service_role;

notify pgrst, 'reload schema';
