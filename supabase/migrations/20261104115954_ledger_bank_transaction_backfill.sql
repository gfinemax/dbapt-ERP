-- One-time, provenance-preserving migration of the frozen dbapt-ledger bank ledger.
alter table finance.bank_transactions
  add column source_system text,
  add column source_transaction_id text,
  add column source_payload_hash text,
  add column source_readonly boolean not null default false,
  add column source_imported_at timestamptz;

alter table finance.bank_transactions add constraint bank_transaction_source_complete check (
  (source_system is null and source_transaction_id is null and source_payload_hash is null
    and source_readonly=false and source_imported_at is null)
  or (length(trim(source_system)) between 1 and 100
    and length(trim(source_transaction_id)) between 1 and 200
    and source_payload_hash ~ '^[0-9a-f]{64}$'
    and source_readonly=true and source_imported_at is not null)
);
create unique index bank_transactions_source_uidx
  on finance.bank_transactions(organization_id,source_system,source_transaction_id)
  where source_system is not null;

create table finance.ledger_bank_account_sources (
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null,
  ledger_account_id text not null,
  account_name text not null,
  bank_name text,
  account_number text,
  source_snapshot jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(organization_id,source_system,ledger_account_id)
);

create table finance.ledger_bank_account_mappings (
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null,
  ledger_account_id text not null,
  bank_account_id uuid not null references finance.bank_accounts(id) on delete restrict,
  mapping_status text not null default 'CONFIRMED' check(mapping_status='CONFIRMED'),
  mapping_note text not null default '',
  mapped_by uuid not null references auth.users(id) on delete restrict,
  mapped_at timestamptz not null default now(),
  primary key(organization_id,source_system,ledger_account_id),
  foreign key(organization_id,source_system,ledger_account_id)
    references finance.ledger_bank_account_sources(organization_id,source_system,ledger_account_id) on delete restrict
);
create index ledger_bank_account_mappings_bank_idx
  on finance.ledger_bank_account_mappings(organization_id,bank_account_id);

create table finance.ledger_bank_transaction_sources (
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null,
  source_transaction_id text not null,
  source_version bigint not null check(source_version>0),
  ledger_account_id text not null,
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  import_status text not null check(import_status in ('PENDING_MAPPING','IMPORTED','INVALID','CONFLICT')),
  issue_detail text,
  bank_transaction_id uuid references finance.bank_transactions(id) on delete restrict,
  synced_at timestamptz not null default now(),
  imported_at timestamptz,
  primary key(organization_id,source_system,source_transaction_id),
  foreign key(organization_id,source_system,ledger_account_id)
    references finance.ledger_bank_account_sources(organization_id,source_system,ledger_account_id) on delete restrict,
  check((import_status in ('IMPORTED','CONFLICT') and bank_transaction_id is not null and imported_at is not null)
    or (import_status in ('PENDING_MAPPING','INVALID') and bank_transaction_id is null and imported_at is null))
);
create index ledger_bank_transaction_sources_review_idx
  on finance.ledger_bank_transaction_sources(organization_id,import_status,ledger_account_id);

create table finance.ledger_bank_transaction_sync_state (
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null,
  last_cursor bigint not null default 0 check(last_cursor>=0),
  source_frozen boolean not null default false,
  last_synced_at timestamptz,
  last_status text not null default 'NEVER' check(last_status in ('NEVER','PARTIAL','SUCCESS','FAILED')),
  last_error text,
  updated_by uuid references auth.users(id) on delete restrict,
  primary key(organization_id,source_system)
);

create table finance.ledger_bank_transaction_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  from_cursor bigint not null,
  to_cursor bigint not null,
  received_count integer not null,
  imported_count integer not null,
  invalid_count integer not null,
  completed boolean not null,
  created_at timestamptz not null default now()
);

