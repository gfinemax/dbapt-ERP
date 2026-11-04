-- dbapt-ledger is authoritative for contribution assessments; ERP owns receipts and reporting.
alter table finance.collection_assessments
  add column source_system text,
  add column source_assessment_id text,
  add column source_version bigint,
  add column source_updated_at timestamptz,
  add column source_payload_hash text,
  add column synced_at timestamptz;

alter table finance.collection_assessments add constraint collection_assessment_source_complete check (
  (source_system is null and source_assessment_id is null and source_version is null and source_payload_hash is null and synced_at is null)
  or (length(trim(source_system)) between 1 and 100 and length(trim(source_assessment_id)) between 1 and 200
      and source_version is not null and source_version>0 and source_payload_hash ~ '^[0-9a-f]{64}$' and synced_at is not null)
);
create unique index collection_assessment_source_uidx
  on finance.collection_assessments(organization_id,source_system,source_assessment_id)
  where source_system is not null;

create table finance.ledger_contribution_sync_state (
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null,
  last_cursor bigint not null default 0 check(last_cursor>=0),
  last_synced_at timestamptz,
  last_status text not null default 'NEVER' check(last_status in ('NEVER','SUCCESS','PARTIAL','FAILED')),
  last_error text,
  updated_by uuid references auth.users(id) on delete restrict,
  primary key(organization_id,source_system)
);
create table finance.ledger_contribution_sync_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null,
  source_assessment_id text not null,
  source_version bigint not null,
  issue_code text not null check(issue_code in ('MISSING_EXTERNAL_MEMBER_ID','INVALID_PAYLOAD')),
  issue_detail text not null,
  payload jsonb not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,source_system,source_assessment_id,source_version,issue_code)
);
create table finance.ledger_contribution_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  from_cursor bigint not null,
  to_cursor bigint not null,
  received_count integer not null,
  applied_count integer not null,
  issue_count integer not null,
  created_at timestamptz not null default now()
);

alter table finance.ledger_contribution_sync_state enable row level security;
alter table finance.ledger_contribution_sync_issues enable row level security;
alter table finance.ledger_contribution_sync_runs enable row level security;
revoke all on finance.ledger_contribution_sync_state,finance.ledger_contribution_sync_issues,finance.ledger_contribution_sync_runs from public,anon,authenticated;
grant select,insert,update on finance.ledger_contribution_sync_state,finance.ledger_contribution_sync_issues to service_role;
grant select,insert on finance.ledger_contribution_sync_runs to service_role;
create policy ledger_sync_state_server on finance.ledger_contribution_sync_state for all to service_role using(true) with check(true);
create policy ledger_sync_issues_server on finance.ledger_contribution_sync_issues for all to service_role using(true) with check(true);
create policy ledger_sync_runs_server on finance.ledger_contribution_sync_runs for all to service_role using(true) with check(true);

create function finance.guard_ledger_source_assessment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.source_system is not null and current_setting('finance.ledger_sync_context',true) is distinct from 'on' then
    raise exception 'ledger에서 연동된 분담금 부과는 ERP에서 수정하거나 삭제할 수 없습니다.';
  end if;
  return coalesce(new,old);
end $$;
create trigger guard_ledger_source_assessment before update or delete on finance.collection_assessments
for each row execute function finance.guard_ledger_source_assessment();

