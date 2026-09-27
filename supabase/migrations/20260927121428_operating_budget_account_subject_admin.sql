create table if not exists finance.account_subject_budget_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  account_subject_id uuid not null references finance.account_subjects(id) on delete restrict,
  budget_id uuid not null references approval.budgets(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ENDED')),
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, account_subject_id, budget_id)
);

create table if not exists finance.account_subject_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  account_subject_id uuid references finance.account_subjects(id) on delete set null,
  action text not null check (action in ('CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE', 'BUDGET_LINK')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_label text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists finance.bank_transaction_classification_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  bank_transaction_id uuid not null references finance.bank_transactions(id) on delete restrict,
  account_subject_id uuid references finance.account_subjects(id) on delete restrict,
  action text not null check (action in ('CONFIRM', 'CHANGE', 'DEFER', 'EXCLUDE')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_label text not null,
  previous_data jsonb,
  confirmed_data jsonb,
  created_at timestamptz not null default now()
);

alter table finance.bank_transactions
  add column if not exists confirmed_account_subject_id uuid references finance.account_subjects(id) on delete restrict,
  add column if not exists classification_status text not null default 'UNREVIEWED'
    check (classification_status in ('UNREVIEWED', 'RECOMMENDED', 'CONFIRMED', 'DEFERRED', 'EXCLUDED')),
  add column if not exists recommendation_reason text,
  add column if not exists classified_by uuid references auth.users(id) on delete restrict,
  add column if not exists classified_at timestamptz,
  add column if not exists classification_note text;

create index if not exists account_subject_budget_links_budget_idx
  on finance.account_subject_budget_links (organization_id, budget_id, status);
create index if not exists account_subject_audit_logs_subject_idx
  on finance.account_subject_audit_logs (organization_id, account_subject_id, created_at desc);
create index if not exists bank_transactions_classification_idx
  on finance.bank_transactions (organization_id, classification_status, transacted_at desc)
  where deleted_at is null;
create index if not exists bank_transaction_classification_audit_idx
  on finance.bank_transaction_classification_audit_logs (organization_id, bank_transaction_id, created_at desc);

alter table finance.account_subject_budget_links enable row level security;
alter table finance.account_subject_audit_logs enable row level security;
alter table finance.bank_transaction_classification_audit_logs enable row level security;
revoke all on finance.account_subject_budget_links, finance.account_subject_audit_logs, finance.bank_transaction_classification_audit_logs from anon, authenticated;
grant select, insert, update, delete on finance.account_subject_budget_links to service_role;
grant select, insert on finance.account_subject_audit_logs to service_role;
grant select, insert on finance.bank_transaction_classification_audit_logs to service_role;

create or replace function finance.confirm_operating_account_subjects(
  p_org uuid,
  p_actor uuid,
  p_items jsonb
)
returns setof finance.account_subjects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor finance.reimbursement_members;
  item jsonb;
  saved finance.account_subjects;
  budget_value jsonb;
  budget_uuid uuid;
  parent_uuid uuid;
begin
  actor := finance.workflow_actor(p_org, p_actor, 'ADMIN');

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '등록할 계정과목을 한 개 이상 선택해주세요.';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if trim(coalesce(item->>'code', '')) = '' or trim(coalesce(item->>'name', '')) = '' then
      raise exception '계정과목 코드와 이름은 필수입니다.';
    end if;
    if coalesce(item->>'subject_type', '') not in ('수입', '지출', '자산', '부채', '정산') then
      raise exception '계정과목 유형이 올바르지 않습니다.';
    end if;
    if coalesce(item->>'normal_balance', '') not in ('차변', '대변') then
      raise exception '계정과목 차대변 구분이 올바르지 않습니다.';
    end if;
    if coalesce(item->>'source', '') not in ('운영비 예산안', '수지분석표', '직접등록') then
      raise exception '계정과목 출처가 올바르지 않습니다.';
    end if;
    if jsonb_typeof(coalesce(item->'budget_ids', '[]'::jsonb)) <> 'array' then
      raise exception '예산 연결 형식이 올바르지 않습니다.';
    end if;

    parent_uuid := nullif(item->>'parent_id', '')::uuid;
    if parent_uuid is not null and not exists (
      select 1 from finance.account_subjects parent
      where parent.id = parent_uuid and parent.organization_id = p_org
    ) then
      raise exception '같은 조직의 상위 계정과목만 연결할 수 있습니다.';
    end if;

    for budget_value in select value from jsonb_array_elements(coalesce(item->'budget_ids', '[]'::jsonb))
    loop
      budget_uuid := (budget_value #>> '{}')::uuid;
      if not exists (
        select 1 from approval.budgets budget
        where budget.id = budget_uuid and budget.organization_id = p_org
      ) then
        raise exception '같은 조직의 예산항목만 연결할 수 있습니다.';
      end if;
    end loop;

    insert into finance.account_subjects (
      organization_id,
      code,
      name,
      parent_id,
      subject_type,
      normal_balance,
      business_category,
      source,
      aliases,
      description,
      sort_order,
      is_active
    ) values (
      p_org,
      trim(item->>'code'),
      trim(item->>'name'),
      parent_uuid,
      item->>'subject_type',
      item->>'normal_balance',
      coalesce(nullif(trim(item->>'business_category'), ''), '미분류'),
      item->>'source',
      coalesce(array(select jsonb_array_elements_text(coalesce(item->'aliases', '[]'::jsonb))), array[]::text[]),
      coalesce(item->>'description', ''),
      coalesce((item->>'sort_order')::integer, 0),
      coalesce((item->>'is_active')::boolean, true)
    )
    returning * into saved;

    insert into finance.account_subject_audit_logs (
      organization_id, account_subject_id, action, actor_id, actor_label, after_data
    ) values (
      p_org, saved.id, 'CREATE', p_actor, actor.display_name,
      to_jsonb(saved) || jsonb_build_object('budget_ids', coalesce(item->'budget_ids', '[]'::jsonb))
    );

    for budget_value in select value from jsonb_array_elements(coalesce(item->'budget_ids', '[]'::jsonb))
    loop
      budget_uuid := (budget_value #>> '{}')::uuid;
      insert into finance.account_subject_budget_links (
        organization_id, account_subject_id, budget_id, confirmed_by
      ) values (p_org, saved.id, budget_uuid, p_actor);
    end loop;

    return next saved;
  end loop;
end
$$;

revoke all on function finance.confirm_operating_account_subjects(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function finance.confirm_operating_account_subjects(uuid, uuid, jsonb) to service_role;

create or replace function finance.confirm_bank_transaction_subjects(
  p_org uuid,
  p_actor uuid,
  p_assignments jsonb
)
returns table (transaction_id uuid, account_subject_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor finance.reimbursement_members;
  assignment jsonb;
  transaction_row finance.bank_transactions;
  subject_row finance.account_subjects;
  transaction_uuid uuid;
  subject_uuid uuid;
begin
  actor := finance.workflow_actor(p_org, p_actor, 'ADMIN');
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) = 0 then
    raise exception '확정할 은행거래를 한 건 이상 선택해주세요.';
  end if;

  for assignment in select value from jsonb_array_elements(p_assignments)
  loop
    transaction_uuid := nullif(assignment->>'transaction_id', '')::uuid;
    subject_uuid := nullif(assignment->>'account_subject_id', '')::uuid;
    if transaction_uuid is null or subject_uuid is null then
      raise exception '은행거래와 계정과목을 모두 지정해주세요.';
    end if;

    select * into transaction_row from finance.bank_transactions
    where id = transaction_uuid and organization_id = p_org and deleted_at is null
    for update;
    if not found then raise exception '확정할 은행거래를 찾을 수 없습니다.'; end if;

    select * into subject_row from finance.account_subjects
    where id = subject_uuid and organization_id = p_org and is_active;
    if not found then raise exception '같은 조직의 사용 중인 계정과목만 지정할 수 있습니다.'; end if;

    update finance.bank_transactions
    set confirmed_account_subject_id = subject_uuid,
        classification_status = 'CONFIRMED',
        classified_by = p_actor,
        classified_at = now(),
        classification_note = nullif(trim(coalesce(assignment->>'note', '')), '')
    where id = transaction_uuid;

    insert into finance.bank_transaction_classification_audit_logs (
      organization_id, bank_transaction_id, account_subject_id, action, actor_id, actor_label,
      previous_data, confirmed_data
    ) values (
      p_org, transaction_uuid, subject_uuid,
      case when transaction_row.confirmed_account_subject_id is null then 'CONFIRM' else 'CHANGE' end,
      p_actor, actor.display_name,
      jsonb_build_object(
        'account_subject_id', transaction_row.confirmed_account_subject_id,
        'classification_status', transaction_row.classification_status,
        'classified_by', transaction_row.classified_by,
        'classified_at', transaction_row.classified_at
      ),
      jsonb_build_object(
        'account_subject_id', subject_uuid,
        'classification_status', 'CONFIRMED',
        'note', nullif(trim(coalesce(assignment->>'note', '')), '')
      )
    );

    transaction_id := transaction_uuid;
    account_subject_id := subject_uuid;
    return next;
  end loop;
end
$$;

revoke all on function finance.confirm_bank_transaction_subjects(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function finance.confirm_bank_transaction_subjects(uuid, uuid, jsonb) to service_role;