alter table finance.ledger_bank_account_sources enable row level security;
alter table finance.ledger_bank_account_mappings enable row level security;
alter table finance.ledger_bank_transaction_sources enable row level security;
alter table finance.ledger_bank_transaction_sync_state enable row level security;
alter table finance.ledger_bank_transaction_sync_runs enable row level security;
revoke all on finance.ledger_bank_account_sources,finance.ledger_bank_account_mappings,
  finance.ledger_bank_transaction_sources,finance.ledger_bank_transaction_sync_state,
  finance.ledger_bank_transaction_sync_runs from public,anon,authenticated;
grant select,insert,update on finance.ledger_bank_account_sources,finance.ledger_bank_account_mappings,
  finance.ledger_bank_transaction_sources,finance.ledger_bank_transaction_sync_state to service_role;
grant select,insert on finance.ledger_bank_transaction_sync_runs to service_role;
create policy ledger_bank_account_sources_server on finance.ledger_bank_account_sources
  for all to service_role using(true) with check(true);
create policy ledger_bank_account_mappings_server on finance.ledger_bank_account_mappings
  for all to service_role using(true) with check(true);
create policy ledger_bank_transaction_sources_server on finance.ledger_bank_transaction_sources
  for all to service_role using(true) with check(true);
create policy ledger_bank_transaction_sync_state_server on finance.ledger_bank_transaction_sync_state
  for all to service_role using(true) with check(true);
create policy ledger_bank_transaction_sync_runs_server on finance.ledger_bank_transaction_sync_runs
  for all to service_role using(true) with check(true);

create function finance.guard_ledger_imported_bank_transaction() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.source_readonly then
    if tg_op='DELETE' then
      raise exception 'Ledger에서 이관한 통장 원본은 삭제할 수 없습니다.';
    end if;
    if new.organization_id is distinct from old.organization_id
      or new.bank_account_id is distinct from old.bank_account_id
      or new.transacted_at is distinct from old.transacted_at
      or new.transaction_kind is distinct from old.transaction_kind
      or new.description is distinct from old.description
      or new.deposit_amount is distinct from old.deposit_amount
      or new.withdrawal_amount is distinct from old.withdrawal_amount
      or new.balance_amount is distinct from old.balance_amount
      or new.counterparty is distinct from old.counterparty
      or new.branch_name is distinct from old.branch_name
      or new.uploaded_major_category is distinct from old.uploaded_major_category
      or new.uploaded_account_title is distinct from old.uploaded_account_title
      or new.memo is distinct from old.memo
      or new.bank_transaction_uid is distinct from old.bank_transaction_uid
      or new.raw_payload is distinct from old.raw_payload
      or new.deleted_at is distinct from old.deleted_at
      or new.source_system is distinct from old.source_system
      or new.source_transaction_id is distinct from old.source_transaction_id
      or new.source_payload_hash is distinct from old.source_payload_hash
      or new.source_readonly is distinct from old.source_readonly
      or new.source_imported_at is distinct from old.source_imported_at then
      raise exception 'Ledger에서 이관한 통장 원본 필드는 변경할 수 없습니다.';
    end if;
  end if;
  return coalesce(new,old);
end $$;
create trigger guard_ledger_imported_bank_transaction before update or delete on finance.bank_transactions
for each row execute function finance.guard_ledger_imported_bank_transaction();

