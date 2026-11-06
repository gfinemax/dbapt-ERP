-- Import Ledger-managed non-cash contribution recognitions without turning them into bank receipts.
create table finance.collection_external_recognitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  assessment_id uuid not null,
  source_system text not null,
  source_recognition_id text not null,
  source_version bigint not null check(source_version>0),
  source_assessment_id text not null,
  external_member_id text not null,
  recognized_on date not null,
  recognized_amount numeric(16,0) not null check(recognized_amount>0),
  recognition_type text not null check(length(trim(recognition_type)) between 1 and 100),
  reason text not null check(length(trim(reason)) between 1 and 500),
  status text not null check(status in ('ACTIVE','CANCELLED')),
  source_updated_at timestamptz not null,
  source_payload_hash text not null check(source_payload_hash ~ '^[0-9a-f]{64}$'),
  source_payload jsonb not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,source_system,source_recognition_id),
  foreign key(organization_id,assessment_id)
    references finance.collection_assessments(organization_id,id) on delete restrict
);
create index collection_external_recognitions_assessment_idx
  on finance.collection_external_recognitions(organization_id,assessment_id,status,recognized_on);

create table finance.ledger_external_recognition_sync_state (
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null,
  last_cursor bigint not null default 0 check(last_cursor>=0),
  last_synced_at timestamptz,
  last_status text not null default 'NEVER' check(last_status in ('NEVER','SUCCESS','PARTIAL','FAILED')),
  last_error text,
  updated_by uuid references auth.users(id) on delete restrict,
  primary key(organization_id,source_system)
);

create table finance.ledger_external_recognition_sync_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null,
  source_recognition_id text not null,
  source_version bigint not null check(source_version>=0),
  issue_code text not null check(issue_code in (
    'INVALID_PAYLOAD','UNKNOWN_ASSESSMENT','UNKNOWN_RECOGNITION','MEMBER_MISMATCH','EXCEEDS_ASSESSMENT'
  )),
  issue_detail text not null,
  payload jsonb not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,source_system,source_recognition_id,source_version,issue_code)
);
create index ledger_external_recognition_issues_open_idx
  on finance.ledger_external_recognition_sync_issues(organization_id,source_system,created_at desc)
  where resolved_at is null;

create table finance.ledger_external_recognition_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  from_cursor bigint not null,
  to_cursor bigint not null,
  received_count integer not null,
  applied_count integer not null,
  reconciled_count integer not null,
  issue_count integer not null,
  created_at timestamptz not null default now()
);

alter table finance.collection_external_recognitions enable row level security;
alter table finance.ledger_external_recognition_sync_state enable row level security;
alter table finance.ledger_external_recognition_sync_issues enable row level security;
alter table finance.ledger_external_recognition_sync_runs enable row level security;
revoke all on finance.collection_external_recognitions,
  finance.ledger_external_recognition_sync_state,
  finance.ledger_external_recognition_sync_issues,
  finance.ledger_external_recognition_sync_runs from public,anon,authenticated;
grant select,insert,update on finance.collection_external_recognitions,
  finance.ledger_external_recognition_sync_state,
  finance.ledger_external_recognition_sync_issues to service_role;
grant select,insert on finance.ledger_external_recognition_sync_runs to service_role;
create policy collection_external_recognitions_server on finance.collection_external_recognitions
  for all to service_role using(true) with check(true);
create policy ledger_external_recognition_state_server on finance.ledger_external_recognition_sync_state
  for all to service_role using(true) with check(true);
create policy ledger_external_recognition_issues_server on finance.ledger_external_recognition_sync_issues
  for all to service_role using(true) with check(true);
create policy ledger_external_recognition_runs_server on finance.ledger_external_recognition_sync_runs
  for all to service_role using(true) with check(true);

create function finance.guard_ledger_external_recognition() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('finance.ledger_external_recognition_sync_context',true) is distinct from 'on' then
    raise exception 'Ledger에서 연동된 외부 납입 인정 원본은 ERP에서 수정하거나 삭제할 수 없습니다.';
  end if;
  return coalesce(new,old);
end $$;
create trigger guard_ledger_external_recognition before update or delete
on finance.collection_external_recognitions for each row
execute function finance.guard_ledger_external_recognition();

