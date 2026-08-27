alter table approval.budgets
  add column if not exists monthly_amount numeric(16,0) not null default 0
  check (monthly_amount >= 0);

update approval.budgets
set monthly_amount = round(approved_amount / 12.0)
where monthly_amount = 0 and approved_amount > 0;

with monthly_values(budget_item, monthly_amount) as (
  values
    ('인건비>급여>조합장', 4300000::numeric),
    ('인건비>급여>상근임원', 3500000::numeric),
    ('인건비>급여>직원', 2300000::numeric),
    ('인건비>상여금', 3266667::numeric),
    ('인건비>퇴직금', 816667::numeric),
    ('인건비>기타인건비', 929580::numeric),
    ('복리후생비', 650000::numeric),
    ('업무추진비', 600000::numeric),
    ('회의비>이사회비', 375000::numeric),
    ('회의비>감사비', 50000::numeric),
    ('일반운영비>지급임차료', 1300000::numeric),
    ('일반운영비>도서인쇄비', 200000::numeric),
    ('일반운영비>소모품비', 300000::numeric),
    ('일반운영비>수선비', 100000::numeric),
    ('제세공과금>통신비', 400000::numeric),
    ('제세공과금>여비교통비', 300000::numeric),
    ('제세공과금>수도광열비', 200000::numeric),
    ('제세공과금>지급수수료', 200000::numeric),
    ('기타운영비', 100000::numeric),
    ('예비비', 300000::numeric)
)
update approval.budgets b
set monthly_amount = v.monthly_amount, updated_at = now()
from monthly_values v
where b.fiscal_year = 2026 and b.budget_item = v.budget_item;

create or replace function finance.guard_quick_expense_budget()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_budget approval.budgets%rowtype;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_quick_used numeric(18,2);
begin
  if new.record_status <> 'RECORDED' then return new; end if;
  select * into v_budget from approval.budgets
    where organization_id = new.organization_id
      and fiscal_year = extract(year from new.occurred_at at time zone 'Asia/Seoul')::integer
      and budget_item = new.budget_item
    for update;
  if not found then raise exception '승인된 예산항목을 찾을 수 없어 정식 지출결의가 필요합니다.'; end if;
  if v_budget.monthly_amount <= 0 then raise exception '월 예산이 등록되지 않아 정식 지출결의가 필요합니다.'; end if;

  v_month_start := date_trunc('month', new.occurred_at at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_month_end := v_month_start + interval '1 month';
  select coalesce(sum(amount), 0) into v_quick_used
    from finance.quick_expense_records
    where organization_id = new.organization_id and budget_item = new.budget_item
      and occurred_at >= v_month_start and occurred_at < v_month_end
      and record_status = 'RECORDED' and id <> new.id;
  if v_budget.monthly_amount - v_quick_used < new.amount then
    raise exception '이번 달 승인예산 잔액을 초과해 정식 지출결의가 필요합니다.';
  end if;
  return new;
end;
$$;
