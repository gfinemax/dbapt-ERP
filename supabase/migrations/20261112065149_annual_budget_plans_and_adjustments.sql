create table approval.budget_plan_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id),
  fiscal_year integer not null check (fiscal_year between 2000 and 2100),
  revision integer not null check (revision > 0),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','SUBMITTED','ACTIVE','ARCHIVED','REJECTED')),
  title text not null,
  authority_reference text not null default '',
  notes text not null default '',
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,fiscal_year,revision)
);
create unique index budget_plan_one_open_version
  on approval.budget_plan_versions(organization_id,fiscal_year)
  where status in ('DRAFT','SUBMITTED');
create unique index budget_plan_one_active_version
  on approval.budget_plan_versions(organization_id,fiscal_year)
  where status='ACTIVE';
create index budget_plan_versions_org_year_idx
  on approval.budget_plan_versions(organization_id,fiscal_year,status);

create table approval.budget_plan_version_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references approval.budget_plan_versions(id) on delete cascade,
  source_budget_id uuid references approval.budgets(id) on delete restrict,
  applied_budget_id uuid references approval.budgets(id) on delete restrict,
  budget_code text,
  budget_item text not null,
  plan_section text,
  plan_item_label text,
  mapping_status text not null default 'CONFIRMED'
    check (mapping_status in ('CONFIRMED','POLICY_REVIEW')),
  mapping_note text not null default '',
  approved_amount numeric(16,0) not null default 0
    check (approved_amount >= 0 and approved_amount=trunc(approved_amount)),
  monthly_amount numeric(16,0) not null default 0
    check (monthly_amount >= 0 and monthly_amount=trunc(monthly_amount)),
  calculation_basis text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id,budget_item)
);
create unique index budget_plan_item_code_unique
  on approval.budget_plan_version_items(plan_id,budget_code)
  where budget_code is not null;
create index budget_plan_items_plan_idx
  on approval.budget_plan_version_items(plan_id,sort_order,budget_item);

create table approval.budget_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id),
  fiscal_year integer not null check (fiscal_year between 2000 and 2100),
  adjustment_no text not null,
  adjustment_type text not null
    check (adjustment_type in ('TRANSFER','RESERVE_USE','SUPPLEMENT','REDUCTION')),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  source_budget_id uuid references approval.budgets(id) on delete restrict,
  target_budget_id uuid references approval.budgets(id) on delete restrict,
  effective_month date not null check (extract(day from effective_month)=1),
  amount numeric(16,0) not null
    check (amount > 0 and amount=trunc(amount)),
  reason text not null check (length(trim(reason)) > 0),
  authority_reference text not null check (length(trim(authority_reference)) > 0),
  requested_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  rejected_by uuid references auth.users(id),
  decision_note text not null default '',
  requested_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id,adjustment_no),
  check (extract(year from effective_month)=fiscal_year),
  check (source_budget_id is distinct from target_budget_id),
  check (
    (adjustment_type in ('TRANSFER','RESERVE_USE') and source_budget_id is not null and target_budget_id is not null)
    or (adjustment_type='SUPPLEMENT' and source_budget_id is null and target_budget_id is not null)
    or (adjustment_type='REDUCTION' and source_budget_id is not null and target_budget_id is null)
  )
);
create index budget_adjustments_org_year_idx
  on approval.budget_adjustments(organization_id,fiscal_year,status,effective_month);
create index budget_adjustments_source_idx
  on approval.budget_adjustments(source_budget_id,status);
create index budget_adjustments_target_idx
  on approval.budget_adjustments(target_budget_id,status);

alter table approval.budget_plan_versions enable row level security;
alter table approval.budget_plan_version_items enable row level security;
alter table approval.budget_adjustments enable row level security;
revoke all on approval.budget_plan_versions,approval.budget_plan_version_items,approval.budget_adjustments from anon,authenticated;
grant select,insert,update,delete on approval.budget_plan_versions,approval.budget_plan_version_items,approval.budget_adjustments to service_role;

create function approval.budget_adjustment_net(p_budget uuid,p_month date default null)
returns numeric
language sql stable security invoker set search_path=''
as $$
  select coalesce(sum(
    case
      when a.target_budget_id=p_budget then a.amount
      when a.source_budget_id=p_budget then -a.amount
      else 0
    end
  ),0)
  from approval.budget_adjustments a
  where a.status='APPROVED'
    and (a.source_budget_id=p_budget or a.target_budget_id=p_budget)
    and (p_month is null or a.effective_month=p_month);
