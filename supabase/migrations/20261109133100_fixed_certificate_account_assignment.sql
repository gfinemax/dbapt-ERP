-- 동일건설 정액 필증 137건을 Google Sheet 116명 명단과 대조한 뒤
-- 원본을 바꾸지 않고 분담금/가수금 ERP 계정과목 배정을 별도 감사 원장에 보존한다.
create table finance.fixed_certificate_assignment_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_document_id text not null,
  source_sheet_id bigint not null,
  source_sheet_name text not null,
  source_range text not null,
  source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  source_signature text not null check(source_signature ~ '^[0-9a-f]{64}$'),
  status text not null default 'PREVIEW' check(status in ('PREVIEW','APPLIED','CANCELLED')),
  reference_count integer not null check(reference_count=116),
  contribution_account_subject_id uuid not null references finance.account_subjects(id) on delete restrict,
  suspense_account_subject_id uuid not null references finance.account_subjects(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_by_label text not null,
  applied_by uuid references auth.users(id) on delete restrict,
  applied_at timestamptz,
  apply_reason text,
  apply_operation_key text,
  lock_version integer not null default 1 check(lock_version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,source_hash,source_signature),
  unique(organization_id,id)
);

create table finance.fixed_certificate_assignment_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  batch_id uuid not null,
  sheet_row_number integer not null check(sheet_row_number between 4 and 119),
  sheet_name_snapshot text not null check(length(trim(sheet_name_snapshot)) between 1 and 100),
  normalized_name text not null check(length(normalized_name) between 1 and 100),
  source_root_recognition_id text,
  external_member_id text,
  erp_name_snapshot text,
  source_version bigint,
  match_status text not null check(match_status in ('EXACT','MANUAL','UNRESOLVED')),
  matched_by uuid references auth.users(id) on delete restrict,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,batch_id)
    references finance.fixed_certificate_assignment_batches(organization_id,id) on delete restrict,
  unique(batch_id,sheet_row_number),
  unique(batch_id,normalized_name),
  unique(batch_id,source_root_recognition_id)
);

create table finance.fixed_certificate_account_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  batch_id uuid not null,
  source_root_recognition_id text not null,
  external_member_id text not null,
  member_name_snapshot text not null,
  source_version bigint not null check(source_version>0),
  source_status text not null check(source_status in ('ACTIVE','CANCELLED')),
  assignment_category text not null check(assignment_category in ('CONTRIBUTION','SUSPENSE')),
  account_subject_id uuid not null references finance.account_subjects(id) on delete restrict,
  assignment_basis text not null check(assignment_basis in ('GOOGLE_SHEET_EXACT','GOOGLE_SHEET_MANUAL','NOT_IN_GOOGLE_SHEET')),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  reason text not null check(length(trim(reason)) between 2 and 500),
  foreign key(organization_id,batch_id)
    references finance.fixed_certificate_assignment_batches(organization_id,id) on delete restrict,
  unique(batch_id,source_root_recognition_id)
);

create index fixed_certificate_batches_org_idx
  on finance.fixed_certificate_assignment_batches(organization_id,created_at desc);
create index fixed_certificate_rows_batch_status_idx
  on finance.fixed_certificate_assignment_rows(batch_id,match_status,sheet_row_number);
create index fixed_certificate_assignments_current_idx
  on finance.fixed_certificate_account_assignments(organization_id,source_root_recognition_id,assigned_at desc);

alter table finance.fixed_certificate_assignment_batches enable row level security;
alter table finance.fixed_certificate_assignment_rows enable row level security;
alter table finance.fixed_certificate_account_assignments enable row level security;

revoke all on finance.fixed_certificate_assignment_batches,
  finance.fixed_certificate_assignment_rows,
  finance.fixed_certificate_account_assignments from public,anon,authenticated;
grant select,insert,update on finance.fixed_certificate_assignment_batches,
  finance.fixed_certificate_assignment_rows to service_role;
grant select,insert on finance.fixed_certificate_account_assignments to service_role;

