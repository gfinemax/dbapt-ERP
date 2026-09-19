-- Audited preview/apply bridge for bulk assessment CSV imports.
-- The original file hash and normalized preview rows are preserved. Names are never matching keys.
create table finance.collection_assessment_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  original_file_name text not null check(length(trim(original_file_name)) between 1 and 255),
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  row_count integer not null check(row_count between 1 and 1000),
  status text not null default 'PREVIEW' check(status in ('PREVIEW','APPLIED')),
  created_by uuid not null references auth.users(id) on delete restrict,
  applied_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique(organization_id,id),
  check((status='PREVIEW' and applied_by is null and applied_at is null) or (status='APPLIED' and applied_by is not null and applied_at is not null))
);

create table finance.collection_assessment_import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  batch_id uuid not null,
  row_number integer not null check(row_number>=2),
  external_member_id text not null,
  member_no text,
  member_name_snapshot text not null,
  assessment_code text not null,
  due_date date,
  assessed_amount numeric(16,0) not null,
  action text not null check(action in ('CREATE','UPDATE','UNCHANGED','ERROR')),
  issue text,
  existing_assessment_id uuid,
  expected_lock_version integer,
  created_at timestamptz not null default now(),
  foreign key(organization_id,batch_id) references finance.collection_assessment_import_batches(organization_id,id),
  foreign key(organization_id,existing_assessment_id) references finance.collection_assessments(organization_id,id),
  check((action in ('UPDATE','UNCHANGED') and existing_assessment_id is not null and expected_lock_version is not null)
    or (action in ('CREATE','ERROR')))
);

create index collection_assessment_import_batch_idx on finance.collection_assessment_import_rows(organization_id,batch_id,row_number);
create index collection_assessment_import_key_idx on finance.collection_assessment_import_rows(organization_id,external_member_id,assessment_code);

alter table finance.collection_assessment_import_batches enable row level security;
alter table finance.collection_assessment_import_rows enable row level security;
revoke all on finance.collection_assessment_import_batches,finance.collection_assessment_import_rows from public,anon,authenticated;
grant select,insert,update on finance.collection_assessment_import_batches to service_role;
grant select,insert on finance.collection_assessment_import_rows to service_role;
create policy collection_assessment_import_batches_server on finance.collection_assessment_import_batches for all to service_role using(true) with check(true);
create policy collection_assessment_import_rows_server on finance.collection_assessment_import_rows for all to service_role using(true) with check(true);

create trigger collection_assessment_import_rows_immutable before update or delete on finance.collection_assessment_import_rows
for each row execute function finance.collection_ledger_immutable();

create function finance.collection_assessment_import_result(p_org uuid,p_batch uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'batch_id',b.id,'file_name',b.original_file_name,'content_hash',b.content_hash,'status',b.status,'row_count',b.row_count,
  'create_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='CREATE'),
  'update_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='UPDATE'),
  'unchanged_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='UNCHANGED'),
  'error_count',(select count(*) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id and r.action='ERROR'),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('row_number',r.row_number,'external_member_id',r.external_member_id,'member_no',r.member_no,
    'member_name_snapshot',r.member_name_snapshot,'assessment_code',r.assessment_code,'due_date',r.due_date,'assessed_amount',r.assessed_amount,
    'action',r.action,'issue',r.issue) order by r.row_number) from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=b.id),'[]'::jsonb)
 ) from finance.collection_assessment_import_batches b where b.organization_id=p_org and b.id=p_batch
$$;