create function finance.validate_collection_credit_total() returns trigger
language plpgsql security invoker set search_path='' as $$
declare assessment finance.collection_assessments; cash_total numeric; recognition_total numeric;
begin
  select * into assessment from finance.collection_assessments
    where organization_id=new.organization_id and id=new.assessment_id for update;
  if assessment.id is null or assessment.status<>'ACTIVE' then
    raise exception '활성 부과 원본을 확인해주세요.';
  end if;
  select coalesce(sum(x.amount),0) into cash_total
    from finance.collection_receipt_allocations x
    left join finance.collection_receipt_reversals r on r.allocation_id=x.id
    where x.organization_id=new.organization_id and x.assessment_id=new.assessment_id and r.id is null;
  select coalesce(sum(x.recognized_amount),0) into recognition_total
    from finance.collection_external_recognitions x
    where x.organization_id=new.organization_id and x.assessment_id=new.assessment_id and x.status='ACTIVE';
  if cash_total+recognition_total+new.amount>assessment.assessed_amount then
    raise exception '실제 수납과 외부 인정액 합계가 부과액을 초과할 수 없습니다.';
  end if;
  return new;
end $$;
create trigger validate_collection_credit_total before insert on finance.collection_receipt_allocations
for each row execute function finance.validate_collection_credit_total();

create function finance.validate_manual_assessment_credit_total() returns trigger
language plpgsql security invoker set search_path='' as $$
declare cash_total numeric; recognition_total numeric;
begin
  if current_setting('finance.ledger_sync_context',true) is distinct from 'on'
     and (new.assessed_amount is distinct from old.assessed_amount or new.status is distinct from old.status) then
    select coalesce(sum(x.amount),0) into cash_total
      from finance.collection_receipt_allocations x
      left join finance.collection_receipt_reversals r on r.allocation_id=x.id
      where x.organization_id=old.organization_id and x.assessment_id=old.id and r.id is null;
    select coalesce(sum(x.recognized_amount),0) into recognition_total
      from finance.collection_external_recognitions x
      where x.organization_id=old.organization_id and x.assessment_id=old.id and x.status='ACTIVE';
    if new.status='CANCELLED' and recognition_total>0 then
      raise exception '유효한 외부 납입 인정이 있는 부과 원본은 취소할 수 없습니다.';
    end if;
    if new.assessed_amount<cash_total+recognition_total then
      raise exception '실제 수납과 외부 인정액 합계보다 부과액을 줄일 수 없습니다.';
    end if;
  end if;
  return new;
end $$;
create trigger validate_manual_assessment_credit_total before update on finance.collection_assessments
for each row execute function finance.validate_manual_assessment_credit_total();

