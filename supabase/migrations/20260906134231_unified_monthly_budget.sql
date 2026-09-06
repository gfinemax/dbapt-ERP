create table finance.budget_source_assignments (
 organization_id uuid not null references core.organizations(id),
 source_kind text not null check(source_kind in ('RESOLUTION','RESERVATION','QUICK','MANUAL')),
 source_id text not null,
 state text not null check(state in ('PENDING','RESERVED','USED','CANCELLED')),
 lines jsonb not null check(jsonb_typeof(lines)='array'),
 covered_amount numeric(16,0) not null default 0 check(covered_amount>=0),
 source_amount numeric(16,0) not null,
 source_signature text not null,
 revision integer not null default 1,
 actor_id uuid not null references auth.users(id),
 reason text not null,
 updated_at timestamptz not null default now(),
 primary key(organization_id,source_kind,source_id)
);
alter table finance.budget_source_assignments enable row level security;
revoke all on finance.budget_source_assignments from public,anon,authenticated;
grant all on finance.budget_source_assignments to service_role;
create policy server_only on finance.budget_source_assignments to service_role using(true) with check(true);

-- Stable source IDs, never names/amount/date similarity, establish the document chain.
create function finance.budget_sources(p_org uuid)
returns table(source_kind text,source_id text,title text,amount numeric,source_state text,suggested_month date,suggested_budget text,paid_at timestamptz,link_id text,signature text)
language sql stable security invoker set search_path='' as $$
 select 'RESOLUTION',r.id,r.resolution_no||' '||coalesce(r.subject,''),r.total_payment_amount,
 case when r.deleted_at is not null or r.approval_status in ('반려','취소') then 'CANCELLED' when r.approval_status='승인완료' then 'APPROVED' else 'PENDING' end,
 date_trunc('month',r.actual_expense_date)::date,r.resolution_data->>'budgetItem',r.disbursed_at,r.approval_document_id::text,
 md5(jsonb_build_array(r.total_payment_amount,r.approval_document_id,r.resolution_data->>'budgetItem',r.resolution_data->'accountAllocations',r.approval_status)::text)
 from finance.expense_resolutions r where r.organization_id=p_org
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

create function finance.budget_effective_entries(p_org uuid)
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
 ), dedup as (
 select n.* from normalized n where n.state<>'CANCELLED'
 and not (n.source_kind='RESERVATION' and exists(select 1 from normalized r where r.source_kind='RESOLUTION' and r.link_id=n.link_id and r.state in ('RESERVED','USED')))
 and not (n.source_kind='QUICK' and exists(select 1 from normalized r where r.source_kind='RESOLUTION' and r.source_id=n.link_id and r.state in ('RESERVED','USED')))
 )
 select source_kind,source_id,title,budget_id,month,amount,state,paid_at from dedup
 union all
 select 'PERSONAL',r.id::text,r.merchant||' '||r.purpose,r.budget_id,r.budget_month,r.amount,case when r.status='SUBMITTED' then 'PENDING' else 'USED' end,r.paid_at
 from finance.personal_reimbursements r where r.organization_id=p_org and r.status in ('SUBMITTED','APPROVED','PAID');
$$;

create function finance.budget_review_queue(p_org uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('source_kind',s.source_kind,'source_id',s.source_id,'title',s.title,'amount',s.amount,
 'source_state',s.source_state,'suggested_month',s.suggested_month,'suggested_budget',s.suggested_budget,'paid_at',s.paid_at,
 'signature',s.signature,'revision',coalesce(a.revision,0),'lines',coalesce(a.lines,'[]'::jsonb),'state',a.state,'covered_amount',coalesce(a.covered_amount,0),
 'needs_review',a.source_id is null or a.source_signature<>s.signature,'reason',case when a.source_id is null then '예산항목·귀속월 확인 필요' when a.source_signature<>s.signature then '원본 금액·배정 정보 변경 확인 필요' else '확인 완료' end)
 order by s.source_kind,s.title),'[]'::jsonb)
 from finance.budget_sources(p_org) s left join finance.budget_source_assignments a on a.organization_id=p_org and a.source_kind=s.source_kind and a.source_id=s.source_id
 where s.source_state<>'CANCELLED'
 and not (s.source_kind='QUICK' and exists(select 1 from finance.budget_effective_entries(p_org) e where e.source_kind='QUICK' and e.source_id=s.source_id) and a.source_id is null)
 and not (s.source_kind='RESERVATION' and exists(select 1 from finance.budget_sources(p_org) r join finance.budget_source_assignments ra on ra.organization_id=p_org and ra.source_kind='RESOLUTION' and ra.source_id=r.source_id
   where r.source_kind='RESOLUTION' and r.link_id=s.link_id and ra.state in ('USED','RESERVED') and r.source_state='APPROVED'));