create function finance.collection_assessment_import_preview(p_org uuid,p_actor uuid,p_file_name text,p_content_hash text,p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; batch finance.collection_assessment_import_batches; item jsonb; existing finance.collection_assessments;
 row_no integer; external_id text; member_number text; member_name text; code text; due_value date; amount_value numeric; row_action text; issue_value text; duplicate_count integer; allocated numeric;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not (m.permissions && array['ADMIN','CLOSE','APPROVE']) then raise exception '분담금 부과자료 등록 권한이 필요합니다.'; end if;
 if coalesce(length(trim(p_file_name)),0) not between 1 and 255 or p_content_hash !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'CSV 파일 정보를 확인해주세요.'; end if;
 insert into finance.collection_assessment_import_batches(organization_id,original_file_name,content_hash,row_count,created_by)
 values(p_org,trim(p_file_name),p_content_hash,jsonb_array_length(p_rows),p_actor) returning * into batch;

 for item in select value from jsonb_array_elements(p_rows) loop
  row_no:=coalesce((item->>'row_number')::integer,0); external_id:=trim(coalesce(item->>'external_member_id','')); member_number:=nullif(trim(coalesce(item->>'member_no','')),'');
  member_name:=trim(coalesce(item->>'member_name_snapshot','')); code:=trim(coalesce(item->>'assessment_code','')); row_action:='ERROR'; issue_value:=null; due_value:=null; amount_value:=0;
  begin amount_value:=(item->>'assessed_amount')::numeric; exception when others then amount_value:=0; end;
  begin if nullif(item->>'due_date','') is not null then due_value:=(item->>'due_date')::date; end if; exception when others then issue_value:='납부기한이 올바른 날짜가 아니야.'; end;
  if row_no<2 or length(external_id) not between 1 and 200 or length(member_name) not between 1 and 200 or length(code) not between 1 and 100 or amount_value<=0 or amount_value<>trunc(amount_value) then
   issue_value:=coalesce(issue_value,'필수값과 부과액을 확인해줘.');
  end if;
  select count(*) into duplicate_count from jsonb_array_elements(p_rows) x
   where trim(coalesce(x->>'external_member_id',''))=external_id and trim(coalesce(x->>'assessment_code',''))=code;
  if duplicate_count>1 then issue_value:='파일 안에 같은 외부 조합원 ID와 부과코드가 중복돼.'; end if;
  existing:=null;
  select * into existing from finance.collection_assessments a where a.organization_id=p_org and a.external_member_id=external_id and a.assessment_code=code;
  if issue_value is null and existing.id is null then row_action:='CREATE';
  elsif issue_value is null and existing.status<>'ACTIVE' then issue_value:='취소된 기존 부과자료와 같은 고유 키야.';
  elsif issue_value is null then
   select coalesce(sum(x.amount),0) into allocated from finance.collection_receipt_allocations x left join finance.collection_receipt_reversals rr on rr.allocation_id=x.id
    where x.organization_id=p_org and x.assessment_id=existing.id and rr.id is null;
   if amount_value<allocated then issue_value:='이미 수납 배분한 금액보다 부과액이 작아.';
   elsif existing.member_no is not distinct from member_number and existing.member_name_snapshot=member_name and existing.due_date is not distinct from due_value and existing.assessed_amount=amount_value then row_action:='UNCHANGED';
   else row_action:='UPDATE'; end if;
  end if;
  if issue_value is not null then row_action:='ERROR'; end if;
  insert into finance.collection_assessment_import_rows(organization_id,batch_id,row_number,external_member_id,member_no,member_name_snapshot,assessment_code,due_date,assessed_amount,action,issue,existing_assessment_id,expected_lock_version)
  values(p_org,batch.id,row_no,external_id,member_number,member_name,code,due_value,amount_value,row_action,issue_value,existing.id,existing.lock_version);
 end loop;
 return finance.collection_assessment_import_result(p_org,batch.id);
end $$;

create function finance.collection_assessment_import_apply(p_org uuid,p_actor uuid,p_batch uuid,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; batch finance.collection_assessment_import_batches; saved finance.collection_ledger_operations; row_data finance.collection_assessment_import_rows; existing finance.collection_assessments; result jsonb; before_value jsonb; entity uuid; allocated numeric;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not (m.permissions && array['ADMIN','CLOSE','APPROVE']) then raise exception '분담금 부과자료 등록 권한이 필요합니다.'; end if;
 if coalesce(length(trim(p_key)),0) not between 1 and 200 then raise exception '처리키를 확인해주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_key,913));
 select * into saved from finance.collection_ledger_operations where organization_id=p_org and operation_key=p_key;
 if found then
  if saved.actor_id<>p_actor or saved.command<>'ASSESSMENT_IMPORT_APPLY' or saved.input<>jsonb_build_object('batch_id',p_batch) then raise exception '다른 처리에 사용된 처리키입니다.'; end if;
  return saved.result;
 end if;
 select * into batch from finance.collection_assessment_import_batches where organization_id=p_org and id=p_batch for update;
 if not found or batch.status<>'PREVIEW' then raise exception '적용할 미리보기를 새로 확인해줘.'; end if;
 if exists(select 1 from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=p_batch and r.action='ERROR') then raise exception '오류 행을 수정하고 새 미리보기를 만들어줘.'; end if;

 for row_data in select * from finance.collection_assessment_import_rows r where r.organization_id=p_org and r.batch_id=p_batch order by r.row_number loop
  if row_data.action='CREATE' then
   if exists(select 1 from finance.collection_assessments a where a.organization_id=p_org and a.external_member_id=row_data.external_member_id and a.assessment_code=row_data.assessment_code) then raise exception '미리보기 후 기존 자료가 바뀌었어. 새 미리보기를 만들어줘.'; end if;
   insert into finance.collection_assessments(organization_id,external_member_id,member_no,member_name_snapshot,assessment_code,due_date,assessed_amount,created_by,updated_by)
   values(p_org,row_data.external_member_id,row_data.member_no,row_data.member_name_snapshot,row_data.assessment_code,row_data.due_date,row_data.assessed_amount,p_actor,p_actor) returning id into entity;
   insert into finance.collection_ledger_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
   select p_org,p_actor,entity,'ASSESSMENT_IMPORT_CREATE','CSV 일괄 등록: '||batch.original_file_name,null,to_jsonb(a) from finance.collection_assessments a where a.id=entity;
  elsif row_data.action in ('UPDATE','UNCHANGED') then
   select * into existing from finance.collection_assessments a where a.organization_id=p_org and a.id=row_data.existing_assessment_id for update;
   if not found or existing.status<>'ACTIVE' or existing.lock_version<>row_data.expected_lock_version then raise exception '미리보기 후 기존 자료가 바뀌었어. 새 미리보기를 만들어줘.'; end if;
   if row_data.action='UPDATE' then
    select coalesce(sum(x.amount),0) into allocated from finance.collection_receipt_allocations x left join finance.collection_receipt_reversals rr on rr.allocation_id=x.id where x.organization_id=p_org and x.assessment_id=existing.id and rr.id is null;
    if row_data.assessed_amount<allocated then raise exception '미리보기 후 수납액이 바뀌었어. 새 미리보기를 만들어줘.'; end if;
    before_value:=to_jsonb(existing);
    update finance.collection_assessments set member_no=row_data.member_no,member_name_snapshot=row_data.member_name_snapshot,due_date=row_data.due_date,assessed_amount=row_data.assessed_amount,lock_version=lock_version+1,updated_by=p_actor,updated_at=clock_timestamp() where id=existing.id returning id into entity;
    insert into finance.collection_ledger_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
    select p_org,p_actor,entity,'ASSESSMENT_IMPORT_UPDATE','CSV 일괄 수정: '||batch.original_file_name,before_value,to_jsonb(a) from finance.collection_assessments a where a.id=entity;
   end if;
  end if;
 end loop;
 update finance.collection_assessment_import_batches set status='APPLIED',applied_by=p_actor,applied_at=clock_timestamp() where id=p_batch;
 result:=finance.collection_assessment_import_result(p_org,p_batch);
 insert into finance.collection_ledger_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,p_key,p_actor,'ASSESSMENT_IMPORT_APPLY',jsonb_build_object('batch_id',p_batch),result);
 return result;
end $$;

revoke all on function finance.collection_assessment_import_result(uuid,uuid),finance.collection_assessment_import_preview(uuid,uuid,text,text,jsonb),finance.collection_assessment_import_apply(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function finance.collection_assessment_import_result(uuid,uuid),finance.collection_assessment_import_preview(uuid,uuid,text,text,jsonb),finance.collection_assessment_import_apply(uuid,uuid,uuid,text) to service_role;