create function finance.reconcile_ledger_bank_transactions(
  p_org uuid,p_actor uuid,p_source_system text default 'dbapt-ledger'
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; imported_count integer:=0;
begin
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['ADMIN','CLOSE','APPROVE']) then
    raise exception 'Ledger 거래 이관 권한이 필요합니다.';
  end if;

  insert into finance.bank_transactions(
    organization_id,bank_account_id,transacted_at,transaction_kind,description,
    deposit_amount,withdrawal_amount,balance_amount,counterparty,branch_name,
    uploaded_major_category,uploaded_account_title,match_status,raw_payload,memo,
    bank_transaction_uid,resolution_status,classification_status,recommendation_reason,
    source_system,source_transaction_id,source_payload_hash,source_readonly,source_imported_at
  )
  select s.organization_id,map.bank_account_id,
    ((s.payload->>'transaction_date')::date
      + coalesce(nullif(s.payload->>'transaction_time','')::time,time '00:00')) at time zone 'Asia/Seoul',
    case when (s.payload->>'deposit_amount')::numeric>0 then '입금' else '출금' end,
    coalesce(s.payload->>'description',''),
    (s.payload->>'deposit_amount')::numeric,(s.payload->>'withdrawal_amount')::numeric,
    nullif(s.payload->>'balance_amount','')::numeric,null,null,
    nullif(s.payload->>'category_group',''),nullif(s.payload->>'category_name',''),
    '미분류',s.payload,coalesce(nullif(s.payload->>'management_memo',''),nullif(s.payload->>'memo','')),
    'LEDGER:'||s.source_system||':'||s.source_transaction_id,'UNRESOLVED','UNREVIEWED',
    'Ledger 과거 분류는 참고값이며 ERP 계정과목 확인이 필요합니다.',
    s.source_system,s.source_transaction_id,s.payload_hash,true,clock_timestamp()
  from finance.ledger_bank_transaction_sources s
  join finance.ledger_bank_account_mappings map
    on map.organization_id=s.organization_id and map.source_system=s.source_system
    and map.ledger_account_id=s.ledger_account_id and map.mapping_status='CONFIRMED'
  where s.organization_id=p_org and s.source_system=p_source_system
    and s.import_status='PENDING_MAPPING'
  on conflict (organization_id,source_system,source_transaction_id) where source_system is not null
  do nothing;

  update finance.ledger_bank_transaction_sources s set
    import_status='IMPORTED',bank_transaction_id=t.id,imported_at=t.source_imported_at,
    issue_detail=null,synced_at=clock_timestamp()
  from finance.bank_transactions t
  where s.organization_id=p_org and s.source_system=p_source_system
    and s.import_status='PENDING_MAPPING'
    and t.organization_id=s.organization_id and t.source_system=s.source_system
    and t.source_transaction_id=s.source_transaction_id;
  get diagnostics imported_count=row_count;

  update finance.bank_accounts a set
    last_synced_at=clock_timestamp(),sync_status='정상',updated_at=clock_timestamp()
  where a.organization_id=p_org and a.deleted_at is null and exists(
    select 1 from finance.ledger_bank_account_mappings map
    where map.organization_id=p_org and map.source_system=p_source_system and map.bank_account_id=a.id
  );
  return jsonb_build_object('imported_count',imported_count);
end $$;