$$;

create or replace function finance.reimbursement_budget_rows(p_org uuid,p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
 with entries as materialized(select * from finance.budget_effective_entries(p_org)),
 review as(select count(*) as n from jsonb_array_elements(finance.budget_review_queue(p_org)) x where (x->>'needs_review')::boolean),
 rows as(
 select b.id,b.budget_item,b.monthly_amount,b.approved_amount,b.executed_amount as annual_recorded_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='QUICK'),0) as quick_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='PERSONAL'),0) as personal_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='RESOLUTION'),0) as resolution_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='MANUAL'),0) as manual_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.paid_at is null and e.source_kind<>'MANUAL'),0) as unpaid_amount,
 coalesce(sum(e.amount) filter(where e.state='RESERVED'),0) as reserved_amount,
 coalesce(sum(e.amount) filter(where e.state='PENDING'),0) as pending_amount,
 (select n from review) as unresolved_count,
 coalesce((select sum(a.amount) from entries a where a.budget_id=b.id and a.state='USED'),0) as annual_used_amount,
 coalesce((select sum(a.amount) from entries a where a.budget_id=b.id and a.state='RESERVED'),0) as annual_reserved_amount
 from approval.budgets b left join entries e on e.budget_id=b.id and e.month=p_month
 where b.organization_id=p_org and b.fiscal_year=extract(year from p_month)
 group by b.id)
 select coalesce(jsonb_agg(to_jsonb(rows) order by budget_item),'[]'::jsonb) from rows;
$$;

