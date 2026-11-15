-- Bank-post-approval draft preparation is intentionally split into a read-only
-- manifest and an explicit, server-only atomic save command.  This migration
-- does not create any operational expense resolution rows.

create or replace view finance.bank_expense_draft_manifest as
with direct_links as (
  select r.organization_id, r.id as resolution_id, r.resolution_no,
    r.approval_document_id, r.bank_transaction_id
  from finance.expense_resolutions r
  where r.deleted_at is null and r.bank_transaction_id is not null
), grouped_links as (
  select r.organization_id, r.id as resolution_id, r.resolution_no,
    r.approval_document_id, l.bank_transaction_id
  from finance.expense_resolution_bank_transactions l
  join finance.expense_resolutions r
    on r.organization_id=l.organization_id and r.id=l.resolution_id
  where r.deleted_at is null
), all_links as (
  select * from direct_links
  union
  select * from grouped_links
), source_rows as (
  select b.*,
    coalesce(nullif(b.raw_payload->>'transaction_date','')::date,
      (b.transacted_at at time zone 'Asia/Seoul')::date) as source_transaction_date
  from finance.bank_transactions b
  where b.deleted_at is null and b.withdrawal_amount>0
)
select
  b.organization_id,
  b.id as bank_transaction_id,
  b.source_transaction_date,
  b.withdrawal_amount as amount,
  b.counterparty,
  b.description,
  b.classification_status,
  b.confirmed_account_subject_id as account_subject_id,
  subject.name as account_subject_name,
  budgets.candidate_count as budget_candidate_count,
  case when budgets.candidate_count=1 then budgets.candidate_ids[1] end as budget_id,
  case when budgets.candidate_count=1 then budgets.candidate_names[1] end as budget_name,
  details.candidate_count as expense_detail_candidate_count,
  case when budgets.candidate_count=1 and details.candidate_count=1 then details.candidate_ids[1] end as expense_detail_id,
  case when budgets.candidate_count=1 and details.candidate_count=1 then details.candidate_names[1] end as expense_detail_name,
  linked.resolution_id as existing_resolution_id,
  linked.resolution_no as existing_resolution_no,
  linked.approval_document_id,
  voucher.id as voucher_id,
  voucher.voucher_no,
  duplicate.resolution_id as duplicate_resolution_id,
  duplicate.resolution_no as duplicate_resolution_no,
  case
    when linked.resolution_id is not null then 'EXISTING_LINK'
    when voucher.id is not null then 'HOLD'
    when b.classification_status<>'CONFIRMED' or b.confirmed_account_subject_id is null then 'HOLD'
    when coalesce(budgets.candidate_count,0)<>1 then 'HOLD'
    when coalesce(details.candidate_count,0)<>1 then 'HOLD'
    when duplicate.resolution_id is not null then 'HOLD'
    when concat_ws(' ',b.counterparty,b.description,b.memo) ~ '(차용|상환|급여|세금|법률|임대료)' then 'HOLD'
    else 'REVIEW_REQUIRED'
  end as eligibility,
  case when linked.resolution_id is null
      and voucher.id is null
      and b.classification_status='CONFIRMED'
      and b.confirmed_account_subject_id is not null
      and budgets.candidate_count=1
      and details.candidate_count=1
      and duplicate.resolution_id is null
      and concat_ws(' ',b.counterparty,b.description,b.memo) !~ '(차용|상환|급여|세금|법률|임대료)'
    then md5(concat_ws('|',
      date_trunc('month',b.source_transaction_date)::date::text,
      b.confirmed_account_subject_id::text,
      budgets.candidate_ids[1]::text,
      details.candidate_ids[1]::text,
      lower(regexp_replace(trim(concat_ws(' ',b.counterparty,b.description)),'\s+',' ','g'))
    ))
  end as recommendation_group_key,
  case
    when linked.resolution_id is not null then '기존 지출결의 연결을 우선 사용'
    when voucher.id is not null then '기존 전표 연결 검토 필요'
    when b.classification_status<>'CONFIRMED' or b.confirmed_account_subject_id is null then '계정과목 확정 필요'
    when coalesce(budgets.candidate_count,0)=0 then '활성 예산 연결 없음'
    when budgets.candidate_count>1 then '활성 예산이 여러 개라 선택 필요'
    when coalesce(details.candidate_count,0)=0 then '활성 세부항목 연결 없음'
    when details.candidate_count>1 then '활성 세부항목이 여러 개라 선택 필요'
    when duplicate.resolution_id is not null then '동일 일자·금액의 기존 결의서 연결 여부 확인 필요'
    when concat_ws(' ',b.counterparty,b.description,b.memo) ~ '(차용|상환|급여|세금|법률|임대료)' then '고위험 거래 별도 검토 필요'
    else '같은 회계월·계정과목 UUID·예산 UUID·세부항목 UUID·정확한 목적 문구 후보; 승인근거·증빙·세무 기준 확인 필요'
  end as recommendation_basis,
  case
    when linked.resolution_id is not null then '이미 지출결의에 연결됨'
    when voucher.id is not null then '기존 전표가 있음'
    when b.classification_status<>'CONFIRMED' or b.confirmed_account_subject_id is null then '미분류'
    when coalesce(budgets.candidate_count,0)<>1 then '예산 확정 필요'
    when coalesce(details.candidate_count,0)<>1 then '세부항목 확정 필요'
    when duplicate.resolution_id is not null then '중복 의심'
    when concat_ws(' ',b.counterparty,b.description,b.memo) ~ '(차용|상환|급여|세금|법률|임대료)' then '고위험 거래'
  end as hold_reason
