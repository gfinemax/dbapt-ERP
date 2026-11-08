-- ERP를 계정과목의 단일 관리 원장으로 사용한다.
-- Ledger 분류값은 출처 메타데이터로만 남기고, 생성·수정·사용중지는 ERP 감사로그에 기록한다.
alter table finance.account_subjects
  add column if not exists is_primary boolean not null default false,
  add column if not exists primary_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists account_subjects_primary_idx
  on finance.account_subjects (organization_id, is_primary desc, primary_order, sort_order, code)
  where is_active;

create or replace function finance.manage_account_subject(
  p_org uuid,
  p_actor uuid,
  p_subject_id uuid,
  p_data jsonb
)
returns setof finance.account_subjects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor finance.reimbursement_members;
  before_row finance.account_subjects;
  saved finance.account_subjects;
  parent_uuid uuid;
  next_active boolean;
  next_primary boolean;
  next_action text;
begin
  actor := finance.workflow_actor(p_org, p_actor, 'ADMIN');

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception '계정과목 입력값을 확인해줘.';
  end if;
  if trim(coalesce(p_data->>'code', '')) = '' or trim(coalesce(p_data->>'name', '')) = '' then
    raise exception '계정과목 코드와 이름은 필수야.';
  end if;
  if coalesce(p_data->>'subject_type', '') not in ('수입', '지출', '자산', '부채', '정산') then
    raise exception '계정과목 유형을 확인해줘.';
  end if;
  if coalesce(p_data->>'normal_balance', '') not in ('차변', '대변') then
    raise exception '차변·대변 구분을 확인해줘.';
  end if;

  parent_uuid := nullif(p_data->>'parent_id', '')::uuid;
  if parent_uuid is not null and not exists (
    select 1 from finance.account_subjects parent
    where parent.id=parent_uuid and parent.organization_id=p_org and parent.is_active
  ) then
    raise exception '같은 조직의 사용 중인 상위 계정과목만 선택할 수 있어.';
  end if;

  next_active := coalesce((p_data->>'is_active')::boolean, true);
  next_primary := coalesce((p_data->>'is_primary')::boolean, false) and next_active;

  if p_subject_id is null then
    insert into finance.account_subjects (
      organization_id, code, name, parent_id, subject_type, normal_balance,
      business_category, source, aliases, description, sort_order, is_active,
      is_primary, primary_order, updated_at
    ) values (
      p_org, trim(p_data->>'code'), trim(p_data->>'name'), parent_uuid,
      p_data->>'subject_type', p_data->>'normal_balance',
      coalesce(nullif(trim(p_data->>'business_category'), ''), '미분류'),
      '직접등록',
      coalesce(array(select jsonb_array_elements_text(coalesce(p_data->'aliases', '[]'::jsonb))), array[]::text[]),
      coalesce(p_data->>'description', ''), coalesce((p_data->>'sort_order')::integer, 0),
      next_active, next_primary, coalesce((p_data->>'primary_order')::integer, 0), now()
    ) returning * into saved;
    next_action := 'CREATE';
  else
    select * into before_row from finance.account_subjects
    where id=p_subject_id and organization_id=p_org
    for update;
    if not found then raise exception '수정할 ERP 계정과목을 찾을 수 없어.'; end if;
    if parent_uuid=p_subject_id then raise exception '계정과목 자신을 상위 계정으로 지정할 수 없어.'; end if;

    update finance.account_subjects
    set code=trim(p_data->>'code'),
        name=trim(p_data->>'name'),
        parent_id=parent_uuid,
        subject_type=p_data->>'subject_type',
        normal_balance=p_data->>'normal_balance',
        business_category=coalesce(nullif(trim(p_data->>'business_category'), ''), '미분류'),
        aliases=coalesce(array(select jsonb_array_elements_text(coalesce(p_data->'aliases', '[]'::jsonb))), array[]::text[]),
        description=coalesce(p_data->>'description', ''),
        sort_order=coalesce((p_data->>'sort_order')::integer, 0),
        is_active=next_active,
        is_primary=next_primary,
        primary_order=coalesce((p_data->>'primary_order')::integer, 0),
        updated_at=now()
    where id=p_subject_id
    returning * into saved;

    next_action := case
      when before_row.is_active and not saved.is_active then 'DEACTIVATE'
      when not before_row.is_active and saved.is_active then 'ACTIVATE'
      else 'UPDATE'
    end;
  end if;

  insert into finance.account_subject_audit_logs (
    organization_id, account_subject_id, action, actor_id, actor_label, before_data, after_data
  ) values (
    p_org, saved.id, next_action, p_actor, actor.display_name,
    case when p_subject_id is null then null else to_jsonb(before_row) end,
    to_jsonb(saved)
  );

  return next saved;
end
$$;

revoke all on function finance.manage_account_subject(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function finance.manage_account_subject(uuid, uuid, uuid, jsonb) to service_role;