create function finance.budget_assign_source(p_org uuid,p_actor uuid,p_data jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members%rowtype;s record;a finance.budget_source_assignments%rowtype;l jsonb;b approval.budgets%rowtype;
 state text:=p_data->>'state'; lines jsonb:=p_data->'lines'; reason text:=trim(coalesce(p_data->>'reason','')); total numeric; covered numeric:=coalesce((p_data->>'covered_amount')::numeric,0);
 months date[]; d date; u record; old_data jsonb; over_limit boolean:=false;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 select * into m from finance.reimbursement_members where organization_id=p_org and user_id=p_actor and active;
 if not found or not (m.permissions&&array['APPROVE','ADMIN']) then raise exception '예산 배정 승인 권한이 필요합니다.'; end if;
 select * into s from finance.budget_sources(p_org) where source_kind=p_data->>'source_kind' and source_id=p_data->>'source_id';
 if not found then raise exception '원본 지출을 찾을 수 없습니다.'; end if;
 if p_data->>'signature' is distinct from s.signature then raise exception '원본이 변경됐습니다. 새로고침 후 확인해주세요.'; end if;
 select * into a from finance.budget_source_assignments where organization_id=p_org and source_kind=s.source_kind and source_id=s.source_id for update;
 if coalesce(a.revision,0)<>coalesce((p_data->>'revision')::int,0) then raise exception '다른 담당자가 먼저 수정했습니다. 새로고침해주세요.'; end if;
 old_data:=to_jsonb(a);
 if reason='' or state is null or state not in ('PENDING','RESERVED','USED','CANCELLED') or lines is null or jsonb_typeof(lines)<>'array' then raise exception '상태·배정내역·사유가 필요합니다.'; end if;
 if s.source_state='CANCELLED' or s.source_state='REVIEW' then raise exception '원본의 취소·조정 상태를 먼저 확인해주세요.'; end if;
 if state='PENDING' and s.source_state<>'PENDING' then raise exception '승인된 원본은 예약 또는 실제 사용으로 배정해주세요.'; end if;
 if state='USED' and not coalesce((p_data->>'evidence_verified')::boolean,false) then raise exception '실제 사용 증빙 확인이 필요합니다.'; end if;
 if state='USED' and (s.source_state<>'APPROVED' or s.source_kind='RESERVATION') then raise exception '승인 완료된 실제 사용분만 사용액으로 반영할 수 있습니다.'; end if;
 if s.source_kind='MANUAL' and state<>'USED' then raise exception '수기 집행액은 기존 기록과 대조한 뒤 사용액으로 배정해주세요.'; end if;
 if s.paid_at is not null and state='CANCELLED' then raise exception '지급된 지출은 지급 취소·환급 검토가 먼저 필요합니다.'; end if;
 if state='CANCELLED' and not(m.permissions&&array['CLOSE','ADMIN']) then raise exception '예산 취소 권한이 필요합니다.'; end if;
 if s.source_kind<>'MANUAL' and covered<>0 then raise exception '수기 집행액만 중복 확인 금액을 지정할 수 있습니다.'; end if;
 if covered<0 then raise exception '중복 확인 금액은 음수일 수 없습니다.'; end if;
 select coalesce(sum((x->>'amount')::numeric),0) into total from jsonb_array_elements(lines)x;
 if total+covered<>s.amount then raise exception '배정액과 중복 확인 금액의 합계가 원본 금액과 일치해야 합니다.'; end if;
 for l in select * from jsonb_array_elements(lines) loop
   if nullif(l->>'amount','') is null or nullif(l->>'month','') is null or nullif(l->>'budget_id','') is null then raise exception '각 배정의 금액·귀속월·예산항목이 필요합니다.'; end if;
   if (l->>'amount')::numeric<=0 or (l->>'amount')::numeric<>trunc((l->>'amount')::numeric) then raise exception '배정 금액은 1원 이상의 정수여야 합니다.'; end if;
   d:=(l->>'month')::date;
   if extract(day from d)<>1 then raise exception '예산 귀속월은 월의 첫날이어야 합니다.'; end if;
   select * into b from approval.budgets where id=(l->>'budget_id')::uuid and organization_id=p_org and fiscal_year=extract(year from d) for update;
   if not found then raise exception '해당 귀속 연도의 예산항목이 아닙니다.'; end if;
   if state='USED' and s.source_kind<>'MANUAL' and (nullif(l->>'used_on','') is null or date_trunc('month',(l->>'used_on')::date)::date<>d or (l->>'used_on')::date>(now() at time zone 'Asia/Seoul')::date) then raise exception '실제 사용일과 예산 귀속월을 확인해주세요.'; end if;
   if not exists(select 1 from finance.reimbursement_periods where organization_id=p_org and month=d) then raise exception '배정할 월을 먼저 개설해주세요.'; end if;
 end loop;
 select array_agg(distinct (x->>'month')::date) into months from jsonb_array_elements(lines||coalesce(a.lines,'[]'::jsonb))x;
 if exists(select 1 from finance.reimbursement_periods where organization_id=p_org and month=any(months) and status='CLOSED') and not(m.permissions&&array['CLOSE','ADMIN']) then raise exception '마감된 월의 수정 권한이 필요합니다.'; end if;
 insert into finance.budget_source_assignments values(p_org,s.source_kind,s.source_id,state,lines,covered,s.amount,s.signature,coalesce(a.revision,0)+1,p_actor,reason,now())
 on conflict(organization_id,source_kind,source_id) do update set state=excluded.state,lines=excluded.lines,covered_amount=excluded.covered_amount,source_amount=excluded.source_amount,source_signature=excluded.source_signature,revision=excluded.revision,actor_id=excluded.actor_id,reason=excluded.reason,updated_at=now();
 for d in select unnest(months) loop
   for l in select * from jsonb_array_elements(finance.reimbursement_budget_rows(p_org,d)) x where exists(select 1 from jsonb_array_elements(lines) y where y->>'budget_id'=x->>'id') loop
     if (l->>'quick_amount')::numeric+(l->>'personal_amount')::numeric+(l->>'resolution_amount')::numeric+(l->>'manual_amount')::numeric+(l->>'reserved_amount')::numeric>(l->>'monthly_amount')::numeric
       or (l->>'annual_used_amount')::numeric+(l->>'annual_reserved_amount')::numeric>(l->>'approved_amount')::numeric then over_limit:=true; end if;
   end loop;
 end loop;
 if over_limit and not(coalesce((p_data->>'approve_over_budget')::boolean,false) and m.permissions&&array['SENIOR','ADMIN']) then raise exception '예산 초과를 확인한 추가 승인이 필요합니다.'; end if;
 insert into finance.reimbursement_audit(organization_id,actor_id,action,reason,before_data,after_data)
 values(p_org,p_actor,'BUDGET_ASSIGNMENT',reason,old_data,p_data);
 for d in select unnest(months) loop
   if exists(select 1 from finance.reimbursement_periods where organization_id=p_org and month=d and status='CLOSED') then perform finance.reimbursement_snapshot(p_org,d,p_actor,reason); end if;
 end loop;
end;$$;

-- Preserve versioned reports; every source kind uses the same rows and detail entries.
create or replace function finance.reimbursement_snapshot(p_org uuid,p_month date,p_actor uuid,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare v_revision integer;
begin
 update finance.reimbursement_periods set revision=revision+1,closed_at=now(),status='CLOSED' where organization_id=p_org and month=p_month returning revision into v_revision;
 insert into finance.reimbursement_reports(organization_id,month,revision,snapshot,reason,actor_id)
 values(p_org,p_month,v_revision,jsonb_build_object('schema_version',2,'review',finance.budget_review_queue(p_org),'budgets',finance.reimbursement_budget_rows(p_org,p_month),
 'entries',coalesce((select jsonb_agg(to_jsonb(e)) from finance.budget_effective_entries(p_org)e where month=p_month),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'used_on',used_on,'amount',amount,'budget_id',budget_id,'status',status)) from finance.personal_reimbursements where organization_id=p_org and budget_month=p_month and status in ('APPROVED','PAID')),'[]'::jsonb)),p_reason,p_actor);
