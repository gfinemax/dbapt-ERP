-- Scope unresolved-source blocking to the affected budget and month.
alter table finance.expense_compliance_settings
  alter column quick_expense_allowed_budget_items set default array[
    '일반운영비>소모품비',
    '일반운영비>도서인쇄비',
    '일반운영비>수선비',
    '제세공과금>여비교통비',
    '제세공과금>통신비'
  ]::text[];

create or replace function finance.guard_quick_expense_budget() returns trigger language plpgsql security invoker set search_path='' as $$
declare b approval.budgets%rowtype; month_start date; used numeric; unresolved integer;
begin
 if new.record_status<>'RECORDED' then return new; end if;
 if tg_op='UPDATE' and row(old.amount,old.budget_item,old.occurred_at,old.record_status,old.organization_id) is not distinct from row(new.amount,new.budget_item,new.occurred_at,new.record_status,new.organization_id) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,0));
 month_start:=date_trunc('month',new.occurred_at at time zone 'Asia/Seoul')::date;
 select * into b from approval.budgets where organization_id=new.organization_id and budget_item=new.budget_item and fiscal_year=extract(year from month_start) for update;
 if not found or b.monthly_amount<=0 then raise exception '승인된 월 예산이 없어 정식 지출결의가 필요합니다.'; end if;
 select coalesce((x->>'unresolved_count')::int,0) into unresolved from jsonb_array_elements(finance.reimbursement_budget_rows(new.organization_id,month_start)) x where x->>'id'=b.id::text;
 if coalesce(unresolved,0)>0 then raise exception '이 예산항목·귀속월의 미정리 원본을 먼저 확인하거나 정식 지출결의로 처리해주세요.'; end if;
 select coalesce(sum(amount),0) into used from finance.budget_effective_entries(new.organization_id) where budget_id=b.id and month=month_start and state in ('USED','RESERVED') and not(source_kind='QUICK' and source_id=new.id::text);
 if used+new.amount>b.monthly_amount then raise exception '이번 달 승인예산 잔액을 초과해 정식 지출결의가 필요합니다.'; end if;
 select coalesce(sum(amount),0) into used from finance.budget_effective_entries(new.organization_id) where budget_id=b.id and state in ('USED','RESERVED') and not(source_kind='QUICK' and source_id=new.id::text);
 if used+new.amount>b.approved_amount then raise exception '연간 승인예산 잔액을 초과해 정식 지출결의가 필요합니다.'; end if;
 return new;
