-- A second active administrator should approve a policy when one exists. A
-- single-admin organization may self-activate so that policy management is not
-- permanently blocked; the action remains fully audited.
create index if not exists expense_policy_versions_created_by_idx on finance.expense_policy_versions(created_by) where created_by is not null;
create index if not exists expense_policy_versions_approved_by_idx on finance.expense_policy_versions(approved_by) where approved_by is not null;
create index if not exists expense_policy_audit_org_idx on finance.expense_policy_audit(organization_id,created_at desc);
create index if not exists expense_policy_audit_actor_idx on finance.expense_policy_audit(actor_id);

create or replace function finance.expense_policy_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  m finance.reimbursement_members%rowtype;
  v finance.expense_policy_versions%rowtype;
  before_value jsonb;
  after_value jsonb;
  next_version integer;
  actor_label text;
  today_kst date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,918));
  select * into m from finance.reimbursement_members where organization_id=p_org and user_id=p_actor and active;
  if not found or not ('ADMIN'=any(m.permissions)) then raise exception '운영 기준을 변경할 관리자 권한이 없습니다.'; end if;
  actor_label:=m.display_name;

  if p_command='CREATE_DRAFT' then
    if coalesce(length(trim(p_data->>'changeReason')),0)=0 then raise exception '변경 사유를 입력해줘.'; end if;
    if (p_data->>'effectiveFrom')::date<today_kst then raise exception '시행일은 오늘 이후로 지정해줘.'; end if;
    if jsonb_typeof(p_data->'policy')<>'object' then raise exception '운영 기준 값이 올바르지 않아.'; end if;
    select coalesce(max(version_no),0)+1 into next_version from finance.expense_policy_versions where organization_id=p_org;
    insert into finance.expense_policy_versions(organization_id,version_no,effective_from,change_reason,policy_data,created_by,created_by_label)
    values(p_org,next_version,(p_data->>'effectiveFrom')::date,trim(p_data->>'changeReason'),p_data->'policy',p_actor,actor_label)
    returning * into v;
    after_value:=to_jsonb(v);
    insert into finance.expense_policy_audit(organization_id,policy_version_id,actor_id,action,after_data)
    values(p_org,v.id,p_actor,'DRAFT_CREATED',after_value);
  else
    select * into v from finance.expense_policy_versions where id=(p_data->>'id')::uuid and organization_id=p_org for update;
    if not found then raise exception '처리할 운영 기준 버전을 찾을 수 없어.'; end if;
    before_value:=to_jsonb(v);
    if p_command='UPDATE_DRAFT' then
      if v.status<>'DRAFT' then raise exception '초안 상태만 수정할 수 있어.'; end if;
      if coalesce(length(trim(p_data->>'changeReason')),0)=0 then raise exception '변경 사유를 입력해줘.'; end if;
      if (p_data->>'effectiveFrom')::date<today_kst then raise exception '시행일은 오늘 이후로 지정해줘.'; end if;
      if jsonb_typeof(p_data->'policy')<>'object' then raise exception '운영 기준 값이 올바르지 않아.'; end if;
      update finance.expense_policy_versions set effective_from=(p_data->>'effectiveFrom')::date,change_reason=trim(p_data->>'changeReason'),policy_data=p_data->'policy'
      where id=v.id returning to_jsonb(expense_policy_versions.*) into after_value;
      insert into finance.expense_policy_audit(organization_id,policy_version_id,actor_id,action,before_data,after_data)
      values(p_org,v.id,p_actor,'DRAFT_UPDATED',before_value,after_value);
    elsif p_command='SUBMIT' then
      if v.status<>'DRAFT' then raise exception '초안 상태만 승인 요청할 수 있어.'; end if;
      update finance.expense_policy_versions set status='PENDING' where id=v.id returning to_jsonb(expense_policy_versions.*) into after_value;
      insert into finance.expense_policy_audit(organization_id,policy_version_id,actor_id,action,before_data,after_data)
      values(p_org,v.id,p_actor,'SUBMITTED',before_value,after_value);
    elsif p_command='ACTIVATE' then
      if v.status<>'PENDING' then raise exception '승인대기 상태만 활성화할 수 있어.'; end if;
      if v.created_by=p_actor and exists(
        select 1 from finance.reimbursement_members a where a.organization_id=p_org and a.user_id<>p_actor and a.active and 'ADMIN'=any(a.permissions)
      ) then raise exception '다른 관리자가 활성 승인해야 해.'; end if;
      if v.effective_from>today_kst then raise exception '시행일이 된 뒤 활성화할 수 있어.'; end if;
      update finance.expense_policy_versions set status='ENDED',effective_to=today_kst-1
      where organization_id=p_org and status='ACTIVE' and id<>v.id and (effective_to is null or effective_to>=today_kst);
      update finance.expense_policy_versions set status='ACTIVE',effective_from=today_kst,approved_by=p_actor,approved_by_label=actor_label,approved_at=now()
      where id=v.id returning to_jsonb(expense_policy_versions.*) into after_value;
      update finance.expense_compliance_settings set post_approval_max_days=(v.policy_data->>'rejectAfterDays')::int,updated_at=now()
      where organization_id=p_org;
      update finance.reimbursement_policies set long_delay_days=(v.policy_data->>'longDelayDays')::int,updated_at=now()
      where organization_id=p_org;
      insert into finance.expense_policy_audit(organization_id,policy_version_id,actor_id,action,before_data,after_data)
      values(p_org,v.id,p_actor,'ACTIVATED',before_value,after_value);
    elsif p_command='END' then
      if v.status not in ('DRAFT','PENDING') then raise exception '초안 또는 승인대기 버전만 종료할 수 있어.'; end if;
      update finance.expense_policy_versions set status='ENDED',effective_to=coalesce(effective_to,today_kst) where id=v.id returning to_jsonb(expense_policy_versions.*) into after_value;
      insert into finance.expense_policy_audit(organization_id,policy_version_id,actor_id,action,before_data,after_data)
      values(p_org,v.id,p_actor,'ENDED',before_value,after_value);
    else raise exception '지원하지 않는 운영 기준 처리야.';
    end if;
  end if;
  return after_value;
end $$;

revoke all on function finance.expense_policy_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function finance.expense_policy_command(uuid,uuid,text,jsonb) to service_role;

notify pgrst, 'reload schema';
