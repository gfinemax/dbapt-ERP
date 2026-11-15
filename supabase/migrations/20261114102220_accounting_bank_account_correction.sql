-- Bank-account-backed account subjects and audit-preserving corrections for
-- already confirmed vouchers. Bank accounts remain the source of identity;
-- account subjects are connected by UUID instead of inferred from names.
create table finance.bank_account_subject_links (
  bank_account_id uuid primary key references finance.bank_accounts(id) on delete restrict,
  organization_id uuid not null references core.organizations(id) on delete restrict,
  account_subject_id uuid not null references finance.account_subjects(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, account_subject_id)
);

alter table finance.bank_account_subject_links enable row level security;
revoke all on finance.bank_account_subject_links from public, anon, authenticated;
grant select, insert, update, delete on finance.bank_account_subject_links to service_role;

create or replace function finance.accounting_workspace_v2(p_org uuid, p_actor uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  base jsonb;
  enriched_vouchers jsonb;
  bank_accounts jsonb;
begin
  base := finance.accounting_workspace(p_org, p_actor);

  select coalesce(jsonb_agg(
    item.value || jsonb_build_object(
      'expense_resolution_id', v.expense_resolution_id,
      'bank_transaction_id', v.bank_transaction_id,
      'bank_account_id', bt.bank_account_id,
      'bank_account_label', case when ba.id is null then null else
        concat_ws(' · ', ba.bank_name, ba.account_name,
          case when nullif(right(regexp_replace(coalesce(ba.account_no, ''), '[^0-9]', '', 'g'), 4), '') is null
            then null else '끝 ' || right(regexp_replace(coalesce(ba.account_no, ''), '[^0-9]', '', 'g'), 4) end)
        end,
      'bank_account_subject_id', link.account_subject_id,
      'suggested_debit_account_subject_id', case
        when confirmed.id is not null then confirmed.id
        when recommended.id is not null then recommended.id
        else null
      end
    ) order by item.ordinality
  ), '[]'::jsonb)
  into enriched_vouchers
  from jsonb_array_elements(coalesce(base->'vouchers', '[]'::jsonb)) with ordinality item(value, ordinality)
  join finance.vouchers v on v.id = (item.value->>'id')::uuid and v.organization_id = p_org
  left join finance.bank_transactions bt on bt.id = v.bank_transaction_id and bt.organization_id = p_org and bt.deleted_at is null
  left join finance.bank_accounts ba on ba.id = bt.bank_account_id and ba.organization_id = p_org and ba.deleted_at is null
  left join finance.bank_account_subject_links link on link.bank_account_id = ba.id and link.organization_id = p_org
  left join finance.account_subjects confirmed on confirmed.id = bt.confirmed_account_subject_id and confirmed.organization_id = p_org and confirmed.is_active
  left join finance.account_subjects recommended on recommended.id = bt.recommended_account_subject_id and recommended.organization_id = p_org and recommended.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ba.id,
    'bank_name', ba.bank_name,
    'account_name', ba.account_name,
    'account_no_last4', right(regexp_replace(coalesce(ba.account_no, ''), '[^0-9]', '', 'g'), 4),
    'account_type', ba.account_type,
    'usage_status', ba.usage_status,
    'account_purpose', ba.account_purpose,
    'opened_at', ba.opened_at,
    'closed_at', ba.closed_at,
    'linked_account_subject_id', link.account_subject_id,
    'linked_account_subject_name', subject.name
  ) order by ba.opened_at nulls first, ba.created_at), '[]'::jsonb)
  into bank_accounts
  from finance.bank_accounts ba
  left join finance.bank_account_subject_links link on link.bank_account_id = ba.id and link.organization_id = p_org
  left join finance.account_subjects subject on subject.id = link.account_subject_id and subject.organization_id = p_org
  where ba.organization_id = p_org and ba.deleted_at is null;

  return jsonb_set(
    jsonb_set(base, '{vouchers}', enriched_vouchers, true),
    '{bank_accounts}', bank_accounts, true
  );
end
$$;

