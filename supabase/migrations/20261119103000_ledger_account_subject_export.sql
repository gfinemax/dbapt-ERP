-- ERP 계정과목과 Ledger 분류 연결을 Ledger가 읽기 전용으로 투영할 수 있게 한다.
-- ERP가 계정과목의 단일 관리 원장이며, Ledger는 커서 이벤트를 삭제 없이 보존한다.

create table finance.ledger_account_subject_export_outbox (
  event_id bigserial primary key,
  organization_id uuid not null references core.organizations(id) on delete restrict,
  entity_type text not null check (entity_type in ('ACCOUNT_SUBJECT','CATEGORY_LINK')),
  entity_id text not null,
  event_type text not null check (event_type in ('UPSERT','DEACTIVATE')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index ledger_account_subject_export_cursor_idx
  on finance.ledger_account_subject_export_outbox(organization_id,event_id);

alter table finance.ledger_account_subject_export_outbox enable row level security;
revoke all on finance.ledger_account_subject_export_outbox from public,anon,authenticated;
grant select,insert on finance.ledger_account_subject_export_outbox to service_role;
grant usage,select on sequence finance.ledger_account_subject_export_outbox_event_id_seq to service_role;
create policy ledger_account_subject_export_server
  on finance.ledger_account_subject_export_outbox for all to service_role
  using (true) with check (true);

create function finance.ledger_account_subject_export_payload(p_subject finance.account_subjects)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'account_subject_id',p_subject.id,
    'organization_id',p_subject.organization_id,
    'code',p_subject.code,
    'name',p_subject.name,
    'parent_id',p_subject.parent_id,
    'subject_type',p_subject.subject_type,
    'normal_balance',p_subject.normal_balance,
    'business_category',p_subject.business_category,
    'source',p_subject.source,
    'aliases',coalesce(to_jsonb(p_subject.aliases),'[]'::jsonb),
    'description',p_subject.description,
    'sort_order',p_subject.sort_order,
    'is_active',p_subject.is_active,
    'is_primary',p_subject.is_primary,
    'primary_order',p_subject.primary_order,
    'source_created_at',p_subject.created_at,
    'source_updated_at',p_subject.updated_at
  )
$$;

create function finance.enqueue_ledger_account_subject_export()
returns trigger language plpgsql security invoker set search_path='' as $$
declare subject_row finance.account_subjects;
begin
  subject_row:=case when tg_op='DELETE' then old else new end;
  insert into finance.ledger_account_subject_export_outbox(
    organization_id,entity_type,entity_id,event_type,payload
  ) values (
    subject_row.organization_id,'ACCOUNT_SUBJECT',subject_row.id::text,
    case when tg_op='DELETE' or not subject_row.is_active then 'DEACTIVATE' else 'UPSERT' end,
    finance.ledger_account_subject_export_payload(subject_row)
  );
  return coalesce(new,old);
end $$;

create trigger account_subject_ledger_export
after insert or update or delete on finance.account_subjects
for each row execute function finance.enqueue_ledger_account_subject_export();

create function finance.ledger_category_link_export_payload(p_link finance.ledger_account_subject_links)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'link_id',p_link.id,
    'organization_id',p_link.organization_id,
    'source_system',p_link.source_system,
    'ledger_category_id',p_link.ledger_category_id,
    'direction',p_link.direction,
    'category_group',p_link.category_group,
    'category_name',p_link.category_name,
    'account_subject_id',p_link.account_subject_id,
    'sync_status',p_link.sync_status,
    'sync_note',p_link.sync_note,
    'source_synced_at',p_link.synced_at,
    'source_created_at',p_link.created_at,
    'source_updated_at',p_link.updated_at
  )
$$;

create function finance.enqueue_ledger_category_link_export()
returns trigger language plpgsql security invoker set search_path='' as $$
declare link_row finance.ledger_account_subject_links;
begin
  link_row:=case when tg_op='DELETE' then old else new end;
  insert into finance.ledger_account_subject_export_outbox(
    organization_id,entity_type,entity_id,event_type,payload
  ) values (
    link_row.organization_id,'CATEGORY_LINK',link_row.id::text,
    case when tg_op='DELETE' then 'DEACTIVATE' else 'UPSERT' end,
    finance.ledger_category_link_export_payload(link_row)
  );
  return coalesce(new,old);
end $$;

create trigger ledger_category_link_export
after insert or update or delete on finance.ledger_account_subject_links
for each row execute function finance.enqueue_ledger_category_link_export();

revoke all on function finance.ledger_account_subject_export_payload(finance.account_subjects),
  finance.enqueue_ledger_account_subject_export(),
  finance.ledger_category_link_export_payload(finance.ledger_account_subject_links),
  finance.enqueue_ledger_category_link_export()
  from public,anon,authenticated;
grant execute on function finance.ledger_account_subject_export_payload(finance.account_subjects),
  finance.enqueue_ledger_account_subject_export(),
  finance.ledger_category_link_export_payload(finance.ledger_account_subject_links),
  finance.enqueue_ledger_category_link_export()
  to service_role;

insert into finance.ledger_account_subject_export_outbox(
  organization_id,entity_type,entity_id,event_type,payload
)
select subject_row.organization_id,'ACCOUNT_SUBJECT',subject_row.id::text,
  case when subject_row.is_active then 'UPSERT' else 'DEACTIVATE' end,
  finance.ledger_account_subject_export_payload(subject_row)
from finance.account_subjects subject_row;

insert into finance.ledger_account_subject_export_outbox(
  organization_id,entity_type,entity_id,event_type,payload
)
select link_row.organization_id,'CATEGORY_LINK',link_row.id::text,'UPSERT',
  finance.ledger_category_link_export_payload(link_row)
from finance.ledger_account_subject_links link_row;