create function finance.sync_ledger_contribution_assessments(
  p_org uuid,p_actor uuid,p_source_system text,p_from_cursor bigint,p_next_cursor bigint,p_items jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  m finance.reimbursement_members; item jsonb; existing finance.collection_assessments;
  saved finance.collection_assessments; before_value jsonb; received integer:=0; applied integer:=0;
  issues integer:=0; source_id text; source_ver bigint; source_status text; amount_value numeric;
  current_cursor bigint; allocated_amount numeric;
begin
  if p_org is null or p_actor is null or coalesce(length(trim(p_source_system)),0) not between 1 and 100
     or p_from_cursor<0 or p_next_cursor<p_from_cursor or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception '연동 요청 정보를 확인해주세요.';
  end if;
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['ADMIN','CLOSE','APPROVE']) then raise exception '분담금 연동 권한이 필요합니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_source_system,914));
  insert into finance.ledger_contribution_sync_state(organization_id,source_system,last_cursor,updated_by)
    values(p_org,p_source_system,0,p_actor) on conflict do nothing;
  select last_cursor into current_cursor from finance.ledger_contribution_sync_state
    where organization_id=p_org and source_system=p_source_system for update;
  if current_cursor<>p_from_cursor then
    raise exception '연동 커서가 바뀌었습니다. 새로고침 후 다시 시도해주세요.';
  end if;
  perform set_config('finance.ledger_sync_context','on',true);
  for item in select value from jsonb_array_elements(p_items) loop
    received:=received+1; source_id:=trim(coalesce(item->>'source_assessment_id',''));
    source_ver:=nullif(item->>'source_version','')::bigint; source_status:=item->>'status';
    if source_id='' or source_ver is null or source_ver<=0 or coalesce(item->>'payload_hash','') !~ '^[0-9a-f]{64}$' then
      issues:=issues+1;
      insert into finance.ledger_contribution_sync_issues(organization_id,source_system,source_assessment_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,coalesce(nullif(source_id,''),'UNKNOWN'),coalesce(source_ver,0),'INVALID_PAYLOAD','원본 ID, 버전 또는 해시가 유효하지 않습니다.',item)
      on conflict do nothing; continue;
    end if;
    select * into existing from finance.collection_assessments
      where organization_id=p_org and source_system=p_source_system and source_assessment_id=source_id for update;
    if found and existing.source_version>=source_ver then continue; end if;
    if source_status='CANCELLED' then
      if found then
        before_value:=to_jsonb(existing);
        update finance.collection_assessments set status='CANCELLED',source_version=source_ver,
          source_updated_at=nullif(item->>'source_updated_at','')::timestamptz,source_payload_hash=item->>'payload_hash',
          synced_at=clock_timestamp(),lock_version=lock_version+1,updated_by=p_actor,updated_at=clock_timestamp()
        where id=existing.id returning * into saved;
        insert into finance.collection_ledger_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
          values(p_org,p_actor,saved.id,'LEDGER_ASSESSMENT_CANCEL','ledger 부과 연동',before_value,to_jsonb(saved));
        applied:=applied+1;
      end if;
      continue;
    end if;
    amount_value:=nullif(item->>'assessed_amount','')::numeric;
    if coalesce(length(trim(item->>'external_member_id')),0) not between 1 and 200 then
      issues:=issues+1;
      insert into finance.ledger_contribution_sync_issues(organization_id,source_system,source_assessment_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,source_id,source_ver,'MISSING_EXTERNAL_MEMBER_ID','PeopleON 고유 ID 연결이 필요합니다.',item)
      on conflict do nothing; continue;
    end if;
    if coalesce(length(trim(item->>'member_name_snapshot')),0) not between 1 and 200
       or coalesce(length(trim(item->>'assessment_code')),0) not between 1 and 100 or coalesce(amount_value,0)<=0 then
      issues:=issues+1;
      insert into finance.ledger_contribution_sync_issues(organization_id,source_system,source_assessment_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,source_id,source_ver,'INVALID_PAYLOAD','부과 코드, 금액 또는 표시 이름을 확인해주세요.',item)
      on conflict do nothing; continue;
    end if;
    if existing.id is not null then
      select coalesce(sum(x.amount),0) into allocated_amount
      from finance.collection_receipt_allocations x
      left join finance.collection_receipt_reversals r on r.allocation_id=x.id
      where x.organization_id=p_org and x.assessment_id=existing.id and r.id is null;
      if amount_value<allocated_amount then
        issues:=issues+1;
        insert into finance.ledger_contribution_sync_issues(organization_id,source_system,source_assessment_id,source_version,issue_code,issue_detail,payload)
        values(p_org,p_source_system,source_id,source_ver,'INVALID_PAYLOAD','이미 배분한 수납액보다 부과액이 작아 수동 검토가 필요합니다.',item)
        on conflict do nothing; continue;
      end if;
    end if;
    before_value:=case when existing.id is null then null else to_jsonb(existing) end;
    begin
      insert into finance.collection_assessments(organization_id,external_member_id,member_no,member_name_snapshot,
        assessment_code,due_date,assessed_amount,status,created_by,updated_by,source_system,source_assessment_id,
        source_version,source_updated_at,source_payload_hash,synced_at)
      values(p_org,trim(item->>'external_member_id'),nullif(trim(coalesce(item->>'ledger_member_id','')),''),
        trim(item->>'member_name_snapshot'),trim(item->>'assessment_code'),nullif(item->>'due_date','')::date,amount_value,
        'ACTIVE',p_actor,p_actor,p_source_system,source_id,source_ver,nullif(item->>'source_updated_at','')::timestamptz,
        item->>'payload_hash',clock_timestamp())
      on conflict(organization_id,source_system,source_assessment_id) where source_system is not null do update set
        external_member_id=excluded.external_member_id,member_no=excluded.member_no,member_name_snapshot=excluded.member_name_snapshot,
        assessment_code=excluded.assessment_code,due_date=excluded.due_date,assessed_amount=excluded.assessed_amount,status='ACTIVE',
        source_version=excluded.source_version,source_updated_at=excluded.source_updated_at,
        source_payload_hash=excluded.source_payload_hash,synced_at=excluded.synced_at,
        lock_version=finance.collection_assessments.lock_version+1,updated_by=p_actor,updated_at=clock_timestamp()
      returning * into saved;
    exception when unique_violation then
      issues:=issues+1;
      insert into finance.ledger_contribution_sync_issues(organization_id,source_system,source_assessment_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,source_id,source_ver,'INVALID_PAYLOAD','같은 조합원 ID와 부과 코드의 ERP 수동 자료가 이미 있어 검토가 필요합니다.',item)
      on conflict do nothing; continue;
    end;
    update finance.ledger_contribution_sync_issues set resolved_at=clock_timestamp()
      where organization_id=p_org and source_system=p_source_system and source_assessment_id=source_id and resolved_at is null;
    insert into finance.collection_ledger_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
      values(p_org,p_actor,saved.id,'LEDGER_ASSESSMENT_SYNC','ledger 부과 연동',before_value,to_jsonb(saved));
    applied:=applied+1;
  end loop;
  update finance.ledger_contribution_sync_state set last_cursor=p_next_cursor,last_synced_at=clock_timestamp(),
    last_status=case when issues>0 then 'PARTIAL' else 'SUCCESS' end,last_error=null,updated_by=p_actor
    where organization_id=p_org and source_system=p_source_system;
  insert into finance.ledger_contribution_sync_runs(organization_id,source_system,actor_id,from_cursor,to_cursor,received_count,applied_count,issue_count)
    values(p_org,p_source_system,p_actor,p_from_cursor,p_next_cursor,received,applied,issues);
  return jsonb_build_object('from_cursor',p_from_cursor,'next_cursor',p_next_cursor,'received_count',received,
    'applied_count',applied,'issue_count',issues,'status',case when issues>0 then 'PARTIAL' else 'SUCCESS' end);
end $$;

create function finance.ledger_contribution_sync_status(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members;
begin
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['ADMIN','CLOSE','APPROVE','SENIOR']) then raise exception '분담금 연동 조회 권한이 필요합니다.'; end if;
  return jsonb_build_object(
    'state',(select to_jsonb(s) from finance.ledger_contribution_sync_state s where s.organization_id=p_org and s.source_system='dbapt-ledger'),
    'unresolved_issues',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from finance.ledger_contribution_sync_issues i where i.organization_id=p_org and i.source_system='dbapt-ledger' and i.resolved_at is null),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'source_system',a.source_system,'source_assessment_id',a.source_assessment_id)) from finance.collection_assessments a where a.organization_id=p_org and a.source_system is not null),'[]'::jsonb));
end $$;

revoke all on function finance.sync_ledger_contribution_assessments(uuid,uuid,text,bigint,bigint,jsonb),finance.ledger_contribution_sync_status(uuid,uuid) from public,anon,authenticated;
grant execute on function finance.sync_ledger_contribution_assessments(uuid,uuid,text,bigint,bigint,jsonb),finance.ledger_contribution_sync_status(uuid,uuid) to service_role;
grant execute on function finance.guard_ledger_source_assessment() to service_role;