$$;
revoke all on function approval.budget_adjustment_net(uuid,date) from public,anon,authenticated;
grant execute on function approval.budget_adjustment_net(uuid,date) to service_role;

create function approval.budget_governance_command(
  p_org uuid,
  p_actor uuid,
  p_command text,
  p_data jsonb
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  member finance.reimbursement_members%rowtype;
  plan approval.budget_plan_versions%rowtype;
  plan_item approval.budget_plan_version_items%rowtype;
  adjustment approval.budget_adjustments%rowtype;
  source_budget approval.budgets%rowtype;
  target_budget approval.budgets%rowtype;
  target_row approval.budgets%rowtype;
  v_source_year integer;
  v_fiscal_year integer;
  revision_value integer;
  amount_value numeric;
  annual_committed numeric;
  monthly_committed numeric;
  annual_limit numeric;
  monthly_limit numeric;
  adjustment_number integer;
  new_id uuid;
  item_data jsonb;
  before_data jsonb;
  after_data jsonb;
  reason_value text:=trim(coalesce(p_data->>'reason',''));
  authority_value text:=trim(coalesce(p_data->>'authority_reference',''));
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  select * into member
  from finance.reimbursement_members
  where organization_id=p_org and user_id=p_actor and active;
  if not found then raise exception '활성 예산관리 권한이 필요합니다.'; end if;

  if p_command in ('CREATE_PLAN','SAVE_PLAN_ITEM','SUBMIT_PLAN')
     and not (member.permissions&&array['ADMIN']) then
    raise exception '연간 예산안 관리에는 관리자 권한이 필요합니다.';
  end if;
  if p_command in ('APPROVE_PLAN','APPROVE_ADJUSTMENT','REJECT_ADJUSTMENT')
     and not (member.permissions&&array['SENIOR','ADMIN']) then
    raise exception '예산 확정·변경 승인 권한이 필요합니다.';
  end if;
  if p_command in ('CREATE_ADJUSTMENT','SUBMIT_ADJUSTMENT','CANCEL_ADJUSTMENT')
     and not (member.permissions&&array['APPROVE','SENIOR','ADMIN']) then
    raise exception '예산 변경 작성 권한이 필요합니다.';
  end if;

  if p_command='CREATE_PLAN' then
    v_fiscal_year:=nullif(p_data->>'fiscal_year','')::integer;
    v_source_year:=nullif(p_data->>'source_year','')::integer;
    if v_fiscal_year is null or v_fiscal_year not between 2000 and 2100 then
      raise exception '회계연도를 확인해주세요.';
    end if;
    if exists(select 1 from approval.budget_plan_versions v
      where v.organization_id=p_org and v.fiscal_year=v_fiscal_year
        and status in ('DRAFT','SUBMITTED')) then
      raise exception '해당 연도에 작성 또는 승인 중인 예산안이 이미 있습니다.';
    end if;
    select coalesce(max(v.revision),0)+1 into revision_value
    from approval.budget_plan_versions v
    where v.organization_id=p_org and v.fiscal_year=v_fiscal_year;
    insert into approval.budget_plan_versions(
      organization_id,fiscal_year,revision,status,title,created_by
    ) values(
      p_org,v_fiscal_year,revision_value,'DRAFT',
      coalesce(nullif(trim(p_data->>'title'),''),v_fiscal_year::text||'년 예산안'),p_actor
    ) returning * into plan;
    if v_source_year is not null then
      if not exists(select 1 from approval.budgets b where b.organization_id=p_org and b.fiscal_year=v_source_year) then
        raise exception '복사할 원본 연도의 확정예산이 없습니다.';
      end if;
      insert into approval.budget_plan_version_items(
        plan_id,source_budget_id,budget_code,budget_item,plan_section,plan_item_label,
        mapping_status,mapping_note,approved_amount,monthly_amount,calculation_basis,sort_order
      )
      select plan.id,b.id,b.budget_code,b.budget_item,b.plan_section,b.plan_item_label,
        b.mapping_status,b.mapping_note,b.approved_amount,b.monthly_amount,b.calculation_basis,
        row_number() over(order by coalesce(b.plan_section,''),coalesce(b.plan_item_label,b.budget_item),b.budget_item)*10
      from approval.budgets b
      where b.organization_id=p_org and b.fiscal_year=v_source_year;
    end if;
    after_data:=to_jsonb(plan);

  elsif p_command='SAVE_PLAN_ITEM' then
    select * into plan from approval.budget_plan_versions
    where id=(p_data->>'plan_id')::uuid and organization_id=p_org for update;
    if not found or plan.status<>'DRAFT' then raise exception '수정 가능한 예산안이 아닙니다.'; end if;
    item_data:=coalesce(p_data->'item','{}'::jsonb);
    if trim(coalesce(item_data->>'budget_item',''))='' then raise exception '예산항목명이 필요합니다.'; end if;
    if coalesce((item_data->>'approved_amount')::numeric,-1)<0
       or coalesce((item_data->>'monthly_amount')::numeric,-1)<0
       or (item_data->>'approved_amount')::numeric<>trunc((item_data->>'approved_amount')::numeric)
       or (item_data->>'monthly_amount')::numeric<>trunc((item_data->>'monthly_amount')::numeric) then
      raise exception '예산 금액은 0원 이상의 정수여야 합니다.';
    end if;
    if nullif(item_data->>'id','') is null then
      insert into approval.budget_plan_version_items(
        plan_id,budget_code,budget_item,plan_section,plan_item_label,mapping_status,mapping_note,
        approved_amount,monthly_amount,calculation_basis,sort_order
      ) values(
        plan.id,nullif(trim(item_data->>'budget_code'),''),trim(item_data->>'budget_item'),
        nullif(trim(item_data->>'plan_section'),''),nullif(trim(item_data->>'plan_item_label'),''),
        coalesce(nullif(item_data->>'mapping_status',''),'POLICY_REVIEW'),coalesce(item_data->>'mapping_note',''),
        (item_data->>'approved_amount')::numeric,(item_data->>'monthly_amount')::numeric,
        coalesce(item_data->>'calculation_basis',''),coalesce((item_data->>'sort_order')::integer,9990)
      ) returning id into new_id;
    else
      update approval.budget_plan_version_items i set
        budget_code=nullif(trim(item_data->>'budget_code'),''),
        budget_item=trim(item_data->>'budget_item'),
        plan_section=nullif(trim(item_data->>'plan_section'),''),
        plan_item_label=nullif(trim(item_data->>'plan_item_label'),''),
        mapping_status=coalesce(nullif(item_data->>'mapping_status',''),'POLICY_REVIEW'),
        mapping_note=coalesce(item_data->>'mapping_note',''),
        approved_amount=(item_data->>'approved_amount')::numeric,
        monthly_amount=(item_data->>'monthly_amount')::numeric,
        calculation_basis=coalesce(item_data->>'calculation_basis',''),
        updated_at=now()
      where i.id=(item_data->>'id')::uuid and i.plan_id=plan.id
      returning i.id into new_id;
      if new_id is null then raise exception '수정할 예산항목을 찾을 수 없습니다.'; end if;
    end if;
    after_data:=jsonb_build_object('plan_id',plan.id,'item_id',new_id);

  elsif p_command='SUBMIT_PLAN' then
    select * into plan from approval.budget_plan_versions
    where id=(p_data->>'plan_id')::uuid and organization_id=p_org for update;
    if not found or plan.status<>'DRAFT' then raise exception '제출 가능한 예산안이 아닙니다.'; end if;
    if not exists(select 1 from approval.budget_plan_version_items where plan_id=plan.id) then
      raise exception '예산항목을 한 개 이상 등록해주세요.';
    end if;
    if exists(select 1 from approval.budget_plan_version_items
      where plan_id=plan.id and (budget_code is null or trim(budget_code)='')) then
      raise exception '모든 예산항목에 연도 간 연결용 예산코드가 필요합니다.';
    end if;
    update approval.budget_plan_versions set status='SUBMITTED',updated_at=now()
    where id=plan.id returning * into plan;
    after_data:=to_jsonb(plan);

  elsif p_command='APPROVE_PLAN' then
    select * into plan from approval.budget_plan_versions
    where id=(p_data->>'plan_id')::uuid and organization_id=p_org for update;
    if not found or plan.status<>'SUBMITTED' then raise exception '확정 가능한 예산안이 아닙니다.'; end if;
    authority_value:=trim(coalesce(p_data->>'authority_reference',''));
    if authority_value='' then raise exception '총회·이사회 등 예산 승인 근거가 필요합니다.'; end if;
    if exists(select 1 from finance.reimbursement_periods
      where organization_id=p_org and extract(year from month)=plan.fiscal_year and status='CLOSED')
      or exists(select 1 from finance.budget_effective_entries(p_org) e
        where extract(year from e.month)=plan.fiscal_year and e.state in ('PENDING','RESERVED','USED')) then
      raise exception '집행·예약 또는 마감 기록이 있는 연도는 예산안을 덮어쓸 수 없습니다. 예산변경 절차를 사용해주세요.';
    end if;
    if exists(
      select 1 from approval.budgets b
      where b.organization_id=p_org and b.fiscal_year=plan.fiscal_year
        and not exists(
          select 1 from approval.budget_plan_version_items i
          where i.plan_id=plan.id
            and (i.budget_code is not null and i.budget_code=b.budget_code or i.budget_item=b.budget_item)
        )
    ) then raise exception '기존 확정예산 항목이 예산안에서 누락되었습니다.'; end if;

    for plan_item in select * from approval.budget_plan_version_items where plan_id=plan.id order by sort_order,id loop
      select * into target_row from approval.budgets b
      where b.organization_id=p_org and b.fiscal_year=plan.fiscal_year
        and ((plan_item.budget_code is not null and b.budget_code=plan_item.budget_code) or b.budget_item=plan_item.budget_item)
      order by case when b.budget_code=plan_item.budget_code then 0 else 1 end limit 1 for update;
      if found then
        update approval.budgets set
          budget_code=plan_item.budget_code,budget_item=plan_item.budget_item,
          plan_section=plan_item.plan_section,plan_item_label=plan_item.plan_item_label,
          mapping_status=plan_item.mapping_status,mapping_note=plan_item.mapping_note,
          approved_amount=plan_item.approved_amount,monthly_amount=plan_item.monthly_amount,
          calculation_basis=plan_item.calculation_basis,updated_at=now()
        where id=target_row.id returning * into target_row;
      else
        insert into approval.budgets(
          organization_id,fiscal_year,budget_code,budget_item,plan_section,plan_item_label,
          mapping_status,mapping_note,approved_amount,monthly_amount,executed_amount,calculation_basis
        ) values(
          p_org,plan.fiscal_year,plan_item.budget_code,plan_item.budget_item,plan_item.plan_section,
          plan_item.plan_item_label,plan_item.mapping_status,plan_item.mapping_note,
          plan_item.approved_amount,plan_item.monthly_amount,0,plan_item.calculation_basis
        ) returning * into target_row;
      end if;
      update approval.budget_plan_version_items set applied_budget_id=target_row.id,updated_at=now()
      where id=plan_item.id;
      if plan_item.source_budget_id is not null then
        insert into finance.expense_detail_items(
          budget_id,code,group_name,name,status,policy_note,quick_expense_eligible,aliases,sort_order,is_active
        )
        select target_row.id,d.code,d.group_name,d.name,d.status,d.policy_note,
          d.quick_expense_eligible,d.aliases,d.sort_order,d.is_active
        from finance.expense_detail_items d where d.budget_id=plan_item.source_budget_id
        on conflict(budget_id,code) do update set
          group_name=excluded.group_name,name=excluded.name,status=excluded.status,
          policy_note=excluded.policy_note,quick_expense_eligible=excluded.quick_expense_eligible,
          aliases=excluded.aliases,sort_order=excluded.sort_order,is_active=excluded.is_active,updated_at=now();
      end if;
    end loop;
    update approval.budget_plan_versions set status='ARCHIVED',updated_at=now()
    where organization_id=p_org and fiscal_year=plan.fiscal_year and status='ACTIVE' and id<>plan.id;
    update approval.budget_plan_versions set
      status='ACTIVE',title=coalesce(nullif(trim(p_data->>'title'),''),title),
      authority_reference=authority_value,notes=coalesce(p_data->>'notes',''),
      approved_by=p_actor,approved_at=now(),updated_at=now()
    where id=plan.id returning * into plan;
    after_data:=to_jsonb(plan);

  elsif p_command='CREATE_ADJUSTMENT' then
    v_fiscal_year:=nullif(p_data->>'fiscal_year','')::integer;
    amount_value:=nullif(p_data->>'amount','')::numeric;
    if v_fiscal_year is null or amount_value is null or amount_value<=0 or amount_value<>trunc(amount_value)
       or reason_value='' or authority_value='' then
      raise exception '예산변경 연도·금액·사유·근거를 확인해주세요.';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||v_fiscal_year::text,1));
    select coalesce(max((regexp_match(adjustment_no,'(\d+)$'))[1]::integer),0)+1
      into adjustment_number
    from approval.budget_adjustments a where a.organization_id=p_org and a.fiscal_year=v_fiscal_year;
    insert into approval.budget_adjustments(
      organization_id,fiscal_year,adjustment_no,adjustment_type,status,
      source_budget_id,target_budget_id,effective_month,amount,reason,authority_reference,requested_by
    ) values(
      p_org,v_fiscal_year,'예변-'||v_fiscal_year||'-'||lpad(adjustment_number::text,4,'0'),
      p_data->>'adjustment_type','DRAFT',nullif(p_data->>'source_budget_id','')::uuid,
      nullif(p_data->>'target_budget_id','')::uuid,(p_data->>'effective_month')::date,
      amount_value,reason_value,authority_value,p_actor
    ) returning * into adjustment;
    after_data:=to_jsonb(adjustment);

  elsif p_command in ('SUBMIT_ADJUSTMENT','CANCEL_ADJUSTMENT','APPROVE_ADJUSTMENT','REJECT_ADJUSTMENT') then
    select * into adjustment from approval.budget_adjustments
    where id=(p_data->>'id')::uuid and organization_id=p_org for update;
    if not found then raise exception '예산변경 문서를 찾을 수 없습니다.'; end if;
    before_data:=to_jsonb(adjustment);
    if p_command='SUBMIT_ADJUSTMENT' then
      if adjustment.status<>'DRAFT' then raise exception '제출 가능한 예산변경 문서가 아닙니다.'; end if;
      update approval.budget_adjustments set status='SUBMITTED',submitted_at=now(),updated_at=now()
      where id=adjustment.id returning * into adjustment;
    elsif p_command='CANCEL_ADJUSTMENT' then
      if adjustment.status<>'DRAFT' then raise exception '작성중인 예산변경만 취소할 수 있습니다.'; end if;
      update approval.budget_adjustments set status='CANCELLED',cancelled_at=now(),updated_at=now()
      where id=adjustment.id returning * into adjustment;
    elsif p_command='REJECT_ADJUSTMENT' then
      if adjustment.status<>'SUBMITTED' then raise exception '승인대기 예산변경만 반려할 수 있습니다.'; end if;
      if reason_value='' then raise exception '반려 사유가 필요합니다.'; end if;
      update approval.budget_adjustments set status='REJECTED',rejected_by=p_actor,
        rejected_at=now(),decision_note=reason_value,updated_at=now()
      where id=adjustment.id returning * into adjustment;
    else
      if adjustment.status<>'SUBMITTED' then raise exception '승인대기 예산변경만 승인할 수 있습니다.'; end if;
      if adjustment.source_budget_id is not null then
        select * into source_budget from approval.budgets
        where id=adjustment.source_budget_id and organization_id=p_org
          and fiscal_year=adjustment.fiscal_year for update;
        if not found then raise exception '차감할 예산항목이 해당 조직·연도와 일치하지 않습니다.'; end if;
      end if;
      if adjustment.target_budget_id is not null then
        select * into target_budget from approval.budgets
        where id=adjustment.target_budget_id and organization_id=p_org
          and fiscal_year=adjustment.fiscal_year for update;
        if not found then raise exception '증액할 예산항목이 해당 조직·연도와 일치하지 않습니다.'; end if;
        if target_budget.mapping_status<>'CONFIRMED' then
          raise exception '정책 확인이 완료된 대상 예산항목만 증액할 수 있습니다.';
        end if;
      end if;
      if adjustment.adjustment_type='RESERVE_USE'
         and coalesce(source_budget.budget_code,'')<>'OPERATING-RESERVE'
         and source_budget.budget_item<>'예비비' then
        raise exception '예비비 사용의 차감 예산은 예비비 항목이어야 합니다.';
      end if;
      if adjustment.source_budget_id is not null then
        annual_limit:=source_budget.approved_amount+approval.budget_adjustment_net(source_budget.id,null);
        monthly_limit:=source_budget.monthly_amount+approval.budget_adjustment_net(source_budget.id,adjustment.effective_month);
        select coalesce(sum(e.amount),0) into annual_committed
        from finance.budget_effective_entries(p_org) e
        where e.budget_id=source_budget.id and e.state in ('PENDING','RESERVED','USED');
        select coalesce(sum(e.amount),0) into monthly_committed
        from finance.budget_effective_entries(p_org) e
        where e.budget_id=source_budget.id and e.month=adjustment.effective_month
          and e.state in ('PENDING','RESERVED','USED');
        if annual_limit-annual_committed<adjustment.amount then
          raise exception '차감 예산의 연간 가용잔액이 부족합니다.';
        end if;
        if monthly_limit-monthly_committed<adjustment.amount then
          raise exception '차감 예산의 해당 월 가용잔액이 부족합니다.';
        end if;
      end if;
      update approval.budget_adjustments set status='APPROVED',approved_by=p_actor,
        approved_at=now(),decision_note=coalesce(p_data->>'decision_note',''),updated_at=now()
      where id=adjustment.id returning * into adjustment;
    end if;
    after_data:=to_jsonb(adjustment);
  else
    raise exception '지원하지 않는 예산관리 처리입니다.';
  end if;

  insert into finance.reimbursement_audit(
    organization_id,actor_id,action,reason,before_data,after_data
  ) values(
    p_org,p_actor,'BUDGET_GOVERNANCE_'||p_command,
    coalesce(nullif(reason_value,''),authority_value),before_data,after_data
  );
  return coalesce(after_data,'{}'::jsonb);