from source_rows b
left join finance.account_subjects subject
  on subject.organization_id=b.organization_id
 and subject.id=b.confirmed_account_subject_id and subject.is_active
left join lateral (
  select count(*)::integer as candidate_count,
    array_agg(link.budget_id order by link.budget_id) as candidate_ids,
    array_agg(budget.budget_item order by link.budget_id) as candidate_names
  from finance.account_subject_budget_links link
  join approval.budgets budget
    on budget.organization_id=link.organization_id and budget.id=link.budget_id
   and budget.fiscal_year=extract(year from b.source_transaction_date)::integer
  where link.organization_id=b.organization_id
    and link.account_subject_id=b.confirmed_account_subject_id
    and link.status='ACTIVE'
) budgets on true
left join lateral (
  select count(*)::integer as candidate_count,
    array_agg(detail.id order by detail.id) as candidate_ids,
    array_agg(detail.name order by detail.id) as candidate_names
  from finance.expense_detail_items detail
  where budgets.candidate_count=1
    and detail.budget_id=budgets.candidate_ids[1]
    and detail.is_active
    and detail.status='ACTIVE'
) details on true
left join lateral (
  select link.resolution_id, link.resolution_no, link.approval_document_id
  from all_links link
  where link.organization_id=b.organization_id and link.bank_transaction_id=b.id
  order by link.resolution_id
  limit 1
) linked on true
left join lateral (
  select v.id, v.voucher_no
  from finance.vouchers v
  where v.organization_id=b.organization_id and v.bank_transaction_id=b.id
    and v.deleted_at is null and v.approval_status<>'취소'
  order by v.created_at desc, v.id desc
  limit 1
) voucher on true
left join lateral (
  select r.id as resolution_id, r.resolution_no
  from finance.expense_resolutions r
  where r.organization_id=b.organization_id and r.deleted_at is null
    and r.actual_expense_date=b.source_transaction_date
    and r.total_payment_amount=b.withdrawal_amount
    and r.id is distinct from linked.resolution_id
  order by r.created_at, r.id
  limit 1
) duplicate on true;

revoke all on finance.bank_expense_draft_manifest from public, anon, authenticated;
grant select on finance.bank_expense_draft_manifest to service_role;

-- Keep source-date validation identical to the manifest and all downstream
-- reconciliation. raw_payload.transaction_date is authoritative when present.
create or replace function finance.sync_expense_resolution_bank_transactions()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  links jsonb;
  link jsonb;
  old_ids uuid[];
  new_ids uuid[]:='{}';
  ref_id uuid;
  link_amount numeric;
  link_date date;
  transaction finance.bank_transactions;
  source_date date;
  link_status text;
