-- Make budget-direct operating expenses explicit and keep payment evidence separate from receipt review.
alter table finance.expense_compliance_settings
  add column if not exists quick_expense_allowed_budget_items text[] not null default '{}';

-- Seed only routine, identifiable operating accounts. Administrators can review this exact-ID label list later.
update finance.expense_compliance_settings s set quick_expense_allowed_budget_items=coalesce((
  select array_agg(distinct b.budget_item order by b.budget_item)
  from approval.budgets b where b.organization_id=s.organization_id and (
    b.budget_item ~ '(소모품비|사무용품비|도서인쇄비|복사|출력|우편|택배|통신비|여비교통비|수선비)'
  )
),'{}') where cardinality(s.quick_expense_allowed_budget_items)=0;

alter table finance.quick_expense_records
  add column if not exists evidence_kind text not null default 'NONE',
  add column if not exists missing_evidence_reason text not null default '',
  add column if not exists evidence_review_status text not null default 'MISSING',
  add column if not exists evidence_reviewed_at timestamptz,
  add column if not exists evidence_reviewed_by uuid references auth.users(id) on delete restrict,
  add column if not exists evidence_review_note text not null default '';

do $$ begin
 alter table finance.quick_expense_records add constraint quick_expense_evidence_kind_check
   check(evidence_kind in ('CARD_TRANSACTION','BANK_TRANSFER','RECEIPT','ALTERNATIVE','NONE'));
exception when duplicate_object then null; end $$;
do $$ begin
 alter table finance.quick_expense_records add constraint quick_expense_evidence_review_status_check
   check(evidence_review_status in ('MISSING','READY','REVIEW_REQUIRED','SUPPLEMENT_REQUIRED','APPROVED'));
exception when duplicate_object then null; end $$;
alter table finance.quick_expense_records drop constraint if exists quick_expense_records_record_status_check;
alter table finance.quick_expense_records add constraint quick_expense_records_record_status_check
  check(record_status in ('RECORDED','SOURCE_PENDING','EVIDENCE_PENDING','NEEDS_RESOLUTION','CONVERTED'));

-- Preserve every existing final record; only new records enter the explicit evidence gate.
update finance.quick_expense_records set evidence_review_status='APPROVED', evidence_review_note='기존 확정 기록 보존'
where record_status in ('RECORDED','CONVERTED') and evidence_review_status='MISSING';

