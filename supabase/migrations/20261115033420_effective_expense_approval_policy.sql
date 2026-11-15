-- Effective-date rules are immutable snapshots; existing documents are not rewritten.
create function finance.assert_expense_approval_period(p_data jsonb, p_org uuid, p_actor uuid, p_before jsonb default null, p_request boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare policy jsonb:=p_data->'approvalPolicy'; person jsonb; day date; today date:=(current_timestamp at time zone 'Asia/Seoul')::date; member finance.reimbursement_members; has_director boolean;
begin
 member:=finance.workflow_actor(p_org,p_actor);
 if not exists(select 1 from core.organizations where id=p_org and status='active') then raise exception '활성 조직이 아닙니다.'; end if;
 select coalesce(p_data->>'author','') ~ '^장현제([[:space:]]|$)'
  or exists(select 1 from jsonb_array_elements(coalesce(p_data->'approvalLine','[]')) s where coalesce(s->>'approver','') ~ '^장현제([[:space:]]|$)')
  or exists(select 1 from jsonb_array_elements(coalesce(nullif(p_data->'approvalParticipants','null'::jsonb),'[]')) s where coalesce(s->>'name','') ~ '^장현제([[:space:]]|$)') into has_director;
 if policy is null or policy='null'::jsonb then
  if p_before->'approvalPolicy' is not null and p_before->'approvalPolicy'<>'null'::jsonb then raise exception '확인된 결재 기준일을 삭제할 수 없습니다.'; end if;
  if has_director then raise exception '장현제 이사가 포함된 문서의 결재 기준일을 먼저 확인해주세요.'; end if;
  return;
 end if;
 if policy->>'version' is distinct from 'organization-approval-2026-07-v1'
  or policy->>'directorHiredOn' is distinct from '2026-06-22'
  or policy->>'directorApprovalFrom' is distinct from '2026-07-01'
  or coalesce(policy->>'kind','') not in ('CURRENT','HISTORICAL')
  or coalesce(policy->>'referenceDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '결재 기준일 또는 규칙 버전이 올바르지 않습니다.'; end if;
 day:=(policy->>'referenceDate')::date;
 if to_char(day,'YYYY-MM-DD')<>policy->>'referenceDate' or day>today then raise exception '원문 결재 기준일을 확인해주세요.'; end if;
 if policy is distinct from p_before->'approvalPolicy' and (policy->>'kind'='HISTORICAL' or p_before->'approvalPolicy'->>'kind'='HISTORICAL') and not ('ADMIN'=any(member.permissions)) then raise exception '과거 원문 기준일 등록·변경은 관리자만 할 수 있습니다.'; end if;
 if policy->>'kind'='HISTORICAL' then
  if coalesce(trim(policy->>'originalReference'),'')='' then raise exception '원문 결재일 확인 근거가 필요합니다.'; end if;
  if policy is distinct from p_before->'approvalPolicy' and not ('ADMIN'=any(member.permissions)) then raise exception '과거 원문 기준일 등록·변경은 관리자만 할 수 있습니다.'; end if;
 elsif p_request and day<>today then raise exception '상신일이 변경되었습니다. 초안을 다시 저장해주세요.'; end if;
 if coalesce(p_data->>'author','') ~ '^장현제([[:space:]]|$)' and day<date '2026-06-22' then raise exception '장현제 입사일 이전의 작성자를 확인해주세요.'; end if;
 if day<date '2026-07-01' and exists(select 1 from jsonb_array_elements(coalesce(p_data->'approvalLine','[]')) s where coalesce(s->>'approver','') ~ '^장현제([[:space:]]|$)') then raise exception '2026-07-01 이전에는 장현제를 실제 결재선에 포함할 수 없습니다.'; end if;
 for person in select value from jsonb_array_elements(coalesce(nullif(p_data->'approvalParticipants','null'::jsonb),'[]')) loop
  if coalesce(person->>'name','') ~ '^장현제([[:space:]]|$)' and
    ((person->>'action'='작성' and day<date '2026-06-22') or (person->>'action' is distinct from '작성' and day<date '2026-07-01')) then
   raise exception '장현제의 입사일·결재권한 시작일에 맞지 않는 참여자 표시입니다.';
  end if;
 end loop;
end $$;
revoke all on function finance.assert_expense_approval_period(jsonb,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function finance.assert_expense_approval_period(jsonb,uuid,uuid,jsonb,boolean) to service_role;

-- Preserve all existing command authorization, concurrency and idempotency checks.
alter function finance.legacy_expense_command(uuid,uuid,text,text,jsonb,jsonb,text) rename to legacy_expense_command_before_period_policy;
revoke all on function finance.legacy_expense_command_before_period_policy(uuid,uuid,text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function finance.legacy_expense_command_before_period_policy(uuid,uuid,text,text,jsonb,jsonb,text) to service_role;
create function finance.legacy_expense_command(p_org uuid,p_actor uuid,p_command text,p_id text,p_expected jsonb,p_payload jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate jsonb; actor finance.reimbursement_members;
begin
 -- Exact successful retries retain their result even when the calendar day changes.
 if not exists(select 1 from finance.expense_authorization_operations where organization_id=p_org and operation_key=p_key) then
  if p_command='SAVE' then
   actor:=finance.workflow_actor(p_org,p_actor);
   candidate:=p_payload->'row'->'resolution_data'||jsonb_build_object('author',case when p_expected is null then actor.display_name else p_expected->>'author' end);
   perform finance.assert_expense_approval_period(candidate,p_org,p_actor,p_expected,false);
  elsif p_command='APPROVAL' and p_payload->>'command' in ('REQUEST','APPROVE','REJECT') then
   if p_expected->'approvalPolicy' is distinct from p_payload->'after'->'approvalPolicy' then raise exception '결재 중에는 적용 기준일을 변경할 수 없습니다.'; end if;
   perform finance.assert_expense_approval_period(p_payload->'after',p_org,p_actor,p_expected,p_payload->>'command'='REQUEST');
   actor:=finance.workflow_actor(p_org,p_actor);
   if trim(actor.display_name) ~ '^장현제([[:space:]]|$)' then
    if p_payload->'after'->'approvalPolicy' is null then raise exception '장현제 계정의 결재 기준일을 확인해주세요.'; end if;
    if (p_payload->'after'->'approvalPolicy'->>'referenceDate')::date < (case when p_payload->>'command'='REQUEST' then date '2026-06-22' else date '2026-07-01' end) then raise exception '장현제 계정의 입사일·결재권한 시작일 이전 문서입니다.'; end if;
   end if;
  end if;
 end if;
 return finance.legacy_expense_command_before_period_policy(p_org,p_actor,p_command,p_id,p_expected,p_payload,p_key);
end $$;
revoke all on function finance.legacy_expense_command(uuid,uuid,text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function finance.legacy_expense_command(uuid,uuid,text,text,jsonb,jsonb,text) to service_role;

create function finance.repair_expense_approval_period(p_org uuid,p_actor uuid,p_id text,p_expected jsonb,p_expected_version integer,p_reference_date text,p_reason text,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare member finance.reimbursement_members; source finance.expense_resolutions; binding finance.expense_authorization_bindings;
 operation finance.expense_authorization_operations; operation_hash text; result jsonb; beforedata jsonb; afterdata jsonb; policy jsonb;
 lines jsonb:='[]'; people jsonb:='[]'; bindings jsonb:='[]'; step jsonb; person jsonb; matched jsonb; old_binding jsonb;
 day date; ordinal integer:=0; new_order integer; source_status text; history_item jsonb;
begin
 member:=finance.workflow_actor(p_org,p_actor);
 if not ('ADMIN'=any(member.permissions)) then raise exception '관리자만 결재선 기간을 정리할 수 있습니다.'; end if;
 if coalesce(trim(p_reason),'')='' or coalesce(trim(p_key),'')='' or length(p_key)>200 or p_expected_version is null then raise exception '원문 확인 근거와 처리키·버전을 확인해주세요.'; end if;
 if coalesce(p_reference_date,'') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '원문 결재 기준일을 입력해주세요.'; end if;
 day:=p_reference_date::date;
 if to_char(day,'YYYY-MM-DD')<>p_reference_date then raise exception '원문 날짜가 올바르지 않습니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
 operation_hash:=md5(jsonb_build_object('id',p_id,'expected',p_expected,'version',p_expected_version,'date',p_reference_date,'reason',p_reason)::text);
 select * into operation from finance.expense_authorization_operations where organization_id=p_org and operation_key=p_key;
 if found then
  if operation.actor_id<>p_actor or operation.command<>'POLICY_REPAIR' or operation.input_hash<>operation_hash then raise exception '처리키가 다른 요청에 사용되었습니다.'; end if;
  return operation.result;
 end if;
 select * into source from finance.expense_resolutions where id=p_id and organization_id=p_org and deleted_at is null for update;
 if not found then raise exception '조직의 지출결의를 찾을 수 없습니다.'; end if;
 if source.resolution_data is distinct from p_expected then raise exception '원본이 변경되었습니다. 다시 미리보기 해주세요.'; end if;
 select * into binding from finance.expense_authorization_bindings where resolution_id=p_id for update;
 if coalesce(binding.version,0)<>p_expected_version or (binding.resolution_id is not null and binding.organization_id<>p_org) then raise exception '계정 연결이 변경되었습니다. 다시 미리보기 해주세요.'; end if;
 beforedata:=source.resolution_data;
 source_status:=beforedata->>'approvalStatus';
 if coalesce(source_status,'') not in ('작성중','반려','승인대기') or coalesce(source.approval_status,'') not in ('작성중','반려','승인대기') then raise exception '승인 완료 문서는 원본을 보존하고 별도 정정해주세요.'; end if;
 if coalesce(beforedata->>'paymentStatus','')<>'지급전' or source.payment_status is distinct from '지급전'
  or coalesce(beforedata->>'voucherNo','')<>'' or coalesce(beforedata->>'voucherStatus','')<>''
  or coalesce(source.voucher_no,'')<>'' or coalesce(source.voucher_status,'')<>''
  or coalesce((beforedata->>'voucherGenerated')::boolean,false)
  or coalesce((beforedata->>'actualPaidAmount')::numeric,0)>0 or coalesce(source.actual_paid_amount,0)>0 or source.disbursed_at is not null
  or nullif(beforedata->>'paidAt','') is not null or nullif(beforedata->>'disbursedAt','') is not null or nullif(beforedata->>'approvedAt','') is not null then
  raise exception '지급·전표 이력이 있는 문서는 자동 변경하지 않습니다.';
 end if;
 if exists(select 1 from jsonb_array_elements(coalesce(beforedata->'approvalLine','[]')) s where s->>'status'='승인완료')
  or exists(select 1 from jsonb_array_elements(coalesce(nullif(beforedata->'history','null'::jsonb),'[]')) h where h->>'actionType'='APPROVED') then
  raise exception '이미 처리된 승인 이력을 보존해야 합니다.';
 end if;
 policy:=jsonb_build_object('kind','HISTORICAL','referenceDate',p_reference_date,'version','organization-approval-2026-07-v1','directorHiredOn','2026-06-22','directorApprovalFrom','2026-07-01','originalReference',trim(p_reason));
 for step in select value from jsonb_array_elements(coalesce(beforedata->'approvalLine','[]')) loop
  if day<date '2026-07-01' and coalesce(step->>'approver','') ~ '^장현제([[:space:]]|$)' then continue; end if;
  ordinal:=ordinal+1;
  lines:=lines||jsonb_build_array((step-'processedAt')||jsonb_build_object('order',ordinal,'status','대기'));
  select case when count(*)=1 then jsonb_agg(b)->0 else null end into matched
   from jsonb_array_elements(coalesce(binding.steps,'[]')) b
   where b->'legacy_step'->>'approver'=step->>'approver' and b->'legacy_step'->>'role'=step->>'role';
  if matched is not null then
   bindings:=bindings||jsonb_build_array(jsonb_build_object('order',ordinal,'approver_user_id',matched->'approver_user_id','legacy_step',jsonb_build_object('order',ordinal,'approver',step->>'approver','role',step->>'role')));
  end if;
 end loop;
 if ordinal=0 then raise exception '실제 결재자가 한 명 이상 필요합니다.'; end if;
 for person in select value from jsonb_array_elements(coalesce(nullif(beforedata->'approvalParticipants','null'::jsonb),'[]')) loop
  if coalesce(person->>'name','') ~ '^장현제([[:space:]]|$)' then
   if person->>'action'='작성' and day<date '2026-06-22' then raise exception '입사 전 작성자 표시를 원문과 대조해주세요.'; end if;
   if person->>'action' is distinct from '작성' and day<date '2026-07-01' then continue; end if;
  end if;
  if person ? 'approvalOrder' then
   select (s->>'order')::integer into new_order from jsonb_array_elements(lines) s where s->>'approver'=person->>'name' limit 1;
   person:=person-'approvalOrder';
   if new_order is not null then person:=person||jsonb_build_object('approvalOrder',new_order); end if;
  end if;
  people:=people||jsonb_build_array(person);
 end loop;
 history_item:=jsonb_build_object('id',gen_random_uuid()::text,'actionAt',to_char(clock_timestamp() at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS'),'actionLabel',case when source_status='승인대기' then '결재선 정정 회수' else '결재선 기간 정정' end,'actionType','UPDATED','actorName',member.display_name,'actorTitle','','comment',trim(p_reason)||' · 원문 기준일 '||p_reference_date);
 afterdata:=(beforedata-'currentApprover')||jsonb_build_object('approvalLine',lines,'approvalPolicy',policy,'approvalStatus',case when source_status='승인대기' then '작성중' else source_status end,'history',coalesce(nullif(beforedata->'history','null'::jsonb),'[]')||jsonb_build_array(history_item));
 if beforedata ? 'approvalParticipants' then afterdata:=afterdata||jsonb_build_object('approvalParticipants',people); end if;
 perform finance.assert_expense_approval_period(afterdata,p_org,p_actor,beforedata,false);
 perform set_config('finance.legacy_expense_command_org',p_org::text,true);
 perform set_config('finance.legacy_expense_command_id',p_id,true);
 update finance.expense_resolutions set resolution_data=afterdata,approval_status=afterdata->>'approvalStatus',current_approver_label=null,updated_at=clock_timestamp() where id=p_id and organization_id=p_org;
 old_binding:=to_jsonb(binding);
 insert into finance.expense_authorization_bindings(resolution_id,organization_id,author_user_id,steps,version,bound_by,bound_at,binding_reason)
  values(p_id,p_org,binding.author_user_id,bindings,coalesce(binding.version,0)+1,p_actor,clock_timestamp(),trim(p_reason))
  on conflict(resolution_id) do update set steps=excluded.steps,version=excluded.version,bound_by=excluded.bound_by,bound_at=excluded.bound_at,binding_reason=excluded.binding_reason
  returning * into binding;
 result:=jsonb_build_object('resolution',afterdata,'authorization',to_jsonb(binding));
 insert into finance.expense_workflow_audit_logs(resolution_id,action,actor_label,actor_id,before_data,after_data)
  values(p_id,'AUTH:POLICY_REPAIR',member.display_name,p_actor,beforedata||jsonb_build_object('authorization',old_binding),afterdata||jsonb_build_object('authorization',to_jsonb(binding)));
 insert into finance.expense_authorization_operations(organization_id,operation_key,actor_id,command,input_hash,result) values(p_org,p_key,p_actor,'POLICY_REPAIR',operation_hash,result);
 perform set_config('finance.legacy_expense_command_org','',true);
 perform set_config('finance.legacy_expense_command_id','',true);
 return result;
end $$;
revoke all on function finance.repair_expense_approval_period(uuid,uuid,text,jsonb,integer,text,text,text) from public,anon,authenticated;
grant execute on function finance.repair_expense_approval_period(uuid,uuid,text,jsonb,integer,text,text,text) to service_role;
notify pgrst, 'reload schema';

-- Policy snapshots and display participants cannot be changed through payment or voucher writes.
create or replace function finance.legacy_expense_bound_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare rid text; org uuid; changed boolean;
begin
 rid:=case when tg_table_name='expense_resolutions' then coalesce(to_jsonb(old)->>'id',to_jsonb(new)->>'id') else coalesce(to_jsonb(old)->>'resolution_id',to_jsonb(new)->>'resolution_id') end;
 select organization_id into org from finance.expense_authorization_bindings where resolution_id=rid;
 if org is null then if tg_op='DELETE' then return old; else return new; end if; end if;
 if current_setting('finance.legacy_expense_command_org',true)=org::text and current_setting('finance.legacy_expense_command_id',true)=rid then if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_table_name='expense_resolutions' then
  changed:=tg_op='DELETE' or row(new.organization_id,new.author_label,new.approval_status,new.current_approver_label,new.total_payment_amount,new.subject,new.deleted_at) is distinct from row(old.organization_id,old.author_label,old.approval_status,old.current_approver_label,old.total_payment_amount,old.subject,old.deleted_at)
   or jsonb_build_array(new.resolution_data->'approvalLine',new.resolution_data->'author',new.resolution_data->'approvalStatus',new.resolution_data->'currentApprover',new.resolution_data->'totalPaymentAmount',new.resolution_data->'approvalPolicy',new.resolution_data->'approvalParticipants') is distinct from jsonb_build_array(old.resolution_data->'approvalLine',old.resolution_data->'author',old.resolution_data->'approvalStatus',old.resolution_data->'currentApprover',old.resolution_data->'totalPaymentAmount',old.resolution_data->'approvalPolicy',old.resolution_data->'approvalParticipants');
 else changed:=true; end if;
 if changed then raise exception '연결된 지출결의는 사용자 확인을 거친 원자적 저장으로 처리해주세요.'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;

revoke all on function finance.legacy_expense_bound_guard() from public,anon,authenticated;
grant execute on function finance.legacy_expense_bound_guard() to service_role;