begin
  if not (new.resolution_data ? 'bankTransactions')
     and not (old.resolution_data ? 'bankTransactions') then
    return new;
  end if;
  links:=case when new.deleted_at is null
    then coalesce(new.resolution_data->'bankTransactions','[]'::jsonb)
    else '[]'::jsonb end;
  if jsonb_typeof(links) is distinct from 'array' then
    raise exception '연결 통장거래 형식을 확인해주세요.';
  end if;
  if exists(select 1 from jsonb_array_elements(links) entry
    group by entry->>'id' having coalesce(entry->>'id','')='' or count(*)>1) then
    raise exception '연결 통장거래가 중복되었습니다.';
  end if;
  select coalesce(array_agg(bank_transaction_id),'{}') into old_ids
  from finance.expense_resolution_bank_transactions where resolution_id=new.id;
  for link in select value from jsonb_array_elements(links)
  loop
    ref_id:=nullif(link->>'id','')::uuid;
    link_amount:=nullif(link->>'amount','')::numeric;
    link_date:=nullif(link->>'transactionDate','')::date;
    if ref_id is null or link_amount is null or link_date is null then
      raise exception '연결 통장거래의 ID·일자·금액이 필요합니다.';
    end if;
    select * into transaction from finance.bank_transactions
    where id=ref_id and organization_id=new.organization_id and deleted_at is null for update;
    if not found then raise exception '조직의 통장거래가 아닙니다.'; end if;
    source_date:=coalesce(nullif(transaction.raw_payload->>'transaction_date','')::date,
      (transaction.transacted_at at time zone 'Asia/Seoul')::date);
    if transaction.withdrawal_amount is distinct from link_amount or source_date is distinct from link_date then
      raise exception '통장거래 일자 또는 금액이 원본과 다릅니다.';
    end if;
    if exists(select 1 from finance.expense_resolutions other
      where other.organization_id=new.organization_id and other.id<>new.id
        and other.deleted_at is null and other.bank_transaction_id=ref_id)
      or exists(select 1 from finance.expense_resolution_bank_transactions other
        where other.bank_transaction_id=ref_id and other.resolution_id<>new.id) then
      raise exception '통장거래가 다른 지출결의에 연결되어 있습니다.';
    end if;
    new_ids:=array_append(new_ids,ref_id);
    insert into finance.expense_resolution_bank_transactions(
      organization_id,resolution_id,bank_transaction_id,item_id,transaction_date,amount,description,updated_at
    ) values (
      new.organization_id,new.id,ref_id,nullif(link->>'itemId',''),link_date,link_amount,
      coalesce(link->>'description',''),now()
    ) on conflict(resolution_id,bank_transaction_id) do update set
      item_id=excluded.item_id, transaction_date=excluded.transaction_date,
      amount=excluded.amount, description=excluded.description, updated_at=now();
  end loop;
  if coalesce((select sum((entry->>'amount')::numeric) from jsonb_array_elements(links) entry),0)
    is distinct from (case when jsonb_array_length(links)>0 then new.total_payment_amount else 0 end) then
    raise exception '연결 통장거래 합계가 지출결의 총액과 다릅니다.';
  end if;
  delete from finance.expense_resolution_bank_transactions
  where resolution_id=new.id and not(bank_transaction_id=any(new_ids));
  for ref_id in select unnest(old_ids) except select unnest(new_ids)
  loop
    if not exists(select 1 from finance.expense_resolutions r
      where r.organization_id=new.organization_id and r.deleted_at is null and r.bank_transaction_id=ref_id)
      and not exists(select 1 from finance.expense_resolution_bank_transactions l
      where l.organization_id=new.organization_id and l.bank_transaction_id=ref_id) then
      update finance.bank_transactions set resolution_status='UNRESOLVED'
      where id=ref_id and organization_id=new.organization_id;
    end if;
  end loop;
  link_status:=case when new.approval_status='승인완료' then 'APPROVED'
    when new.evidence_status in('NONE','DEFICIENT') then 'EVIDENCE_MISSING' else 'DRAFTING' end;
  update finance.bank_transactions set resolution_status=link_status
  where organization_id=new.organization_id and id=any(new_ids);
  return new;
end;
$$;

revoke all on function finance.sync_expense_resolution_bank_transactions() from public,anon,authenticated;
grant execute on function finance.sync_expense_resolution_bank_transactions() to service_role;