create or replace function finance.link_quick_expense_card(p_record_id uuid,p_card_transaction_id uuid,p_record_status text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_record finance.quick_expense_records%rowtype; v_card finance.corporate_card_transactions%rowtype;
begin
  if p_record_status not in ('RECORDED','EVIDENCE_PENDING','NEEDS_RESOLUTION') then raise exception '잘못된 연결 상태입니다.'; end if;
  select * into v_record from finance.quick_expense_records where id=p_record_id for update;
  select * into v_card from finance.corporate_card_transactions where id=p_card_transaction_id for update;
  if v_record.record_status<>'SOURCE_PENDING' then raise exception '카드내역 연결대기 기록이 아닙니다.'; end if;
  if v_card.linked_resolution_id is not null or v_card.resolution_status<>'UNRESOLVED' then raise exception '이미 처리된 카드 승인내역입니다.'; end if;
  if abs(v_record.amount-v_card.amount)>0.5 or abs(v_record.occurred_at::date-v_card.approved_at::date)>2 then raise exception '금액 또는 사용일이 일치하지 않습니다.'; end if;
  update finance.quick_expense_records set source_type='CORPORATE_CARD',corporate_card_transaction_id=v_card.id,occurred_at=v_card.approved_at,counterparty=v_card.merchant_name,
    evidence_kind=case when evidence_kind='NONE' then 'CARD_TRANSACTION' else evidence_kind end,record_status=p_record_status,updated_at=now() where id=v_record.id;
  update finance.corporate_card_transactions set resolution_status='APPROVED',updated_at=now() where id=v_card.id;
end; $$;

alter table finance.personal_reimbursements
  add column if not exists payment_method text not null default 'PERSONAL_CARD',
  add column if not exists evidence_kind text not null default 'RECEIPT',
  add column if not exists missing_receipt_reason text not null default '',
  add column if not exists evidence_review_status text not null default 'READY',
  add column if not exists evidence_reviewed_at timestamptz,
  add column if not exists evidence_reviewed_by uuid references auth.users(id) on delete restrict,
  add column if not exists evidence_review_note text not null default '';
do $$ begin
 alter table finance.personal_reimbursements add constraint personal_reimbursement_payment_method_check
   check(payment_method in ('PERSONAL_CARD','PERSONAL_TRANSFER','CASH'));
exception when duplicate_object then null; end $$;
do $$ begin
 alter table finance.personal_reimbursements add constraint personal_reimbursement_evidence_kind_check
   check(evidence_kind in ('RECEIPT','CARD_STATEMENT','BANK_TRANSFER','ORDER_DETAILS','TRANSACTION_STATEMENT','ITEM_PHOTO','OTHER_ALTERNATIVE'));
exception when duplicate_object then null; end $$;
do $$ begin
 alter table finance.personal_reimbursements add constraint personal_reimbursement_evidence_review_check
   check(evidence_review_status in ('READY','REVIEW_REQUIRED','SUPPLEMENT_REQUIRED','APPROVED'));
exception when duplicate_object then null; end $$;

-- A missing legacy source affects only the budget and month it actually identifies.
create or replace function finance.reimbursement_budget_rows(p_org uuid,p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
 with entries as materialized(select * from finance.budget_effective_entries(p_org)),
 review as materialized(select x from jsonb_array_elements(finance.budget_review_queue(p_org)) x where (x->>'needs_review')::boolean),
 rows as(
 select b.id,b.budget_item,b.monthly_amount,b.approved_amount,b.executed_amount as annual_recorded_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='QUICK'),0) as quick_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='PERSONAL'),0) as personal_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='RESOLUTION'),0) as resolution_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.source_kind='MANUAL'),0) as manual_amount,
 coalesce(sum(e.amount) filter(where e.state='USED' and e.paid_at is null and e.source_kind<>'MANUAL'),0) as unpaid_amount,
 coalesce(sum(e.amount) filter(where e.state='RESERVED'),0) as reserved_amount,
 coalesce(sum(e.amount) filter(where e.state='PENDING'),0) as pending_amount,
 coalesce((select count(*) from review r where
   (r.x->>'suggested_budget'=b.budget_item and r.x->>'suggested_month'=p_month::text)
   or exists(select 1 from jsonb_array_elements(coalesce(r.x->'lines','[]'::jsonb)) l where l->>'budget_id'=b.id::text and l->>'month'=p_month::text)
 ),0) as unresolved_count,
 coalesce((select sum(a.amount) from entries a where a.budget_id=b.id and a.state='USED'),0) as annual_used_amount,
 coalesce((select sum(a.amount) from entries a where a.budget_id=b.id and a.state='RESERVED'),0) as annual_reserved_amount
 from approval.budgets b left join entries e on e.budget_id=b.id and e.month=p_month
 where b.organization_id=p_org and b.fiscal_year=extract(year from p_month)
 group by b.id)
 select coalesce(jsonb_agg(to_jsonb(rows) order by budget_item),'[]'::jsonb) from rows;
$$;

create or replace function finance.quick_expense_evidence_attached() returns trigger
language plpgsql security invoker set search_path='' as $$
declare kind text;
begin
 select evidence_type into kind from finance.expense_evidence_ocr_jobs where id=new.ocr_job_id;
 update finance.quick_expense_records set
   evidence_kind=case when kind='영수증' then 'RECEIPT' else 'ALTERNATIVE' end,
   evidence_review_status=case when kind='영수증' then 'READY' else 'REVIEW_REQUIRED' end,
   updated_at=clock_timestamp()
 where id=new.quick_expense_id and organization_id=new.organization_id and record_status<>'CONVERTED';
 return new;
