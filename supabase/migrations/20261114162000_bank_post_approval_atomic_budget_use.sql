-- A bank post-approval resolution represents money that already left the
-- organization account. Its final approval therefore confirms approval and
-- payment in one atomic update. Allow that update to use the canonical
-- budget projection when no manual budget assignment exists, while keeping
-- the existing USED-assignment guard for every separate payment transition.
create or replace function finance.budget_guard_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  j jsonb := to_jsonb(old);
  n jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  org uuid;
  kind text;
  assigned finance.budget_source_assignments%rowtype;
  assignment_exists boolean := false;
  budget_change boolean;
  payment_change boolean;
  bank_post_approval_finalization boolean := false;
begin
  if tg_table_name = 'expense_resolutions' then
    org := (j->>'organization_id')::uuid;
    kind := 'RESOLUTION';
    budget_change := tg_op = 'DELETE' or
      (j->'organization_id', j->'total_payment_amount', j->'approval_status', j->'deleted_at', j->'approval_document_id', j->'actual_expense_date', j->'resolution_data'->'budgetItem', j->'resolution_data'->'accountAllocations')
      is distinct from
      (n->'organization_id', n->'total_payment_amount', n->'approval_status', n->'deleted_at', n->'approval_document_id', n->'actual_expense_date', n->'resolution_data'->'budgetItem', n->'resolution_data'->'accountAllocations');
    payment_change := tg_op = 'UPDATE'
      and n->>'disbursed_at' is not null
      and (j->'disbursed_at', j->'payment_status') is distinct from (n->'disbursed_at', n->'payment_status');
    bank_post_approval_finalization := tg_op = 'UPDATE'
      and j->>'approval_status' is distinct from '승인완료'
      and n->>'approval_status' = '승인완료'
      and j->>'payment_status' is distinct from '지급완료'
      and n->>'payment_status' = '지급완료'
      and n->>'disbursed_at' is not null
      and n->>'actual_expense_date' is not null
      and coalesce(n->>'expense_kind', n->'resolution_data'->>'expenseKind') = 'BANK_POST_APPROVAL'
      and n->>'budget_id' is not null
      and n->>'budget_month' is not null
      and (
        n->>'bank_transaction_id' is not null
        or exists (
          select 1
          from finance.expense_resolution_bank_transactions link
          where link.organization_id = org
            and link.resolution_id = n->>'id'
        )
      );
  elsif tg_table_name = 'budget_reservations' then
    select organization_id into org
    from approval.documents
    where id = (j->>'document_id')::uuid;
    kind := 'RESERVATION';
    budget_change := tg_op = 'DELETE' or
      (j->'amount', j->'released_amount', j->'budget_id', j->'document_id', j->'status')
      is distinct from
      (n->'amount', n->'released_amount', n->'budget_id', n->'document_id', n->'status');
    if n->>'status' = 'CONSUMED'
      and not exists (
        select 1 from finance.budget_effective_entries(org) e
        where e.source_kind = 'RESERVATION'
          and e.source_id = j->>'id'
          and e.state = 'RESERVED'
      )
      and exists (
        select 1
        from finance.budget_sources(org) s
        join finance.budget_source_assignments a
          on a.organization_id = org
         and a.source_kind = 'RESOLUTION'
         and a.source_id = s.source_id
        where s.source_kind = 'RESOLUTION'
          and s.link_id = j->>'document_id'
          and a.state = 'USED'
          and s.source_signature = a.source_signature
      ) then
      return new;
    end if;
  else
    org := (j->>'organization_id')::uuid;
    kind := 'QUICK';
    budget_change := tg_op = 'DELETE' or
      (j->'organization_id', j->'amount', j->'budget_item', j->'occurred_at', j->'record_status', j->'linked_resolution_id')
      is distinct from
      (n->'organization_id', n->'amount', n->'budget_item', n->'occurred_at', n->'record_status', n->'linked_resolution_id');
    if current_setting('finance.reimbursement_mutation', true) = 'on' then
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(org::text, 0));
  select * into assigned
  from finance.budget_source_assignments
  where organization_id = org
    and source_kind = kind
    and source_id = j->>'id';
  assignment_exists := found;

  if payment_change
    and exists (
      select 1 from finance.reimbursement_policies
      where organization_id = org
    )
    and not (
      assignment_exists
      and assigned.state = 'USED'
      and exists (
        select 1
        from finance.budget_sources(org) s
        where s.source_kind = kind
          and s.source_id = assigned.source_id
          and s.signature = assigned.source_signature
      )
    )
    and not (bank_post_approval_finalization and not assignment_exists) then
    raise exception '월 예산·마감의 예산 배정에서 실제 사용분을 확인한 뒤 지급해주세요.';
  end if;

  if budget_change
    and assignment_exists
    and assigned.state is distinct from 'CANCELLED'
    and exists (
      select 1
      from jsonb_array_elements(assigned.lines) l
      join finance.reimbursement_periods p
        on p.organization_id = org
       and p.month = (l->>'month')::date
       and p.status = 'CLOSED'
    ) then
    raise exception '마감된 월의 원본 금액·상태는 직접 변경할 수 없습니다. 월 예산·마감에서 사유를 남겨 배정을 수정하거나 취소해주세요.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