-- A PostgreSQL function call is one transaction.  Any failed item therefore
-- rolls back every draft in the requested accounting month.
create or replace function finance.legacy_expense_save_batch(
  p_org uuid,
  p_actor uuid,
  p_items jsonb,
  p_key text,
  p_month date
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  item jsonb;
  payload jsonb;
  rowdata jsonb;
  document jsonb;
  review jsonb;
  link jsonb;
  source finance.bank_transactions;
  source_date date;
  resolution_id text;
  result jsonb;
  results jsonb:='[]'::jsonb;
  transaction_ids uuid[]:='{}';
  transaction_id uuid;
  transaction_total numeric;
  transaction_count integer;
  duplicate_id text;
begin
  perform finance.workflow_actor(p_org,p_actor);
  if p_month is null or p_month<>date_trunc('month',p_month)::date then
    raise exception '월별 저장 기준일은 월의 첫날이어야 합니다.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception '월별 초안 항목 형식을 확인해주세요.';
  end if;
  if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>200 then
    raise exception '월별 초안은 1건 이상 200건 이하만 저장할 수 있습니다.';
  end if;
  if coalesce(trim(p_key),'')='' or length(p_key)>120 then
    raise exception '월별 초안 처리키를 확인해주세요.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) entry
    group by entry->>'id' having coalesce(entry->>'id','')='' or count(*)>1) then
    raise exception '중복되거나 비어 있는 초안 ID가 있습니다.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));

  -- Validate the complete set before the first write.
  for item in select value from jsonb_array_elements(p_items)
  loop
    resolution_id:=item->>'id';
    payload:=item->'payload';
    rowdata:=payload->'row';
    document:=rowdata->'resolution_data';
    review:=item->'review_contract';
    if not(item ? 'expected') or item->'expected'<>'null'::jsonb
      or jsonb_typeof(payload) is distinct from 'object'
      or jsonb_typeof(rowdata) is distinct from 'object'
      or jsonb_typeof(document) is distinct from 'object'
      or jsonb_typeof(review) is distinct from 'object' then
      raise exception '신규 월별 초안 원본 형식을 확인해주세요: %',resolution_id;
    end if;
    if exists(select 1 from finance.expense_resolutions r where r.id=resolution_id) then
      raise exception '이미 존재하는 지출결의 ID입니다: %',resolution_id;
    end if;
    if rowdata->>'id' is distinct from resolution_id or document->>'id' is distinct from resolution_id
      or rowdata->>'approval_status' is distinct from '작성중'
      or document->>'approvalStatus' is distinct from '작성중'
      or rowdata->>'payment_status' is distinct from '지급전'
      or document->>'paymentStatus' is distinct from '지급전'
      or rowdata->>'expense_kind' is distinct from 'BANK_POST_APPROVAL'
      or document->>'expenseKind' is distinct from 'BANK_POST_APPROVAL'
      or coalesce((rowdata->>'is_post_approval')::boolean,false) is not true
      or coalesce((document->>'isPostApproval')::boolean,false) is not true then
      raise exception '월별 초안은 작성중·지급전·통장 선출금 사후결의만 저장할 수 있습니다: %',resolution_id;
    end if;
    if nullif(rowdata->>'approved_at','') is not null
      or nullif(rowdata->>'disbursed_at','') is not null
      or nullif(rowdata->>'voucher_no','') is not null
      or nullif(document->>'approvedAt','') is not null
      or nullif(document->>'disbursedAt','') is not null
      or nullif(document->>'voucherNo','') is not null
      or coalesce((document->>'voucherGenerated')::boolean,false) then
      raise exception '월별 초안에 승인·지급·전표 결과를 포함할 수 없습니다: %',resolution_id;
    end if;
    if nullif(rowdata->>'bank_transaction_id','') is not null
      or nullif(document->>'bankTransactionId','') is not null then
      raise exception '월별 초안은 개별 원본 보존을 위해 다중 통장 연결만 사용해야 합니다: %',resolution_id;
    end if;
    if nullif(rowdata->>'budget_id','') is distinct from nullif(review->>'budgetId','')
      or nullif(rowdata->>'expense_detail_id','') is distinct from nullif(review->>'expenseDetailId','')
      or nullif(document->>'budgetId','') is distinct from nullif(review->>'budgetId','')
      or nullif(document->>'expenseDetailId','') is distinct from nullif(review->>'expenseDetailId','') then
      raise exception '검토한 예산·세부항목 UUID와 초안이 일치하지 않습니다: %',resolution_id;
    end if;
    if nullif(review->>'accountSubjectId','') is null
      or nullif(review->>'budgetId','') is null
      or nullif(review->>'expenseDetailId','') is null
      or nullif(trim(review->>'purposeKey'),'') is null
      or nullif(trim(review->>'approvalBasisKey'),'') is null
      or nullif(trim(review->>'evidencePolicyKey'),'') is null
      or nullif(trim(review->>'taxPolicyKey'),'') is null then
      raise exception '계정과목·예산·세부항목·목적·승인근거·증빙·세무 검토값이 모두 필요합니다: %',resolution_id;
    end if;
    if jsonb_typeof(document->'bankTransactions') is distinct from 'array'
      or jsonb_array_length(document->'bankTransactions')<1 then
      raise exception '연결할 통장 출금거래가 필요합니다: %',resolution_id;
    end if;
    if exists(select 1 from jsonb_array_elements(document->'bankTransactions') entry
      group by entry->>'id' having coalesce(entry->>'id','')='' or count(*)>1) then
      raise exception '초안 안의 통장거래가 중복되었습니다: %',resolution_id;
    end if;
    transaction_total:=0;
    transaction_count:=0;
    duplicate_id:=null;
    for link in select value from jsonb_array_elements(document->'bankTransactions')
    loop
      transaction_id:=nullif(link->>'id','')::uuid;
      if transaction_id=any(transaction_ids) then
        raise exception '월별 초안 사이에 통장거래가 중복되었습니다: %',transaction_id;
      end if;
      select * into source from finance.bank_transactions b
      where b.organization_id=p_org and b.id=transaction_id and b.deleted_at is null for update;
      if not found or source.withdrawal_amount<=0 then
        raise exception '조직의 통장 출금거래가 아닙니다: %',transaction_id;
      end if;
      source_date:=coalesce(nullif(source.raw_payload->>'transaction_date','')::date,
        (source.transacted_at at time zone 'Asia/Seoul')::date);
      if date_trunc('month',source_date)::date<>p_month
        or nullif(link->>'transactionDate','')::date is distinct from source_date
        or nullif(link->>'amount','')::numeric is distinct from source.withdrawal_amount then
        raise exception '월·원천 거래일·금액이 통장 원본과 다릅니다: %',transaction_id;
      end if;
      if source.classification_status<>'CONFIRMED'
        or source.confirmed_account_subject_id::text is distinct from review->>'accountSubjectId'
        or not exists(select 1 from finance.account_subjects s
          where s.organization_id=p_org and s.id=source.confirmed_account_subject_id and s.is_active)
        or not exists(select 1 from finance.account_subject_budget_links budget_link
          join approval.budgets budget on budget.id=budget_link.budget_id
          where budget_link.organization_id=p_org and budget_link.account_subject_id=source.confirmed_account_subject_id
            and budget_link.budget_id=(review->>'budgetId')::uuid and budget_link.status='ACTIVE'
            and budget.organization_id=p_org and budget.fiscal_year=extract(year from source_date)::integer)
        or not exists(select 1 from finance.expense_detail_items detail
          where detail.id=(review->>'expenseDetailId')::uuid and detail.budget_id=(review->>'budgetId')::uuid
            and detail.is_active and detail.status='ACTIVE') then
        raise exception '확정 계정과목·활성 예산·세부항목 계약이 원본과 다릅니다: %',transaction_id;
      end if;
      if exists(select 1 from finance.expense_resolutions r
          where r.organization_id=p_org and r.deleted_at is null and r.bank_transaction_id=transaction_id)
        or exists(select 1 from finance.expense_resolution_bank_transactions l
          where l.organization_id=p_org and l.bank_transaction_id=transaction_id)
        or exists(select 1 from finance.vouchers v
          where v.organization_id=p_org and v.bank_transaction_id=transaction_id
            and v.deleted_at is null and v.approval_status<>'취소') then
        raise exception '이미 결의서 또는 전표에 연결된 통장거래입니다: %',transaction_id;
      end if;
      select r.id into duplicate_id from finance.expense_resolutions r
      where r.organization_id=p_org and r.deleted_at is null
        and r.actual_expense_date=source_date and r.total_payment_amount=source.withdrawal_amount
      order by r.created_at,r.id limit 1;
      if duplicate_id is not null and not(
        coalesce((review->>'duplicateResolutionReviewed')::boolean,false)
        and review->>'duplicateResolutionId'=duplicate_id
      ) then
        raise exception '동일 일자·금액의 기존 결의서 연결 여부를 먼저 확인해주세요: %',duplicate_id;
      end if;
      transaction_ids:=array_append(transaction_ids,transaction_id);
      transaction_total:=transaction_total+source.withdrawal_amount;
      transaction_count:=transaction_count+1;
    end loop;
    if transaction_total is distinct from (rowdata->>'total_payment_amount')::numeric
      or transaction_total is distinct from (document->>'totalPaymentAmount')::numeric then
      raise exception '통장거래 합계와 초안 총액이 다릅니다: %',resolution_id;
    end if;
    if nullif(rowdata->>'budget_month','')::date is distinct from p_month
      or nullif(document->>'budgetMonth','')::date is distinct from p_month then
      raise exception '예산 귀속월이 월별 저장 기준과 다릅니다: %',resolution_id;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(p_items)
  loop
    resolution_id:=item->>'id';
    result:=finance.legacy_expense_command(
      p_org,p_actor,'SAVE',resolution_id,null,item->'payload',p_key||':'||resolution_id
    );
    results:=results||jsonb_build_array(result);
  end loop;
  return jsonb_build_object('batchKey',p_key,'month',p_month,'count',jsonb_array_length(p_items),'results',results);
