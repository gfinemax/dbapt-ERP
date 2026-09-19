alter table finance.advance_settlement_drafts
 add column status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','SETTLED')),
 add column submitted_by uuid references auth.users(id), add column submitted_at timestamptz,
 add column approved_by uuid references auth.users(id), add column approved_at timestamptz,
 add column rejected_by uuid references auth.users(id), add column rejected_at timestamptz,
 add column settled_by uuid references auth.users(id), add column settled_at timestamptz,
 add column decision_reason text not null default '';

create function finance.advance_settlement_review(p_org uuid,p_draft uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare d finance.advance_settlement_drafts; src jsonb; reasons text[]:='{}'; u finance.advance_settlement_usage; current_usage jsonb; totals jsonb;
begin
 select * into d from finance.advance_settlement_drafts where organization_id=p_org and id=p_draft;
 if not found then raise exception '선지급 정산을 찾을 수 없습니다.'; end if;
 src:=finance.advance_settlement_source_read(p_org,d.transaction_id);
 if src is null then reasons:=array_append(reasons,'실제 선지급 원본을 확인할 수 없습니다.');
 elsif d.source_signature is distinct from src->>'signature' then reasons:=array_append(reasons,'원지급 또는 반납 내역이 변경됐습니다.'); end if;
 if coalesce((src->>'legacy_review_required')::boolean,true) then reasons:=array_append(reasons,'과거 지급완료 기록의 실제 배분을 대조해야 합니다.'); end if;
 if not exists(select 1 from finance.advance_settlement_usage where organization_id=p_org and draft_id=d.id) then reasons:=array_append(reasons,'사용내역을 하나 이상 연결해야 합니다.'); end if;
 for u in select * from finance.advance_settlement_usage where organization_id=p_org and draft_id=d.id loop
  current_usage:=finance.advance_settlement_usage_read(p_org,u.source_kind,u.source_id);
  if current_usage is null or u.source_signature is distinct from current_usage->>'signature' then reasons:=array_append(reasons,'연결한 사용 원본이 변경됐습니다.'); end if;
  if u.evidence_file_id is null then reasons:=array_append(reasons,'모든 사용내역에 증빙을 연결해야 합니다.'); end if;
  if current_usage->>'review_reason' is not null then reasons:=array_append(reasons,current_usage->>'review_reason'); end if;
 end loop;
 totals:=finance.advance_settlement_totals(p_org,d.id);
 return jsonb_build_object('ready',cardinality(reasons)=0,'reasons',to_jsonb(reasons),'totals',totals,
  'requires_return',(totals->>'balance')::numeric>0,'requires_additional_payment',(totals->>'balance')::numeric<0);
end $$;

create function finance.advance_settlement_draft_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.status<>'DRAFT' and (new.transaction_id,new.title,new.memo,new.source_signature,new.source_snapshot)
  is distinct from (old.transaction_id,old.title,old.memo,old.source_signature,old.source_snapshot) then
  raise exception '제출한 선지급 정산은 초안으로 되돌린 뒤 수정해주세요.';
 end if;
 return new;
end $$;
create trigger advance_settlement_draft_guard before update on finance.advance_settlement_drafts for each row execute function finance.advance_settlement_draft_guard();

create function finance.advance_settlement_child_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare target uuid:=case when tg_op='DELETE' then old.draft_id else new.draft_id end;
begin
 if exists(select 1 from finance.advance_settlement_drafts d where d.id=target and d.status<>'DRAFT') then
  raise exception '제출한 선지급 정산은 초안으로 되돌린 뒤 수정해주세요.';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger advance_settlement_funding_guard before insert or update or delete on finance.advance_settlement_funding for each row execute function finance.advance_settlement_child_guard();
create trigger advance_settlement_usage_guard before insert or update or delete on finance.advance_settlement_usage for each row execute function finance.advance_settlement_child_guard();
create trigger advance_settlement_claim_guard before insert or update or delete on finance.advance_settlement_claims for each row execute function finance.advance_settlement_child_guard();

create function finance.advance_settlement_transition(p_org uuid,p_actor uuid,p_command text,p_data jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op finance.workflow_operations; d finance.advance_settlement_drafts; review jsonb; result jsonb; permission text;
begin
 permission:=case when p_command='SETTLE' then 'CLOSE' else 'APPROVE' end;
 perform finance.workflow_actor(p_org,p_actor,permission);
 if p_command not in ('SUBMIT','APPROVE','REJECT','REOPEN','SETTLE') then raise exception '지원하지 않는 선지급 정산 처리입니다.'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_data ?| array['organization_id','actor_id','p_org','p_actor'] then raise exception '정산 처리 입력을 확인해주세요.'; end if;
 if p_key is null or length(trim(p_key))=0 or length(p_key)>200 then raise exception '처리키를 확인해주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,741));
 select * into op from finance.workflow_operations where organization_id=p_org and operation_key='ADVANCE_TRANSITION:'||p_key;
 if found then
  if op.actor_id<>p_actor or op.command<>p_command or op.input<>p_data then raise exception '처리키가 다른 정산 처리에 이미 사용됐습니다.'; end if;
  return op.result;
 end if;
 select * into d from finance.advance_settlement_drafts where organization_id=p_org and id=(p_data->>'id')::uuid for update;
 if not found or d.lock_version<>(p_data->>'lock_version')::integer then raise exception '최신 선지급 정산을 다시 확인해주세요.'; end if;
 review:=finance.advance_settlement_review(p_org,d.id);
 if p_command='SUBMIT' then
  if d.status not in ('DRAFT','REJECTED') then raise exception '작성중 또는 반려된 정산만 제출할 수 있습니다.'; end if;
  if not (review->>'ready')::boolean then raise exception '제출 전 확인 필요: %',array_to_string(array(select jsonb_array_elements_text(review->'reasons')),' '); end if;
  update finance.advance_settlement_drafts set status='SUBMITTED',submitted_by=p_actor,submitted_at=now(),approved_by=null,approved_at=null,rejected_by=null,rejected_at=null,settled_by=null,settled_at=null,decision_reason='',lock_version=lock_version+1,updated_by=p_actor,updated_at=now() where id=d.id returning * into d;
 elsif p_command='APPROVE' then
  if d.status<>'SUBMITTED' then raise exception '제출된 정산만 승인할 수 있습니다.'; end if;
  if d.created_by=p_actor or d.submitted_by=p_actor then raise exception '작성·제출한 본인은 정산을 승인할 수 없습니다.'; end if;
  if not (review->>'ready')::boolean then raise exception '승인 전 확인 필요: %',array_to_string(array(select jsonb_array_elements_text(review->'reasons')),' '); end if;
  update finance.advance_settlement_drafts set status='APPROVED',approved_by=p_actor,approved_at=now(),decision_reason=trim(coalesce(p_data->>'reason','')),lock_version=lock_version+1,updated_by=p_actor,updated_at=now() where id=d.id returning * into d;
 elsif p_command='REJECT' then
  if d.status not in ('SUBMITTED','APPROVED') or nullif(trim(p_data->>'reason'),'') is null then raise exception '반려할 정산과 사유를 확인해주세요.'; end if;
  update finance.advance_settlement_drafts set status='REJECTED',rejected_by=p_actor,rejected_at=now(),decision_reason=trim(p_data->>'reason'),approved_by=null,approved_at=null,settled_by=null,settled_at=null,lock_version=lock_version+1,updated_by=p_actor,updated_at=now() where id=d.id returning * into d;
 elsif p_command='REOPEN' then
  if d.status<>'REJECTED' then raise exception '반려된 정산만 초안으로 되돌릴 수 있습니다.'; end if;
  update finance.advance_settlement_drafts set status='DRAFT',decision_reason='',submitted_by=null,submitted_at=null,rejected_by=null,rejected_at=null,lock_version=lock_version+1,updated_by=p_actor,updated_at=now() where id=d.id returning * into d;
 else
  if d.status<>'APPROVED' then raise exception '승인된 정산만 완료할 수 있습니다.'; end if;
  if not (review->>'ready')::boolean then raise exception '완료 전 확인 필요: %',array_to_string(array(select jsonb_array_elements_text(review->'reasons')),' '); end if;
  if (review#>>'{totals,balance}')::numeric<>0 then raise exception '실제 반납 또는 추가 지급을 연결해 정산 차액을 0원으로 맞춰주세요.'; end if;
  update finance.advance_settlement_drafts set status='SETTLED',settled_by=p_actor,settled_at=now(),decision_reason=trim(coalesce(p_data->>'reason','')),lock_version=lock_version+1,updated_by=p_actor,updated_at=now() where id=d.id returning * into d;
 end if;
 result:=jsonb_build_object('id',d.id,'lock_version',d.lock_version,'status',d.status,'review',finance.advance_settlement_review(p_org,d.id));
 insert into finance.workflow_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data) values(p_org,p_actor,d.id,'ADVANCE:'||p_command,coalesce(p_data->>'reason',''),jsonb_build_object('status',case p_command when 'SUBMIT' then 'DRAFT' when 'APPROVE' then 'SUBMITTED' when 'REJECT' then case when d.approved_at is null then 'SUBMITTED' else 'APPROVED' end when 'REOPEN' then 'REJECTED' else 'APPROVED' end),result);
 insert into finance.workflow_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,'ADVANCE_TRANSITION:'||p_key,p_actor,p_command,p_data,result);
 return result;
end $$;

-- Include lifecycle state and readiness in the existing workspace contract.
create or replace function finance.advance_settlement_workspace(p_org uuid,p_actor uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members; candidates jsonb; usage_sources jsonb; drafts jsonb; evidence jsonb;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not m.permissions && array['ADMIN','APPROVE','PAY','CLOSE','SENIOR'] then raise exception '선지급 정산 조회 권한이 필요합니다.'; end if;
 select coalesce(jsonb_agg(s order by s->>'number'),'[]') into candidates from (select finance.advance_settlement_source_read(p_org,t.id) s from finance.workflow_transactions t join finance.expense_resolutions r on r.organization_id=p_org and r.id=t.source_id where t.organization_id=p_org and t.source_kind='RESOLUTION' and r.expense_timing='ADVANCE' and r.execution_method='EMPLOYEE_ADVANCE') q where s is not null;
 select coalesce(jsonb_agg(s order by s->>'used_on' desc,s->>'id'),'[]') into usage_sources from (
  select finance.advance_settlement_usage_read(p_org,'RESOLUTION',id) s from finance.expense_resolutions where organization_id=p_org and deleted_at is null and actual_expense_date is not null and (expense_timing is null or expense_timing not in ('ADVANCE','SETTLEMENT'))
  union all select finance.advance_settlement_usage_read(p_org,'QUICK',id::text) from finance.quick_expense_records where organization_id=p_org
  union all select finance.advance_settlement_usage_read(p_org,'PERSONAL',id::text) from finance.personal_reimbursements where organization_id=p_org
 ) q where s is not null;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'transaction_id',d.transaction_id,'lock_version',d.lock_version,'title',d.title,'memo',d.memo,'status',d.status,'decision_reason',d.decision_reason,'created_by',d.created_by,'submitted_by',d.submitted_by,
  'source_stale',d.source_signature is distinct from finance.advance_settlement_source_read(p_org,d.transaction_id)->>'signature',
  'funding',coalesce((select jsonb_agg(jsonb_build_object('allocation_id',f.allocation_id,'kind',f.kind) order by f.allocation_id) from finance.advance_settlement_funding f where f.organization_id=p_org and f.draft_id=d.id),'[]'),
  'usage',coalesce((select jsonb_agg(jsonb_build_object('source_kind',u.source_kind,'source_id',u.source_id,'signature',u.source_signature,'evidence_file_id',u.evidence_file_id,'title',u.snapshot->>'title','amount',(u.snapshot->>'amount')::numeric,'used_on',u.snapshot->>'used_on') order by u.source_kind,u.source_id) from finance.advance_settlement_usage u where u.organization_id=p_org and u.draft_id=d.id),'[]'),
  'totals',finance.advance_settlement_totals(p_org,d.id),'review',finance.advance_settlement_review(p_org,d.id),
  'needs_review',not (finance.advance_settlement_review(p_org,d.id)->>'ready')::boolean) order by d.updated_at desc),'[]') into drafts from finance.advance_settlement_drafts d where d.organization_id=p_org;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'file_name',file_name,'content_hash',content_hash) order by uploaded_at desc),'[]') into evidence from finance.workflow_files where organization_id=p_org and purpose='EVIDENCE';
 return jsonb_build_object('candidates',candidates,'usage_sources',usage_sources,'drafts',drafts,'evidence',evidence,'policy',jsonb_build_object('approval_enabled',true,'budget_posting_enabled',true));
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='finance' and p.proname in ('advance_settlement_review','advance_settlement_transition') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature); execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
