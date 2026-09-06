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


create or replace function finance.budget_review_queue(p_org uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('source_kind',s.source_kind,'source_id',s.source_id,'title',s.title,'amount',s.amount,
 'source_state',s.source_state,'suggested_month',s.suggested_month,'suggested_budget',s.suggested_budget,'paid_at',s.paid_at,
 'signature',s.signature,'revision',coalesce(a.revision,0),'lines',coalesce(a.lines,'[]'::jsonb),'state',a.state,'covered_amount',coalesce(a.covered_amount,0),
 'needs_review',a.source_id is null or a.source_signature<>s.signature,'reason',case when a.source_id is null then '예산항목·귀속월 확인 필요' when a.source_signature<>s.signature then '원본 금액·배정 정보 변경 확인 필요' else '확인 완료' end)
 order by s.source_kind,s.title),'[]'::jsonb)
 from finance.budget_sources(p_org) s left join finance.budget_source_assignments a on a.organization_id=p_org and a.source_kind=s.source_kind and a.source_id=s.source_id
 where s.source_state<>'CANCELLED'
 and not (s.source_kind='QUICK' and exists(select 1 from finance.budget_effective_entries(p_org) e where e.source_kind='QUICK' and e.source_id=s.source_id) and a.source_id is null)
 and not (s.source_kind='QUICK' and exists(select 1 from finance.budget_effective_entries(p_org)e where e.source_kind='RESOLUTION' and e.source_id=s.link_id and e.state in ('RESERVED','USED')))
 and not (s.source_kind='RESERVATION' and exists(select 1 from finance.budget_sources(p_org) r join finance.budget_source_assignments ra on ra.organization_id=p_org and ra.source_kind='RESOLUTION' and ra.source_id=r.source_id
   where r.source_kind='RESOLUTION' and r.link_id=s.link_id and ra.state in ('USED','RESERVED') and r.source_state='APPROVED' and (select coalesce(sum(e.amount),0) from finance.budget_effective_entries(p_org)e where e.source_kind='RESOLUTION' and e.source_id=r.source_id)>=s.amount));
$$;