end $$;
drop trigger if exists quick_expense_evidence_attached on finance.quick_expense_evidence;
create trigger quick_expense_evidence_attached after insert on finance.quick_expense_evidence
for each row execute function finance.quick_expense_evidence_attached();
revoke all on function finance.quick_expense_evidence_attached() from public,anon,authenticated;

create or replace function finance.quick_expense_evidence_command(p_org uuid,p_actor uuid,p_id uuid,p_decision text,p_reason text,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; q finance.quick_expense_records; op finance.quick_expense_operations; before_value jsonb; result jsonb; has_receipt boolean; target_status text;
begin
 if p_decision not in ('APPROVE','SUPPLEMENT') or coalesce(length(trim(p_reason)),0)=0 or coalesce(length(trim(p_key)),0) not between 1 and 200 then raise exception '증빙 처리 정보가 올바르지 않습니다.'; end if;
 m:=finance.workflow_actor(p_org,p_actor);
 if not (m.permissions && array['ADMIN','APPROVE']) then raise exception '증빙 확인 권한이 없습니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_id::text,742));
 select * into op from finance.quick_expense_operations where organization_id=p_org and operation_key=p_key;
 if found then
   if op.actor_id<>p_actor or op.command<>'EVIDENCE_'||p_decision then raise exception '다른 처리에 사용된 처리키입니다.'; end if;
   return op.result;
 end if;
 select * into q from finance.quick_expense_records where organization_id=p_org and id=p_id for update;
 if not found or q.record_status='CONVERTED' then raise exception '처리할 간편지출을 찾을 수 없습니다.'; end if;
 before_value:=to_jsonb(q);
 if p_decision='APPROVE' then
   if not exists(select 1 from finance.quick_expense_evidence where organization_id=p_org and quick_expense_id=p_id) then raise exception '영수증 또는 대체증빙 파일을 먼저 첨부해주세요.'; end if;
   select exists(select 1 from finance.quick_expense_evidence e join finance.expense_evidence_ocr_jobs j on j.id=e.ocr_job_id where e.organization_id=p_org and e.quick_expense_id=p_id and j.evidence_type='영수증') into has_receipt;
   if not has_receipt and coalesce(trim(q.missing_evidence_reason),'')='' then
     update finance.quick_expense_records set missing_evidence_reason=trim(p_reason) where id=p_id;
   end if;
   target_status:=case when q.direct_expense_decision<>'ALLOWED' then 'NEEDS_RESOLUTION' when q.payment_method='CORPORATE_CARD' and q.corporate_card_transaction_id is null then 'SOURCE_PENDING' else 'RECORDED' end;
   update finance.quick_expense_records set evidence_status=case when has_receipt then 'QUALIFIED' else 'ALTERNATIVE' end,
     evidence_kind=case when has_receipt then 'RECEIPT' else 'ALTERNATIVE' end,evidence_review_status='APPROVED',evidence_reviewed_at=now(),evidence_reviewed_by=p_actor,evidence_review_note=trim(p_reason),record_status=target_status,updated_at=clock_timestamp() where id=p_id returning to_jsonb(quick_expense_records.*) into result;
 else
   update finance.quick_expense_records set evidence_review_status='SUPPLEMENT_REQUIRED',evidence_reviewed_at=now(),evidence_reviewed_by=p_actor,evidence_review_note=trim(p_reason),record_status=case when record_status='SOURCE_PENDING' then record_status else 'EVIDENCE_PENDING' end,updated_at=clock_timestamp() where id=p_id returning to_jsonb(quick_expense_records.*) into result;
 end if;
 insert into finance.quick_expense_audit(organization_id,quick_expense_id,actor_id,action,before_data,after_data) values(p_org,p_id,p_actor,'EVIDENCE_'||p_decision,before_value,result);
 insert into finance.quick_expense_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,p_key,p_actor,'EVIDENCE_'||p_decision,jsonb_build_object('reason',trim(p_reason)),result);
 return result;
