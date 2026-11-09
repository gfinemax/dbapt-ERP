-- 정액필증 분담금/가수금 적용 결과를 통합 거래내역의 계정과목으로 표시한다.
-- 외부납입·결손 원본은 그대로 보존하고, 적용 완료된 별도 분류 원장만 읽어 투영한다.
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
  '{}'::jsonb as source_payload,
  coalesce(
    nullif(trim(b.memo),''),
    nullif(trim(b.uploaded_account_title),''),
    nullif(trim(b.description),''),
    ''
  ) as transaction_detail
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
  coalesce(subject.name,case x.accounting_treatment
    when 'confirmed_loss' then '확정결손'
    when 'trust_receipt' then '신탁사 보관 수납'
    else '회계 처리 검토 필요'
  end) as uploaded_account_title,
  null::uuid as recommended_account_subject_id,
  null::text as recommended_account_subject_name,
  assignment.account_subject_id as confirmed_account_subject_id,
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
  x.source_payload,
  coalesce(x.reason,'') as transaction_detail
from finance.collection_external_recognitions x
left join lateral (
  select a.account_subject_id
  from finance.fixed_certificate_account_assignments a
  join finance.fixed_certificate_assignment_batches batch
    on batch.organization_id=a.organization_id
   and batch.id=a.batch_id
   and batch.status='APPLIED'
  where a.organization_id=x.organization_id
    and a.source_root_recognition_id=coalesce(x.source_root_recognition_id,x.source_recognition_id)
  order by batch.applied_at desc,a.assigned_at desc,a.id desc
  limit 1
) assignment on x.source_kind='dongil_fixed_certificate'
left join finance.account_subjects subject
  on subject.organization_id=x.organization_id
 and subject.id=assignment.account_subject_id;

revoke all on finance.financial_activity_feed from public,anon,authenticated;
grant select on finance.financial_activity_feed to service_role;

notify pgrst, 'reload schema';