end;
$$;
revoke all on function approval.budget_governance_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function approval.budget_governance_command(uuid,uuid,text,jsonb) to service_role;

-- Approved budget changes affect both the annual ceiling and the selected month's ceiling.
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
 select b.id,b.budget_item,
 b.monthly_amount+approval.budget_adjustment_net(b.id,p_month) as monthly_amount,
 b.approved_amount+approval.budget_adjustment_net(b.id,null) as approved_amount,
 b.monthly_amount as base_monthly_amount,b.approved_amount as base_approved_amount,
 approval.budget_adjustment_net(b.id,p_month) as monthly_adjustment_amount,
 approval.budget_adjustment_net(b.id,null) as annual_adjustment_amount,
 b.executed_amount as annual_recorded_amount,
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

-- Preserve the current approved budgets as the first active, date-neutral snapshot.
with plan_rows as (
  insert into approval.budget_plan_versions(
    organization_id,fiscal_year,revision,status,title,authority_reference,notes
  )
  select b.organization_id,b.fiscal_year,1,'ACTIVE',b.fiscal_year::text||'년 기존 승인 예산',
    '기존 승인 예산 데이터 이관(승인일 미입력)','시스템 도입 전 승인예산의 최초 스냅샷'
  from approval.budgets b
  where b.organization_id is not null
  group by b.organization_id,b.fiscal_year
  on conflict(organization_id,fiscal_year,revision) do nothing
  returning id,organization_id,fiscal_year
)
insert into approval.budget_plan_version_items(
  plan_id,source_budget_id,applied_budget_id,budget_code,budget_item,plan_section,plan_item_label,
  mapping_status,mapping_note,approved_amount,monthly_amount,calculation_basis,sort_order
)
select p.id,b.id,b.id,b.budget_code,b.budget_item,b.plan_section,b.plan_item_label,
  b.mapping_status,b.mapping_note,b.approved_amount,b.monthly_amount,b.calculation_basis,
  row_number() over(partition by p.id order by coalesce(b.plan_section,''),coalesce(b.plan_item_label,b.budget_item),b.budget_item)*10
from plan_rows p join approval.budgets b
  on b.organization_id=p.organization_id and b.fiscal_year=p.fiscal_year;
