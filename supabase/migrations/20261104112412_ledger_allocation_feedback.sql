-- Durable ERP -> ledger receipt allocation feedback. The ERP allocation remains authoritative.
create table finance.ledger_allocation_feedback_outbox (
  event_id bigserial primary key,
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_kind text not null check(source_kind in ('ALLOCATION','REVERSAL')),
  source_id uuid not null,
  source_assessment_id text not null,
  erp_allocation_id uuid not null,
  bank_transaction_id uuid not null,
  external_member_id text not null,
  amount numeric(16,0) not null check(amount>0),
  event_type text not null check(event_type in ('ALLOCATED','REVERSED')),
  reason text not null,
  occurred_at timestamptz not null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,source_kind,source_id)
);
create index ledger_allocation_feedback_pending_idx
  on finance.ledger_allocation_feedback_outbox(organization_id,event_id) where acknowledged_at is null;
alter table finance.ledger_allocation_feedback_outbox enable row level security;
revoke all on finance.ledger_allocation_feedback_outbox from public,anon,authenticated;
grant select,insert,update on finance.ledger_allocation_feedback_outbox to service_role;
grant usage,select on sequence finance.ledger_allocation_feedback_outbox_event_id_seq to service_role;
create policy ledger_allocation_feedback_server on finance.ledger_allocation_feedback_outbox
  for all to service_role using(true) with check(true);

create function finance.enqueue_ledger_allocation_feedback() returns trigger
language plpgsql security invoker set search_path='' as $$
declare assessment finance.collection_assessments;
begin
  select * into assessment from finance.collection_assessments
    where organization_id=new.organization_id and id=new.assessment_id;
  if assessment.source_system='dbapt-ledger' and assessment.source_assessment_id is not null then
    insert into finance.ledger_allocation_feedback_outbox(
      organization_id,source_kind,source_id,source_assessment_id,erp_allocation_id,
      bank_transaction_id,external_member_id,amount,event_type,reason,occurred_at)
    values(new.organization_id,'ALLOCATION',new.id,assessment.source_assessment_id,new.id,
      new.bank_transaction_id,assessment.external_member_id,new.amount,'ALLOCATED',new.reason,new.created_at)
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger enqueue_ledger_allocation_feedback after insert on finance.collection_receipt_allocations
for each row execute function finance.enqueue_ledger_allocation_feedback();

create function finance.enqueue_ledger_reversal_feedback() returns trigger
language plpgsql security invoker set search_path='' as $$
declare allocation finance.collection_receipt_allocations; assessment finance.collection_assessments;
begin
  select * into allocation from finance.collection_receipt_allocations
    where organization_id=new.organization_id and id=new.allocation_id;
  select * into assessment from finance.collection_assessments
    where organization_id=new.organization_id and id=allocation.assessment_id;
  if assessment.source_system='dbapt-ledger' and assessment.source_assessment_id is not null then
    insert into finance.ledger_allocation_feedback_outbox(
      organization_id,source_kind,source_id,source_assessment_id,erp_allocation_id,
      bank_transaction_id,external_member_id,amount,event_type,reason,occurred_at)
    values(new.organization_id,'REVERSAL',new.id,assessment.source_assessment_id,allocation.id,
      allocation.bank_transaction_id,assessment.external_member_id,allocation.amount,'REVERSED',new.reason,new.created_at)
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger enqueue_ledger_reversal_feedback after insert on finance.collection_receipt_reversals
for each row execute function finance.enqueue_ledger_reversal_feedback();

create function finance.ledger_allocation_feedback_batch(p_org uuid,p_actor uuid,p_limit integer default 200)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members;
begin
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['ADMIN','PAY','CLOSE','APPROVE']) then raise exception '수납 연동 권한이 필요합니다.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'event_id',o.event_id,'event_type',o.event_type,'source_assessment_id',o.source_assessment_id,
    'erp_allocation_id',o.erp_allocation_id,'bank_transaction_id',o.bank_transaction_id,
    'external_member_id',o.external_member_id,'amount',o.amount,'reason',o.reason,'occurred_at',o.occurred_at
  ) order by o.event_id) from (select * from finance.ledger_allocation_feedback_outbox
    where organization_id=p_org and acknowledged_at is null order by event_id limit greatest(1,least(coalesce(p_limit,200),500))) o),'[]'::jsonb);
end $$;

create function finance.ledger_allocation_feedback_ack(p_org uuid,p_actor uuid,p_event_ids bigint[])
returns integer language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; affected integer;
begin
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['ADMIN','PAY','CLOSE','APPROVE']) then raise exception '수납 연동 권한이 필요합니다.'; end if;
  update finance.ledger_allocation_feedback_outbox set acknowledged_at=clock_timestamp()
    where organization_id=p_org and event_id=any(coalesce(p_event_ids,'{}'::bigint[])) and acknowledged_at is null;
  get diagnostics affected=row_count; return affected;
end $$;

revoke all on function finance.ledger_allocation_feedback_batch(uuid,uuid,integer),finance.ledger_allocation_feedback_ack(uuid,uuid,bigint[]) from public,anon,authenticated;
grant execute on function finance.ledger_allocation_feedback_batch(uuid,uuid,integer),finance.ledger_allocation_feedback_ack(uuid,uuid,bigint[]) to service_role;
grant execute on function finance.enqueue_ledger_allocation_feedback(),finance.enqueue_ledger_reversal_feedback() to service_role;