create or replace function finance.accounting_create_bank_account_subject(
  p_org uuid,
  p_actor uuid,
  p_bank_account_id uuid,
  p_name text,
  p_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  operation finance.workflow_operations;
  bank finance.bank_accounts;
  subject finance.account_subjects;
  normalized_name text := trim(coalesce(p_name, ''));
  operation_input jsonb;
  result jsonb;
  last4 text;
begin
  perform finance.workflow_actor(p_org, p_actor, 'ADMIN');
  if p_bank_account_id is null then raise exception '연결할 계좌를 확인해줘.'; end if;
  if length(normalized_name) < 2 or length(normalized_name) > 80 then raise exception '예금 계정과목 이름을 2자 이상 80자 이하로 입력해줘.'; end if;
  if p_key is null or length(trim(p_key)) = 0 or length(p_key) > 200 then raise exception '처리키를 확인해줘.'; end if;

  operation_input := jsonb_build_object('bank_account_id', p_bank_account_id, 'name', normalized_name);
  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 739));
  select * into operation from finance.workflow_operations
  where organization_id = p_org and operation_key = 'ACCOUNTING_BANK_SUBJECT:' || p_key;
  if found then
    if operation.actor_id <> p_actor or operation.command <> 'BANK_ACCOUNT_SUBJECT_CREATE' or operation.input <> operation_input then
      raise exception '처리키가 다른 계좌 계정 입력에 이미 사용됐어.';
    end if;
    return operation.result;
  end if;

  select * into bank from finance.bank_accounts
  where id = p_bank_account_id and organization_id = p_org and deleted_at is null
  for update;
  if not found then raise exception '조직의 계좌정보를 찾을 수 없어.'; end if;

  select s.* into subject
  from finance.bank_account_subject_links link
  join finance.account_subjects s on s.id = link.account_subject_id and s.organization_id = link.organization_id
  where link.organization_id = p_org and link.bank_account_id = bank.id;

  if not found then
    last4 := right(regexp_replace(coalesce(bank.account_no, ''), '[^0-9]', '', 'g'), 4);
    select * into subject from finance.manage_account_subject(
      p_org,
      p_actor,
      null,
      jsonb_build_object(
        'code', 'BANK-' || upper(replace(left(bank.id::text, 8), '-', '')),
        'name', normalized_name,
        'parent_id', null,
        'subject_type', '자산',
        'normal_balance', '차변',
        'business_category', '운영비',
        'aliases', jsonb_build_array(bank.bank_name, bank.account_name, nullif(last4, '')),
        'description', concat_ws(' · ', '은행계좌 원장 연결', bank.bank_name, bank.account_name,
          case when nullif(last4, '') is null then null else '끝 ' || last4 end),
        'sort_order', 0,
        'is_active', true,
        'is_primary', false,
        'primary_order', 0
      )
    ) limit 1;

    insert into finance.bank_account_subject_links(
      bank_account_id, organization_id, account_subject_id, created_by, updated_by
    ) values (bank.id, p_org, subject.id, p_actor, p_actor);

    insert into finance.workflow_events(organization_id, actor_id, entity_id, action, reason, before_data, after_data)
    values (
      p_org, p_actor, subject.id, 'ACCOUNTING_BANK_ACCOUNT_SUBJECT_LINK',
      '계좌정보 원장에서 예금 계정과목 생성',
      jsonb_build_object('bank_account_id', bank.id, 'account_subject_id', null),
      jsonb_build_object('bank_account_id', bank.id, 'account_subject', to_jsonb(subject))
    );
  end if;

  result := jsonb_build_object(
    'bank_account_id', bank.id,
    'account_subject_id', subject.id,
    'account_subject_name', subject.name
  );
  insert into finance.workflow_operations(organization_id, operation_key, actor_id, command, input, result)
  values (p_org, 'ACCOUNTING_BANK_SUBJECT:' || p_key, p_actor, 'BANK_ACCOUNT_SUBJECT_CREATE', operation_input, result);
  return result;
end
$$;

