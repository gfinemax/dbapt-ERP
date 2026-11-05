create table finance.ledger_bank_subject_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null default 'dbapt-ledger',
  match_type text not null check (match_type in ('CATEGORY','DESCRIPTION')),
  source_key text not null,
  direction text not null check (direction in ('DEPOSIT','WITHDRAWAL')),
  source_group text,
  source_label text not null,
  account_subject_id uuid references finance.account_subjects(id) on delete restrict,
  rule_status text not null check (rule_status in ('CONFIRMED','POLICY_REVIEW','TRANSFER')),
  note text not null default '',
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,source_system,match_type,source_key,direction),
  check (rule_status <> 'CONFIRMED' or account_subject_id is not null),
  check (rule_status <> 'TRANSFER' or account_subject_id is null)
);

create table finance.ledger_bank_subject_rule_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  rule_id uuid not null references finance.ledger_bank_subject_rules(id) on delete restrict,
  action text not null check (action in ('CREATE','UPDATE')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_label text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);

create index ledger_bank_subject_rules_review_idx
  on finance.ledger_bank_subject_rules(organization_id,rule_status,match_type,direction);
create index ledger_bank_subject_rule_audit_idx
  on finance.ledger_bank_subject_rule_audit_logs(organization_id,rule_id,created_at desc);

alter table finance.ledger_bank_subject_rules enable row level security;
alter table finance.ledger_bank_subject_rule_audit_logs enable row level security;
revoke all on finance.ledger_bank_subject_rules,finance.ledger_bank_subject_rule_audit_logs
  from public,anon,authenticated;
grant select,insert,update on finance.ledger_bank_subject_rules to service_role;
grant select,insert on finance.ledger_bank_subject_rule_audit_logs to service_role;

create policy ledger_bank_subject_rules_server on finance.ledger_bank_subject_rules
  for all to service_role using (true) with check (true);
create policy ledger_bank_subject_rule_audit_server on finance.ledger_bank_subject_rule_audit_logs
  for all to service_role using (true) with check (true);

create function finance.normalize_ledger_bank_description(p_value text)
returns text
language sql
immutable
parallel safe
set search_path=''
as $$
  select nullif(lower(regexp_replace(coalesce(p_value,''),'[[:space:]]+','','g')),'')
$$;

create function finance.ledger_bank_subject_rule_matches(
  p_payload jsonb,p_match_type text,p_source_key text,p_direction text
) returns boolean
language sql
immutable
parallel safe
set search_path=''
as $$
  select
    case when coalesce((p_payload->>'deposit_amount')::numeric,0)>0 then 'DEPOSIT' else 'WITHDRAWAL' end=p_direction
    and case p_match_type
      when 'CATEGORY' then nullif(p_payload->>'ledger_category_id','')=p_source_key
        and coalesce(nullif(p_payload->>'category_name',''),'확인필요')<>'확인필요'
      when 'DESCRIPTION' then coalesce(nullif(p_payload->>'category_name',''),'확인필요')='확인필요'
        and finance.normalize_ledger_bank_description(p_payload->>'description')=p_source_key
      else false
    end
$$;

revoke all on function finance.normalize_ledger_bank_description(text) from public,anon,authenticated;
revoke all on function finance.ledger_bank_subject_rule_matches(jsonb,text,text,text) from public,anon,authenticated;
grant execute on function finance.normalize_ledger_bank_description(text) to service_role;
grant execute on function finance.ledger_bank_subject_rule_matches(jsonb,text,text,text) to service_role;

