-- 관리자가 확정한 적요·입출금 방향 규칙으로 같은 거래를 일괄 분류하고 이후 거래에도 적용한다.
create or replace function finance.normalize_bank_transaction_rule_key(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_value,'')), '\s+', '', 'g'))
$$;

create table if not exists finance.bank_transaction_counterparty_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  match_text text not null,
  normalized_match_text text not null,
  direction text not null check (direction in ('DEPOSIT','WITHDRAWAL')),
  account_subject_id uuid not null references finance.account_subjects(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_tx_counterparty_rule_unique unique (organization_id,normalized_match_text,direction)
);

create table if not exists finance.bank_transaction_counterparty_rule_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  rule_id uuid not null references finance.bank_transaction_counterparty_rules(id) on delete restrict,
  action text not null check (action in ('CREATE','CHANGE','REACTIVATE')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_label text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists bank_transaction_counterparty_rules_lookup_idx
  on finance.bank_transaction_counterparty_rules(organization_id,normalized_match_text,direction,status);
create index if not exists bank_transaction_counterparty_rule_audit_idx
  on finance.bank_transaction_counterparty_rule_audit_logs(organization_id,rule_id,created_at desc);

alter table finance.bank_transaction_counterparty_rules enable row level security;
alter table finance.bank_transaction_counterparty_rule_audit_logs enable row level security;
revoke all on finance.bank_transaction_counterparty_rules, finance.bank_transaction_counterparty_rule_audit_logs
  from public,anon,authenticated;
grant select,insert,update on finance.bank_transaction_counterparty_rules to service_role;
grant select,insert on finance.bank_transaction_counterparty_rule_audit_logs to service_role;
drop policy if exists bank_transaction_counterparty_rules_server on finance.bank_transaction_counterparty_rules;
create policy bank_transaction_counterparty_rules_server
  on finance.bank_transaction_counterparty_rules for all to service_role
  using (true) with check (true);
drop policy if exists bank_transaction_counterparty_rule_audit_server on finance.bank_transaction_counterparty_rule_audit_logs;
create policy bank_transaction_counterparty_rule_audit_server
  on finance.bank_transaction_counterparty_rule_audit_logs for all to service_role
  using (true) with check (true);

alter table finance.bank_transaction_classification_audit_logs
  drop constraint if exists bank_transaction_classification_audit_logs_action_check;
alter table finance.bank_transaction_classification_audit_logs
  add constraint bank_transaction_classification_audit_logs_action_check
  check (action in ('CONFIRM','CHANGE','DEFER','EXCLUDE','NOTE','RULE_APPLY','AUTO_RULE_APPLY'));

create or replace function finance.bank_transaction_effective_description(
  p_org uuid,
  p_transaction_id uuid
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select o.source_value
      from finance.bank_transaction_sheet_field_overrides o
      where o.organization_id=p_org
        and o.bank_transaction_id=p_transaction_id
        and o.field_name='DESCRIPTION'
        and o.apply_status='APPLIED'
      order by o.imported_at desc,o.id desc
      limit 1
    ),
    t.description
  )
  from finance.bank_transactions t
  where t.organization_id=p_org and t.id=p_transaction_id and t.deleted_at is null
$$;