create or replace function finance.budget_assign_source(p_org uuid,p_actor uuid,p_data jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members%rowtype;s record;a finance.budget_source_assignments%rowtype;l jsonb;b approval.budgets%rowtype;
 state text:=p_data->>'state'; lines jsonb:=p_data->'lines'; reason text:=trim(coalesce(p_data->>'reason','')); total numeric; covered numeric:=coalesce((p_data->>'covered_amount')::numeric,0);
 months date[]; d date; u record; old_data jsonb; over_limit boolean:=false; before_months jsonb; after_months jsonb;
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
 select coalesce(jsonb_object_agg(month,entries),'{}'::jsonb) into before_months from (select month,jsonb_agg(to_jsonb(e) order by source_kind,source_id,budget_id,amount,state,paid_at) as entries from finance.budget_effective_entries(p_org)e group by month)t;
 if reason='' or state is null or state not in ('PENDING','RESERVED','USED','CANCELLED') or lines is null or jsonb_typeof(lines)<>'array' then raise exception '상태·배정내역·사유가 필요합니다.'; end if;
 if s.source_state='CANCELLED' or s.source_state='REVIEW' then raise exception '원본의 취소·조정 상태를 먼저 확인해주세요.'; end if;
 if state='PENDING' and s.source_state<>'PENDING' then raise exception '승인된 원본은 예약 또는 실제 사용으로 배정해주세요.'; end if;
 if state='USED' and not coalesce((p_data->>'evidence_verified')::boolean,false) then raise exception '실제 사용 증빙 확인이 필요합니다.'; end if;
 if state='USED' and (s.source_state<>'APPROVED' or s.source_kind='RESERVATION') then raise exception '승인 완료된 실제 사용분만 사용액으로 반영할 수 있습니다.'; end if;
 if s.source_kind='MANUAL' and state<>'USED' then raise exception '수기 집행액은 기존 기록과 대조한 뒤 사용액으로 배정해주세요.'; end if;
 if s.paid_at is not null and state<>'USED' then raise exception '이미 지급된 원본은 실제 사용 상태를 유지해야 합니다.'; end if;
 if state='CANCELLED' and not(m.permissions&&array['CLOSE','ADMIN']) then raise exception '예산 취소 권한이 필요합니다.'; end if;
 if s.source_kind<>'MANUAL' and covered<>0 then raise exception '수기 집행액만 중복 확인 금액을 지정할 수 있습니다.'; end if;
 if covered<>trunc(covered) then raise exception '중복 확인 금액은 정수여야 합니다.'; end if;
 if s.source_kind='MANUAL' then
 if covered>coalesce((select sum(e.amount) from finance.budget_effective_entries(p_org)e where e.budget_id=s.source_id::uuid and e.source_kind<>'MANUAL' and e.state='USED'),0) then raise exception '동일 예산항목에 확인된 기존 사용액보다 큰 금액을 중복으로 제외할 수 없습니다.'; end if;
 end if;
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
   if s.source_kind='MANUAL' and b.id::text<>s.source_id then raise exception '수기 집행액은 원래 예산항목에 배정해주세요.'; end if;
   if state='USED' and s.source_kind<>'MANUAL' and (nullif(l->>'used_on','') is null or date_trunc('month',(l->>'used_on')::date)::date<>d or (l->>'used_on')::date>(now() at time zone 'Asia/Seoul')::date) then raise exception '실제 사용일과 예산 귀속월을 확인해주세요.'; end if;
   if not exists(select 1 from finance.reimbursement_periods where organization_id=p_org and month=d) then raise exception '배정할 월을 먼저 개설해주세요.'; end if;
 end loop;
 select array_agg(distinct (x->>'month')::date) into months from jsonb_array_elements(lines||coalesce(a.lines,'[]'::jsonb))x;
 if exists(select 1 from finance.reimbursement_periods where organization_id=p_org and month=any(months) and status='CLOSED') and not(m.permissions&&array['CLOSE','ADMIN']) then raise exception '마감된 월의 수정 권한이 필요합니다.'; end if;
 insert into finance.budget_source_assignments values(p_org,s.source_kind,s.source_id,state,lines,covered,s.amount,s.signature,coalesce(a.revision,0)+1,p_actor,reason,now())
 on conflict(organization_id,source_kind,source_id) do update set state=excluded.state,lines=excluded.lines,covered_amount=excluded.covered_amount,source_amount=excluded.source_amount,source_signature=excluded.source_signature,revision=excluded.revision,actor_id=excluded.actor_id,reason=excluded.reason,updated_at=now();

 select coalesce(jsonb_object_agg(month,entries),'{}'::jsonb) into after_months from (select month,jsonb_agg(to_jsonb(e) order by source_kind,source_id,budget_id,amount,state,paid_at) as entries from finance.budget_effective_entries(p_org)e group by month)t;
 select array_agg(distinct d) into months from (
 select unnest(months) as d union select coalesce(b.key,a.key)::date from jsonb_each(before_months)b full join jsonb_each(after_months)a on b.key=a.key where b.value is distinct from a.value
 ) affected;
 if exists(select 1 from finance.reimbursement_periods where organization_id=p_org and month=any(months) and status='CLOSED') and not(m.permissions&&array['CLOSE','ADMIN']) then raise exception '연결된 원본의 마감 월도 변경되므로 마감 수정 권한이 필요합니다.'; end if;
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



create or replace function finance.budget_guard_source() returns trigger language plpgsql security invoker set search_path='' as $$
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
   if n->>'status'='CONSUMED' and not exists(select 1 from finance.budget_effective_entries(org)e where e.source_kind='RESERVATION' and e.source_id=j->>'id' and e.state='RESERVED') and exists(select 1 from finance.budget_sources(org)s join finance.budget_source_assignments a on a.organization_id=org and a.source_kind='RESOLUTION' and a.source_id=s.source_id where s.source_kind='RESOLUTION' and s.link_id=j->>'document_id' and a.state='USED' and a.source_signature=s.signature) then return new; end if;
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

-- Return the entire month as one JSON value so API row limits cannot truncate drill-down details.
create function finance.budget_month_entries(p_org uuid,p_month date) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(e) order by source_kind,source_id,budget_id,amount),'[]'::jsonb) from finance.budget_effective_entries(p_org)e where month=p_month;
$$;
revoke all on function finance.budget_month_entries(uuid,date) from public,anon,authenticated;
grant execute on function finance.budget_month_entries(uuid,date) to service_role;