create function finance.save_ledger_bank_subject_rules(
  p_org uuid,p_actor uuid,p_rules jsonb
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor finance.reimbursement_members;
  item jsonb;
  before_rule finance.ledger_bank_subject_rules;
  saved_rule finance.ledger_bank_subject_rules;
  subject_row finance.account_subjects;
  match_type_value text;
  source_key_value text;
  direction_value text;
  status_value text;
  source_group_value text;
  source_label_value text;
  subject_uuid uuid;
  matched integer:=0;
  recommended integer:=0;
  saved integer:=0;
begin
  actor:=finance.workflow_actor(p_org,p_actor,'ADMIN');
  if p_rules is null or jsonb_typeof(p_rules)<>'array' or jsonb_array_length(p_rules)=0 then
    raise exception '저장할 Ledger 분류 규칙을 한 개 이상 선택해줘.';
  end if;

  for item in select value from jsonb_array_elements(p_rules)
  loop
    match_type_value:=coalesce(item->>'match_type','');
    source_key_value:=trim(coalesce(item->>'source_key',''));
    direction_value:=coalesce(item->>'direction','');
    status_value:=coalesce(item->>'rule_status','');
    subject_uuid:=nullif(item->>'account_subject_id','')::uuid;
    if match_type_value not in ('CATEGORY','DESCRIPTION') or source_key_value=''
      or direction_value not in ('DEPOSIT','WITHDRAWAL')
      or status_value not in ('CONFIRMED','POLICY_REVIEW','TRANSFER') then
      raise exception 'Ledger 분류 규칙 형식이 올바르지 않아.';
    end if;
    if status_value='CONFIRMED' and subject_uuid is null then
      raise exception '추천할 ERP 계정과목을 선택해줘.';
    end if;
    if status_value='TRANSFER' then subject_uuid:=null; end if;

    if subject_uuid is not null then
      select * into subject_row from finance.account_subjects
      where id=subject_uuid and organization_id=p_org and is_active;
      if not found then raise exception '같은 조직의 사용 중인 계정과목만 연결할 수 있어.'; end if;
    end if;

    select count(*),
      min(nullif(s.payload->>'category_group','')),
      min(case when match_type_value='CATEGORY' then nullif(s.payload->>'category_name','')
        else nullif(s.payload->>'description','') end)
      into matched,source_group_value,source_label_value
    from finance.ledger_bank_transaction_sources s
    where s.organization_id=p_org and s.source_system='dbapt-ledger' and s.import_status='IMPORTED'
      and finance.ledger_bank_subject_rule_matches(s.payload,match_type_value,source_key_value,direction_value);
    if matched=0 then raise exception '현재 Ledger 원본과 일치하는 거래가 없어.'; end if;
    source_label_value:=coalesce(source_label_value,source_key_value);

    select * into before_rule from finance.ledger_bank_subject_rules
    where organization_id=p_org and source_system='dbapt-ledger'
      and match_type=match_type_value and source_key=source_key_value and direction=direction_value;

    insert into finance.ledger_bank_subject_rules(
      organization_id,source_system,match_type,source_key,direction,source_group,source_label,
      account_subject_id,rule_status,note,confirmed_by,confirmed_at
    ) values(
      p_org,'dbapt-ledger',match_type_value,source_key_value,direction_value,
      source_group_value,source_label_value,subject_uuid,status_value,
      trim(coalesce(item->>'note','')),p_actor,clock_timestamp()
    )
    on conflict(organization_id,source_system,match_type,source_key,direction) do update set
      source_group=excluded.source_group,source_label=excluded.source_label,
      account_subject_id=excluded.account_subject_id,rule_status=excluded.rule_status,
      note=excluded.note,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,
      updated_at=clock_timestamp()
    returning * into saved_rule;

    insert into finance.ledger_bank_subject_rule_audit_logs(
      organization_id,rule_id,action,actor_id,actor_label,before_data,after_data
    ) values(
      p_org,saved_rule.id,case when before_rule.id is null then 'CREATE' else 'UPDATE' end,
      p_actor,actor.display_name,case when before_rule.id is null then null else to_jsonb(before_rule) end,
      to_jsonb(saved_rule)
    );

    update finance.bank_transactions b set
      recommended_account_subject_id=null,recommended_account_subject_name=null,
      classification_status='UNREVIEWED',recommendation_reason=null
    from finance.ledger_bank_transaction_sources s
    where s.organization_id=p_org and s.source_system='dbapt-ledger' and s.import_status='IMPORTED'
      and s.bank_transaction_id=b.id and b.organization_id=p_org
      and b.classification_status in ('UNREVIEWED','RECOMMENDED','DEFERRED')
      and b.recommendation_reason like 'Ledger 규칙:%'
      and finance.ledger_bank_subject_rule_matches(s.payload,match_type_value,source_key_value,direction_value);

    if status_value='CONFIRMED' then
      update finance.bank_transactions b set
        recommended_account_subject_id=subject_row.id,
        recommended_account_subject_name=subject_row.name,
        classification_status='RECOMMENDED',
        recommendation_reason='Ledger 규칙: '||coalesce(source_group_value||' / ','')||source_label_value
      from finance.ledger_bank_transaction_sources s
      where s.organization_id=p_org and s.source_system='dbapt-ledger' and s.import_status='IMPORTED'
        and s.bank_transaction_id=b.id and b.organization_id=p_org
        and b.confirmed_account_subject_id is null
        and b.classification_status in ('UNREVIEWED','RECOMMENDED','DEFERRED')
        and (b.recommended_account_subject_id is null or b.recommendation_reason like 'Ledger 규칙:%')
        and finance.ledger_bank_subject_rule_matches(s.payload,match_type_value,source_key_value,direction_value);
      get diagnostics matched=row_count;
      recommended:=recommended+matched;
    end if;
    saved:=saved+1;
  end loop;

  insert into audit.audit_logs(organization_id,actor_user_id,action,entity_schema,entity_table,entity_id,after_data)
  values(p_org,p_actor,'LEDGER_BANK_SUBJECT_RULES_SAVE','finance','ledger_bank_subject_rules',p_actor::text,
    jsonb_build_object('saved_count',saved,'recommended_count',recommended));
  return jsonb_build_object('saved_count',saved,'recommended_count',recommended);
end
$$;

revoke all on function finance.save_ledger_bank_subject_rules(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function finance.save_ledger_bank_subject_rules(uuid,uuid,jsonb) to service_role;
