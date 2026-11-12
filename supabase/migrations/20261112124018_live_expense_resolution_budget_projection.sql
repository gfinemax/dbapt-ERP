-- Keep open-month budget judgment live without overwriting approved document snapshots.
-- Canonical IDs drive aggregation; the legacy display label remains presentation-only.
alter table finance.expense_resolutions
  add column if not exists budget_id uuid references approval.budgets(id) on delete restrict,
  add column if not exists budget_month date;

alter table finance.expense_resolutions
  drop constraint if exists expense_resolutions_budget_month_first_day_check;
alter table finance.expense_resolutions
  add constraint expense_resolutions_budget_month_first_day_check
  check (budget_month is null or extract(day from budget_month)=1);

create index if not exists expense_resolutions_live_budget_idx
  on finance.expense_resolutions(organization_id,budget_month,budget_id,approval_status)
  where deleted_at is null and budget_id is not null and budget_month is not null;

update finance.expense_resolutions r
set budget_month=coalesce(
  case
    when r.resolution_data#>>'{budgetSnapshot,budgetPeriod}' ~ '^\d{4}-(0[1-9]|1[0-2])$'
      then ((r.resolution_data#>>'{budgetSnapshot,budgetPeriod}')||'-01')::date
  end,
  date_trunc('month',r.actual_expense_date)::date
)
where r.budget_month is null;

update finance.expense_resolutions r
set budget_id=d.budget_id
from finance.expense_detail_items d
where r.budget_id is null and r.budget_month is not null and r.expense_detail_id=d.id;

-- Backfill the longest official label contained in a legacy display label.
-- Any source without a match stays in the existing review queue.
update finance.expense_resolutions r
set budget_id=(
  select b.id
  from approval.budgets b
  where b.organization_id=r.organization_id
    and b.fiscal_year=extract(year from r.budget_month)
    and regexp_replace(lower(coalesce(r.resolution_data->>'budgetItem','')),'[^0-9a-z가-힣]+','','g')
      like '%'||regexp_replace(lower(b.budget_item),'[^0-9a-z가-힣]+','','g')||'%'
  order by length(regexp_replace(lower(b.budget_item),'[^0-9a-z가-힣]+','','g')) desc,b.id
  limit 1
)
where r.budget_id is null and r.budget_month is not null
  and exists (
    select 1 from approval.budgets b
    where b.organization_id=r.organization_id
      and b.fiscal_year=extract(year from r.budget_month)
      and regexp_replace(lower(coalesce(r.resolution_data->>'budgetItem','')),'[^0-9a-z가-힣]+','','g')
        like '%'||regexp_replace(lower(b.budget_item),'[^0-9a-z가-힣]+','','g')||'%'
  );

update finance.expense_resolutions r
set resolution_data=r.resolution_data||jsonb_strip_nulls(jsonb_build_object(
  'budgetId',r.budget_id::text,
  'budgetMonth',r.budget_month::text
))
where r.budget_id is not null and r.budget_month is not null
  and (
    r.resolution_data->>'budgetId' is distinct from r.budget_id::text
    or r.resolution_data->>'budgetMonth' is distinct from r.budget_month::text
  );

create or replace function finance.guard_expense_resolution_budget_link() returns trigger
language plpgsql security invoker set search_path='' as $$
declare budget approval.budgets%rowtype; detail_budget_id uuid;
begin
  -- Legacy unresolved rows may know their month before an official budget ID is reviewed.
  if new.budget_id is null then return new; end if;
  if new.budget_month is null then
    raise exception '예산항목과 귀속월을 함께 선택해주세요.';
  end if;
  select * into budget from approval.budgets where id=new.budget_id;
  if not found or budget.organization_id<>new.organization_id
     or budget.fiscal_year<>extract(year from new.budget_month) then
    raise exception '지출결의의 예산항목·조직·귀속연도가 일치하지 않습니다.';
  end if;
  if new.expense_detail_id is not null then
    select budget_id into detail_budget_id from finance.expense_detail_items
    where id=new.expense_detail_id and is_active;
    if detail_budget_id is null or detail_budget_id<>new.budget_id then
      raise exception '지출 세부항목과 예산항목이 일치하지 않습니다.';
    end if;
  end if;
  new.resolution_data:=new.resolution_data||jsonb_build_object(
    'budgetId',new.budget_id::text,
    'budgetMonth',new.budget_month::text
  );
  return new;
end $$;
drop trigger if exists expense_resolution_budget_link_guard on finance.expense_resolutions;
create trigger expense_resolution_budget_link_guard
before insert or update of budget_id,budget_month,expense_detail_id,resolution_data
on finance.expense_resolutions for each row
execute function finance.guard_expense_resolution_budget_link();
revoke all on function finance.guard_expense_resolution_budget_link() from public,anon,authenticated;
grant execute on function finance.guard_expense_resolution_budget_link() to service_role;

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
 null,b.budget_item,null,d.id::text,md5(jsonb_build_array(r.amount-r.released_amount,r.budget_id,d.id)::text)
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
 select s.source_kind,s.source_id,s.title,r.budget_id,r.budget_month,s.amount,
 case when s.source_state='APPROVED' then case when r.disbursed_at is not null or r.payment_status='지급완료' then 'USED' else 'RESERVED' end else 'PENDING' end,
 s.paid_at,s.link_id
 from sources s join finance.expense_resolutions r on r.organization_id=p_org and r.id=s.source_id
 where s.source_kind='RESOLUTION' and s.source_state<>'CANCELLED'
   and r.budget_id is not null and r.budget_month is not null
   and not exists(select 1 from assigned a where a.source_kind=s.source_kind and a.source_id=s.source_id)
 ), resolved as (
 select link_id,sum(amount) as amount from normalized where source_kind='RESOLUTION' and state in ('USED','RESERVED') group by link_id
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
