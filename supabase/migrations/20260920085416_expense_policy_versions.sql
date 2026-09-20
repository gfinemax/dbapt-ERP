-- Versioned expense policy settings generated through the Supabase migration workflow.
-- Existing records remain unchanged; only new
-- records receive the policy version that is active when they are created.
create table if not exists finance.expense_policy_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','PENDING','ACTIVE','ENDED')),
  effective_from date not null,
  effective_to date,
  change_reason text not null check (length(trim(change_reason)) > 0),
  policy_data jsonb not null,
  created_by uuid references auth.users(id),
  created_by_label text not null default '기존 설정',
  approved_by uuid references auth.users(id),
  approved_by_label text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (organization_id, version_no),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists finance.expense_policy_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  policy_version_id uuid not null references finance.expense_policy_versions(id) on delete restrict,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('DRAFT_CREATED','DRAFT_UPDATED','SUBMITTED','ACTIVATED','ENDED')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists expense_policy_versions_org_status_idx
  on finance.expense_policy_versions(organization_id,status,effective_from desc);
create index if not exists expense_policy_audit_version_idx
  on finance.expense_policy_audit(policy_version_id,created_at);

alter table finance.expense_policy_versions enable row level security;
alter table finance.expense_policy_audit enable row level security;
revoke all on finance.expense_policy_versions, finance.expense_policy_audit from public,anon,authenticated;
grant all on finance.expense_policy_versions, finance.expense_policy_audit to service_role;
create policy server_only on finance.expense_policy_versions to service_role using (true) with check (true);
create policy server_only on finance.expense_policy_audit to service_role using (true) with check (true);

alter table finance.expense_resolutions add column if not exists policy_version_id uuid references finance.expense_policy_versions(id) on delete restrict;
alter table finance.quick_expense_records add column if not exists policy_version_id uuid references finance.expense_policy_versions(id) on delete restrict;
alter table finance.personal_reimbursements add column if not exists policy_version_id uuid references finance.expense_policy_versions(id) on delete restrict;
create index if not exists expense_resolutions_policy_version_idx on finance.expense_resolutions(policy_version_id) where policy_version_id is not null;
create index if not exists quick_expense_policy_version_idx on finance.quick_expense_records(policy_version_id) where policy_version_id is not null;
create index if not exists personal_reimbursement_policy_version_idx on finance.personal_reimbursements(policy_version_id) where policy_version_id is not null;

create or replace function finance.current_expense_policy_version(p_org uuid, p_on date default ((now() at time zone 'Asia/Seoul')::date))
returns uuid language sql stable security invoker set search_path='' as $$
  select id from finance.expense_policy_versions
  where organization_id=p_org and status='ACTIVE' and effective_from<=p_on and (effective_to is null or effective_to>=p_on)
  order by effective_from desc,version_no desc limit 1
$$;

create or replace function finance.assign_expense_policy_version() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.policy_version_id is null then
    new.policy_version_id:=finance.current_expense_policy_version(new.organization_id);
  end if;
  return new;
end $$;

drop trigger if exists finance_expense_resolution_policy_version on finance.expense_resolutions;
create trigger finance_expense_resolution_policy_version before insert on finance.expense_resolutions
for each row execute function finance.assign_expense_policy_version();
drop trigger if exists finance_quick_expense_policy_version on finance.quick_expense_records;
create trigger finance_quick_expense_policy_version before insert on finance.quick_expense_records
for each row execute function finance.assign_expense_policy_version();
drop trigger if exists finance_personal_reimbursement_policy_version on finance.personal_reimbursements;
create trigger finance_personal_reimbursement_policy_version before insert on finance.personal_reimbursements
for each row execute function finance.assign_expense_policy_version();

create or replace function finance.expense_policy_preview(p_org uuid,p_policy jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'pendingExpenseResolutions',(select count(*) from finance.expense_resolutions where organization_id=p_org and deleted_at is null and approval_status not in ('승인완료','반려')),
    'pendingQuickExpenses',(select count(*) from finance.quick_expense_records where organization_id=p_org and record_status not in ('RECORDED','CONVERTED')),
    'pendingReimbursements',(select count(*) from finance.personal_reimbursements where organization_id=p_org and status='SUBMITTED'),
    'delayedReimbursements',(select count(*) from finance.personal_reimbursements where organization_id=p_org and status='SUBMITTED' and ((now() at time zone 'Asia/Seoul')::date-used_on)>(p_policy->>'normalDays')::int),
    'longDelayedReimbursements',(select count(*) from finance.personal_reimbursements where organization_id=p_org and status='SUBMITTED' and ((now() at time zone 'Asia/Seoul')::date-used_on)>(p_policy->>'longDelayDays')::int),
    'priorYearReimbursements',(select count(*) from finance.personal_reimbursements where organization_id=p_org and status='SUBMITTED' and extract(year from used_on)<extract(year from (now() at time zone 'Asia/Seoul')::date))
  )
$$;

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
      if v.created_by=p_actor then raise exception '작성자와 다른 관리자가 활성 승인해야 해.'; end if;
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

revoke all on function finance.current_expense_policy_version(uuid,date),finance.expense_policy_preview(uuid,jsonb),finance.expense_policy_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function finance.current_expense_policy_version(uuid,date),finance.expense_policy_preview(uuid,jsonb),finance.expense_policy_command(uuid,uuid,text,jsonb) to service_role;

-- Preserve the current operating settings as the first active version. It is an
-- audit baseline only and does not rewrite existing expense records.
insert into finance.expense_policy_versions(organization_id,version_no,status,effective_from,change_reason,policy_data,created_by_label,approved_by_label,approved_at)
select s.organization_id,1,'ACTIVE',((now() at time zone 'Asia/Seoul')::date),'기존 운영 설정을 버전 관리의 기준값으로 등록',jsonb_build_object(
  'normalDays',30,'delayedDays',60,'longDelayDays',coalesce(s.post_approval_max_days,180),'rejectAfterDays',coalesce(s.post_approval_max_days,180),'allowLateException',true,
  'simpleApprovalMax',500000,'generalApprovalMax',3000000,'outOfBudgetSeparateApproval',true,'trustBusinessSeparateApproval',true,'relatedPartySeparateApproval',true,
  'materialityAmount',1000000,'materialityMonthlyBudgetPercent',1,'materialityBudgetOverrun',true,'materialityTrustBusiness',true,'materialityRelatedParty',true,
  'materialityFraudOrDuplicate',true,'materialityReportedResultChange',true,'materialityAuditImpact',true,'blockPriorYearGeneralSubmission',true,
  'requireAccountingReview',true,'requireSeniorExceptionApproval',true,'requireExternalAccountantReview',true,'requireBoardWhenNeeded',true
),'기존 설정','기존 설정',now()
from finance.expense_compliance_settings s
where not exists(select 1 from finance.expense_policy_versions v where v.organization_id=s.organization_id);

notify pgrst, 'reload schema';
