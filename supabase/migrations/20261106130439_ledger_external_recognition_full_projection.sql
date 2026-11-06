-- Ledger 외부납입 인정 전체 원장을 먼저 보존하고, 부과 연결이 검증된 건만 수납 충족액에 반영한다.
alter table finance.collection_external_recognitions
  alter column assessment_id drop not null,
  alter column source_assessment_id drop not null,
  alter column external_member_id drop not null;
alter table finance.collection_external_recognitions
  drop constraint if exists collection_external_recognitions_recognized_amount_check;
alter table finance.collection_external_recognitions
  add constraint collection_external_recognitions_recognized_amount_check check(recognized_amount>=0);
alter table finance.collection_external_recognitions
  add column source_root_recognition_id text,
  add column source_current_recognition_id text,
  add column linkage_status text not null default 'LINKED',
  add column linkage_issue_detail text;
update finance.collection_external_recognitions set
  source_root_recognition_id=source_recognition_id,
  source_current_recognition_id=source_recognition_id
where source_root_recognition_id is null or source_current_recognition_id is null;
alter table finance.collection_external_recognitions
  alter column source_root_recognition_id set not null,
  alter column source_current_recognition_id set not null,
  add constraint collection_external_recognitions_linkage_status_check check(linkage_status in (
    'LINKED','UNLINKED','ASSESSMENT_MISSING','MEMBER_MISMATCH','EXCEEDS_ASSESSMENT'
  ));
create index collection_external_recognitions_linkage_idx
  on finance.collection_external_recognitions(organization_id,linkage_status,status,source_version desc);

create table finance.ledger_external_recognition_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  source_system text not null,
  source_recognition_id text not null,
  source_root_recognition_id text not null,
  source_current_recognition_id text not null,
  source_version bigint not null check(source_version>0),
  event_type text not null check(event_type in ('UPSERT','CANCEL')),
  sync_reason text not null,
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique(organization_id,source_system,source_recognition_id,source_version)
);
create index ledger_external_recognition_events_source_idx
  on finance.ledger_external_recognition_events(
    organization_id,source_system,source_recognition_id,source_version desc
  );
alter table finance.ledger_external_recognition_events enable row level security;
revoke all on finance.ledger_external_recognition_events from public,anon,authenticated;
grant select,insert on finance.ledger_external_recognition_events to service_role;
create policy ledger_external_recognition_events_server
  on finance.ledger_external_recognition_events for all to service_role
  using(true) with check(true);