end;
$$;

revoke all on function finance.legacy_expense_save_batch(uuid,uuid,jsonb,text,date) from public,anon,authenticated;
grant execute on function finance.legacy_expense_save_batch(uuid,uuid,jsonb,text,date) to service_role;

-- The status view must treat both legacy direct links and normalized grouped
-- links as completed resolution connections.
create or replace view finance.bank_transaction_processing_status as
with resolution_links as (
  select r.organization_id,r.id as resolution_id,r.resolution_no,
    r.approval_status,r.payment_status,r.bank_transaction_id
  from finance.expense_resolutions r
  where r.deleted_at is null and r.bank_transaction_id is not null
  union
  select r.organization_id,r.id,r.resolution_no,r.approval_status,r.payment_status,l.bank_transaction_id
  from finance.expense_resolution_bank_transactions l
  join finance.expense_resolutions r
    on r.organization_id=l.organization_id and r.id=l.resolution_id
  where r.deleted_at is null
  union
  select r.organization_id,r.id,r.resolution_no,r.approval_status,r.payment_status,
    (item.value->>'bankTransactionId')::uuid
  from finance.expense_resolutions r
  cross join lateral jsonb_array_elements(coalesce(r.resolution_data->'expenseItems','[]'::jsonb)) item(value)
  where r.deleted_at is null
    and coalesce(item.value->>'bankTransactionId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
), ranked_resolution as (
  select links.*,row_number() over(
    partition by links.organization_id,links.bank_transaction_id
    order by case links.approval_status when '승인완료' then 1 when '승인대기' then 2 else 3 end,
      links.resolution_id desc) as rank_no
  from resolution_links links
), active_voucher as (
  select v.*,row_number() over(
    partition by v.organization_id,v.bank_transaction_id
    order by case v.approval_status when '승인완료' then 1 else 2 end,v.created_at desc,v.id desc) as rank_no,
    exists(select 1 from finance.voucher_lines line
      where line.voucher_id=v.id and line.account_subject_id is null) as has_missing_account
  from finance.vouchers v
  where v.deleted_at is null and v.bank_transaction_id is not null and v.approval_status<>'취소'
)
select bank.organization_id,bank.id as bank_transaction_id,
  case when transfer.id is not null then '전표완료'
    when refund.id is not null then '전표완료'
    when voucher.approval_status='승인완료' and not voucher.has_missing_account then '전표완료'
    when voucher.id is not null then '전표확인'
    when resolution.approval_status='승인완료' then '승인완료'
    when resolution.approval_status='승인대기' then '승인대기'
    when resolution.resolution_id is not null then '결의서 작성중'
    else '결의서 작성 대기' end as workflow_stage,
  case when transfer.id is not null then '계좌대체'
    when refund.id is not null then '취소·환불 연결'
    when voucher.approval_status='승인완료' and not voucher.has_missing_account then '전표 생성 완료'
    else '확인 필요' end as accounting_result,
  resolution.resolution_id,resolution.resolution_no,
  voucher.id as voucher_id,voucher.voucher_no,
  coalesce(voucher.has_missing_account,true) as account_review_required
from finance.bank_transactions bank
left join ranked_resolution resolution
  on resolution.organization_id=bank.organization_id and resolution.bank_transaction_id=bank.id and resolution.rank_no=1
left join active_voucher voucher
  on voucher.organization_id=bank.organization_id and voucher.bank_transaction_id=bank.id and voucher.rank_no=1
left join finance.workflow_transfers transfer
  on transfer.organization_id=bank.organization_id and (transfer.withdrawal_id=bank.id or transfer.deposit_id=bank.id)
left join finance.collection_refunds refund
  on refund.organization_id=bank.organization_id and refund.bank_transaction_id=bank.id and refund.status='PAID'
where bank.deleted_at is null;

revoke all on finance.bank_transaction_processing_status from public,anon,authenticated;
grant select on finance.bank_transaction_processing_status to service_role;
