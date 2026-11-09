-- Keep navigation counts cheap: the shell needs totals, not full ledger payloads.
create index if not exists quick_expense_records_org_status_idx
  on finance.quick_expense_records (organization_id, record_status);

create index if not exists personal_reimbursements_org_approved_idx
  on finance.personal_reimbursements (organization_id)
  where status = 'APPROVED';

create index if not exists advance_settlement_drafts_org_open_idx
  on finance.advance_settlement_drafts (organization_id)
  where status <> 'SETTLED';

create index if not exists trust_operating_periods_org_open_idx
  on finance.trust_operating_periods (organization_id)
  where status <> 'SETTLED';

create index if not exists workflow_transactions_org_unknown_idx
  on finance.workflow_transactions (organization_id)
  where route = 'UNKNOWN';

create index if not exists approval_documents_org_approved_updated_idx
  on approval.documents (organization_id, updated_at desc)
  where approval_status = 'APPROVED' and deleted_at is null;

create index if not exists bank_transactions_org_withdrawal_recent_idx
  on finance.bank_transactions (organization_id, transacted_at desc)
  where withdrawal_amount > 0 and deleted_at is null;

create or replace function finance.finance_navigation_badges(p_org uuid, p_actor uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  member finance.reimbursement_members;
  v_fiscal_year integer := extract(year from now() at time zone 'Asia/Seoul')::integer;
  missing_role_count integer;
  verified_contract_count integer;
  operating_contract_count integer;
  current_budget_count integer;
  card_link_pending integer;
  evidence_pending integer;
  resolution_required integer;
  personal_payment_pending integer;
  advance_settlement_open integer;
  operating_period_open integer;
  route_unclassified integer;
  budget_review_pending integer;
  collection_pending integer;
  refund_pending integer;
begin
  member := finance.workflow_actor(p_org, p_actor);
  if cardinality(member.permissions) = 0 then
    raise exception '운영 준비 점검은 회계·자금 담당자만 볼 수 있어.';
  end if;

  select count(*)::integer
  into missing_role_count
  from unnest(array['ADMIN', 'APPROVE', 'PAY', 'CLOSE']::text[]) role_name
  where not exists (
    select 1
    from finance.reimbursement_members staff
    where staff.organization_id = p_org
      and staff.active
      and role_name = any(staff.permissions)
  );

  select
    count(*)::integer,
    count(*) filter (
      where conditions->>'operating_allowed' = 'true'
        and conditions->>'operating_advance_allowed' = 'true'
    )::integer
  into verified_contract_count, operating_contract_count
  from finance.workflow_contract_versions
  where organization_id = p_org and status = 'VERIFIED';

  select count(*)::integer
  into current_budget_count
  from approval.budgets
  where organization_id = p_org and fiscal_year = v_fiscal_year;

  select
    count(*) filter (where record_status = 'SOURCE_PENDING')::integer,
    count(*) filter (where record_status = 'EVIDENCE_PENDING')::integer,
    count(*) filter (where record_status = 'NEEDS_RESOLUTION')::integer
  into card_link_pending, evidence_pending, resolution_required
  from finance.quick_expense_records
  where organization_id = p_org
    and record_status in ('SOURCE_PENDING', 'EVIDENCE_PENDING', 'NEEDS_RESOLUTION');

  select count(*)::integer into personal_payment_pending
  from finance.personal_reimbursements
  where organization_id = p_org and status = 'APPROVED';

  select count(*)::integer into advance_settlement_open
  from finance.advance_settlement_drafts
  where organization_id = p_org and status <> 'SETTLED';

  select count(*)::integer into operating_period_open
  from finance.trust_operating_periods
  where organization_id = p_org and status <> 'SETTLED';

  select count(*)::integer into route_unclassified
  from finance.workflow_transactions
  where organization_id = p_org and route = 'UNKNOWN';

  select count(*)::integer
  into budget_review_pending
  from jsonb_array_elements(finance.budget_review_queue(p_org)) row_data
  where coalesce((row_data->>'needs_review')::boolean, false);

  select count(*)::integer
  into collection_pending
  from finance.collection_assessments assessment
  where assessment.organization_id = p_org
    and assessment.status = 'ACTIVE'
    and assessment.assessed_amount > coalesce((
      select sum(allocation.amount)
      from finance.collection_receipt_allocations allocation
      where allocation.organization_id = p_org
        and allocation.assessment_id = assessment.id
        and not exists (
          select 1
          from finance.collection_receipt_reversals reversal
          where reversal.organization_id = p_org
            and reversal.allocation_id = allocation.id
        )
    ), 0);

  select count(*)::integer
  into refund_pending
  from finance.collection_refunds
  where organization_id = p_org and status in ('DRAFT', 'APPROVED');

  return jsonb_build_object(
    'fiscal_year', v_fiscal_year,
    'missing_role_count', missing_role_count,
    'verified_contract_count', verified_contract_count,
    'operating_contract_count', operating_contract_count,
    'current_budget_count', current_budget_count,
    'card_link_pending', card_link_pending,
    'evidence_pending', evidence_pending,
    'resolution_required', resolution_required,
    'personal_payment_pending', personal_payment_pending,
    'advance_settlement_open', advance_settlement_open,
    'operating_period_open', operating_period_open,
    'route_unclassified', route_unclassified,
    'budget_review_pending', budget_review_pending,
    'collection_pending', collection_pending,
    'refund_pending', refund_pending
  );
end
$$;

revoke all on function finance.finance_navigation_badges(uuid, uuid)
  from public, anon, authenticated;
grant execute on function finance.finance_navigation_badges(uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
