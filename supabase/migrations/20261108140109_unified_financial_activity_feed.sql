-- 실제 통장거래와 외부납입 인정을 한 화면에서 조회하되 원본과 현금 영향은 분리한다.
-- 외부납입 인정은 finance.bank_transactions에 가상 거래로 만들지 않는다.
create or replace view finance.financial_activity_feed
with (security_invoker=true) as
select
  b.id::text as activity_id,
  'BANK_TRANSACTION'::text as origin_type,
  b.id::text as source_record_id,
  b.organization_id,
  b.bank_account_id,
  b.transacted_at,
  b.transaction_kind,
  b.description,
  coalesce(b.memo,'') as memo,
  b.deposit_amount,
  b.withdrawal_amount,
  greatest(b.deposit_amount,b.withdrawal_amount)::numeric(16,0) as activity_amount,
  b.balance_amount,
  coalesce(b.counterparty,'') as counterparty,
  coalesce(b.branch_name,'') as branch_name,
  coalesce(b.uploaded_major_category,'') as uploaded_major_category,
  coalesce(b.uploaded_account_title,'') as uploaded_account_title,
  b.recommended_account_subject_id,
  b.recommended_account_subject_name,
  b.confirmed_account_subject_id,
  b.classification_status,
  coalesce(b.classification_note,'') as classification_note,
  b.recommendation_reason,
  'BANK_CASH'::text as cash_impact,
  null::text as source_kind,
  null::text as accounting_treatment,
  null::text as recognition_status,
  0::numeric(16,0) as actual_fund_amount,
  0::numeric(16,0) as loss_amount,
  null::text as source_root_record_id,
  null::text as linkage_status,
  '{}'::jsonb as source_payload
from finance.bank_transactions b
where b.deleted_at is null
union all
select
  ('external:'||x.id::text) as activity_id,
  'EXTERNAL_RECOGNITION'::text as origin_type,
  x.id::text as source_record_id,
  x.organization_id,
  null::uuid as bank_account_id,
  (x.recognized_on::timestamp at time zone 'Asia/Seoul') as transacted_at,
  '외부납입'::text as transaction_kind,
  case x.source_kind
    when 'dongil_fixed_certificate' then '동일건설 정액 필증 3천만원'
    when 'application_certificate' then '가입신청필증 외부납입 인정'
    when 'dongil_other' then '동일건설 기타 외부납입 인정'
    when 'trust_account' then '신탁사 보관 수납'
    else '기타 외부납입 인정'
  end as description,
  x.reason as memo,
  0::numeric(16,0) as deposit_amount,
  0::numeric(16,0) as withdrawal_amount,
  x.recognized_amount::numeric(16,0) as activity_amount,
  null::numeric(14,0) as balance_amount,
  coalesce(x.source_payload->>'member_name_snapshot','') as counterparty,
  ''::text as branch_name,
  '외부납입 인정'::text as uploaded_major_category,
  case x.accounting_treatment
    when 'confirmed_loss' then '확정결손'
    when 'trust_receipt' then '신탁사 보관 수납'
    else '회계 처리 검토 필요'
  end as uploaded_account_title,
  null::uuid as recommended_account_subject_id,
  null::text as recommended_account_subject_name,
  null::uuid as confirmed_account_subject_id,
  case
    when x.status='CANCELLED' then 'EXCLUDED'
    when x.accounting_treatment='pending_review' then 'DEFERRED'
    else 'CONFIRMED'
  end as classification_status,
  coalesce(x.linkage_issue_detail,'') as classification_note,
  null::text as recommendation_reason,
  case x.accounting_treatment
    when 'trust_receipt' then 'TRUST_HELD'
    else 'NON_CASH_RECOGNITION'
  end as cash_impact,
  x.source_kind,
  x.accounting_treatment,
  x.status as recognition_status,
  x.actual_fund_amount,
  x.loss_amount,
  x.source_root_recognition_id as source_root_record_id,
  x.linkage_status,
  x.source_payload
from finance.collection_external_recognitions x;

revoke all on finance.financial_activity_feed from public,anon,authenticated;
grant select on finance.financial_activity_feed to service_role;

create or replace function finance.financial_activity_summary(p_org uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'bank_transaction_count',(select count(*) from finance.bank_transactions b
      where b.organization_id=p_org and b.deleted_at is null),
    'bank_deposit_total',(select coalesce(sum(b.deposit_amount),0) from finance.bank_transactions b
      where b.organization_id=p_org and b.deleted_at is null),
    'bank_withdrawal_total',(select coalesce(sum(b.withdrawal_amount),0) from finance.bank_transactions b
      where b.organization_id=p_org and b.deleted_at is null),
    'external_recognition_count',(select count(*) from finance.collection_external_recognitions x
      where x.organization_id=p_org and x.status='ACTIVE'),
    'external_recognition_total',(select coalesce(sum(x.recognized_amount),0) from finance.collection_external_recognitions x
      where x.organization_id=p_org and x.status='ACTIVE'),
    'confirmed_loss_total',(select coalesce(sum(x.loss_amount),0) from finance.collection_external_recognitions x
      where x.organization_id=p_org and x.status='ACTIVE'),
    'trust_held_total',(select coalesce(sum(x.actual_fund_amount),0) from finance.collection_external_recognitions x
      where x.organization_id=p_org and x.status='ACTIVE')
  )
$$;

revoke all on function finance.financial_activity_summary(uuid) from public,anon,authenticated;
grant execute on function finance.financial_activity_summary(uuid) to service_role;

notify pgrst, 'reload schema';