create function finance.sync_ledger_external_recognitions(
  p_org uuid,p_actor uuid,p_source_system text,p_from_cursor bigint,p_next_cursor bigint,p_items jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  m finance.reimbursement_members; entry record; item jsonb; existing finance.collection_external_recognitions;
  saved finance.collection_external_recognitions; assessment finance.collection_assessments;
  before_value jsonb; source_id text; source_assessment text; external_member text; source_status text;
  source_ver bigint; amount_value numeric; recognized_date date; current_cursor bigint;
  cash_total numeric; recognition_total numeric; received integer:=0; applied integer:=0;
  reconciled integer:=0; issues integer:=0; open_issues integer:=0; is_retry boolean;
begin
  if p_org is null or p_actor is null or coalesce(length(trim(p_source_system)),0) not between 1 and 100
     or p_from_cursor<0 or p_next_cursor<p_from_cursor or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception '외부 납입 인정 연동 요청 정보를 확인해주세요.';
  end if;
  if jsonb_array_length(p_items)=0 and p_next_cursor<>p_from_cursor then
    raise exception '외부 납입 인정 커서를 확인해주세요.';
  end if;
  if jsonb_array_length(p_items)>0 and (
    select max(coalesce((value->>'cursor')::bigint,-1)) from jsonb_array_elements(p_items)
  )<>p_next_cursor then
    raise exception '외부 납입 인정 페이지 커서를 확인해주세요.';
  end if;
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['ADMIN','CLOSE','APPROVE']) then
    raise exception '외부 납입 인정 연동 권한이 필요합니다.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_source_system||':external-recognition',914));
  insert into finance.ledger_external_recognition_sync_state(organization_id,source_system,last_cursor,updated_by)
    values(p_org,p_source_system,0,p_actor) on conflict do nothing;
  select last_cursor into current_cursor from finance.ledger_external_recognition_sync_state
    where organization_id=p_org and source_system=p_source_system for update;
  if current_cursor<>p_from_cursor then
    raise exception '외부 납입 인정 연동 커서가 바뀌었습니다. 새로고침 후 다시 시도해주세요.';
  end if;
  perform set_config('finance.ledger_external_recognition_sync_context','on',true);

  for entry in
    select i.payload as item,true as is_retry
      from finance.ledger_external_recognition_sync_issues i
      where i.organization_id=p_org and i.source_system=p_source_system and i.resolved_at is null
        and i.issue_code in ('UNKNOWN_ASSESSMENT','MEMBER_MISMATCH','EXCEEDS_ASSESSMENT')
    union all
    select value as item,false as is_retry from jsonb_array_elements(p_items)
  loop
    item:=entry.item; is_retry:=entry.is_retry;
    if not is_retry then received:=received+1; end if;
    source_id:=trim(coalesce(item->>'source_recognition_id',''));
    source_assessment:=trim(coalesce(item->>'source_assessment_id',''));
    external_member:=trim(coalesce(item->>'external_member_id',''));
    source_ver:=coalesce(nullif(item->>'source_version','')::bigint,0);
    source_status:=coalesce(item->>'status','');

    if source_id='' or source_ver<=0 or coalesce(item->>'payload_hash','')!~'^[0-9a-f]{64}$'
       or source_status not in ('ACTIVE','CANCELLED')
       or (not is_retry and coalesce((item->>'cursor')::bigint,0)<=p_from_cursor) then
      if not is_retry then issues:=issues+1; end if;
      insert into finance.ledger_external_recognition_sync_issues(
        organization_id,source_system,source_recognition_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,coalesce(nullif(source_id,''),'UNKNOWN'),source_ver,'INVALID_PAYLOAD',
        '원본 ID, 버전, 상태, 커서 또는 해시가 유효하지 않습니다.',item)
      on conflict(organization_id,source_system,source_recognition_id,source_version,issue_code)
      do update set issue_detail=excluded.issue_detail,payload=excluded.payload,resolved_at=null,updated_at=clock_timestamp();
      continue;
    end if;

    select * into existing from finance.collection_external_recognitions
      where organization_id=p_org and source_system=p_source_system and source_recognition_id=source_id for update;
    if existing.id is not null and existing.source_version>=source_ver then
      update finance.ledger_external_recognition_sync_issues set resolved_at=clock_timestamp(),updated_at=clock_timestamp()
        where organization_id=p_org and source_system=p_source_system
          and source_recognition_id=source_id and source_version<=existing.source_version and resolved_at is null;
      continue;
    end if;

    if source_status='CANCELLED' then
      if existing.id is null then
        if not is_retry then issues:=issues+1; end if;
        insert into finance.ledger_external_recognition_sync_issues(
          organization_id,source_system,source_recognition_id,source_version,issue_code,issue_detail,payload)
        values(p_org,p_source_system,source_id,source_ver,'UNKNOWN_RECOGNITION','취소할 외부 납입 인정 원본을 찾지 못했습니다.',item)
        on conflict(organization_id,source_system,source_recognition_id,source_version,issue_code)
        do update set issue_detail=excluded.issue_detail,payload=excluded.payload,resolved_at=null,updated_at=clock_timestamp();
        continue;
      end if;
      before_value:=to_jsonb(existing);
      update finance.collection_external_recognitions set status='CANCELLED',source_version=source_ver,
        source_updated_at=nullif(item->>'source_updated_at','')::timestamptz,
        source_payload_hash=item->>'payload_hash',source_payload=item,synced_at=clock_timestamp(),updated_at=clock_timestamp()
        where id=existing.id returning * into saved;
      insert into finance.collection_ledger_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
        values(p_org,p_actor,saved.assessment_id,'LEDGER_EXTERNAL_RECOGNITION_CANCEL','Ledger 외부 납입 인정 취소',before_value,to_jsonb(saved));
      if is_retry then reconciled:=reconciled+1; else applied:=applied+1; end if;
      update finance.ledger_external_recognition_sync_issues set resolved_at=clock_timestamp(),updated_at=clock_timestamp()
        where organization_id=p_org and source_system=p_source_system and source_recognition_id=source_id
          and source_version<=source_ver and resolved_at is null;
      continue;
    end if;

    amount_value:=nullif(item->>'recognized_amount','')::numeric;
    recognized_date:=case when coalesce(item->>'recognized_on','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then (item->>'recognized_on')::date else null end;
    if source_assessment='' or external_member='' or recognized_date is null
       or coalesce(amount_value,0)<=0 or amount_value<>trunc(amount_value)
       or coalesce(length(trim(item->>'recognition_type')),0) not between 1 and 100
       or coalesce(length(trim(item->>'reason')),0) not between 1 and 500
       or nullif(item->>'source_updated_at','') is null then
      if not is_retry then issues:=issues+1; end if;
      insert into finance.ledger_external_recognition_sync_issues(
        organization_id,source_system,source_recognition_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,source_id,source_ver,'INVALID_PAYLOAD','부과 원본, 조합원, 인정일, 금액, 유형 또는 사유를 확인해주세요.',item)
      on conflict(organization_id,source_system,source_recognition_id,source_version,issue_code)
      do update set issue_detail=excluded.issue_detail,payload=excluded.payload,resolved_at=null,updated_at=clock_timestamp();
      continue;
    end if;

    select * into assessment from finance.collection_assessments
      where organization_id=p_org and source_system=p_source_system
        and source_assessment_id=source_assessment and status='ACTIVE' for update;
    if assessment.id is null then
      if not is_retry then issues:=issues+1; end if;
      insert into finance.ledger_external_recognition_sync_issues(
        organization_id,source_system,source_recognition_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,source_id,source_ver,'UNKNOWN_ASSESSMENT','연결할 Ledger 부과 원본을 찾지 못했습니다.',item)
      on conflict(organization_id,source_system,source_recognition_id,source_version,issue_code)
      do update set issue_detail=excluded.issue_detail,payload=excluded.payload,resolved_at=null,updated_at=clock_timestamp();
      continue;
    end if;
    if assessment.external_member_id<>external_member then
      if not is_retry then issues:=issues+1; end if;
      insert into finance.ledger_external_recognition_sync_issues(
        organization_id,source_system,source_recognition_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,source_id,source_ver,'MEMBER_MISMATCH','부과 원본과 외부 납입 인정의 조합원 ID가 다릅니다.',item)
      on conflict(organization_id,source_system,source_recognition_id,source_version,issue_code)
      do update set issue_detail=excluded.issue_detail,payload=excluded.payload,resolved_at=null,updated_at=clock_timestamp();
      continue;
    end if;
    select coalesce(sum(x.amount),0) into cash_total
      from finance.collection_receipt_allocations x
      left join finance.collection_receipt_reversals r on r.allocation_id=x.id
      where x.organization_id=p_org and x.assessment_id=assessment.id and r.id is null;
    select coalesce(sum(x.recognized_amount),0) into recognition_total
      from finance.collection_external_recognitions x
      where x.organization_id=p_org and x.assessment_id=assessment.id and x.status='ACTIVE'
        and x.id is distinct from existing.id;
    if cash_total+recognition_total+amount_value>assessment.assessed_amount then
      if not is_retry then issues:=issues+1; end if;
      insert into finance.ledger_external_recognition_sync_issues(
        organization_id,source_system,source_recognition_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,source_id,source_ver,'EXCEEDS_ASSESSMENT','실제 수납과 외부 인정액 합계가 부과액을 초과합니다.',item)
      on conflict(organization_id,source_system,source_recognition_id,source_version,issue_code)
      do update set issue_detail=excluded.issue_detail,payload=excluded.payload,resolved_at=null,updated_at=clock_timestamp();
      continue;
    end if;

    before_value:=case when existing.id is null then null else to_jsonb(existing) end;
    insert into finance.collection_external_recognitions(
      organization_id,assessment_id,source_system,source_recognition_id,source_version,source_assessment_id,
      external_member_id,recognized_on,recognized_amount,recognition_type,reason,status,
      source_updated_at,source_payload_hash,source_payload,synced_at)
    values(p_org,assessment.id,p_source_system,source_id,source_ver,source_assessment,external_member,
      recognized_date,amount_value,trim(item->>'recognition_type'),trim(item->>'reason'),'ACTIVE',
      (item->>'source_updated_at')::timestamptz,item->>'payload_hash',item,clock_timestamp())
    on conflict(organization_id,source_system,source_recognition_id) do update set
      assessment_id=excluded.assessment_id,source_version=excluded.source_version,
      source_assessment_id=excluded.source_assessment_id,external_member_id=excluded.external_member_id,
      recognized_on=excluded.recognized_on,recognized_amount=excluded.recognized_amount,
      recognition_type=excluded.recognition_type,reason=excluded.reason,status='ACTIVE',
      source_updated_at=excluded.source_updated_at,source_payload_hash=excluded.source_payload_hash,
      source_payload=excluded.source_payload,synced_at=excluded.synced_at,updated_at=clock_timestamp()
    returning * into saved;
    update finance.ledger_external_recognition_sync_issues set resolved_at=clock_timestamp(),updated_at=clock_timestamp()
      where organization_id=p_org and source_system=p_source_system and source_recognition_id=source_id
        and source_version<=source_ver and resolved_at is null;
    insert into finance.collection_ledger_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
      values(p_org,p_actor,assessment.id,'LEDGER_EXTERNAL_RECOGNITION_SYNC','Ledger 외부 납입 인정 연동',before_value,to_jsonb(saved));
    if is_retry then reconciled:=reconciled+1; else applied:=applied+1; end if;
  end loop;

  select count(*) into open_issues from finance.ledger_external_recognition_sync_issues
    where organization_id=p_org and source_system=p_source_system and resolved_at is null;
  update finance.ledger_external_recognition_sync_state set last_cursor=p_next_cursor,
    last_synced_at=clock_timestamp(),last_status=case when open_issues>0 then 'PARTIAL' else 'SUCCESS' end,
    last_error=null,updated_by=p_actor
    where organization_id=p_org and source_system=p_source_system;
  insert into finance.ledger_external_recognition_sync_runs(
    organization_id,source_system,actor_id,from_cursor,to_cursor,received_count,applied_count,reconciled_count,issue_count)
  values(p_org,p_source_system,p_actor,p_from_cursor,p_next_cursor,received,applied,reconciled,issues);
  return jsonb_build_object('from_cursor',p_from_cursor,'next_cursor',p_next_cursor,
    'received_count',received,'applied_count',applied,'reconciled_count',reconciled,
    'issue_count',issues,'unresolved_issue_count',open_issues,
    'status',case when open_issues>0 then 'PARTIAL' else 'SUCCESS' end);
end $$;

create function finance.ledger_external_recognition_sync_status(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members;
begin
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['ADMIN','CLOSE','APPROVE','SENIOR','PAY']) then
    raise exception '외부 납입 인정 연동 조회 권한이 필요합니다.';
  end if;
  return jsonb_build_object(
    'state',(select to_jsonb(s) from finance.ledger_external_recognition_sync_state s
      where s.organization_id=p_org and s.source_system='dbapt-ledger'),
    'unresolved_issues',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'source_recognition_id',i.source_recognition_id,'source_version',i.source_version,
      'issue_code',i.issue_code,'issue_detail',i.issue_detail,'created_at',i.created_at
    ) order by i.created_at desc) from finance.ledger_external_recognition_sync_issues i
      where i.organization_id=p_org and i.source_system='dbapt-ledger' and i.resolved_at is null),'[]'::jsonb),
    'source_count',(select count(*) from finance.collection_external_recognitions x
      where x.organization_id=p_org and x.source_system='dbapt-ledger')
  );