create or replace function finance.preview_bank_transaction_counterparty_rule(
  p_org uuid,
  p_actor uuid,
  p_transaction_id uuid
)
returns table (
  match_text text,
  direction text,
  pending_count integer,
  pending_amount bigint,
  active_rule_id uuid,
  active_rule_account_subject_id uuid,
  active_rule_account_subject_name text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  transaction_row finance.bank_transactions;
  normalized_key text;
  direction_value text;
begin
  perform finance.workflow_actor(p_org,p_actor,'READ');
  select * into transaction_row from finance.bank_transactions
  where organization_id=p_org and id=p_transaction_id and deleted_at is null;
  if not found then raise exception '검토할 은행거래를 찾을 수 없어.'; end if;

  match_text:=finance.bank_transaction_effective_description(p_org,p_transaction_id);
  normalized_key:=finance.normalize_bank_transaction_rule_key(match_text);
  if normalized_key='' then raise exception '자동 분류 규칙으로 사용할 적요가 없어.'; end if;
  direction_value:=case when transaction_row.withdrawal_amount>0 then 'WITHDRAWAL' else 'DEPOSIT' end;

  select count(*)::integer,
         coalesce(sum(case when direction_value='WITHDRAWAL' then t.withdrawal_amount else t.deposit_amount end),0)::bigint
  into pending_count,pending_amount
  from finance.bank_transactions t
  where t.organization_id=p_org
    and t.deleted_at is null
    and t.classification_status in ('UNREVIEWED','RECOMMENDED')
    and (case when t.withdrawal_amount>0 then 'WITHDRAWAL' else 'DEPOSIT' end)=direction_value
    and finance.normalize_bank_transaction_rule_key(finance.bank_transaction_effective_description(p_org,t.id))=normalized_key;

  select r.id,r.account_subject_id,s.name
  into active_rule_id,active_rule_account_subject_id,active_rule_account_subject_name
  from finance.bank_transaction_counterparty_rules r
  join finance.account_subjects s on s.id=r.account_subject_id
  where r.organization_id=p_org and r.normalized_match_text=normalized_key
    and r.direction=direction_value and r.status='ACTIVE';
  direction:=direction_value;
  return next;
end
$$;

create or replace function finance.save_bank_transaction_review_rule(
  p_org uuid,
  p_actor uuid,
  p_transaction_id uuid,
  p_account_subject_id uuid,
  p_note text,
  p_scope text
)
returns table (
  transaction_id uuid,
  account_subject_id uuid,
  classification_status text,
  classification_note text,
  applied_count integer,
  rule_id uuid,
  match_text text,
  direction text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor finance.reimbursement_members;
  transaction_row finance.bank_transactions;
  target_row finance.bank_transactions;
  subject_row finance.account_subjects;
  existing_rule finance.bank_transaction_counterparty_rules;
  saved_rule finance.bank_transaction_counterparty_rules;
  normalized_key text;
  direction_value text;
  note_value text:=nullif(trim(coalesce(p_note,'')),'');
  audit_action text;
begin
  actor:=finance.workflow_actor(p_org,p_actor,'ADMIN');
  if p_scope not in ('SINGLE','MATCHING','MATCHING_AND_FUTURE') then
    raise exception '지원하지 않는 자동 분류 적용 범위야.';
  end if;

  select * into transaction_row from finance.bank_transactions
  where id=p_transaction_id and organization_id=p_org and deleted_at is null
  for update;
  if not found then raise exception '검토할 은행거래를 찾을 수 없어.'; end if;

  select * into subject_row from finance.account_subjects
  where id=p_account_subject_id and organization_id=p_org and is_active;
  if not found then raise exception '같은 조직의 사용 중인 계정과목만 선택할 수 있어.'; end if;

  match_text:=finance.bank_transaction_effective_description(p_org,p_transaction_id);
  normalized_key:=finance.normalize_bank_transaction_rule_key(match_text);
  if normalized_key='' then raise exception '자동 분류 규칙으로 사용할 적요가 없어.'; end if;
  direction_value:=case when transaction_row.withdrawal_amount>0 then 'WITHDRAWAL' else 'DEPOSIT' end;
  applied_count:=0;

  if p_scope='MATCHING_AND_FUTURE' then
    select r.* into existing_rule from finance.bank_transaction_counterparty_rules r
    where r.organization_id=p_org and r.normalized_match_text=normalized_key
      and r.direction=direction_value
    for update;

    insert into finance.bank_transaction_counterparty_rules(
      organization_id,match_text,normalized_match_text,direction,account_subject_id,status,created_by,updated_by
    ) values (
      p_org,match_text,normalized_key,direction_value,p_account_subject_id,'ACTIVE',p_actor,p_actor
    )
    on conflict on constraint bank_tx_counterparty_rule_unique do update
      set match_text=excluded.match_text,account_subject_id=excluded.account_subject_id,status='ACTIVE',
          updated_by=excluded.updated_by,updated_at=now()
    returning * into saved_rule;

    insert into finance.bank_transaction_counterparty_rule_audit_logs(
      organization_id,rule_id,action,actor_id,actor_label,before_data,after_data
    ) values (
      p_org,saved_rule.id,
      case when existing_rule.id is null then 'CREATE'
           when existing_rule.status<>'ACTIVE' then 'REACTIVATE' else 'CHANGE' end,
      p_actor,actor.display_name,
      case when existing_rule.id is null then null else jsonb_build_object(
        'match_text',existing_rule.match_text,'direction',existing_rule.direction,
        'account_subject_id',existing_rule.account_subject_id,'status',existing_rule.status
      ) end,
      jsonb_build_object(
        'match_text',saved_rule.match_text,'direction',saved_rule.direction,
        'account_subject_id',saved_rule.account_subject_id,'status',saved_rule.status
      )
    );
    rule_id:=saved_rule.id;
  end if;

  for target_row in
    select t.*
    from finance.bank_transactions t
    where t.organization_id=p_org and t.deleted_at is null
      and (
        t.id=p_transaction_id
        or (
          p_scope in ('MATCHING','MATCHING_AND_FUTURE')
          and t.classification_status in ('UNREVIEWED','RECOMMENDED')
          and (case when t.withdrawal_amount>0 then 'WITHDRAWAL' else 'DEPOSIT' end)=direction_value
          and finance.normalize_bank_transaction_rule_key(finance.bank_transaction_effective_description(p_org,t.id))=normalized_key
        )
      )
    order by (t.id=p_transaction_id) desc,t.transacted_at,t.id
    for update
  loop
    audit_action:=case
      when target_row.id<>p_transaction_id then 'RULE_APPLY'
      when target_row.confirmed_account_subject_id is null or target_row.classification_status<>'CONFIRMED' then 'CONFIRM'
      when target_row.confirmed_account_subject_id<>p_account_subject_id then 'CHANGE'
      else 'NOTE'
    end;

    update finance.bank_transactions
    set confirmed_account_subject_id=p_account_subject_id,
        classification_status='CONFIRMED',
        classification_note=case when target_row.id=p_transaction_id then note_value else target_row.classification_note end,
        classified_by=p_actor,
        classified_at=now(),
        recommendation_reason=case when p_scope='SINGLE' then recommendation_reason
          else '관리자 확정 규칙 · '||match_text||' · '||case when direction_value='WITHDRAWAL' then '출금' else '입금' end end
    where id=target_row.id;

    insert into finance.bank_transaction_classification_audit_logs(
      organization_id,bank_transaction_id,account_subject_id,action,actor_id,actor_label,previous_data,confirmed_data
    ) values (
      p_org,target_row.id,p_account_subject_id,audit_action,p_actor,actor.display_name,
      jsonb_build_object(
        'account_subject_id',target_row.confirmed_account_subject_id,
        'classification_status',target_row.classification_status,
        'classification_note',target_row.classification_note
      ),
      jsonb_build_object(
        'account_subject_id',p_account_subject_id,'classification_status','CONFIRMED',
        'classification_note',case when target_row.id=p_transaction_id then note_value else target_row.classification_note end,
        'scope',p_scope,'rule_id',rule_id
      )
    );
    applied_count:=applied_count+1;
  end loop;

  transaction_id:=p_transaction_id;
  account_subject_id:=p_account_subject_id;
  classification_status:='CONFIRMED';
  classification_note:=note_value;
  direction:=direction_value;
  return next;
end
$$;

create or replace function finance.apply_bank_transaction_counterparty_rule_on_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  matched_rule finance.bank_transaction_counterparty_rules;
  actor_label text;
  direction_value text;
  normalized_key text;
begin
  if new.deleted_at is not null or new.classification_status not in ('UNREVIEWED','RECOMMENDED') then return new; end if;
  direction_value:=case when new.withdrawal_amount>0 then 'WITHDRAWAL' else 'DEPOSIT' end;
  normalized_key:=finance.normalize_bank_transaction_rule_key(new.description);
  if normalized_key='' then return new; end if;

  select * into matched_rule from finance.bank_transaction_counterparty_rules
  where organization_id=new.organization_id and normalized_match_text=normalized_key
    and direction=direction_value and status='ACTIVE';
  if not found then return new; end if;

  select display_name into actor_label from finance.reimbursement_members
  where organization_id=new.organization_id and user_id=matched_rule.updated_by and active
  limit 1;

  update finance.bank_transactions
  set confirmed_account_subject_id=matched_rule.account_subject_id,
      classification_status='CONFIRMED',classified_by=matched_rule.updated_by,classified_at=now(),
      recommendation_reason='관리자 확정 자동 규칙 · '||matched_rule.match_text||' · '||case when direction_value='WITHDRAWAL' then '출금' else '입금' end
  where id=new.id;

  insert into finance.bank_transaction_classification_audit_logs(
    organization_id,bank_transaction_id,account_subject_id,action,actor_id,actor_label,previous_data,confirmed_data
  ) values (
    new.organization_id,new.id,matched_rule.account_subject_id,'AUTO_RULE_APPLY',matched_rule.updated_by,
    coalesce(actor_label,'거래처 자동 규칙'),
    jsonb_build_object('account_subject_id',new.confirmed_account_subject_id,'classification_status',new.classification_status),
    jsonb_build_object('account_subject_id',matched_rule.account_subject_id,'classification_status','CONFIRMED','rule_id',matched_rule.id)
  );
  return new;
end
$$;

drop trigger if exists bank_transaction_counterparty_rule_on_insert on finance.bank_transactions;
create trigger bank_transaction_counterparty_rule_on_insert
after insert on finance.bank_transactions
for each row execute function finance.apply_bank_transaction_counterparty_rule_on_insert();

revoke all on function finance.normalize_bank_transaction_rule_key(text) from public,anon,authenticated;
revoke all on function finance.bank_transaction_effective_description(uuid,uuid) from public,anon,authenticated;
revoke all on function finance.preview_bank_transaction_counterparty_rule(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function finance.save_bank_transaction_review_rule(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function finance.normalize_bank_transaction_rule_key(text) to service_role;
grant execute on function finance.bank_transaction_effective_description(uuid,uuid) to service_role;
grant execute on function finance.preview_bank_transaction_counterparty_rule(uuid,uuid,uuid) to service_role;
grant execute on function finance.save_bank_transaction_review_rule(uuid,uuid,uuid,uuid,text,text) to service_role;