create policy fixed_certificate_batches_server on finance.fixed_certificate_assignment_batches
  for all to service_role using(true) with check(true);
create policy fixed_certificate_rows_server on finance.fixed_certificate_assignment_rows
  for all to service_role using(true) with check(true);
create policy fixed_certificate_assignments_server on finance.fixed_certificate_account_assignments
  for all to service_role using(true) with check(true);

create trigger fixed_certificate_assignments_immutable
before update or delete on finance.fixed_certificate_account_assignments
for each row execute function finance.collection_ledger_immutable();

create or replace function finance.fixed_certificate_normalized_name(p_value text)
returns text
language sql
immutable
security invoker
set search_path=''
as $$
  select lower(regexp_replace(trim(coalesce(p_value,'')),'\s+','','g'))
$$;

create or replace function finance.fixed_certificate_assignment_read(p_org uuid,p_actor uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  member finance.reimbursement_members;
  batch finance.fixed_certificate_assignment_batches;
  rows_value jsonb;
  candidates_value jsonb;
  assignments_value jsonb;
  fixed_count integer;
  exact_count integer;
  manual_count integer;
  unresolved_count integer;
  active_contribution_count integer;
  active_suspense_count integer;
  contribution_amount numeric;
  suspense_amount numeric;
  stale boolean;
begin
  member:=finance.workflow_actor(p_org,p_actor);
  if not (member.permissions && array['ADMIN','CLOSE','APPROVE','SENIOR']) then
    raise exception '정액 필증 계정과목 대조 권한이 필요합니다.';
  end if;

  select * into batch
  from finance.fixed_certificate_assignment_batches b
  where b.organization_id=p_org
  order by b.created_at desc,b.id desc
  limit 1;
  if not found then return null; end if;

  select count(*) into fixed_count
  from finance.collection_external_recognitions x
  where x.organization_id=p_org and x.source_kind='dongil_fixed_certificate';
  select
    count(*) filter(where r.match_status='EXACT'),
    count(*) filter(where r.match_status='MANUAL'),
    count(*) filter(where r.match_status='UNRESOLVED')
  into exact_count,manual_count,unresolved_count
  from finance.fixed_certificate_assignment_rows r
  where r.organization_id=p_org and r.batch_id=batch.id;

  select exists(
    select 1
    from finance.fixed_certificate_assignment_rows r
    left join finance.collection_external_recognitions x
      on x.organization_id=p_org
     and coalesce(x.source_root_recognition_id,x.source_recognition_id)=r.source_root_recognition_id
     and x.source_kind='dongil_fixed_certificate'
    where r.organization_id=p_org and r.batch_id=batch.id
      and batch.status='PREVIEW'
      and r.source_root_recognition_id is not null
      and (x.id is null or x.source_version is distinct from r.source_version)
  ) into stale;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sheet_row_number',r.sheet_row_number,
    'sheet_name_snapshot',r.sheet_name_snapshot,
    'source_root_recognition_id',r.source_root_recognition_id,
    'external_member_id',r.external_member_id,
    'erp_name_snapshot',r.erp_name_snapshot,
    'source_version',r.source_version,
    'match_status',r.match_status
  ) order by r.sheet_row_number),'[]'::jsonb) into rows_value
  from finance.fixed_certificate_assignment_rows r
  where r.organization_id=p_org and r.batch_id=batch.id and batch.status='PREVIEW';

  select coalesce(jsonb_agg(jsonb_build_object(
    'source_root_recognition_id',coalesce(x.source_root_recognition_id,x.source_recognition_id),
    'external_member_id',x.external_member_id,
    'member_name_snapshot',x.source_payload->>'member_name_snapshot',
    'source_version',x.source_version,
    'status',x.status,
    'member_group',x.source_payload->>'member_group',
    'member_status',x.source_payload->>'member_status'
  ) order by x.source_payload->>'member_name_snapshot',coalesce(x.source_root_recognition_id,x.source_recognition_id)),'[]'::jsonb)
  into candidates_value
  from finance.collection_external_recognitions x
  where x.organization_id=p_org and x.source_kind='dongil_fixed_certificate' and batch.status='PREVIEW'
    and not exists(
      select 1 from finance.fixed_certificate_assignment_rows r
      where r.organization_id=p_org and r.batch_id=batch.id
        and r.source_root_recognition_id=coalesce(x.source_root_recognition_id,x.source_recognition_id)
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'source_root_recognition_id',a.source_root_recognition_id,
    'external_member_id',a.external_member_id,
    'member_name_snapshot',a.member_name_snapshot,
    'source_version',a.source_version,
    'source_status',a.source_status,
    'assignment_category',a.assignment_category,
    'account_subject_id',a.account_subject_id,
    'assignment_basis',a.assignment_basis
  ) order by a.member_name_snapshot,a.source_root_recognition_id),'[]'::jsonb) into assignments_value
  from finance.fixed_certificate_account_assignments a
  where a.organization_id=p_org and a.batch_id=batch.id;

  select
    count(*) filter(where a.assignment_category='CONTRIBUTION' and x.status='ACTIVE'),
    count(*) filter(where a.assignment_category='SUSPENSE' and x.status='ACTIVE'),
    coalesce(sum(x.recognized_amount) filter(where a.assignment_category='CONTRIBUTION' and x.status='ACTIVE'),0),
    coalesce(sum(x.recognized_amount) filter(where a.assignment_category='SUSPENSE' and x.status='ACTIVE'),0)
  into active_contribution_count,active_suspense_count,contribution_amount,suspense_amount
  from finance.fixed_certificate_account_assignments a
  join finance.collection_external_recognitions x
    on x.organization_id=p_org
   and coalesce(x.source_root_recognition_id,x.source_recognition_id)=a.source_root_recognition_id
  where a.organization_id=p_org and a.batch_id=batch.id;

  return jsonb_build_object(
    'batch',jsonb_build_object(
      'id',batch.id,'status',batch.status,'source_document_id',batch.source_document_id,
      'source_sheet_id',batch.source_sheet_id,'source_sheet_name',batch.source_sheet_name,
      'source_range',batch.source_range,'source_hash',batch.source_hash,
      'source_signature',batch.source_signature,'reference_count',batch.reference_count,
      'contribution_account_subject_id',batch.contribution_account_subject_id,
      'suspense_account_subject_id',batch.suspense_account_subject_id,
      'created_by_label',batch.created_by_label,'created_at',batch.created_at,
      'applied_at',batch.applied_at,'apply_reason',batch.apply_reason,
      'lock_version',batch.lock_version
    ),
    'summary',jsonb_build_object(
      'fixed_count',fixed_count,'exact_count',coalesce(exact_count,0),
      'manual_count',coalesce(manual_count,0),'unresolved_count',coalesce(unresolved_count,0),
      'contribution_count',coalesce(exact_count,0)+coalesce(manual_count,0),
      'suspense_count',fixed_count-coalesce(exact_count,0)-coalesce(manual_count,0),
      'active_contribution_count',coalesce(active_contribution_count,0),
      'active_suspense_count',coalesce(active_suspense_count,0),
      'contribution_amount',coalesce(contribution_amount,0),
      'suspense_amount',coalesce(suspense_amount,0),
      'is_stale',stale
    ),
    'rows',rows_value,'candidates',candidates_value,'assignments',assignments_value
  );