create or replace function finance.accounting_correct_voucher_accounts(
  p_org uuid,
  p_actor uuid,
  p_data jsonb,
  p_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  operation finance.workflow_operations;
  voucher finance.vouchers;
  current_voucher_id uuid;
  debit_subject finance.account_subjects;
  credit_subject finance.account_subjects;
  selected_bank_account_id uuid;
  linked_bank_account_id uuid;
  debit_subject_id uuid;
  credit_subject_id uuid;
  reason text;
  voucher_ids jsonb;
  corrected_ids jsonb := '[]'::jsonb;
  before_data jsonb;
  after_data jsonb;
  debit_total numeric;
  credit_total numeric;
  invalid_count integer;
  previous_setting text := current_setting('finance.accounting_voucher', true);
  result jsonb;
begin
  perform finance.workflow_actor(p_org, p_actor, 'APPROVE');
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_data ?| array['organization_id','actor_id','p_org','p_actor'] then
    raise exception '계정 정정 입력 형식을 확인해줘.';
  end if;
  if p_key is null or length(trim(p_key)) = 0 or length(p_key) > 200 then raise exception '처리키를 확인해줘.'; end if;

  voucher_ids := p_data->'voucher_ids';
  if jsonb_typeof(voucher_ids) is distinct from 'array' or jsonb_array_length(voucher_ids) < 1 or jsonb_array_length(voucher_ids) > 100 then
    raise exception '정정할 전표를 1건 이상 100건 이하로 선택해줘.';
  end if;
  if (select count(*) from jsonb_array_elements_text(voucher_ids)) <>
     (select count(distinct value) from jsonb_array_elements_text(voucher_ids)) then
    raise exception '중복된 전표가 포함돼 있어.';
  end if;

  selected_bank_account_id := nullif(p_data->>'bank_account_id', '')::uuid;
  debit_subject_id := nullif(p_data->>'debit_account_subject_id', '')::uuid;
  credit_subject_id := nullif(p_data->>'credit_account_subject_id', '')::uuid;
  reason := trim(coalesce(p_data->>'reason', ''));
  if selected_bank_account_id is null or debit_subject_id is null or credit_subject_id is null then raise exception '차변·대변 계정과 출금계좌를 모두 확인해줘.'; end if;
  if length(reason) < 2 or length(reason) > 500 then raise exception '정정 근거를 2자 이상 500자 이하로 입력해줘.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 739));
  select * into operation from finance.workflow_operations
  where organization_id = p_org and operation_key = 'ACCOUNTING_ACCOUNT_CORRECTION:' || p_key;
  if found then
    if operation.actor_id <> p_actor or operation.command <> 'ACCOUNT_CORRECTION' or operation.input <> p_data then
      raise exception '처리키가 다른 계정 정정 입력에 이미 사용됐어.';
    end if;
    return operation.result;
  end if;

  select * into debit_subject from finance.account_subjects
  where id = debit_subject_id and organization_id = p_org and is_active and normal_balance = '차변';
  if not found then raise exception '사용 중인 차변 계정과목을 선택해줘.'; end if;
  select * into credit_subject from finance.account_subjects
  where id = credit_subject_id and organization_id = p_org and is_active and subject_type = '자산' and normal_balance = '차변';
  if not found then raise exception '사용 중인 예금 자산 계정과목을 선택해줘.'; end if;
  if not exists (
    select 1 from finance.bank_account_subject_links
    where organization_id = p_org and bank_account_id = selected_bank_account_id and account_subject_id = credit_subject_id
  ) then raise exception '실제 출금계좌와 연결된 예금 계정과목을 선택해줘.'; end if;

  for current_voucher_id in select value::uuid from jsonb_array_elements_text(voucher_ids)
  loop
    select * into voucher from finance.vouchers
    where id = current_voucher_id and organization_id = p_org and deleted_at is null
    for update;
    if not found then raise exception '조직의 전표를 찾을 수 없어.'; end if;
    if voucher.approval_status <> '승인완료' then raise exception '% 전표는 승인완료 기록이 아니야.', voucher.voucher_no; end if;

    select bt.bank_account_id into linked_bank_account_id
    from finance.bank_transactions bt
    where bt.id = voucher.bank_transaction_id and bt.organization_id = p_org and bt.deleted_at is null;
    if linked_bank_account_id is distinct from selected_bank_account_id then
      raise exception '% 전표의 실제 출금계좌가 선택한 계좌와 달라.', voucher.voucher_no;
    end if;

    select coalesce(sum(debit_amount), 0), coalesce(sum(credit_amount), 0),
      count(*) filter (where (debit_amount > 0) = (credit_amount > 0))
    into debit_total, credit_total, invalid_count
    from finance.voucher_lines line where line.voucher_id = voucher.id;
    if debit_total <= 0 or debit_total <> credit_total or invalid_count > 0 then
      raise exception '% 전표의 차변·대변 금액을 먼저 확인해줘.', voucher.voucher_no;
    end if;
    if exists (
      select 1 from finance.voucher_lines line
      join finance.account_subjects current_subject on current_subject.id = line.account_subject_id and current_subject.organization_id = p_org and current_subject.is_active
      where line.voucher_id = voucher.id
        and current_subject.id is distinct from case when line.debit_amount > 0 then debit_subject_id else credit_subject_id end
    ) then raise exception '% 전표에는 이미 다른 활성 계정과목이 있어 별도 정정 검토가 필요해.', voucher.voucher_no; end if;

    before_data := jsonb_build_object(
      'voucher', to_jsonb(voucher),
      'lines', (select coalesce(jsonb_agg(to_jsonb(line) order by line.sort_order, line.id), '[]'::jsonb) from finance.voucher_lines line where line.voucher_id = voucher.id),
      'bank_account_id', linked_bank_account_id
    );
    perform set_config('finance.accounting_voucher', voucher.id::text, true);
    update finance.voucher_lines
    set account_subject_id = case when debit_amount > 0 then debit_subject_id else credit_subject_id end
    where voucher_id = voucher.id;
    update finance.vouchers set updated_at = now() where id = voucher.id;
    update finance.workflow_voucher_controls
    set lock_version = lock_version + 1, updated_by = p_actor, updated_at = now()
    where voucher_id = voucher.id and organization_id = p_org;

    after_data := jsonb_build_object(
      'voucher_id', voucher.id,
      'debit_account_subject_id', debit_subject_id,
      'credit_account_subject_id', credit_subject_id,
      'bank_account_id', selected_bank_account_id,
      'lines', (select coalesce(jsonb_agg(to_jsonb(line) order by line.sort_order, line.id), '[]'::jsonb) from finance.voucher_lines line where line.voucher_id = voucher.id)
    );
    insert into finance.workflow_events(organization_id, actor_id, entity_id, action, reason, before_data, after_data)
    values (p_org, p_actor, voucher.id, 'ACCOUNTING_ACCOUNT_CORRECTION', reason, before_data, after_data);
    corrected_ids := corrected_ids || jsonb_build_array(voucher.id);
  end loop;

  perform set_config('finance.accounting_voucher', coalesce(previous_setting, ''), true);
  result := jsonb_build_object('corrected_count', jsonb_array_length(corrected_ids), 'corrected_ids', corrected_ids);
  insert into finance.workflow_operations(organization_id, operation_key, actor_id, command, input, result)
  values (p_org, 'ACCOUNTING_ACCOUNT_CORRECTION:' || p_key, p_actor, 'ACCOUNT_CORRECTION', p_data, result);
  return result;
end
$$;

revoke all on function finance.accounting_workspace_v2(uuid, uuid) from public, anon, authenticated;
revoke all on function finance.accounting_create_bank_account_subject(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function finance.accounting_correct_voucher_accounts(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function finance.accounting_workspace_v2(uuid, uuid) to service_role;
grant execute on function finance.accounting_create_bank_account_subject(uuid, uuid, uuid, text, text) to service_role;
grant execute on function finance.accounting_correct_voucher_accounts(uuid, uuid, jsonb, text) to service_role;