end $$;

-- Preserve existing callers while enriching collection reads with cash/non-cash split amounts.
alter function finance.collection_ledger_read(uuid,uuid) rename to collection_ledger_read_legacy;
create function finance.collection_ledger_read(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare base jsonb; assessments jsonb; recognitions jsonb;
begin
  base:=finance.collection_ledger_read_legacy(p_org,p_actor);
  select coalesce(jsonb_agg(a.item||jsonb_build_object(
    'cash_allocated_amount',coalesce((a.item->>'allocated_amount')::numeric,0),
    'external_recognized_amount',coalesce((select sum(x.recognized_amount)
      from finance.collection_external_recognitions x where x.organization_id=p_org
        and x.assessment_id=(a.item->>'id')::uuid and x.status='ACTIVE'),0),
    'satisfied_amount',coalesce((a.item->>'allocated_amount')::numeric,0)+coalesce((select sum(x.recognized_amount)
      from finance.collection_external_recognitions x where x.organization_id=p_org
        and x.assessment_id=(a.item->>'id')::uuid and x.status='ACTIVE'),0)
  )),'[]'::jsonb) into assessments from jsonb_array_elements(base->'assessments') a(item);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'assessment_id',x.assessment_id,'source_recognition_id',x.source_recognition_id,
    'source_assessment_id',x.source_assessment_id,'external_member_id',x.external_member_id,
    'recognized_on',x.recognized_on,'recognized_amount',x.recognized_amount,
    'recognition_type',x.recognition_type,'reason',x.reason,'status',x.status,
    'source_version',x.source_version,'source_updated_at',x.source_updated_at
  ) order by x.recognized_on desc,x.id),'[]'::jsonb) into recognitions
  from finance.collection_external_recognitions x where x.organization_id=p_org;
  return base||jsonb_build_object('assessments',assessments,'external_recognitions',recognitions);