end
$$;

create or replace function finance.fixed_certificate_assignment_preview(
  p_org uuid,
  p_actor uuid,
  p_source_document_id text,
  p_source_sheet_id bigint,
  p_source_sheet_name text,
  p_source_range text,
  p_source_hash text,
  p_names jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor finance.reimbursement_members;
  batch finance.fixed_certificate_assignment_batches;
  name_item jsonb;
  row_number_value integer;
  name_value text;
  normalized_value text;
  matched finance.collection_external_recognitions;
  matched_id uuid;
  matching_count integer;
  fixed_count integer;
  contribution_subject uuid;
  suspense_subject uuid;
  source_signature_value text;
begin
  actor:=finance.workflow_actor(p_org,p_actor);
  if not (actor.permissions && array['ADMIN','CLOSE','APPROVE']) then
    raise exception '정액 필증 계정과목 대조 권한이 필요합니다.';
  end if;
  if jsonb_typeof(p_names) is distinct from 'array' or jsonb_array_length(p_names)<>116 then
    raise exception 'Google 시트 이름 명단은 정확히 116명이어야 합니다.';
  end if;
  if p_source_hash !~ '^[0-9a-f]{64}$' or trim(coalesce(p_source_document_id,''))=''
    or trim(coalesce(p_source_sheet_name,''))='' or trim(coalesce(p_source_range,''))='' then
    raise exception 'Google 시트 원본 정보를 확인해주세요.';
  end if;

  select count(*) into fixed_count from finance.collection_external_recognitions x
  where x.organization_id=p_org and x.source_kind='dongil_fixed_certificate';
  if fixed_count<>137 then raise exception '정액 필증 원장은 137건이어야 합니다. 현재 %건입니다.',fixed_count; end if;

  select s.id into contribution_subject from finance.account_subjects s
  where s.organization_id=p_org and s.is_active and s.name='분담금'
  order by s.id limit 1;
  if contribution_subject is null or (select count(*) from finance.account_subjects s where s.organization_id=p_org and s.is_active and s.name='분담금')<>1 then
    raise exception '활성 분담금 계정과목을 하나로 확인해주세요.';
  end if;
  select s.id into suspense_subject from finance.account_subjects s
  where s.organization_id=p_org and s.is_active and s.name='가수금'
  order by s.id limit 1;
  if suspense_subject is null or (select count(*) from finance.account_subjects s where s.organization_id=p_org and s.is_active and s.name='가수금')<>1 then
    raise exception '활성 가수금 계정과목을 하나로 확인해주세요.';
  end if;

  select encode(extensions.digest(convert_to(string_agg(
    coalesce(x.source_root_recognition_id,x.source_recognition_id)||':'||x.source_version::text,
    '|' order by coalesce(x.source_root_recognition_id,x.source_recognition_id)
  ),'UTF8'),'sha256'),'hex') into source_signature_value
  from finance.collection_external_recognitions x
  where x.organization_id=p_org and x.source_kind='dongil_fixed_certificate';

  select * into batch from finance.fixed_certificate_assignment_batches b
  where b.organization_id=p_org and b.source_hash=p_source_hash and b.source_signature=source_signature_value;
  if found then return finance.fixed_certificate_assignment_read(p_org,p_actor); end if;

  insert into finance.fixed_certificate_assignment_batches(
    organization_id,source_document_id,source_sheet_id,source_sheet_name,source_range,
    source_hash,source_signature,reference_count,contribution_account_subject_id,
    suspense_account_subject_id,created_by,created_by_label
  ) values (
    p_org,trim(p_source_document_id),p_source_sheet_id,trim(p_source_sheet_name),trim(p_source_range),
    p_source_hash,source_signature_value,116,contribution_subject,suspense_subject,p_actor,actor.display_name
  ) returning * into batch;

  for name_item in select value from jsonb_array_elements(p_names) loop
    row_number_value:=nullif(name_item->>'row_number','')::integer;
    name_value:=trim(coalesce(name_item->>'name',''));
    normalized_value:=finance.fixed_certificate_normalized_name(name_value);
    if row_number_value not between 4 and 119 or length(name_value) not between 1 and 100 then
      raise exception 'Google 시트 이름 행을 확인해주세요.';
    end if;
    if exists(select 1 from finance.fixed_certificate_assignment_rows r where r.batch_id=batch.id and (r.sheet_row_number=row_number_value or r.normalized_name=normalized_value)) then
      raise exception 'Google 시트 명단에 중복 행 또는 중복 이름이 있습니다.';
    end if;

    matched_id:=null;
    select count(*) into matching_count
    from finance.collection_external_recognitions x
    where x.organization_id=p_org and x.source_kind='dongil_fixed_certificate'
      and finance.fixed_certificate_normalized_name(x.source_payload->>'member_name_snapshot')=normalized_value;
    if matching_count=1 then
      select x.id into matched_id
      from finance.collection_external_recognitions x
      where x.organization_id=p_org and x.source_kind='dongil_fixed_certificate'
        and finance.fixed_certificate_normalized_name(x.source_payload->>'member_name_snapshot')=normalized_value
      order by x.id limit 1;
      select * into matched from finance.collection_external_recognitions x
      where x.id=matched_id;
    end if;
    insert into finance.fixed_certificate_assignment_rows(
      organization_id,batch_id,sheet_row_number,sheet_name_snapshot,normalized_name,
      source_root_recognition_id,external_member_id,erp_name_snapshot,source_version,
      match_status,matched_by,matched_at
    ) values (
      p_org,batch.id,row_number_value,name_value,normalized_value,
      case when matching_count=1 then coalesce(matched.source_root_recognition_id,matched.source_recognition_id) end,
      case when matching_count=1 then matched.external_member_id end,
      case when matching_count=1 then matched.source_payload->>'member_name_snapshot' end,
      case when matching_count=1 then matched.source_version end,
      case when matching_count=1 then 'EXACT' else 'UNRESOLVED' end,
      case when matching_count=1 then p_actor end,
      case when matching_count=1 then clock_timestamp() end
    );
  end loop;

  insert into finance.collection_ledger_events(
    organization_id,actor_id,entity_id,action,reason,before_data,after_data
  ) values (
    p_org,p_actor,batch.id,'FIXED_CERTIFICATE_ASSIGNMENT_PREVIEW','Google 시트 116명 대조 미리보기',null,
    jsonb_build_object('source_hash',p_source_hash,'source_signature',source_signature_value,'reference_count',116)
  );
  return finance.fixed_certificate_assignment_read(p_org,p_actor);
end
$$;

create or replace function finance.fixed_certificate_assignment_map(
  p_org uuid,
  p_actor uuid,
  p_batch uuid,
  p_sheet_row_number integer,
  p_source_root_recognition_id text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor finance.reimbursement_members;
  batch finance.fixed_certificate_assignment_batches;
  target finance.fixed_certificate_assignment_rows;
  recognition finance.collection_external_recognitions;
  previous jsonb;
begin
  actor:=finance.workflow_actor(p_org,p_actor);
  if not (actor.permissions && array['ADMIN','CLOSE','APPROVE']) then raise exception '정액 필증 명단 대조 권한이 필요합니다.'; end if;
  select * into batch from finance.fixed_certificate_assignment_batches b
  where b.organization_id=p_org and b.id=p_batch for update;
  if not found or batch.status<>'PREVIEW' then raise exception '수정 가능한 최신 미리보기를 확인해주세요.'; end if;
  select * into target from finance.fixed_certificate_assignment_rows r
  where r.organization_id=p_org and r.batch_id=p_batch and r.sheet_row_number=p_sheet_row_number for update;
  if not found then raise exception '대조할 시트 행을 찾지 못했습니다.'; end if;
  previous:=to_jsonb(target);

  if nullif(trim(coalesce(p_source_root_recognition_id,'')),'') is null then
    update finance.fixed_certificate_assignment_rows set
      source_root_recognition_id=null,external_member_id=null,erp_name_snapshot=null,
      source_version=null,match_status='UNRESOLVED',matched_by=null,matched_at=null,updated_at=clock_timestamp()
    where id=target.id;
  else
    select * into recognition from finance.collection_external_recognitions x
    where x.organization_id=p_org and x.source_kind='dongil_fixed_certificate'
      and coalesce(x.source_root_recognition_id,x.source_recognition_id)=trim(p_source_root_recognition_id);
    if not found then raise exception '정액 필증 ERP 원본을 찾지 못했습니다.'; end if;
    if exists(select 1 from finance.fixed_certificate_assignment_rows r
      where r.organization_id=p_org and r.batch_id=p_batch and r.id<>target.id
        and r.source_root_recognition_id=trim(p_source_root_recognition_id)) then
      raise exception '이미 다른 명단 행에 연결한 ERP 원본입니다.';
    end if;
    update finance.fixed_certificate_assignment_rows set
      source_root_recognition_id=coalesce(recognition.source_root_recognition_id,recognition.source_recognition_id),
      external_member_id=recognition.external_member_id,
      erp_name_snapshot=recognition.source_payload->>'member_name_snapshot',source_version=recognition.source_version,
      match_status='MANUAL',matched_by=p_actor,matched_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=target.id;
  end if;
  update finance.fixed_certificate_assignment_batches set lock_version=lock_version+1,updated_at=clock_timestamp()
  where id=batch.id;
  insert into finance.collection_ledger_events(
    organization_id,actor_id,entity_id,action,reason,before_data,after_data
  ) values (
    p_org,p_actor,batch.id,'FIXED_CERTIFICATE_ASSIGNMENT_MAP','116명 명단 수동 대조',previous,
    (select to_jsonb(r) from finance.fixed_certificate_assignment_rows r where r.id=target.id)
  );
  return finance.fixed_certificate_assignment_read(p_org,p_actor);
end
$$;

create or replace function finance.fixed_certificate_assignment_apply(
  p_org uuid,
  p_actor uuid,
  p_batch uuid,
  p_reason text,
  p_operation_key text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor finance.reimbursement_members;
  batch finance.fixed_certificate_assignment_batches;
  fixed_count integer;
  matched_count integer;
  unresolved_count integer;
  stale_count integer;
begin
  actor:=finance.workflow_actor(p_org,p_actor);
  if not (actor.permissions && array['ADMIN','CLOSE','APPROVE']) then raise exception '정액 필증 계정과목 적용 권한이 필요합니다.'; end if;
  if length(trim(coalesce(p_reason,''))) not between 2 and 500 or length(trim(coalesce(p_operation_key,''))) not between 1 and 200 then
    raise exception '적용 사유와 처리키를 확인해주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||trim(p_operation_key),916));
  select * into batch from finance.fixed_certificate_assignment_batches b
  where b.organization_id=p_org and b.id=p_batch for update;
  if not found then raise exception '적용할 미리보기를 찾지 못했습니다.'; end if;
  if batch.status='APPLIED' then
    if batch.apply_operation_key=trim(p_operation_key) then return finance.fixed_certificate_assignment_read(p_org,p_actor); end if;
    raise exception '이미 적용된 대조 배치입니다.';
  end if;
  if batch.status<>'PREVIEW' then raise exception '적용 가능한 미리보기가 아닙니다.'; end if;

  select count(*) into fixed_count from finance.collection_external_recognitions x
  where x.organization_id=p_org and x.source_kind='dongil_fixed_certificate';
  select
    count(*) filter(where r.source_root_recognition_id is not null),
    count(*) filter(where r.match_status='UNRESOLVED')
  into matched_count,unresolved_count
  from finance.fixed_certificate_assignment_rows r
  where r.organization_id=p_org and r.batch_id=batch.id;
  select count(*) into stale_count
  from finance.fixed_certificate_assignment_rows r
  left join finance.collection_external_recognitions x
    on x.organization_id=p_org and x.source_kind='dongil_fixed_certificate'
   and coalesce(x.source_root_recognition_id,x.source_recognition_id)=r.source_root_recognition_id
  where r.organization_id=p_org and r.batch_id=batch.id
    and (r.source_root_recognition_id is null or x.id is null or x.source_version is distinct from r.source_version);
  if fixed_count<>137 or matched_count<>116 or unresolved_count<>0 or stale_count<>0 then
    raise exception '116명 분담금·21명 가수금 대조와 최신 원본을 다시 확인해주세요.';
  end if;
  if not exists(select 1 from finance.account_subjects s where s.organization_id=p_org and s.id=batch.contribution_account_subject_id and s.is_active)
    or not exists(select 1 from finance.account_subjects s where s.organization_id=p_org and s.id=batch.suspense_account_subject_id and s.is_active) then
    raise exception '분담금·가수금 계정과목이 현재 활성 상태인지 확인해주세요.';
  end if;

  insert into finance.fixed_certificate_account_assignments(
    organization_id,batch_id,source_root_recognition_id,external_member_id,member_name_snapshot,
    source_version,source_status,assignment_category,account_subject_id,assignment_basis,assigned_by,reason
  )
  select p_org,batch.id,coalesce(x.source_root_recognition_id,x.source_recognition_id),x.external_member_id,
    coalesce(x.source_payload->>'member_name_snapshot',''),x.source_version,x.status,
    case when r.id is not null then 'CONTRIBUTION' else 'SUSPENSE' end,
    case when r.id is not null then batch.contribution_account_subject_id else batch.suspense_account_subject_id end,
    case when r.match_status='EXACT' then 'GOOGLE_SHEET_EXACT'
         when r.match_status='MANUAL' then 'GOOGLE_SHEET_MANUAL'
         else 'NOT_IN_GOOGLE_SHEET' end,
    p_actor,trim(p_reason)
  from finance.collection_external_recognitions x
  left join finance.fixed_certificate_assignment_rows r
    on r.organization_id=p_org and r.batch_id=batch.id
   and r.source_root_recognition_id=coalesce(x.source_root_recognition_id,x.source_recognition_id)
  where x.organization_id=p_org and x.source_kind='dongil_fixed_certificate';

  update finance.fixed_certificate_assignment_batches set
    status='APPLIED',applied_by=p_actor,applied_at=clock_timestamp(),apply_reason=trim(p_reason),
    apply_operation_key=trim(p_operation_key),lock_version=lock_version+1,updated_at=clock_timestamp()
  where id=batch.id;
  insert into finance.collection_ledger_events(
    organization_id,actor_id,entity_id,action,reason,before_data,after_data
  ) values (
    p_org,p_actor,batch.id,'FIXED_CERTIFICATE_ASSIGNMENT_APPLY',trim(p_reason),
    jsonb_build_object('status','PREVIEW'),
    jsonb_build_object('status','APPLIED','contribution_count',116,'suspense_count',21)
  );
  insert into audit.audit_logs(
    organization_id,auth_actor_id,actor_label,action,entity_schema,entity_table,entity_id,after_data
  ) values (
    p_org,p_actor,actor.display_name,'FIXED_CERTIFICATE_ACCOUNT_ASSIGNMENT','finance','fixed_certificate_assignment_batches',batch.id::text,
    jsonb_build_object('contribution_count',116,'suspense_count',21,'reason',trim(p_reason),
      'source_hash',batch.source_hash,'source_signature',batch.source_signature)
  );
  return finance.fixed_certificate_assignment_read(p_org,p_actor);
end
$$;

revoke all on function finance.fixed_certificate_normalized_name(text),
  finance.fixed_certificate_assignment_read(uuid,uuid),
  finance.fixed_certificate_assignment_preview(uuid,uuid,text,bigint,text,text,text,jsonb),
  finance.fixed_certificate_assignment_map(uuid,uuid,uuid,integer,text),
  finance.fixed_certificate_assignment_apply(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function finance.fixed_certificate_assignment_read(uuid,uuid),
  finance.fixed_certificate_normalized_name(text),
  finance.fixed_certificate_assignment_preview(uuid,uuid,text,bigint,text,text,text,jsonb),
  finance.fixed_certificate_assignment_map(uuid,uuid,uuid,integer,text),
  finance.fixed_certificate_assignment_apply(uuid,uuid,uuid,text,text)
  to service_role;

notify pgrst, 'reload schema';