create or replace function finance.sync_ledger_external_recognitions(
  p_org uuid,p_actor uuid,p_source_system text,p_from_cursor bigint,p_next_cursor bigint,p_items jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  m finance.reimbursement_members; entry record; item jsonb;
  existing finance.collection_external_recognitions; saved finance.collection_external_recognitions;
  assessment finance.collection_assessments; before_value jsonb;
  source_id text; source_root_id text; source_current_id text; source_assessment text;
  external_member text; source_status text; event_kind text; sync_reason_value text;
  source_ver bigint; amount_value numeric; recognized_date date; current_cursor bigint;
  recognition_type_value text; reason_value text;
  cash_total numeric; recognition_total numeric; received integer:=0; applied integer:=0;
  reconciled integer:=0; issues integer:=0; open_issues integer:=0; is_retry boolean;
  target_assessment_id uuid; link_status text; link_detail text;
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
    source_root_id:=trim(coalesce(item->>'source_root_recognition_id',source_id));
    source_current_id:=trim(coalesce(item->>'source_current_recognition_id',source_id));
    source_assessment:=nullif(trim(coalesce(item->>'source_assessment_id','')),'');
    external_member:=nullif(trim(coalesce(item->>'external_member_id','')),'');
    source_ver:=coalesce(nullif(item->>'source_version','')::bigint,0);
    source_status:=coalesce(item->>'status','');
    event_kind:=coalesce(item->>'event_type',case when source_status='CANCELLED' then 'CANCEL' else 'UPSERT' end);
    sync_reason_value:=coalesce(nullif(trim(item->>'sync_reason'),''),'UNSPECIFIED');

    if source_id='' or source_root_id<>source_id or source_current_id='' or source_ver<=0
       or coalesce(item->>'payload_hash','')!~'^[0-9a-f]{64}$'
       or source_status not in ('ACTIVE','CANCELLED') or event_kind not in ('UPSERT','CANCEL')
       or nullif(item->>'source_updated_at','') is null
       or (not is_retry and coalesce((item->>'cursor')::bigint,0)<=p_from_cursor) then
      if not is_retry then issues:=issues+1; end if;
      insert into finance.ledger_external_recognition_sync_issues(
        organization_id,source_system,source_recognition_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,coalesce(nullif(source_id,''),'UNKNOWN'),source_ver,'INVALID_PAYLOAD',
        '원본 루트 ID, 현재 ID, 버전, 상태, 커서 또는 해시가 유효하지 않습니다.',item)
      on conflict(organization_id,source_system,source_recognition_id,source_version,issue_code)
      do update set issue_detail=excluded.issue_detail,payload=excluded.payload,resolved_at=null,updated_at=clock_timestamp();
      continue;
    end if;

    if not is_retry then
      insert into finance.ledger_external_recognition_events(
        organization_id,actor_id,source_system,source_recognition_id,source_root_recognition_id,
        source_current_recognition_id,source_version,event_type,sync_reason,payload_hash,payload)
      values(p_org,p_actor,p_source_system,source_id,source_root_id,source_current_id,source_ver,
        event_kind,sync_reason_value,item->>'payload_hash',item)
      on conflict(organization_id,source_system,source_recognition_id,source_version) do nothing;
    end if;

    select * into existing from finance.collection_external_recognitions
      where organization_id=p_org and source_system=p_source_system and source_recognition_id=source_id for update;
    if existing.id is not null and (existing.source_version>source_ver
       or (existing.source_version=source_ver and not is_retry)) then
      update finance.ledger_external_recognition_sync_issues set resolved_at=clock_timestamp(),updated_at=clock_timestamp()
        where organization_id=p_org and source_system=p_source_system
          and source_recognition_id=source_id and source_version<existing.source_version and resolved_at is null;
      continue;
    end if;

    amount_value:=coalesce(nullif(item->>'recognized_amount','')::numeric,existing.recognized_amount,0);
    recognized_date:=coalesce(case when coalesce(item->>'recognized_on','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then (item->>'recognized_on')::date else null end,existing.recognized_on);
    recognition_type_value:=coalesce(nullif(trim(item->>'recognition_type'),''),existing.recognition_type);
    reason_value:=coalesce(nullif(trim(item->>'reason'),''),existing.reason);
    if recognized_date is null or amount_value<0 or amount_value<>trunc(amount_value)
       or (source_status='ACTIVE' and amount_value=0)
       or coalesce(length(recognition_type_value),0) not between 1 and 100
       or coalesce(length(reason_value),0) not between 1 and 500 then
      if not is_retry then issues:=issues+1; end if;
      insert into finance.ledger_external_recognition_sync_issues(
        organization_id,source_system,source_recognition_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,source_id,source_ver,'INVALID_PAYLOAD',
        '인정일, 현재 인정액, 유형 또는 사유를 확인해주세요.',item)
      on conflict(organization_id,source_system,source_recognition_id,source_version,issue_code)
      do update set issue_detail=excluded.issue_detail,payload=excluded.payload,resolved_at=null,updated_at=clock_timestamp();
      continue;
    end if;

    target_assessment_id:=null; link_status:='UNLINKED'; link_detail:=null;
    if source_status='CANCELLED' then
      target_assessment_id:=existing.assessment_id;
      link_status:=coalesce(existing.linkage_status,'UNLINKED');
    elsif source_assessment is null then
      link_status:='ASSESSMENT_MISSING';
      link_detail:='Ledger 외부납입 원장에 ERP 부과 원본 연결 ID가 없습니다.';
    else
      select * into assessment from finance.collection_assessments
        where organization_id=p_org and source_system=p_source_system
          and source_assessment_id=source_assessment and status='ACTIVE' for update;
      if assessment.id is null then
        link_status:='ASSESSMENT_MISSING';
        link_detail:='연결할 Ledger 부과 원본을 찾지 못했습니다.';
      elsif external_member is null or assessment.external_member_id<>external_member then
        link_status:='MEMBER_MISMATCH';
        link_detail:='부과 원본과 외부 납입 인정의 조합원 ID가 다릅니다.';
      else
        select coalesce(sum(x.amount),0) into cash_total
          from finance.collection_receipt_allocations x
          left join finance.collection_receipt_reversals r on r.allocation_id=x.id
          where x.organization_id=p_org and x.assessment_id=assessment.id and r.id is null;
        select coalesce(sum(x.recognized_amount),0) into recognition_total
          from finance.collection_external_recognitions x
          where x.organization_id=p_org and x.assessment_id=assessment.id and x.status='ACTIVE'
            and x.id is distinct from existing.id;
        if cash_total+recognition_total+amount_value>assessment.assessed_amount then
          link_status:='EXCEEDS_ASSESSMENT';
          link_detail:='실제 수납과 외부 인정액 합계가 부과액을 초과합니다.';
        else
          target_assessment_id:=assessment.id; link_status:='LINKED';
        end if;
      end if;
    end if;

    before_value:=case when existing.id is null then null else to_jsonb(existing) end;
    insert into finance.collection_external_recognitions(
      organization_id,assessment_id,source_system,source_recognition_id,source_root_recognition_id,
      source_current_recognition_id,source_version,source_assessment_id,external_member_id,
      recognized_on,recognized_amount,recognition_type,reason,status,linkage_status,linkage_issue_detail,
      source_updated_at,source_payload_hash,source_payload,synced_at)
    values(p_org,target_assessment_id,p_source_system,source_id,source_root_id,source_current_id,
      source_ver,source_assessment,external_member,recognized_date,amount_value,
      recognition_type_value,reason_value,source_status,link_status,link_detail,
      (item->>'source_updated_at')::timestamptz,item->>'payload_hash',item,clock_timestamp())
    on conflict(organization_id,source_system,source_recognition_id) do update set
      assessment_id=excluded.assessment_id,source_root_recognition_id=excluded.source_root_recognition_id,
      source_current_recognition_id=excluded.source_current_recognition_id,
      source_version=excluded.source_version,source_assessment_id=excluded.source_assessment_id,
      external_member_id=excluded.external_member_id,recognized_on=excluded.recognized_on,
      recognized_amount=excluded.recognized_amount,recognition_type=excluded.recognition_type,
      reason=excluded.reason,status=excluded.status,linkage_status=excluded.linkage_status,
      linkage_issue_detail=excluded.linkage_issue_detail,source_updated_at=excluded.source_updated_at,
      source_payload_hash=excluded.source_payload_hash,source_payload=excluded.source_payload,
      synced_at=excluded.synced_at,updated_at=clock_timestamp()
    returning * into saved;

    if source_status='CANCELLED' or link_status='LINKED' then
      update finance.ledger_external_recognition_sync_issues set resolved_at=clock_timestamp(),updated_at=clock_timestamp()
        where organization_id=p_org and source_system=p_source_system and source_recognition_id=source_id
          and source_version<=source_ver and resolved_at is null;
    else
      if not is_retry then issues:=issues+1; end if;
      insert into finance.ledger_external_recognition_sync_issues(
        organization_id,source_system,source_recognition_id,source_version,issue_code,issue_detail,payload)
      values(p_org,p_source_system,source_id,source_ver,
        case link_status when 'MEMBER_MISMATCH' then 'MEMBER_MISMATCH'
             when 'EXCEEDS_ASSESSMENT' then 'EXCEEDS_ASSESSMENT' else 'UNKNOWN_ASSESSMENT' end,
        link_detail,item)
      on conflict(organization_id,source_system,source_recognition_id,source_version,issue_code)
      do update set issue_detail=excluded.issue_detail,payload=excluded.payload,resolved_at=null,updated_at=clock_timestamp();
    end if;

    if saved.assessment_id is not null then
      insert into finance.collection_ledger_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
        values(p_org,p_actor,saved.assessment_id,
          case when source_status='CANCELLED' then 'LEDGER_EXTERNAL_RECOGNITION_CANCEL'
               else 'LEDGER_EXTERNAL_RECOGNITION_SYNC' end,
          'Ledger 외부 납입 인정 연동',before_value,to_jsonb(saved));
    end if;
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

create or replace function finance.collection_ledger_read(p_org uuid,p_actor uuid) returns jsonb
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
    'source_root_recognition_id',x.source_root_recognition_id,
    'source_current_recognition_id',x.source_current_recognition_id,
    'source_assessment_id',x.source_assessment_id,'external_member_id',x.external_member_id,
    'member_name_snapshot',x.source_payload->>'member_name_snapshot',
    'recognized_on',x.recognized_on,'recognized_amount',x.recognized_amount,
    'claimed_amount',x.source_payload->>'claimed_amount',
    'recognition_type',x.recognition_type,'reason',x.reason,'status',x.status,
    'linkage_status',x.linkage_status,'linkage_issue_detail',x.linkage_issue_detail,
    'governance_status',x.source_payload#>>'{recognition,governance_status}',
    'sync_reason',x.source_payload->>'sync_reason','source_version',x.source_version,
    'source_updated_at',x.source_updated_at,'source_payload',x.source_payload
  ) order by x.source_updated_at desc,x.id),'[]'::jsonb) into recognitions
  from finance.collection_external_recognitions x where x.organization_id=p_org;
  return base||jsonb_build_object('assessments',assessments,'external_recognitions',recognitions);
end $$;

create or replace function finance.financial_report_live(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare base jsonb; recognition_total numeric; cash_total numeric;
begin
  base:=finance.financial_report_live_cash_legacy(p_org,p_actor);
  select coalesce(sum(x.recognized_amount),0) into recognition_total
    from finance.collection_external_recognitions x
    where x.organization_id=p_org and x.status='ACTIVE' and x.assessment_id is not null;
  cash_total:=coalesce((base#>>'{quarterly,receipt_total}')::numeric,0);
  return jsonb_set(base,'{quarterly}',(base->'quarterly')||jsonb_build_object(
    'external_recognition_total',recognition_total,
    'satisfied_total',cash_total+recognition_total
  ),true);
end $$;

revoke all on function finance.sync_ledger_external_recognitions(uuid,uuid,text,bigint,bigint,jsonb),
  finance.collection_ledger_read(uuid,uuid),finance.financial_report_live(uuid,uuid)
  from public,anon,authenticated;
grant execute on function finance.sync_ledger_external_recognitions(uuid,uuid,text,bigint,bigint,jsonb),
  finance.collection_ledger_read(uuid,uuid),finance.financial_report_live(uuid,uuid)
  to service_role;

notify pgrst, 'reload schema';
