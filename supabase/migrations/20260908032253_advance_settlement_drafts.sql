-- Draft-only staff advance settlement. No payments, budgets or GL entries are posted.
create table finance.advance_settlement_drafts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references core.organizations(id),
 transaction_id uuid not null, title text not null check(length(trim(title))>0), memo text not null default '',
 lock_version integer not null default 1 check(lock_version>0), source_signature text not null, source_snapshot jsonb not null,
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,transaction_id),
 foreign key(organization_id,transaction_id) references finance.workflow_transactions(organization_id,id)
);
create table finance.advance_settlement_funding (
 organization_id uuid not null, draft_id uuid not null, allocation_id uuid not null,
 kind text not null check(kind in ('INITIAL','ADDITIONAL')),
 primary key(organization_id,allocation_id), foreign key(organization_id,draft_id) references finance.advance_settlement_drafts(organization_id,id),
 foreign key(organization_id,allocation_id) references finance.workflow_allocations(organization_id,id)
);
create table finance.advance_settlement_usage (
 organization_id uuid not null, draft_id uuid not null, source_kind text not null check(source_kind in ('RESOLUTION','QUICK','PERSONAL')), source_id text not null,
 source_signature text not null, snapshot jsonb not null, evidence_file_id uuid, evidence_hash text,
 primary key(organization_id,source_kind,source_id), foreign key(organization_id,draft_id) references finance.advance_settlement_drafts(organization_id,id),
 foreign key(organization_id,evidence_file_id) references finance.workflow_files(organization_id,id)
);
create unique index advance_usage_evidence_once on finance.advance_settlement_usage(organization_id,evidence_hash) where evidence_hash is not null;
-- Alias claims reserve explicit QUICK/RESOLUTION/PERSONAL bridges as one usage.
create table finance.advance_settlement_claims (
 organization_id uuid not null, source_kind text not null, source_id text not null, draft_id uuid not null,
 primary key(organization_id,source_kind,source_id), foreign key(organization_id,draft_id) references finance.advance_settlement_drafts(organization_id,id)
);
alter table finance.advance_settlement_drafts enable row level security;
alter table finance.advance_settlement_funding enable row level security;
alter table finance.advance_settlement_usage enable row level security;
alter table finance.advance_settlement_claims enable row level security;
revoke all on finance.advance_settlement_drafts,finance.advance_settlement_funding,finance.advance_settlement_usage,finance.advance_settlement_claims from public,anon,authenticated;
grant select,insert,update,delete on finance.advance_settlement_drafts,finance.advance_settlement_funding,finance.advance_settlement_usage,finance.advance_settlement_claims to service_role;