end;$$;

create function finance.unified_budget_totals(p_month date) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(x),'[]'::jsonb) from (select distinct organization_id,fiscal_year from approval.budgets) o
 cross join lateral jsonb_array_elements(finance.reimbursement_budget_rows(o.organization_id,make_date(o.fiscal_year,extract(month from p_month)::int,1)))x;
$$;

create or replace function finance.guard_quick_expense_budget() returns trigger language plpgsql security invoker set search_path='' as $$
 declare b approval.budgets%rowtype; month_start date; used numeric;
begin
 if new.record_status<>'RECORDED' then return new; end if;
 if tg_op='UPDATE' and row(old.amount,old.budget_item,old.occurred_at,old.record_status,old.organization_id) is not distinct from row(new.amount,new.budget_item,new.occurred_at,new.record_status,new.organization_id) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,0));
 month_start:=date_trunc('month',new.occurred_at at time zone 'Asia/Seoul')::date;
 select * into b from approval.budgets where organization_id=new.organization_id and budget_item=new.budget_item and fiscal_year=extract(year from month_start) for update;
 if not found or b.monthly_amount<=0 then raise exception '승인된 월 예산이 없어 정식 지출결의가 필요합니다.'; end if;
 if exists(select 1 from jsonb_array_elements(finance.budget_review_queue(new.organization_id))x where (x->>'needs_review')::boolean) then raise exception '미확인 예산 귀속을 먼저 확인하거나 정식 지출결의로 처리해주세요.'; end if;
 select coalesce(sum(amount),0) into used from finance.budget_effective_entries(new.organization_id) where budget_id=b.id and month=month_start and state in ('USED','RESERVED') and not(source_kind='QUICK' and source_id=new.id::text);
 if used+new.amount>b.monthly_amount then raise exception '이번 달 승인예산 잔액을 초과해 정식 지출결의가 필요합니다.'; end if;
 select coalesce(sum(amount),0) into used from finance.budget_effective_entries(new.organization_id) where budget_id=b.id and state in ('USED','RESERVED') and not(source_kind='QUICK' and source_id=new.id::text);
 if used+new.amount>b.approved_amount then raise exception '연간 승인예산 잔액을 초과해 정식 지출결의가 필요합니다.'; end if;
 return new;
end;$$;

do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='finance' and (p.proname like 'budget_%' or p.proname='unified_budget_totals') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end$$;

