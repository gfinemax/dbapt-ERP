-- Create the personal reimbursement intake period atomically with the first
-- submission. This period is an intake deadline snapshot, not a general-ledger
-- period unlock, so applicants may trigger creation from an approved policy.
create or replace function finance.ensure_reimbursement_period(
  p_org uuid,
  p_actor uuid,
  p_month date
) returns finance.reimbursement_periods
language plpgsql
security invoker
set search_path=''
as $$
declare
  member finance.reimbursement_members%rowtype;
  policy finance.reimbursement_policies%rowtype;
  period finance.reimbursement_periods%rowtype;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));

  select * into member
  from finance.reimbursement_members
  where organization_id=p_org and user_id=p_actor and active;
  if not found then raise exception '정산 업무 접근 권한이 없습니다.'; end if;

  if extract(day from p_month)<>1
     or extract(year from p_month)<>extract(year from today)
     or p_month>date_trunc('month',today)::date
  then
    raise exception '올해의 현재 월 또는 이전 월만 자동 개설할 수 있습니다.';
  end if;

  select * into period
  from finance.reimbursement_periods
  where organization_id=p_org and month=p_month
  for update;
  if found then return period; end if;

  select * into policy
  from finance.reimbursement_policies
  where organization_id=p_org;
  if not found then
    raise exception '접수월 자동 개설에 필요한 제출·보완 마감일과 장기 지연 기준을 먼저 설정해주세요.';
  end if;

  insert into finance.reimbursement_periods(
    organization_id,month,submission_deadline,completion_deadline,long_delay_days
  ) values (
    p_org,
    p_month,
    (p_month+interval '1 month')::date+policy.submission_day-1,
    (p_month+interval '1 month')::date+policy.completion_day-1,
    policy.long_delay_days
  )
  on conflict (organization_id,month) do nothing
  returning * into period;

  if found then
    insert into finance.reimbursement_audit(
      organization_id,request_id,actor_id,action,reason,before_data,after_data
    ) values (
      p_org,
      null,
      p_actor,
      'AUTO_OPEN',
      '첫 개인 지출 정산 신청으로 접수월 자동 개설',
      null,
      to_jsonb(period)
    );
    return period;
  end if;

  select * into period
  from finance.reimbursement_periods
  where organization_id=p_org and month=p_month
  for update;
  return period;
end;
$$;

revoke all on function finance.ensure_reimbursement_period(uuid,uuid,date) from public,anon,authenticated;
grant execute on function finance.ensure_reimbursement_period(uuid,uuid,date) to service_role;

create or replace function finance.reimbursement_submit_with_evidence(p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  result jsonb;
  method text:=p_data->>'payment_method';
  kind text:=p_data->>'evidence_kind';
  review text;
  existing finance.personal_reimbursements%rowtype;
  used_month date;
begin
  if method not in ('PERSONAL_CARD','PERSONAL_TRANSFER','CASH') then raise exception '개인 결제수단을 확인해주세요.'; end if;
  if kind not in ('RECEIPT','CARD_STATEMENT','BANK_TRANSFER','ORDER_DETAILS','TRANSACTION_STATEMENT','ITEM_PHOTO','OTHER_ALTERNATIVE') then raise exception '제출 증빙 종류를 확인해주세요.'; end if;
  if kind<>'RECEIPT' and coalesce(trim(p_data->>'missing_receipt_reason'),'')='' then raise exception '영수증 미첨부 사유가 필요합니다.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  select * into existing
  from finance.personal_reimbursements
  where organization_id=p_org and id=(p_data->>'id')::uuid;
  if found then
    if existing.applicant_id<>p_actor
       or existing.budget_id is distinct from (p_data->>'budget_id')::uuid
       or existing.used_on is distinct from (p_data->>'used_on')::date
       or existing.amount is distinct from (p_data->>'amount')::numeric
       or existing.merchant is distinct from trim(p_data->>'merchant')
       or existing.purpose is distinct from trim(p_data->>'purpose')
       or existing.evidence_path is distinct from p_data->>'evidence_path'
       or existing.evidence_hash is distinct from p_data->>'evidence_hash'
       or existing.source_quick_id is distinct from nullif(p_data->>'source_quick_id','')::uuid
       or existing.payment_method is distinct from method
       or existing.evidence_kind is distinct from kind
       or existing.missing_receipt_reason is distinct from coalesce(trim(p_data->>'missing_receipt_reason'),'')
    then raise exception '같은 정산 요청번호가 다른 내용으로 이미 사용되었습니다.'; end if;
    return to_jsonb(existing);
  end if;

  used_month:=date_trunc('month',(p_data->>'used_on')::date)::date;
  perform finance.ensure_reimbursement_period(p_org,p_actor,used_month);

  result:=finance.reimbursement_command(p_org,p_actor,'SUBMIT',p_data);
  review:=case when kind='RECEIPT' then 'READY' else 'REVIEW_REQUIRED' end;
  update finance.personal_reimbursements
  set payment_method=method,
      evidence_kind=kind,
      missing_receipt_reason=coalesce(trim(p_data->>'missing_receipt_reason'),''),
      evidence_review_status=review
  where organization_id=p_org and id=(p_data->>'id')::uuid and applicant_id=p_actor
  returning to_jsonb(personal_reimbursements.*) into result;
  return result;
end;
$$;

revoke all on function finance.reimbursement_submit_with_evidence(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function finance.reimbursement_submit_with_evidence(uuid,uuid,jsonb) to service_role;

notify pgrst, 'reload schema';