create function finance.advance_settlement_source(p_org uuid,p_tx uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare t finance.workflow_transactions; r finance.expense_resolutions; allocations jsonb; returns jsonb; snapshot jsonb; legacy boolean;
begin
 select * into t from finance.workflow_transactions where organization_id=p_org and id=p_tx and source_kind='RESOLUTION';
 if not found then raise exception '담당자 선지급 원본을 찾을 수 없습니다.'; end if;
 select * into r from finance.expense_resolutions where organization_id=p_org and id=t.source_id and deleted_at is null;
 if not found or r.expense_timing is distinct from 'ADVANCE' or r.execution_method is distinct from 'EMPLOYEE_ADVANCE'
  or (r.resolution_data->>'expenseTiming' is not null and r.resolution_data->>'expenseTiming'<>'ADVANCE')
  or (r.resolution_data->>'executionMethod' is not null and r.resolution_data->>'executionMethod'<>'EMPLOYEE_ADVANCE') then raise exception '명시적인 담당자 선지급 원결의가 필요합니다.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'payment_id',a.payment_id,'amount',a.amount,'paid_at',p.paid_at,'counterparty',p.counterparty) order by p.paid_at,a.id),'[]') into allocations
 from finance.workflow_allocations a join finance.workflow_payments p on p.organization_id=p_org and p.id=a.payment_id
 where a.organization_id=p_org and a.transaction_id=p_tx and a.purpose='DISBURSEMENT' and p.flow='OUT'
  and not exists(select 1 from finance.workflow_allocation_reversals x where x.allocation_id=a.id);
 if jsonb_array_length(allocations)=0 then raise exception '확인된 실제 선지급 배분이 없습니다. 승인금액으로 대체할 수 없습니다.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'original_allocation_id',a.original_allocation_id,'amount',a.amount,'paid_at',p.paid_at) order by p.paid_at,a.id),'[]') into returns
 from finance.workflow_allocations a join finance.workflow_payments p on p.organization_id=p_org and p.id=a.payment_id
 where a.organization_id=p_org and a.transaction_id=p_tx and a.purpose='RETURN' and p.flow='IN'
  and exists(select 1 from jsonb_array_elements(allocations) f where f->>'id'=a.original_allocation_id::text)
  and not exists(select 1 from finance.workflow_allocation_reversals x where x.allocation_id=a.id);
 if (select sum((f->>'amount')::numeric) from jsonb_array_elements(allocations) f)>9007199254740991 then raise exception '선지급 합계의 안전한 원 단위 범위를 확인해주세요.'; end if;
 legacy:=t.payment_review_required or coalesce(t.legacy_paid_amount,0)>0;
 snapshot:=jsonb_build_object('original',to_jsonb(r),'allocations',allocations,'returns',returns,'legacy_review_required',legacy);
 return jsonb_build_object('transaction_id',t.id,'resolution_id',r.id,'number',r.resolution_no,'title',coalesce(r.subject,r.resolution_no),'signature',md5(snapshot::text),'snapshot',snapshot,
  'legacy_review_required',legacy,'allocations',allocations,'returns',returns,'existing_draft_id',(select id from finance.advance_settlement_drafts where organization_id=p_org and transaction_id=p_tx));
end $$;

create function finance.advance_settlement_usage_source(p_org uuid,p_kind text,p_id text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare src jsonb; used text; claims jsonb; existing uuid; review_reason text;
begin
 if p_kind not in ('RESOLUTION','QUICK','PERSONAL') then raise exception '지원하지 않는 사용 원본입니다.'; end if;
 src:=finance.workflow_source(p_org,p_kind,p_id); used:=src#>>'{snapshot,transactionDate}';
 if nullif(used,'') is null then raise exception '사용일이 확인된 원본만 정산에 연결할 수 있습니다.'; end if;
 if (src->>'amount')::numeric>9007199254740991 then raise exception '사용액의 원 단위 범위를 확인해주세요.'; end if;
 if p_kind='RESOLUTION' and exists(select 1 from finance.expense_resolutions where organization_id=p_org and id=p_id and expense_timing in ('ADVANCE','SETTLEMENT')) then raise exception '선지급 원금·정산결의 총액을 사용비용으로 다시 연결할 수 없습니다.'; end if;
 if p_kind='PERSONAL' or coalesce((src->>'legacy_payment_complete')::boolean,false)
  or nullif(src#>>'{snapshot,legacyBankId}','') is not null or src#>>'{snapshot,method}' in ('CORPORATE_CARD','BANK_TRANSFER','AUTO_DEBIT') then
  review_reason:='별도 지급·카드·개인 환급 원본과 선지급 사용의 중복 여부를 대조해야 합니다.';
 end if;
 with quick_ids as (
  select q.id from finance.quick_expense_records q where q.organization_id=p_org and
   ((p_kind='QUICK' and q.id::text=p_id) or (p_kind='RESOLUTION' and q.linked_resolution_id=p_id) or
    (p_kind='PERSONAL' and q.id::text=src#>>'{snapshot,sourceQuickId}'))
 ), aliases as (
  select p_kind kind,p_id id
  union select 'QUICK',q.id::text from quick_ids q
  union select 'RESOLUTION',q.linked_resolution_id from finance.quick_expense_records q join quick_ids x on x.id=q.id where q.linked_resolution_id is not null
  union select 'PERSONAL',r.id::text from finance.personal_reimbursements r join quick_ids x on x.id=r.source_quick_id where r.organization_id=p_org
 ) select jsonb_agg(jsonb_build_object('kind',kind,'id',id) order by kind,id) into claims from aliases;
 select c.draft_id into existing from finance.advance_settlement_claims c where c.organization_id=p_org and exists(select 1 from jsonb_array_elements(claims) q where q->>'kind'=c.source_kind and q->>'id'=c.source_id) limit 1;
 return jsonb_build_object('kind',p_kind,'id',p_id,'title',src->>'title','amount',(src->>'amount')::numeric,'used_on',used,
  'signature',md5(jsonb_build_object('source',src,'claims',claims)::text),'claims',claims,'existing_draft_id',existing,'review_reason',review_reason);
end $$;

create function finance.advance_settlement_source_read(p_org uuid,p_tx uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin return finance.advance_settlement_source(p_org,p_tx)-'snapshot'; exception when raise_exception then return null; end $$;
create function finance.advance_settlement_usage_read(p_org uuid,p_kind text,p_id text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin return finance.advance_settlement_usage_source(p_org,p_kind,p_id)-'claims'; exception when raise_exception then return null; end $$;

create function finance.advance_settlement_totals(p_org uuid,p_draft uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare initial_paid numeric; additional_paid numeric; returned numeric; used numeric;
begin
 select coalesce(sum(a.amount) filter(where f.kind='INITIAL'),0),coalesce(sum(a.amount) filter(where f.kind='ADDITIONAL'),0) into initial_paid,additional_paid
 from finance.advance_settlement_funding f join finance.workflow_allocations a on a.organization_id=p_org and a.id=f.allocation_id
 where f.organization_id=p_org and f.draft_id=p_draft and not exists(select 1 from finance.workflow_allocation_reversals r where r.allocation_id=a.id);
 select coalesce(sum(a.amount),0) into returned from finance.workflow_allocations a join finance.advance_settlement_funding f on f.organization_id=p_org and f.allocation_id=a.original_allocation_id
 where a.organization_id=p_org and f.draft_id=p_draft and a.purpose='RETURN'
  and not exists(select 1 from finance.workflow_allocation_reversals r where r.allocation_id=a.id or r.allocation_id=a.original_allocation_id);
 select coalesce(sum((u.snapshot->>'amount')::numeric),0) into used from finance.advance_settlement_usage u where u.organization_id=p_org and u.draft_id=p_draft;
 return jsonb_build_object('initial_paid',initial_paid,'additional_paid',additional_paid,'returned',returned,'draft_used',used,'balance',case when finance.advance_settlement_source_read(p_org,(select transaction_id from finance.advance_settlement_drafts where organization_id=p_org and id=p_draft)) is null then null else initial_paid+additional_paid-returned-used end);
end $$;

create function finance.advance_settlement_workspace(p_org uuid,p_actor uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members; candidates jsonb; usage_sources jsonb; drafts jsonb; evidence jsonb;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not m.permissions && array['ADMIN','APPROVE','PAY','CLOSE','SENIOR'] then raise exception '선지급 정산 조회 권한이 필요합니다.'; end if;
 select coalesce(jsonb_agg(s order by s->>'number'),'[]') into candidates from (
  select finance.advance_settlement_source_read(p_org,t.id) s from finance.workflow_transactions t join finance.expense_resolutions r on r.organization_id=p_org and r.id=t.source_id
  where t.organization_id=p_org and t.source_kind='RESOLUTION' and r.expense_timing='ADVANCE' and r.execution_method='EMPLOYEE_ADVANCE'
 ) q where s is not null;
 select coalesce(jsonb_agg(s order by s->>'used_on' desc,s->>'id'),'[]') into usage_sources from (
  select finance.advance_settlement_usage_read(p_org,'RESOLUTION',id) s from finance.expense_resolutions where organization_id=p_org and deleted_at is null and actual_expense_date is not null and (expense_timing is null or expense_timing not in ('ADVANCE','SETTLEMENT'))
  union all select finance.advance_settlement_usage_read(p_org,'QUICK',id::text) from finance.quick_expense_records where organization_id=p_org
  union all select finance.advance_settlement_usage_read(p_org,'PERSONAL',id::text) from finance.personal_reimbursements where organization_id=p_org
 ) q where s is not null;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'transaction_id',d.transaction_id,'lock_version',d.lock_version,'title',d.title,'memo',d.memo,
  'source_stale',d.source_signature is distinct from finance.advance_settlement_source_read(p_org,d.transaction_id)->>'signature',
  'funding',coalesce((select jsonb_agg(jsonb_build_object('allocation_id',f.allocation_id,'kind',f.kind) order by f.allocation_id) from finance.advance_settlement_funding f where f.organization_id=p_org and f.draft_id=d.id),'[]'),
  'usage',coalesce((select jsonb_agg(jsonb_build_object('source_kind',u.source_kind,'source_id',u.source_id,'signature',u.source_signature,'evidence_file_id',u.evidence_file_id,'title',u.snapshot->>'title','amount',(u.snapshot->>'amount')::numeric,'used_on',u.snapshot->>'used_on') order by u.source_kind,u.source_id) from finance.advance_settlement_usage u where u.organization_id=p_org and u.draft_id=d.id),'[]'),
  'totals',finance.advance_settlement_totals(p_org,d.id),
  'needs_review',d.source_signature is distinct from finance.advance_settlement_source_read(p_org,d.transaction_id)->>'signature'
   or coalesce((finance.advance_settlement_source_read(p_org,d.transaction_id)->>'legacy_review_required')::boolean,true)
   or not exists(select 1 from finance.advance_settlement_usage u where u.organization_id=p_org and u.draft_id=d.id)
   or exists(select 1 from finance.advance_settlement_usage u where u.organization_id=p_org and u.draft_id=d.id and (u.evidence_file_id is null or u.snapshot->>'review_reason' is not null or u.source_signature is distinct from finance.advance_settlement_usage_read(p_org,u.source_kind,u.source_id)->>'signature'))
 ) order by d.updated_at desc),'[]') into drafts from finance.advance_settlement_drafts d where d.organization_id=p_org;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'file_name',file_name,'content_hash',content_hash) order by uploaded_at desc),'[]') into evidence from finance.workflow_files where organization_id=p_org and purpose='EVIDENCE';
 return jsonb_build_object('candidates',candidates,'usage_sources',usage_sources,'drafts',drafts,'evidence',evidence,
  'policy',jsonb_build_object('approval_enabled',false,'budget_posting_enabled',false));
end $$;

create function finance.advance_settlement_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb,p_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare op finance.workflow_operations; d finance.advance_settlement_drafts; src jsonb; usage_src jsonb; f jsonb; u jsonb; claim_row jsonb; file finance.workflow_files;
 entity uuid; version integer; seen uuid[]:='{}'; before_data jsonb; result jsonb;
begin
 perform finance.workflow_actor(p_org,p_actor,'APPROVE');
 if p_command<>'DRAFT_SAVE' then raise exception '선지급 정산 승인·예산 처리 정책 확인 전에는 초안만 저장할 수 있습니다.'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_data ?| array['organization_id','actor_id','p_org','p_actor'] then raise exception '정산 입력 형식을 확인해주세요.'; end if;
 if p_key is null or length(trim(p_key))=0 or length(p_key)>200 then raise exception '처리키를 확인해주세요.'; end if;
 if nullif(trim(p_data->>'title'),'') is null then raise exception '정산 제목을 입력해주세요.'; end if;
 if jsonb_typeof(p_data->'funding') is distinct from 'array' or jsonb_typeof(p_data->'usage') is distinct from 'array' or jsonb_array_length(p_data->'usage')>200 then raise exception '원지급·사용내역 배열을 확인해주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
 select * into op from finance.workflow_operations where organization_id=p_org and operation_key='ADVANCE:'||p_key;
 if found then
  if op.actor_id<>p_actor or op.command<>p_command or op.input<>p_data then raise exception '처리키가 다른 정산 입력에 이미 사용됐습니다.'; end if;
  return op.result;
 end if;
 src:=finance.advance_settlement_source(p_org,(p_data->>'transaction_id')::uuid);
 if src->>'signature' is distinct from p_data->>'source_signature' then raise exception '원지급 또는 반환 내역이 변경됐습니다. 새로 조회해주세요.'; end if;
 if nullif(p_data->>'id','') is null then
  if src->>'existing_draft_id' is not null then raise exception '원지급에 이미 정산 초안이 있습니다.'; end if;
  entity:=gen_random_uuid(); version:=1;
 else
  select * into d from finance.advance_settlement_drafts where organization_id=p_org and id=(p_data->>'id')::uuid for update;
  if not found or d.transaction_id<>(p_data->>'transaction_id')::uuid then raise exception '조직의 원지급 정산 초안을 찾을 수 없습니다.'; end if;
  if d.lock_version is distinct from (p_data->>'lock_version')::integer then raise exception '다른 사용자가 정산 초안을 수정했습니다. 다시 조회해주세요.'; end if;
  entity:=d.id; version:=d.lock_version+1; before_data:=to_jsonb(d)||jsonb_build_object('funding',(select jsonb_agg(to_jsonb(x)) from finance.advance_settlement_funding x where draft_id=d.id),'usage',(select jsonb_agg(to_jsonb(x)) from finance.advance_settlement_usage x where draft_id=d.id));
 end if;
 if jsonb_array_length(p_data->'funding')<>jsonb_array_length(src->'allocations') or not exists(select 1 from jsonb_array_elements(p_data->'funding') x where x->>'kind'='INITIAL') then raise exception '모든 실제 배분을 최초 선지급·추가 지급으로 구분해주세요.'; end if;
 for f in select value from jsonb_array_elements(p_data->'funding') loop
  if f->>'kind' not in ('INITIAL','ADDITIONAL') or f->>'kind' is null or (f->>'allocation_id')::uuid=any(seen) or not exists(select 1 from jsonb_array_elements(src->'allocations') a where a->>'id'=f->>'allocation_id') then raise exception '확인된 원지급 배분을 중복 없이 선택해주세요.'; end if;
  seen:=array_append(seen,(f->>'allocation_id')::uuid);
 end loop;
 if d.id is null then insert into finance.advance_settlement_drafts(id,organization_id,transaction_id,title,memo,source_signature,source_snapshot,created_by,updated_by) values(entity,p_org,(p_data->>'transaction_id')::uuid,p_data->>'title',coalesce(p_data->>'memo',''),src->>'signature',src->'snapshot',p_actor,p_actor);
 else update finance.advance_settlement_drafts set title=p_data->>'title',memo=coalesce(p_data->>'memo',''),lock_version=version,source_signature=src->>'signature',source_snapshot=src->'snapshot',updated_by=p_actor,updated_at=now() where id=entity;
 end if;
 delete from finance.advance_settlement_claims where organization_id=p_org and draft_id=entity;
 delete from finance.advance_settlement_usage where organization_id=p_org and draft_id=entity;
 delete from finance.advance_settlement_funding where organization_id=p_org and draft_id=entity;
 for f in select value from jsonb_array_elements(p_data->'funding') loop
  insert into finance.advance_settlement_funding values(p_org,entity,(f->>'allocation_id')::uuid,f->>'kind');
 end loop;
 for u in select value from jsonb_array_elements(p_data->'usage') loop
  usage_src:=finance.advance_settlement_usage_source(p_org,u->>'source_kind',u->>'source_id');
  if usage_src->>'signature' is distinct from u->>'signature' then raise exception '사용 원본이 변경됐습니다. 사용내역을 다시 확인해주세요.'; end if;
  if (select coalesce(sum((x.snapshot->>'amount')::numeric),0) from finance.advance_settlement_usage x where x.organization_id=p_org and x.draft_id=entity)+(usage_src->>'amount')::numeric>9007199254740991 then raise exception '사용액 합계의 안전한 원 단위 범위를 확인해주세요.'; end if;
  for claim_row in select value from jsonb_array_elements(usage_src->'claims') loop
   if exists(select 1 from finance.advance_settlement_claims where organization_id=p_org and source_kind=claim_row->>'kind' and source_id=claim_row->>'id') then raise exception '같은 사용 원본이 정산에 이미 연결됐습니다.'; end if;
   insert into finance.advance_settlement_claims values(p_org,claim_row->>'kind',claim_row->>'id',entity);
  end loop;
  file:=null;
  if nullif(u->>'evidence_file_id','') is not null then
   select * into file from finance.workflow_files where organization_id=p_org and id=(u->>'evidence_file_id')::uuid and purpose='EVIDENCE';
   if not found then raise exception '조직의 사용 증빙을 선택해주세요.'; end if;
   if exists(select 1 from finance.advance_settlement_usage where organization_id=p_org and evidence_hash=file.content_hash) then raise exception '같은 증빙이 정산에 이미 사용됐습니다.'; end if;
  end if;
  insert into finance.advance_settlement_usage values(p_org,entity,u->>'source_kind',u->>'source_id',usage_src->>'signature',usage_src-'claims',file.id,file.content_hash);
 end loop;
 result:=jsonb_build_object('id',entity,'lock_version',version);
 insert into finance.workflow_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data) values(p_org,p_actor,entity,'ADVANCE:DRAFT_SAVE',coalesce(p_data->>'memo',''),before_data,jsonb_build_object('input',p_data,'result',result,'totals',finance.advance_settlement_totals(p_org,entity)));
 insert into finance.workflow_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,'ADVANCE:'||p_key,p_actor,p_command,p_data,result);
 return result;
end $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='finance' and p.proname like 'advance_settlement_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature); execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