end $$;

-- Recompute the collection close check without treating external recognition as cash.
alter function finance.month_close_read(uuid,uuid,date) rename to month_close_read_legacy;
create function finance.month_close_read(p_org uuid,p_actor uuid,p_month date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare base jsonb; checks jsonb; month_end date; pending integer;
begin
  base:=finance.month_close_read_legacy(p_org,p_actor,p_month);
  month_end:=((base->>'month')::date+interval '1 month')::date;
  select count(*) into pending from finance.collection_assessments a
  where a.organization_id=p_org and a.status='ACTIVE' and a.due_date<month_end
    and a.assessed_amount>coalesce((select sum(x.amount) from finance.collection_receipt_allocations x
      left join finance.collection_receipt_reversals r on r.allocation_id=x.id
      where x.organization_id=p_org and x.assessment_id=a.id and r.id is null),0)
      +coalesce((select sum(x.recognized_amount) from finance.collection_external_recognitions x
        where x.organization_id=p_org and x.assessment_id=a.id and x.status='ACTIVE'),0);
  select jsonb_agg(case when item->>'key'='collection'
    then jsonb_set(item,'{count}',to_jsonb(pending),true) else item end order by ord)
    into checks from jsonb_array_elements(base->'checks') with ordinality c(item,ord);
  return base||jsonb_build_object('checks',checks,'ready',not exists(
    select 1 from jsonb_array_elements(checks) c where (c->>'blocking')::boolean and (c->>'count')::integer>0));
end $$;

-- Keep bank receipt totals unchanged and expose non-cash recognition separately in performance reports.
alter function finance.financial_report_live(uuid,uuid) rename to financial_report_live_cash_legacy;
create function finance.financial_report_live(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare base jsonb; recognition_total numeric; cash_total numeric;
begin
  base:=finance.financial_report_live_cash_legacy(p_org,p_actor);
  select coalesce(sum(x.recognized_amount),0) into recognition_total
    from finance.collection_external_recognitions x
    where x.organization_id=p_org and x.status='ACTIVE';
  cash_total:=coalesce((base#>>'{quarterly,receipt_total}')::numeric,0);
  return jsonb_set(base,'{quarterly}',(base->'quarterly')||jsonb_build_object(
    'external_recognition_total',recognition_total,
    'satisfied_total',cash_total+recognition_total
  ),true);
end $$;

revoke all on function finance.guard_ledger_external_recognition(),
  finance.validate_collection_credit_total(),finance.validate_manual_assessment_credit_total(),
  finance.sync_ledger_external_recognitions(uuid,uuid,text,bigint,bigint,jsonb),
  finance.ledger_external_recognition_sync_status(uuid,uuid),
  finance.collection_ledger_read(uuid,uuid),finance.month_close_read(uuid,uuid,date),
  finance.financial_report_live(uuid,uuid) from public,anon,authenticated;
grant execute on function finance.guard_ledger_external_recognition(),
  finance.validate_collection_credit_total(),finance.validate_manual_assessment_credit_total(),
  finance.sync_ledger_external_recognitions(uuid,uuid,text,bigint,bigint,jsonb),
  finance.ledger_external_recognition_sync_status(uuid,uuid),
  finance.collection_ledger_read(uuid,uuid),finance.month_close_read(uuid,uuid,date),
  finance.financial_report_live(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
