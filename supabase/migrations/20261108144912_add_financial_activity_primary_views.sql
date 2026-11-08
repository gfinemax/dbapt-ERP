-- 통합 거래내역의 검토 필요 탭은 미확인·보류와 원본 대조 필요 거래를 함께 보여준다.
-- 기존 함수의 현금/비현금 분리 합계는 유지하고 검토 탭 조건만 확장한다.
drop function if exists finance.filtered_financial_activity_summary(uuid,uuid,text,text,date,date,text,text[]);

create or replace function finance.filtered_financial_activity_summary(
  p_org uuid,
  p_bank_account_id uuid default null,
  p_origin_type text default null,
  p_classification_status text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_query text default null,
  p_source_record_ids text[] default null,
  p_review_required boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  with filtered as (
    select f.*
    from finance.financial_activity_feed f
    where f.organization_id=p_org
      and (p_bank_account_id is null or f.bank_account_id=p_bank_account_id)
      and (p_origin_type is null or f.origin_type=p_origin_type)
      and (p_classification_status is null or f.classification_status=p_classification_status)
      and (p_date_from is null or f.transacted_at >= (p_date_from::timestamp at time zone 'Asia/Seoul'))
      and (p_date_to is null or f.transacted_at < ((p_date_to + 1)::timestamp at time zone 'Asia/Seoul'))
      and (
        coalesce(p_review_required,false)
        or p_source_record_ids is null
        or (f.origin_type='BANK_TRANSACTION' and f.source_record_id=any(p_source_record_ids))
      )
      and (
        not coalesce(p_review_required,false)
        or f.classification_status in ('UNREVIEWED','DEFERRED')
        or (
          f.origin_type='BANK_TRANSACTION'
          and p_source_record_ids is not null
          and f.source_record_id=any(p_source_record_ids)
        )
      )
      and (
        nullif(trim(p_query),'') is null
        or coalesce(f.description,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.counterparty,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.memo,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.uploaded_major_category,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.uploaded_account_title,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.branch_name,'') ilike '%'||trim(p_query)||'%'
        or coalesce(f.classification_note,'') ilike '%'||trim(p_query)||'%'
        or f.source_record_id ilike '%'||trim(p_query)||'%'
      )
  )
  select jsonb_build_object(
    'result_count',count(*),
    'bank_deposit_total',coalesce(sum(deposit_amount) filter (where origin_type='BANK_TRANSACTION'),0),
    'bank_withdrawal_total',coalesce(sum(withdrawal_amount) filter (where origin_type='BANK_TRANSACTION'),0),
    'external_recognition_count',count(*) filter (
      where origin_type='EXTERNAL_RECOGNITION' and recognition_status='ACTIVE'
    ),
    'external_recognition_total',coalesce(sum(activity_amount) filter (
      where origin_type='EXTERNAL_RECOGNITION' and recognition_status='ACTIVE'
    ),0)
  )
  from filtered
$$;

revoke all on function finance.filtered_financial_activity_summary(uuid,uuid,text,text,date,date,text,text[],boolean)
  from public,anon,authenticated;
grant execute on function finance.filtered_financial_activity_summary(uuid,uuid,text,text,date,date,text,text[],boolean)
  to service_role;

notify pgrst, 'reload schema';
