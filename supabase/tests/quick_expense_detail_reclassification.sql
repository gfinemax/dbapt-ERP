begin;

do $$
declare
  actor finance.reimbursement_members%rowtype;
  source_detail finance.expense_detail_items%rowtype;
  target_detail finance.expense_detail_items%rowtype;
  target_budget approval.budgets%rowtype;
  record_id uuid := gen_random_uuid();
  operation_key text := 'detail-reclassification-' || gen_random_uuid()::text;
  expected_updated_at text;
  result jsonb;
begin
  select * into actor
  from finance.reimbursement_members
  where active and permissions && array['ADMIN','APPROVE','PAY']
  order by user_id
  limit 1;
  if not found then raise exception 'TEST: authorized finance actor fixture missing'; end if;

  select d.* into source_detail
  from finance.expense_detail_items d
  join approval.budgets b on b.id=d.budget_id
  where b.organization_id=actor.organization_id and b.fiscal_year=2026 and d.code='PUBLIC-COMM' and d.is_active;
  select d.* into target_detail
  from finance.expense_detail_items d
  join approval.budgets b on b.id=d.budget_id
  where b.organization_id=actor.organization_id and b.fiscal_year=2026 and d.code='GENERAL-SUPPLIES' and d.is_active;
  select * into target_budget from approval.budgets where id=target_detail.budget_id;
  if source_detail.id is null or target_detail.id is null then raise exception 'TEST: operating detail fixtures missing'; end if;

  insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,expense_detail_id,evidence_status,evidence_kind,evidence_review_status,approval_skip_reason,direct_expense_decision,direct_expense_reasons,record_status,recorded_by_label)
  values(record_id,actor.organization_id,'MANUAL','CASH','2026-09-08 12:00:00+09',1,'테스트 거래처','인터넷 요금',(select budget_item from approval.budgets where id=source_detail.budget_id),source_detail.id,'GENERAL','NONE','REVIEW_REQUIRED','테스트','ALLOWED','{}','EVIDENCE_PENDING','테스트');
  select updated_at::text into expected_updated_at from finance.quick_expense_records where id=record_id;

  result:=finance.quick_expense_command(actor.organization_id,actor.user_id,'UPDATE_DETAILS',record_id,
    jsonb_build_object('usage_description','클리어파일 구입','counterparty','문구점','budget_item',target_budget.budget_item,'expense_detail_id',target_detail.id,'expected_updated_at',expected_updated_at),operation_key);
  if result->>'expense_detail_id'<>target_detail.id::text or result->>'budget_item'<>target_budget.budget_item then
    raise exception 'TEST: recommended detail and linked budget were not saved together';
  end if;
  if (select count(*) from finance.quick_expense_audit where quick_expense_id=record_id and action='UPDATE_DETAILS')<>1 then
    raise exception 'TEST: detail reclassification audit missing';
  end if;
  if finance.quick_expense_command(actor.organization_id,actor.user_id,'UPDATE_DETAILS',record_id,
    jsonb_build_object('usage_description','클리어파일 구입','counterparty','문구점','budget_item',target_budget.budget_item,'expense_detail_id',target_detail.id,'expected_updated_at',expected_updated_at),operation_key)<>result then
    raise exception 'TEST: idempotent detail reclassification changed result';
  end if;
end $$;

rollback;