end $$;
revoke all on function finance.quick_expense_evidence_command(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function finance.quick_expense_evidence_command(uuid,uuid,uuid,text,text,text) to service_role;

create or replace function finance.reimbursement_submit_with_evidence(p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; method text:=p_data->>'payment_method'; kind text:=p_data->>'evidence_kind'; review text;
begin
 if method not in ('PERSONAL_CARD','PERSONAL_TRANSFER','CASH') then raise exception '개인 결제수단을 확인해주세요.'; end if;
 if kind not in ('RECEIPT','CARD_STATEMENT','BANK_TRANSFER','ORDER_DETAILS','TRANSACTION_STATEMENT','ITEM_PHOTO','OTHER_ALTERNATIVE') then raise exception '제출 증빙 종류를 확인해주세요.'; end if;
 if kind<>'RECEIPT' and coalesce(trim(p_data->>'missing_receipt_reason'),'')='' then raise exception '영수증 미첨부 사유가 필요합니다.'; end if;
 result:=finance.reimbursement_command(p_org,p_actor,'SUBMIT',p_data);
 review:=case when kind='RECEIPT' then 'READY' else 'REVIEW_REQUIRED' end;
 update finance.personal_reimbursements set payment_method=method,evidence_kind=kind,missing_receipt_reason=coalesce(trim(p_data->>'missing_receipt_reason'),''),evidence_review_status=review
 where organization_id=p_org and id=(p_data->>'id')::uuid and applicant_id=p_actor returning to_jsonb(personal_reimbursements.*) into result;
 return result;
end $$;
revoke all on function finance.reimbursement_submit_with_evidence(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function finance.reimbursement_submit_with_evidence(uuid,uuid,jsonb) to service_role;

create or replace function finance.reimbursement_evidence_command(p_org uuid,p_actor uuid,p_id uuid,p_decision text,p_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; r finance.personal_reimbursements; before_value jsonb; result jsonb;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not (m.permissions && array['ADMIN','APPROVE']) then raise exception '대체증빙 승인 권한이 없습니다.'; end if;
 if p_decision not in ('APPROVE','SUPPLEMENT') or coalesce(trim(p_reason),'')='' then raise exception '증빙 처리 사유가 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_id::text,743));
 select * into r from finance.personal_reimbursements where organization_id=p_org and id=p_id for update;
 if not found or r.status<>'SUBMITTED' then raise exception '심사 중인 정산 신청만 처리할 수 있습니다.'; end if;
 if r.applicant_id=p_actor then raise exception '본인 신청의 대체증빙은 다른 승인자가 확인해야 합니다.'; end if;
 if p_decision='APPROVE' and r.evidence_review_status not in ('REVIEW_REQUIRED','SUPPLEMENT_REQUIRED') then raise exception '대체증빙 검토 대상이 아닙니다.'; end if;
 before_value:=to_jsonb(r);
 update finance.personal_reimbursements set evidence_review_status=case when p_decision='APPROVE' then 'APPROVED' else 'SUPPLEMENT_REQUIRED' end,
   evidence_reviewed_at=now(),evidence_reviewed_by=p_actor,evidence_review_note=trim(p_reason) where id=p_id returning to_jsonb(personal_reimbursements.*) into result;
 insert into finance.reimbursement_audit(organization_id,request_id,actor_id,action,reason,before_data,after_data)
 values(p_org,p_id,p_actor,'EVIDENCE_'||p_decision,trim(p_reason),before_value,result);
 return result;
end $$;
revoke all on function finance.reimbursement_evidence_command(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function finance.reimbursement_evidence_command(uuid,uuid,uuid,text,text) to service_role;

create or replace function finance.guard_reimbursement_evidence_review() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status='APPROVED' and old.status is distinct from new.status and new.evidence_review_status not in ('READY','APPROVED') then
   raise exception '영수증 확인 또는 대체증빙 승인이 먼저 필요합니다.';
 end if;
 return new;
end $$;
drop trigger if exists guard_reimbursement_evidence_review on finance.personal_reimbursements;
create trigger guard_reimbursement_evidence_review before update of status on finance.personal_reimbursements
for each row execute function finance.guard_reimbursement_evidence_review();
revoke all on function finance.guard_reimbursement_evidence_review() from public,anon,authenticated;

notify pgrst, 'reload schema';