create function finance.sync_ledger_bank_transactions(
  p_org uuid,p_actor uuid,p_source_system text,p_from_cursor bigint,p_next_cursor bigint,
  p_source_frozen boolean,p_complete boolean,p_items jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  m finance.reimbursement_members; item jsonb; current_cursor bigint; source_id text;
  account_id text; source_ver bigint; hash_value text; deposit_value numeric;
  withdrawal_value numeric; row_status text; issue text; existing_status text;
  existing_hash text; received integer:=0; invalid integer:=0; imported integer:=0;
  reconcile_result jsonb;
begin
  if p_org is null or p_actor is null or coalesce(length(trim(p_source_system)),0) not between 1 and 100
    or p_from_cursor<0 or p_next_cursor<p_from_cursor or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Ledger 거래 이관 요청 정보를 확인해주세요.';
  end if;
  if not p_source_frozen then raise exception 'Ledger 신규 통장입력을 ERP로 전환한 뒤 이관할 수 있습니다.'; end if;
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['ADMIN','CLOSE','APPROVE']) then
    raise exception 'Ledger 거래 이관 권한이 필요합니다.';
  end if;
  insert into finance.ledger_bank_transaction_sync_state(organization_id,source_system,updated_by)
    values(p_org,p_source_system,p_actor) on conflict do nothing;
  select last_cursor into current_cursor from finance.ledger_bank_transaction_sync_state
    where organization_id=p_org and source_system=p_source_system for update;
  if current_cursor<>p_from_cursor then raise exception '다른 이관 작업이 먼저 진행됐습니다. 상태를 새로고침해주세요.'; end if;
  if (jsonb_array_length(p_items)=0 and p_next_cursor<>p_from_cursor)
    or (jsonb_array_length(p_items)>0 and p_next_cursor<>(
      select max((value->>'cursor')::bigint) from jsonb_array_elements(p_items)
    )) then raise exception 'Ledger 거래 페이지 커서를 확인해주세요.'; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    received:=received+1;
    source_id:=trim(coalesce(item->>'source_transaction_id',''));
    account_id:=trim(coalesce(item->>'ledger_account_id',''));
    source_ver:=coalesce((item->>'source_version')::bigint,0);
    hash_value:=lower(trim(coalesce(item->>'payload_hash','')));
    if source_id='' or account_id='' or source_ver<=0 or source_id<>source_ver::text
      or coalesce((item->>'cursor')::bigint,0)<>source_ver or hash_value!~'^[0-9a-f]{64}$'
      or coalesce(item->>'transaction_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Ledger 거래 고유번호 또는 원본 형식이 올바르지 않습니다.';
    end if;
    deposit_value:=coalesce((item->>'deposit_amount')::numeric,0);
    withdrawal_value:=coalesce((item->>'withdrawal_amount')::numeric,0);
    if deposit_value<0 or withdrawal_value<0 or ((deposit_value>0)=(withdrawal_value>0)) then
      row_status:='INVALID'; issue:='입금과 출금 중 정확히 한 금액만 0보다 커야 합니다.'; invalid:=invalid+1;
    else
      row_status:='PENDING_MAPPING'; issue:=null;
    end if;

    insert into finance.ledger_bank_account_sources(
      organization_id,source_system,ledger_account_id,account_name,bank_name,account_number,source_snapshot
    ) values(
      p_org,p_source_system,account_id,coalesce(nullif(item->>'account_name',''),'Ledger 계좌 '||account_id),
      nullif(item->>'bank_name',''),nullif(item->>'account_number',''),
      jsonb_build_object('ledger_account_id',account_id,'account_name',item->>'account_name',
        'bank_name',item->>'bank_name','account_number',item->>'account_number')
    ) on conflict(organization_id,source_system,ledger_account_id) do update set
      account_name=excluded.account_name,bank_name=excluded.bank_name,account_number=excluded.account_number,
      source_snapshot=excluded.source_snapshot,last_seen_at=clock_timestamp();

    select import_status,payload_hash into existing_status,existing_hash
      from finance.ledger_bank_transaction_sources where organization_id=p_org
      and source_system=p_source_system and source_transaction_id=source_id;
    if existing_status in ('IMPORTED','CONFLICT') then
      if existing_hash is distinct from hash_value then
        update finance.ledger_bank_transaction_sources set import_status='CONFLICT',
          issue_detail='이관 후 Ledger 원본 해시가 달라졌습니다. 자동 덮어쓰기를 중단했습니다.',synced_at=clock_timestamp()
          where organization_id=p_org and source_system=p_source_system and source_transaction_id=source_id;
        invalid:=invalid+1;
      else
        update finance.ledger_bank_transaction_sources set synced_at=clock_timestamp()
          where organization_id=p_org and source_system=p_source_system and source_transaction_id=source_id;
      end if;
    else
      insert into finance.ledger_bank_transaction_sources(
        organization_id,source_system,source_transaction_id,source_version,ledger_account_id,
        payload_hash,payload,import_status,issue_detail
      ) values(p_org,p_source_system,source_id,source_ver,account_id,hash_value,item,row_status,issue)
      on conflict(organization_id,source_system,source_transaction_id) do update set
        source_version=excluded.source_version,ledger_account_id=excluded.ledger_account_id,
        payload_hash=excluded.payload_hash,payload=excluded.payload,
        import_status=case when finance.ledger_bank_transaction_sources.import_status='IMPORTED'
          then 'IMPORTED' else excluded.import_status end,
        issue_detail=case when finance.ledger_bank_transaction_sources.import_status='IMPORTED'
          then finance.ledger_bank_transaction_sources.issue_detail else excluded.issue_detail end,
        synced_at=clock_timestamp();
    end if;
  end loop;

  reconcile_result:=finance.reconcile_ledger_bank_transactions(p_org,p_actor,p_source_system);
  imported:=coalesce((reconcile_result->>'imported_count')::integer,0);
  update finance.ledger_bank_transaction_sync_state set
    last_cursor=p_next_cursor,source_frozen=p_source_frozen,last_synced_at=clock_timestamp(),
    last_status=case when p_complete then 'SUCCESS' else 'PARTIAL' end,last_error=null,updated_by=p_actor
    where organization_id=p_org and source_system=p_source_system;
  insert into finance.ledger_bank_transaction_sync_runs(
    organization_id,source_system,actor_id,from_cursor,to_cursor,received_count,
    imported_count,invalid_count,completed
  ) values(p_org,p_source_system,p_actor,p_from_cursor,p_next_cursor,received,imported,invalid,p_complete);
  insert into audit.audit_logs(organization_id,actor_user_id,action,entity_schema,entity_table,entity_id,after_data)
    values(p_org,p_actor,'LEDGER_BANK_BACKFILL_SYNC','finance','ledger_bank_transaction_sync_state',
      p_source_system,jsonb_build_object('from_cursor',p_from_cursor,'to_cursor',p_next_cursor,
        'received_count',received,'imported_count',imported,'invalid_count',invalid,'completed',p_complete));
  return jsonb_build_object('received_count',received,'imported_count',imported,
    'invalid_count',invalid,'next_cursor',p_next_cursor,'completed',p_complete);
end $$;

create function finance.set_ledger_bank_account_mapping(
  p_org uuid,p_actor uuid,p_source_system text,p_ledger_account_id text,
  p_bank_account_id uuid,p_note text default ''
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; before_value jsonb; after_value jsonb; result jsonb;
begin
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['ADMIN','CLOSE']) then raise exception 'Ledger 계좌 매핑 권한이 필요합니다.'; end if;
  if not exists(select 1 from finance.ledger_bank_account_sources where organization_id=p_org
    and source_system=p_source_system and ledger_account_id=p_ledger_account_id) then
    raise exception 'Ledger 원본 계좌를 먼저 불러와주세요.';
  end if;
  if not exists(select 1 from finance.bank_accounts where organization_id=p_org
    and id=p_bank_account_id and deleted_at is null) then raise exception '사용 가능한 ERP 계좌를 선택해주세요.'; end if;
  select to_jsonb(x) into before_value from finance.ledger_bank_account_mappings x
    where organization_id=p_org and source_system=p_source_system and ledger_account_id=p_ledger_account_id;
  if before_value is not null and (before_value->>'bank_account_id')::uuid<>p_bank_account_id and exists(
    select 1 from finance.ledger_bank_transaction_sources where organization_id=p_org
      and source_system=p_source_system and ledger_account_id=p_ledger_account_id and import_status='IMPORTED'
  ) then raise exception '이미 이관된 거래가 있어 계좌 매핑을 변경할 수 없습니다.'; end if;
  insert into finance.ledger_bank_account_mappings(
    organization_id,source_system,ledger_account_id,bank_account_id,mapping_note,mapped_by
  ) values(p_org,p_source_system,p_ledger_account_id,p_bank_account_id,coalesce(p_note,''),p_actor)
  on conflict(organization_id,source_system,ledger_account_id) do update set
    bank_account_id=excluded.bank_account_id,mapping_note=excluded.mapping_note,
    mapped_by=excluded.mapped_by,mapped_at=clock_timestamp();
  select to_jsonb(x) into after_value from finance.ledger_bank_account_mappings x
    where organization_id=p_org and source_system=p_source_system and ledger_account_id=p_ledger_account_id;
  result:=finance.reconcile_ledger_bank_transactions(p_org,p_actor,p_source_system);
  insert into audit.audit_logs(organization_id,actor_user_id,action,entity_schema,entity_table,entity_id,before_data,after_data)
    values(p_org,p_actor,'LEDGER_BANK_ACCOUNT_MAP','finance','ledger_bank_account_mappings',
      p_source_system||':'||p_ledger_account_id,before_value,
      after_value||jsonb_build_object('imported_count',coalesce((result->>'imported_count')::integer,0)));
  return after_value||result;
end $$;

create function finance.ledger_bank_backfill_status(p_org uuid,p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members;
begin
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['READ','ADMIN','CLOSE','APPROVE','PAY']) then
    raise exception 'Ledger 거래 이관 조회 권한이 필요합니다.';
  end if;
  return jsonb_build_object(
    'state',(select to_jsonb(s) from finance.ledger_bank_transaction_sync_state s
      where s.organization_id=p_org and s.source_system='dbapt-ledger'),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object(
      'ledger_account_id',a.ledger_account_id,'account_name',a.account_name,
      'bank_name',a.bank_name,'account_number_last4',right(regexp_replace(coalesce(a.account_number,''),'[^0-9]','','g'),4),
      'erp_bank_account_id',map.bank_account_id,'mapping_note',map.mapping_note,
      'pending_count',(select count(*) from finance.ledger_bank_transaction_sources t where
        t.organization_id=a.organization_id and t.source_system=a.source_system
        and t.ledger_account_id=a.ledger_account_id and t.import_status='PENDING_MAPPING'),
      'imported_count',(select count(*) from finance.ledger_bank_transaction_sources t where
        t.organization_id=a.organization_id and t.source_system=a.source_system
        and t.ledger_account_id=a.ledger_account_id and t.import_status='IMPORTED'),
      'invalid_count',(select count(*) from finance.ledger_bank_transaction_sources t where
        t.organization_id=a.organization_id and t.source_system=a.source_system
        and t.ledger_account_id=a.ledger_account_id and t.import_status='INVALID'),
      'conflict_count',(select count(*) from finance.ledger_bank_transaction_sources t where
        t.organization_id=a.organization_id and t.source_system=a.source_system
        and t.ledger_account_id=a.ledger_account_id and t.import_status='CONFLICT')
    ) order by a.ledger_account_id) from finance.ledger_bank_account_sources a
      left join finance.ledger_bank_account_mappings map on map.organization_id=a.organization_id
        and map.source_system=a.source_system and map.ledger_account_id=a.ledger_account_id
      where a.organization_id=p_org and a.source_system='dbapt-ledger'),'[]'::jsonb),
    'totals',jsonb_build_object(
      'staged',(select count(*) from finance.ledger_bank_transaction_sources where organization_id=p_org and source_system='dbapt-ledger'),
      'pending',(select count(*) from finance.ledger_bank_transaction_sources where organization_id=p_org and source_system='dbapt-ledger' and import_status='PENDING_MAPPING'),
      'imported',(select count(*) from finance.ledger_bank_transaction_sources where organization_id=p_org and source_system='dbapt-ledger' and import_status='IMPORTED'),
      'invalid',(select count(*) from finance.ledger_bank_transaction_sources where organization_id=p_org and source_system='dbapt-ledger' and import_status='INVALID'),
      'conflict',(select count(*) from finance.ledger_bank_transaction_sources where organization_id=p_org and source_system='dbapt-ledger' and import_status='CONFLICT')
    )
  );
end $$;

revoke all on function finance.guard_ledger_imported_bank_transaction(),
  finance.reconcile_ledger_bank_transactions(uuid,uuid,text),
  finance.sync_ledger_bank_transactions(uuid,uuid,text,bigint,bigint,boolean,boolean,jsonb),
  finance.set_ledger_bank_account_mapping(uuid,uuid,text,text,uuid,text),
  finance.ledger_bank_backfill_status(uuid,uuid) from public,anon,authenticated;
grant execute on function finance.guard_ledger_imported_bank_transaction(),
  finance.reconcile_ledger_bank_transactions(uuid,uuid,text),
  finance.sync_ledger_bank_transactions(uuid,uuid,text,bigint,bigint,boolean,boolean,jsonb),
  finance.set_ledger_bank_account_mapping(uuid,uuid,text,text,uuid,text),
  finance.ledger_bank_backfill_status(uuid,uuid) to service_role;