end;$$;
create or replace function finance.reimbursement_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 m finance.reimbursement_members%rowtype; r finance.personal_reimbursements%rowtype; old_r jsonb;
 p finance.reimbursement_periods%rowtype; cfg finance.reimbursement_policies%rowtype;
 b approval.budgets%rowtype; q finance.quick_expense_records%rowtype; tx finance.bank_transactions%rowtype;
 v_month date; v_today date := (now() at time zone 'Asia/Seoul')::date;
 v_reason text := trim(coalesce(p_data->>'reason','')); v_total numeric; v_reserved numeric; v_role text;
 v_id uuid; v_before jsonb; v_after jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 select * into m from finance.reimbursement_members where organization_id=p_org and user_id=p_actor and active;
 if not found then raise exception '정산 업무 접근 권한이 없습니다.'; end if;
 if p_command in ('POLICY','MEMBER') then
   if not ('ADMIN'=any(m.permissions)) then raise exception '관리자 권한이 필요합니다.'; end if;
   if p_command='POLICY' then
     select to_jsonb(t) into v_before from finance.reimbursement_policies t where organization_id=p_org;
     insert into finance.reimbursement_policies values(p_org,(p_data->>'submission_day')::int,(p_data->>'completion_day')::int,(p_data->>'long_delay_days')::int,now())
     on conflict (organization_id) do update set submission_day=excluded.submission_day,completion_day=excluded.completion_day,long_delay_days=excluded.long_delay_days,updated_at=now();
   else
     if (p_data->>'user_id')::uuid=p_actor then raise exception '본인 권한은 이 화면에서 변경할 수 없습니다.'; end if;
     select to_jsonb(t) into v_before from finance.reimbursement_members t where organization_id=p_org and user_id=(p_data->>'user_id')::uuid;
     insert into finance.reimbursement_members values(p_org,(p_data->>'user_id')::uuid,trim(p_data->>'display_name'),
       array(select jsonb_array_elements_text(p_data->'permissions')),(p_data->>'active')::boolean)
     on conflict (organization_id,user_id) do update set display_name=excluded.display_name,permissions=excluded.permissions,active=excluded.active;
   end if;
   v_after:=p_data;
 elsif p_command='OPEN' then
   if not ('CLOSE'=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '마감 권한이 필요합니다.'; end if;
   v_month:=(p_data->>'month')::date;
   if extract(day from v_month)<>1 or extract(year from v_month)<>extract(year from v_today) or v_month>v_today then raise exception '올해의 현재 월 또는 이전 월만 개설할 수 있습니다.'; end if;
   select * into cfg from finance.reimbursement_policies where organization_id=p_org;
   if not found then raise exception '제출·보완 마감일과 장기 지연 기준을 먼저 설정해주세요.'; end if;
   insert into finance.reimbursement_periods(organization_id,month,submission_deadline,completion_deadline,long_delay_days)
   values(p_org,v_month,(v_month+interval '1 month')::date+cfg.submission_day-1,(v_month+interval '1 month')::date+cfg.completion_day-1,cfg.long_delay_days);
   v_after:=p_data;
 elsif p_command in ('SUPPLEMENT','CLOSE') then
   if not ('CLOSE'=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '마감 권한이 필요합니다.'; end if;
   v_month:=(p_data->>'month')::date;
   select * into p from finance.reimbursement_periods where organization_id=p_org and month=v_month for update;
   if not found or p.status='CLOSED' then raise exception '접수 중인 월만 처리할 수 있습니다.'; end if;
   if v_reason='' then raise exception '처리 사유가 필요합니다.'; end if;
   v_before:=to_jsonb(p);
   if p_command='CLOSE' then
     if v_today<=p.completion_deadline then raise exception '보완 마감일이 지난 뒤 마감해주세요.'; end if;
     if exists(select 1 from finance.personal_reimbursements where organization_id=p_org and budget_month=v_month and status='SUBMITTED') then raise exception '심사 중인 정산을 먼저 처리해주세요.'; end if;
     if exists(select 1 from jsonb_array_elements(finance.budget_review_queue(p_org))x where (x->>'needs_review')::boolean and (x->>'suggested_month'=v_month::text or exists(select 1 from jsonb_array_elements(coalesce(x->'lines','[]'::jsonb)) l where l->>'month'=v_month::text))) then raise exception '이 마감월의 귀속 확인이 필요한 원본을 먼저 배정해주세요.'; end if;
     perform finance.reimbursement_snapshot(p_org,v_month,p_actor,v_reason);
   else update finance.reimbursement_periods set status='SUPPLEMENT' where organization_id=p_org and month=v_month;
   end if;
   select to_jsonb(t) into v_after from finance.reimbursement_periods t where organization_id=p_org and month=v_month;
 elsif p_command='SUBMIT' then
   v_id:=(p_data->>'id')::uuid;
   if exists(select 1 from finance.personal_reimbursements where id=v_id and organization_id=p_org and applicant_id=p_actor) then return jsonb_build_object('id',v_id); end if;
   v_month:=date_trunc('month',(p_data->>'used_on')::date)::date;
   if extract(year from v_month)<>extract(year from v_today) or (p_data->>'used_on')::date>v_today then raise exception '올해 실제 사용분만 신청할 수 있습니다. 전년도분은 별도 회계 검토가 필요합니다.'; end if;
   select * into p from finance.reimbursement_periods where organization_id=p_org and month=v_month for update;
   if not found then raise exception '해당 사용월의 접수 기간을 먼저 개설해주세요.'; end if;
   if (v_today>p.submission_deadline or p.status='CLOSED' or v_today-(p_data->>'used_on')::date>p.long_delay_days) and trim(coalesce(p_data->>'delay_reason',''))='' then raise exception '지연 정산 사유가 필요합니다.'; end if;
   select * into b from approval.budgets where id=(p_data->>'budget_id')::uuid and organization_id=p_org and fiscal_year=extract(year from v_month);
   if not found then raise exception '해당 연도의 예산항목이 아닙니다.'; end if;
   if not exists(select 1 from storage.objects where bucket_id='personal-reimbursements' and name=p_data->>'evidence_path'
      and name like p_org::text||'/'||p_actor::text||'/'||v_id::text||'/%') then raise exception '저장된 증빙이 필요합니다.'; end if;
   if length(coalesce(p_data->>'evidence_hash',''))<>64 then raise exception '증빙 확인값이 필요합니다.'; end if;
   if nullif(p_data->>'source_quick_id','') is not null then
     if not ('APPROVE'=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '기존 선지출 연결은 정산 담당자가 확인해야 합니다.'; end if;
     select * into q from finance.quick_expense_records where id=(p_data->>'source_quick_id')::uuid and organization_id=p_org for update;
     if not found or q.payment_method<>'PERSONAL_PREPAID' or q.record_status='CONVERTED' or q.linked_resolution_id is not null
       or q.amount<>(p_data->>'amount')::numeric or q.budget_item<>b.budget_item or (q.occurred_at at time zone 'Asia/Seoul')::date<>(p_data->>'used_on')::date
       then raise exception '기존 개인 선지출의 날짜·금액·예산항목과 일치해야 합니다.'; end if;
   elsif exists(select 1 from finance.quick_expense_records where organization_id=p_org and payment_method='PERSONAL_PREPAID'
      and amount=(p_data->>'amount')::numeric and (occurred_at at time zone 'Asia/Seoul')::date=(p_data->>'used_on')::date and record_status<>'CONVERTED') then
     raise exception '같은 날짜·금액의 기존 개인 선지출을 연결해 중복 등록을 확인해주세요.';
   end if;
   if exists(select 1 from finance.personal_reimbursements where organization_id=p_org and applicant_id=p_actor and used_on=(p_data->>'used_on')::date
     and amount=(p_data->>'amount')::numeric and merchant=trim(p_data->>'merchant') and status not in ('REJECTED','CANCELLED')) then raise exception '동일한 개인 지출이 이미 신청되어 있습니다.'; end if;
   insert into finance.personal_reimbursements(id,organization_id,applicant_id,budget_id,used_on,budget_month,amount,merchant,purpose,evidence_path,evidence_hash,delay_reason,source_quick_id,needs_exception,needs_senior)
   values(v_id,p_org,p_actor,b.id,(p_data->>'used_on')::date,v_month,(p_data->>'amount')::numeric,trim(p_data->>'merchant'),trim(p_data->>'purpose'),p_data->>'evidence_path',p_data->>'evidence_hash',coalesce(p_data->>'delay_reason',''),q.id,
     v_today>p.submission_deadline or p.status='CLOSED',v_today-(p_data->>'used_on')::date>p.long_delay_days) returning to_jsonb(personal_reimbursements.*) into v_after;
 else
   select * into r from finance.personal_reimbursements where id=(p_data->>'id')::uuid and organization_id=p_org for update;
   if not found then raise exception '정산 신청을 찾을 수 없습니다.'; end if;
   v_id:=r.id; old_r:=to_jsonb(r); v_before:=old_r;
   select * into p from finance.reimbursement_periods where organization_id=p_org and month=r.budget_month for update;
   if p_command in ('EXCEPTION','SENIOR','OVER_BUDGET','APPROVE','REJECT') and r.applicant_id=p_actor then raise exception '본인 신청은 다른 승인자가 검토해야 합니다.'; end if;
   v_role:=case when p_command in ('SENIOR','OVER_BUDGET') then 'SENIOR' when p_command in ('PAY','REVERSE_PAYMENT') then 'PAY'
     when p_command='APPROVE' and p.status='CLOSED' then 'CLOSE' when p_command='CANCEL' and r.status='APPROVED' then 'CLOSE' else 'APPROVE' end;
   if not (p_command='CANCEL' and r.status='SUBMITTED' and r.applicant_id=p_actor) and not (v_role=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '이 처리에 필요한 권한이 없습니다.'; end if;
   if v_reason='' then raise exception '승인·반려·취소 사유를 남겨주세요.'; end if;
   if p_command in ('EXCEPTION','SENIOR','OVER_BUDGET','APPROVE','REJECT') and r.status<>'SUBMITTED' then raise exception '심사 중인 신청만 처리할 수 있습니다.'; end if;
   if p_command='EXCEPTION' then
     update finance.personal_reimbursements set exception_approved_at=now() where id=r.id;
   elsif p_command='SENIOR' then
     update finance.personal_reimbursements set senior_approved_at=now() where id=r.id;
   elsif p_command='OVER_BUDGET' then
     update finance.personal_reimbursements set over_budget_approved_at=now() where id=r.id;
   elsif p_command='APPROVE' then
     if extract(year from r.budget_month)<>extract(year from v_today) then raise exception '전년도 정산은 별도 회계 검토가 필요합니다.'; end if;
     if r.needs_exception and r.exception_approved_at is null then raise exception '지연 정산 예외 승인이 먼저 필요합니다.'; end if;
     if r.needs_senior and r.senior_approved_at is null then raise exception '장기 지연 추가 승인이 먼저 필요합니다.'; end if;
     select * into b from approval.budgets where id=r.budget_id for update;
     if exists(select 1 from jsonb_array_elements(finance.reimbursement_budget_rows(p_org,r.budget_month)) x where x->>'id'=b.id::text and (x->>'unresolved_count')::int>0) then raise exception '이 예산항목·귀속월의 미정리 원본을 먼저 확인해주세요.'; end if;
     select coalesce(sum(amount),0) into v_total from finance.budget_effective_entries(p_org) where budget_id=b.id and month=r.budget_month and state in ('USED','RESERVED') and not(source_kind='QUICK' and source_id=coalesce(r.source_quick_id::text,''));
     select coalesce(sum(amount),0) into v_reserved from finance.budget_effective_entries(p_org) where budget_id=b.id and state in ('USED','RESERVED') and not(source_kind='QUICK' and source_id=coalesce(r.source_quick_id::text,''));
     if (v_total+r.amount>b.monthly_amount or v_reserved+r.amount>b.approved_amount)
       and r.over_budget_approved_at is null then raise exception '예산 초과 추가 승인이 필요합니다.'; end if;
     perform set_config('finance.reimbursement_mutation','on',true);
     if r.source_quick_id is not null then update finance.quick_expense_records set record_status='CONVERTED',updated_at=now() where id=r.source_quick_id; end if;
     update finance.personal_reimbursements set status='APPROVED',approved_at=now() where id=r.id;
     if p.status='CLOSED' then perform finance.reimbursement_snapshot(p_org,r.budget_month,p_actor,v_reason); end if;
   elsif p_command='REJECT' then update finance.personal_reimbursements set status='REJECTED' where id=r.id;
   elsif p_command='CANCEL' then
     if r.status not in ('SUBMITTED','APPROVED') then raise exception '지급 전 신청만 취소할 수 있습니다. 지급 연결을 먼저 취소해주세요.'; end if;
     update finance.personal_reimbursements set status='CANCELLED' where id=r.id;
     if p.status='CLOSED' and r.status='APPROVED' then perform finance.reimbursement_snapshot(p_org,r.budget_month,p_actor,v_reason); end if;
   elsif p_command='PAY' then
     if r.status<>'APPROVED' then raise exception '예산 반영이 승인된 신청만 지급 연결할 수 있습니다.'; end if;
     select * into tx from finance.bank_transactions where id=(p_data->>'bank_transaction_id')::uuid and organization_id=p_org and deleted_at is null for update;
     if not found or tx.withdrawal_amount<>r.amount or tx.deposit_amount<>0 or (tx.transacted_at at time zone 'Asia/Seoul')::date<r.used_on or tx.transacted_at>now() then raise exception '사용일 이후의 동일 금액 출금거래를 선택해주세요.'; end if;
     if exists(select 1 from finance.expense_resolutions where bank_transaction_id=tx.id and deleted_at is null)
       or exists(select 1 from finance.quick_expense_records where bank_transaction_id=tx.id)
       or exists(select 1 from finance.personal_reimbursements where bank_transaction_id=tx.id) then raise exception '이미 다른 지출에 연결된 출금거래입니다.'; end if;
     update finance.personal_reimbursements set status='PAID',paid_at=tx.transacted_at,bank_transaction_id=tx.id where id=r.id;
   elsif p_command='REVERSE_PAYMENT' then
     if r.status<>'PAID' then raise exception '지급 연결된 신청만 연결 취소할 수 있습니다.'; end if;
     update finance.personal_reimbursements set status='APPROVED',paid_at=null,bank_transaction_id=null where id=r.id;
   else raise exception '지원하지 않는 처리입니다.';
   end if;
   select to_jsonb(t) into v_after from finance.personal_reimbursements t where id=r.id;
 end if;
 insert into finance.reimbursement_audit(organization_id,request_id,actor_id,action,reason,before_data,after_data)
 values(p_org,v_id,p_actor,p_command,v_reason,v_before,v_after);
 return coalesce(v_after,'{}'::jsonb);
end; $$;

create or replace function finance.quick_expense_evidence_command(p_org uuid,p_actor uuid,p_id uuid,p_decision text,p_reason text,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; q finance.quick_expense_records; op finance.quick_expense_operations; before_value jsonb; result jsonb; has_receipt boolean; target_status text; operation_input jsonb;
begin
 if p_decision not in ('APPROVE','SUPPLEMENT') or coalesce(length(trim(p_reason)),0)=0 or coalesce(length(trim(p_key)),0) not between 1 and 200 then raise exception '증빙 처리 정보가 올바르지 않습니다.'; end if;
 m:=finance.workflow_actor(p_org,p_actor);
 if not (m.permissions && array['ADMIN','APPROVE']) then raise exception '증빙 확인 권한이 없습니다.'; end if;
 operation_input:=jsonb_build_object('reason',trim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_id::text,742));
 select * into op from finance.quick_expense_operations where organization_id=p_org and operation_key=p_key;
 if found then
   if op.actor_id<>p_actor or op.command<>'EVIDENCE_'||p_decision or op.input is distinct from operation_input then raise exception '다른 처리에 사용된 처리키입니다.'; end if;
   return op.result;
 end if;
 select * into q from finance.quick_expense_records where organization_id=p_org and id=p_id for update;
 if not found or q.record_status='CONVERTED' then raise exception '처리할 간편지출을 찾을 수 없습니다.'; end if;
 before_value:=to_jsonb(q);
 if p_decision='APPROVE' then
   if not exists(select 1 from finance.quick_expense_evidence where organization_id=p_org and quick_expense_id=p_id) then raise exception '영수증 또는 대체증빙 파일을 먼저 첨부해주세요.'; end if;
   select exists(select 1 from finance.quick_expense_evidence e join finance.expense_evidence_ocr_jobs j on j.id=e.ocr_job_id where e.organization_id=p_org and e.quick_expense_id=p_id and j.evidence_type='영수증') into has_receipt;
   if not has_receipt and coalesce(trim(q.missing_evidence_reason),'')='' then update finance.quick_expense_records set missing_evidence_reason=trim(p_reason) where id=p_id; end if;
   target_status:=case when q.direct_expense_decision<>'ALLOWED' then 'NEEDS_RESOLUTION' when q.payment_method='CORPORATE_CARD' and q.corporate_card_transaction_id is null then 'SOURCE_PENDING' else 'RECORDED' end;
   update finance.quick_expense_records set evidence_status=case when has_receipt then 'QUALIFIED' else 'ALTERNATIVE' end,
     evidence_kind=case when has_receipt then 'RECEIPT' else 'ALTERNATIVE' end,evidence_review_status='APPROVED',evidence_reviewed_at=now(),evidence_reviewed_by=p_actor,evidence_review_note=trim(p_reason),record_status=target_status,updated_at=clock_timestamp() where id=p_id returning to_jsonb(quick_expense_records.*) into result;
 else
   update finance.quick_expense_records set evidence_review_status='SUPPLEMENT_REQUIRED',evidence_reviewed_at=now(),evidence_reviewed_by=p_actor,evidence_review_note=trim(p_reason),record_status=case when record_status='SOURCE_PENDING' then record_status else 'EVIDENCE_PENDING' end,updated_at=clock_timestamp() where id=p_id returning to_jsonb(quick_expense_records.*) into result;
 end if;
 insert into finance.quick_expense_audit(organization_id,quick_expense_id,actor_id,action,before_data,after_data) values(p_org,p_id,p_actor,'EVIDENCE_'||p_decision,before_value,result);
 insert into finance.quick_expense_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,p_key,p_actor,'EVIDENCE_'||p_decision,operation_input,result);
 return result;
end $$;
revoke all on function finance.quick_expense_evidence_command(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function finance.quick_expense_evidence_command(uuid,uuid,uuid,text,text,text) to service_role;

create or replace function finance.reimbursement_submit_with_evidence(p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; method text:=p_data->>'payment_method'; kind text:=p_data->>'evidence_kind'; review text; existing finance.personal_reimbursements%rowtype;
begin
 if method not in ('PERSONAL_CARD','PERSONAL_TRANSFER','CASH') then raise exception '개인 결제수단을 확인해주세요.'; end if;
 if kind not in ('RECEIPT','CARD_STATEMENT','BANK_TRANSFER','ORDER_DETAILS','TRANSACTION_STATEMENT','ITEM_PHOTO','OTHER_ALTERNATIVE') then raise exception '제출 증빙 종류를 확인해주세요.'; end if;
 if kind<>'RECEIPT' and coalesce(trim(p_data->>'missing_receipt_reason'),'')='' then raise exception '영수증 미첨부 사유가 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 select * into existing from finance.personal_reimbursements where organization_id=p_org and id=(p_data->>'id')::uuid;
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
 result:=finance.reimbursement_command(p_org,p_actor,'SUBMIT',p_data);
 review:=case when kind='RECEIPT' then 'READY' else 'REVIEW_REQUIRED' end;
 update finance.personal_reimbursements set payment_method=method,evidence_kind=kind,missing_receipt_reason=coalesce(trim(p_data->>'missing_receipt_reason'),''),evidence_review_status=review
 where organization_id=p_org and id=(p_data->>'id')::uuid and applicant_id=p_actor returning to_jsonb(personal_reimbursements.*) into result;
 return result;
end $$;
revoke all on function finance.reimbursement_submit_with_evidence(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function finance.reimbursement_submit_with_evidence(uuid,uuid,jsonb) to service_role;



notify pgrst, 'reload schema';
