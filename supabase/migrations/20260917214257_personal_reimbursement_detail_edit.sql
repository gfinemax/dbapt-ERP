alter table finance.personal_reimbursements
  add column if not exists updated_at timestamptz not null default clock_timestamp();

create or replace function finance.reimbursement_detail_update(
  p_org uuid,
  p_actor uuid,
  p_id uuid,
  p_merchant text,
  p_purpose text,
  p_reason text,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  member finance.reimbursement_members%rowtype;
  request finance.personal_reimbursements%rowtype;
  before_value jsonb;
  result jsonb;
  merchant_value text := trim(coalesce(p_merchant, ''));
  purpose_value text := trim(coalesce(p_purpose, ''));
  reason_value text := trim(coalesce(p_reason, ''));
begin
  if p_id is null or p_expected_updated_at is null then
    raise exception '수정할 개인 정산 정보를 확인해주세요.';
  end if;
  if length(merchant_value) not between 1 and 200 then
    raise exception '거래처는 1자 이상 200자 이하로 입력해주세요.';
  end if;
  if length(purpose_value) not between 1 and 500 then
    raise exception '사용내용은 1자 이상 500자 이하로 입력해주세요.';
  end if;
  if length(reason_value) not between 1 and 500 then
    raise exception '수정 사유는 1자 이상 500자 이하로 입력해주세요.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_id::text, 913));
  select * into member
  from finance.reimbursement_members
  where organization_id=p_org and user_id=p_actor and active;
  if not found then raise exception '정산 업무 접근 권한이 없습니다.'; end if;

  select * into request
  from finance.personal_reimbursements
  where organization_id=p_org and id=p_id
  for update;
  if not found then raise exception '개인 정산 원본을 찾을 수 없습니다.'; end if;
  if request.status <> 'SUBMITTED' then
    raise exception '승인대기 상태의 개인 정산만 수정할 수 있습니다.';
  end if;
  if request.applicant_id <> p_actor and not ('ADMIN'=any(member.permissions)) then
    raise exception '신청자 본인 또는 관리자만 수정할 수 있습니다.';
  end if;
  if request.updated_at is distinct from p_expected_updated_at then
    raise exception '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 확인해주세요.';
  end if;
  if request.merchant = merchant_value and request.purpose = purpose_value then
    raise exception '변경된 거래처 또는 사용내용이 없습니다.';
  end if;
  if exists(
    select 1 from finance.personal_reimbursements other
    where other.organization_id=p_org
      and other.id<>request.id
      and other.applicant_id=request.applicant_id
      and other.used_on=request.used_on
      and other.amount=request.amount
      and other.merchant=merchant_value
      and other.status not in ('REJECTED','CANCELLED')
  ) then
    raise exception '동일한 개인 지출이 이미 신청되어 있습니다.';
  end if;

  before_value:=to_jsonb(request);
  update finance.personal_reimbursements
  set merchant=merchant_value, purpose=purpose_value, updated_at=clock_timestamp()
  where id=request.id
  returning to_jsonb(personal_reimbursements.*) into result;

  insert into finance.reimbursement_audit(
    organization_id,request_id,actor_id,action,reason,before_data,after_data
  ) values (
    p_org,p_id,p_actor,'UPDATE_DETAILS',reason_value,before_value,result
  );
  return result;
end;
$$;

revoke all on function finance.reimbursement_detail_update(uuid,uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function finance.reimbursement_detail_update(uuid,uuid,uuid,text,text,text,timestamptz) to service_role;
