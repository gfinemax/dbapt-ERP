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
 select coalesce(jsonb_object_agg(month,entries),'{}'::jsonb) into before_months from (select month,jsonb_agg(to_jsonb(e) order by e.source_kind,e.source_id,e.budget_id,e.amount,e.state,e.paid_at) as entries from finance.budget_effective_entries(p_org)e group by month)t;
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

 select coalesce(jsonb_object_agg(month,entries),'{}'::jsonb) into after_months from (select month,jsonb_agg(to_jsonb(e) order by e.source_kind,e.source_id,e.budget_id,e.amount,e.state,e.paid_at) as entries from finance.budget_effective_entries(p_org)e group by month)t;
 select array_agg(distinct affected.changed_month) into months from (
 select unnest(months) as changed_month union select coalesce(prior_entry.key,next_entry.key)::date from jsonb_each(before_months) prior_entry full join jsonb_each(after_months) next_entry on prior_entry.key=next_entry.key where prior_entry.value is distinct from next_entry.value
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