create or replace function finance.reimbursement_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 m finance.reimbursement_members%rowtype; r finance.personal_reimbursements%rowtype; old_r jsonb;
 p finance.reimbursement_periods%rowtype; cfg finance.reimbursement_policies%rowtype;
 b approval.budgets%rowtype; q finance.quick_expense_records%rowtype; tx finance.bank_transactions%rowtype;
 v_month date; v_today date := (now() at time zone 'Asia/Seoul')::date;
 v_reason text := trim(coalesce(p_data->>'reason','')); v_total numeric; v_reserved numeric; v_role text;
 v_id uuid; v_before jsonb; v_after jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 select * into m from finance.reimbursement_members where organization_id=p_org and user_id=p_actor and active;
 if not found then raise exception '정산 업무 접근 권한이 없습니다.'; end if;
 if p_command in ('POLICY','MEMBER') then
   if not ('ADMIN'=any(m.permissions)) then raise exception '관리자 권한이 필요합니다.'; end if;
   if p_command='POLICY' then
     select to_jsonb(t) into v_before from finance.reimbursement_policies t where organization_id=p_org;
     insert into finance.reimbursement_policies values(p_org,(p_data->>'submission_day')::int,(p_data->>'completion_day')::int,(p_data->>'long_delay_days')::int,now())
     on conflict (organization_id) do update set submission_day=excluded.submission_day,completion_day=excluded.completion_day,long_delay_days=excluded.long_delay_days,updated_at=now();
   else
     if (p_data->>'user_id')::uuid=p_actor then raise exception '본인 권한은 이 화면에서 변경할 수 없습니다.'; end if;
     select to_jsonb(t) into v_before from finance.reimbursement_members t where organization_id=p_org and user_id=(p_data->>'user_id')::uuid;
     insert into finance.reimbursement_members values(p_org,(p_data->>'user_id')::uuid,trim(p_data->>'display_name'),
       array(select jsonb_array_elements_text(p_data->'permissions')),(p_data->>'active')::boolean)
     on conflict (organization_id,user_id) do update set display_name=excluded.display_name,permissions=excluded.permissions,active=excluded.active;
   end if;
   v_after:=p_data;
 elsif p_command='OPEN' then
   if not ('CLOSE'=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '마감 권한이 필요합니다.'; end if;
   v_month:=(p_data->>'month')::date;
   if extract(day from v_month)<>1 or extract(year from v_month)<>extract(year from v_today) or v_month>v_today then raise exception '올해의 현재 월 또는 이전 월만 개설할 수 있습니다.'; end if;
   select * into cfg from finance.reimbursement_policies where organization_id=p_org;
   if not found then raise exception '제출·보완 마감일과 장기 지연 기준을 먼저 설정해주세요.'; end if;
   insert into finance.reimbursement_periods(organization_id,month,submission_deadline,completion_deadline,long_delay_days)
   values(p_org,v_month,(v_month+interval '1 month')::date+cfg.submission_day-1,(v_month+interval '1 month')::date+cfg.completion_day-1,cfg.long_delay_days);
   v_after:=p_data;
 elsif p_command in ('SUPPLEMENT','CLOSE') then
   if not ('CLOSE'=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '마감 권한이 필요합니다.'; end if;
   v_month:=(p_data->>'month')::date;
   select * into p from finance.reimbursement_periods where organization_id=p_org and month=v_month for update;
   if not found or p.status='CLOSED' then raise exception '접수 중인 월만 처리할 수 있습니다.'; end if;
   if v_reason='' then raise exception '처리 사유가 필요합니다.'; end if;
   v_before:=to_jsonb(p);
   if p_command='CLOSE' then
     if v_today<=p.completion_deadline then raise exception '보완 마감일이 지난 뒤 마감해주세요.'; end if;
     if exists(select 1 from finance.personal_reimbursements where organization_id=p_org and budget_month=v_month and status='SUBMITTED') then raise exception '심사 중인 정산을 먼저 처리해주세요.'; end if;
     if exists(select 1 from jsonb_array_elements(finance.budget_review_queue(p_org))x where (x->>'needs_review')::boolean) then raise exception '귀속 확인이 필요한 원본을 먼저 배정해주세요.'; end if;
     perform finance.reimbursement_snapshot(p_org,v_month,p_actor,v_reason);
   else update finance.reimbursement_periods set status='SUPPLEMENT' where organization_id=p_org and month=v_month;
   end if;
   select to_jsonb(t) into v_after from finance.reimbursement_periods t where organization_id=p_org and month=v_month;
 elsif p_command='SUBMIT' then
   v_id:=(p_data->>'id')::uuid;
   if exists(select 1 from finance.personal_reimbursements where id=v_id and organization_id=p_org and applicant_id=p_actor) then return jsonb_build_object('id',v_id); end if;
   v_month:=date_trunc('month',(p_data->>'used_on')::date)::date;
   if extract(year from v_month)<>extract(year from v_today) or (p_data->>'used_on')::date>v_today then raise exception '올해 실제 사용분만 신청할 수 있습니다. 전년도분은 별도 회계 검토가 필요합니다.'; end if;
   select * into p from finance.reimbursement_periods where organization_id=p_org and month=v_month for update;
   if not found then raise exception '해당 사용월의 접수 기간을 먼저 개설해주세요.'; end if;
   if (v_today>p.submission_deadline or p.status='CLOSED' or v_today-(p_data->>'used_on')::date>p.long_delay_days) and trim(coalesce(p_data->>'delay_reason',''))='' then raise exception '지연 정산 사유가 필요합니다.'; end if;
   select * into b from approval.budgets where id=(p_data->>'budget_id')::uuid and organization_id=p_org and fiscal_year=extract(year from v_month);
   if not found then raise exception '해당 연도의 예산항목이 아닙니다.'; end if;
   if not exists(select 1 from storage.objects where bucket_id='personal-reimbursements' and name=p_data->>'evidence_path'
      and name like p_org::text||'/'||p_actor::text||'/'||v_id::text||'/%') then raise exception '저장된 증빙이 필요합니다.'; end if;
   if length(coalesce(p_data->>'evidence_hash',''))<>64 then raise exception '증빙 확인값이 필요합니다.'; end if;
   if nullif(p_data->>'source_quick_id','') is not null then
     if not ('APPROVE'=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '기존 선지출 연결은 정산 담당자가 확인해야 합니다.'; end if;
     select * into q from finance.quick_expense_records where id=(p_data->>'source_quick_id')::uuid and organization_id=p_org for update;
     if not found or q.payment_method<>'PERSONAL_PREPAID' or q.record_status='CONVERTED' or q.linked_resolution_id is not null
       or q.amount<>(p_data->>'amount')::numeric or q.budget_item<>b.budget_item or (q.occurred_at at time zone 'Asia/Seoul')::date<>(p_data->>'used_on')::date
       then raise exception '기존 개인 선지출의 날짜·금액·예산항목과 일치해야 합니다.'; end if;
   elsif exists(select 1 from finance.quick_expense_records where organization_id=p_org and payment_method='PERSONAL_PREPAID'
      and amount=(p_data->>'amount')::numeric and (occurred_at at time zone 'Asia/Seoul')::date=(p_data->>'used_on')::date and record_status<>'CONVERTED') then
     raise exception '같은 날짜·금액의 기존 개인 선지출을 연결해 중복 등록을 확인해주세요.';
   end if;
   if exists(select 1 from finance.personal_reimbursements where organization_id=p_org and applicant_id=p_actor and used_on=(p_data->>'used_on')::date
     and amount=(p_data->>'amount')::numeric and merchant=trim(p_data->>'merchant') and status not in ('REJECTED','CANCELLED')) then raise exception '동일한 개인 지출이 이미 신청되어 있습니다.'; end if;
   insert into finance.personal_reimbursements(id,organization_id,applicant_id,budget_id,used_on,budget_month,amount,merchant,purpose,evidence_path,evidence_hash,delay_reason,source_quick_id,needs_exception,needs_senior)
   values(v_id,p_org,p_actor,b.id,(p_data->>'used_on')::date,v_month,(p_data->>'amount')::numeric,trim(p_data->>'merchant'),trim(p_data->>'purpose'),p_data->>'evidence_path',p_data->>'evidence_hash',coalesce(p_data->>'delay_reason',''),q.id,
     v_today>p.submission_deadline or p.status='CLOSED',v_today-(p_data->>'used_on')::date>p.long_delay_days) returning to_jsonb(personal_reimbursements.*) into v_after;
 else
   select * into r from finance.personal_reimbursements where id=(p_data->>'id')::uuid and organization_id=p_org for update;
   if not found then raise exception '정산 신청을 찾을 수 없습니다.'; end if;
   v_id:=r.id; old_r:=to_jsonb(r); v_before:=old_r;
   select * into p from finance.reimbursement_periods where organization_id=p_org and month=r.budget_month for update;
   if p_command in ('EXCEPTION','SENIOR','OVER_BUDGET','APPROVE','REJECT') and r.applicant_id=p_actor then raise exception '본인 신청은 다른 승인자가 검토해야 합니다.'; end if;
   v_role:=case when p_command in ('SENIOR','OVER_BUDGET') then 'SENIOR' when p_command in ('PAY','REVERSE_PAYMENT') then 'PAY'
     when p_command='APPROVE' and p.status='CLOSED' then 'CLOSE' when p_command='CANCEL' and r.status='APPROVED' then 'CLOSE' else 'APPROVE' end;
   if not (p_command='CANCEL' and r.status='SUBMITTED' and r.applicant_id=p_actor) and not (v_role=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '이 처리에 필요한 권한이 없습니다.'; end if;
   if v_reason='' then raise exception '승인·반려·취소 사유를 남겨주세요.'; end if;
   if p_command in ('EXCEPTION','SENIOR','OVER_BUDGET','APPROVE','REJECT') and r.status<>'SUBMITTED' then raise exception '심사 중인 신청만 처리할 수 있습니다.'; end if;
   if p_command='EXCEPTION' then
     update finance.personal_reimbursements set exception_approved_at=now() where id=r.id;
   elsif p_command='SENIOR' then
     update finance.personal_reimbursements set senior_approved_at=now() where id=r.id;
   elsif p_command='OVER_BUDGET' then
     update finance.personal_reimbursements set over_budget_approved_at=now() where id=r.id;
   elsif p_command='APPROVE' then
     if extract(year from r.budget_month)<>extract(year from v_today) then raise exception '전년도 정산은 별도 회계 검토가 필요합니다.'; end if;
     if r.needs_exception and r.exception_approved_at is null then raise exception '지연 정산 예외 승인이 먼저 필요합니다.'; end if;
     if r.needs_senior and r.senior_approved_at is null then raise exception '장기 지연 추가 승인이 먼저 필요합니다.'; end if;
     select * into b from approval.budgets where id=r.budget_id for update;
     if exists(select 1 from jsonb_array_elements(finance.budget_review_queue(p_org))x where (x->>'needs_review')::boolean and not(x->>'source_kind'='QUICK' and x->>'source_id'=coalesce(r.source_quick_id::text,''))) then raise exception '귀속 확인이 필요한 원본을 먼저 배정해주세요.'; end if;
     select coalesce(sum(amount),0) into v_total from finance.budget_effective_entries(p_org) where budget_id=b.id and month=r.budget_month and state in ('USED','RESERVED') and not(source_kind='QUICK' and source_id=coalesce(r.source_quick_id::text,''));
     select coalesce(sum(amount),0) into v_reserved from finance.budget_effective_entries(p_org) where budget_id=b.id and state in ('USED','RESERVED') and not(source_kind='QUICK' and source_id=coalesce(r.source_quick_id::text,''));
     if (v_total+r.amount>b.monthly_amount or v_reserved+r.amount>b.approved_amount)
       and r.over_budget_approved_at is null then raise exception '예산 초과 추가 승인이 필요합니다.'; end if;
     perform set_config('finance.reimbursement_mutation','on',true);
     if r.source_quick_id is not null then update finance.quick_expense_records set record_status='CONVERTED',updated_at=now() where id=r.source_quick_id; end if;
     update finance.personal_reimbursements set status='APPROVED',approved_at=now() where id=r.id;
     if p.status='CLOSED' then perform finance.reimbursement_snapshot(p_org,r.budget_month,p_actor,v_reason); end if;
   elsif p_command='REJECT' then update finance.personal_reimbursements set status='REJECTED' where id=r.id;
   elsif p_command='CANCEL' then
     if r.status not in ('SUBMITTED','APPROVED') then raise exception '지급 전 신청만 취소할 수 있습니다. 지급 연결을 먼저 취소해주세요.'; end if;
     update finance.personal_reimbursements set status='CANCELLED' where id=r.id;
     if p.status='CLOSED' and r.status='APPROVED' then perform finance.reimbursement_snapshot(p_org,r.budget_month,p_actor,v_reason); end if;
   elsif p_command='PAY' then
     if r.status<>'APPROVED' then raise exception '예산 반영이 승인된 신청만 지급 연결할 수 있습니다.'; end if;
     select * into tx from finance.bank_transactions where id=(p_data->>'bank_transaction_id')::uuid and organization_id=p_org and deleted_at is null for update;
     if not found or tx.withdrawal_amount<>r.amount or tx.deposit_amount<>0 or (tx.transacted_at at time zone 'Asia/Seoul')::date<r.used_on or tx.transacted_at>now() then raise exception '사용일 이후의 동일 금액 출금거래를 선택해주세요.'; end if;
     if exists(select 1 from finance.expense_resolutions where bank_transaction_id=tx.id and deleted_at is null)
       or exists(select 1 from finance.quick_expense_records where bank_transaction_id=tx.id)
       or exists(select 1 from finance.personal_reimbursements where bank_transaction_id=tx.id) then raise exception '이미 다른 지출에 연결된 출금거래입니다.'; end if;
     update finance.personal_reimbursements set status='PAID',paid_at=tx.transacted_at,bank_transaction_id=tx.id where id=r.id;
   elsif p_command='REVERSE_PAYMENT' then
     if r.status<>'PAID' then raise exception '지급 연결된 신청만 연결 취소할 수 있습니다.'; end if;
     update finance.personal_reimbursements set status='APPROVED',paid_at=null,bank_transaction_id=null where id=r.id;
   else raise exception '지원하지 않는 처리입니다.';
   end if;
   select to_jsonb(t) into v_after from finance.personal_reimbursements t where id=r.id;
 end if;
 insert into finance.reimbursement_audit(organization_id,request_id,actor_id,action,reason,before_data,after_data)
 values(p_org,v_id,p_actor,p_command,v_reason,v_before,v_after);
 return coalesce(v_after,'{}'::jsonb);
end; $$;


-- Cash settlement does not change budget allocation. Closed source changes require the audited allocation path.
create function finance.budget_guard_source() returns trigger language plpgsql security invoker set search_path='' as $$
declare j jsonb:=to_jsonb(old); n jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 org uuid; kind text; assigned finance.budget_source_assignments%rowtype; budget_change boolean; payment_change boolean;
begin
 if tg_table_name='expense_resolutions' then
   org:=(j->>'organization_id')::uuid;kind:='RESOLUTION';
   budget_change:=tg_op='DELETE' or (j->'organization_id',j->'total_payment_amount',j->'approval_status',j->'deleted_at',j->'approval_document_id',j->'actual_expense_date',j->'resolution_data'->'budgetItem',j->'resolution_data'->'accountAllocations')
    is distinct from (n->'organization_id',n->'total_payment_amount',n->'approval_status',n->'deleted_at',n->'approval_document_id',n->'actual_expense_date',n->'resolution_data'->'budgetItem',n->'resolution_data'->'accountAllocations');
   payment_change:=tg_op='UPDATE' and n->>'disbursed_at' is not null and (j->'disbursed_at',j->'payment_status') is distinct from (n->'disbursed_at',n->'payment_status');
 elsif tg_table_name='budget_reservations' then
   select organization_id into org from approval.documents where id=(j->>'document_id')::uuid;kind:='RESERVATION';
   budget_change:=tg_op='DELETE' or (j->'amount',j->'released_amount',j->'budget_id',j->'document_id',j->'status') is distinct from (n->'amount',n->'released_amount',n->'budget_id',n->'document_id',n->'status');
   if n->>'status'='CONSUMED' and exists(select 1 from finance.budget_sources(org)s join finance.budget_source_assignments a on a.organization_id=org and a.source_kind='RESOLUTION' and a.source_id=s.source_id where s.source_kind='RESOLUTION' and s.link_id=j->>'document_id' and a.state='USED' and a.source_signature=s.signature) then return new; end if;
 else
   org:=(j->>'organization_id')::uuid;kind:='QUICK';
   budget_change:=tg_op='DELETE' or (j->'organization_id',j->'amount',j->'budget_item',j->'occurred_at',j->'record_status',j->'linked_resolution_id') is distinct from (n->'organization_id',n->'amount',n->'budget_item',n->'occurred_at',n->'record_status',n->'linked_resolution_id');
   if current_setting('finance.reimbursement_mutation',true)='on' then return new; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 select * into assigned from finance.budget_source_assignments where organization_id=org and source_kind=kind and source_id=j->>'id';
 if payment_change and exists(select 1 from finance.reimbursement_policies where organization_id=org) then
   if assigned.state is distinct from 'USED' or not exists(select 1 from finance.budget_sources(org) s where s.source_kind=kind and s.source_id=assigned.source_id and s.signature=assigned.source_signature) then raise exception '월 예산·마감의 예산 배정에서 실제 사용분을 확인한 뒤 지급해주세요.'; end if;
 end if;
 if budget_change and assigned.state is distinct from 'CANCELLED' and exists(select 1 from jsonb_array_elements(assigned.lines) l join finance.reimbursement_periods p on p.organization_id=org and p.month=(l->>'month')::date and p.status='CLOSED') then raise exception '마감된 월의 원본 금액·상태는 직접 변경할 수 없습니다. 월 예산·마감에서 사유를 남겨 배정을 수정하거나 취소해주세요.'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end;$$;
create trigger aaa_unified_budget_source before update or delete on finance.expense_resolutions for each row execute function finance.budget_guard_source();
create trigger aaa_unified_budget_source before update or delete on approval.budget_reservations for each row execute function finance.budget_guard_source();
create trigger aab_unified_budget_source before update or delete on finance.quick_expense_records for each row execute function finance.budget_guard_source();
revoke all on function finance.budget_guard_source() from public,anon,authenticated;
grant execute on function finance.budget_guard_source() to service_role;
