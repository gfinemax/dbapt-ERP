-- 업로드 원본 정보는 읽기 전용으로 보존하고 ERP 관리자 검토만 별도 기록한다.
alter table finance.bank_transaction_classification_audit_logs
  drop constraint if exists bank_transaction_classification_audit_logs_action_check;
alter table finance.bank_transaction_classification_audit_logs
  add constraint bank_transaction_classification_audit_logs_action_check
  check (action in ('CONFIRM', 'CHANGE', 'DEFER', 'EXCLUDE', 'NOTE'));

create or replace function finance.save_bank_transaction_review(
  p_org uuid,
  p_actor uuid,
  p_transaction_id uuid,
  p_account_subject_id uuid,
  p_note text,
  p_action text
)
returns table (
  transaction_id uuid,
  account_subject_id uuid,
  classification_status text,
  classification_note text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor finance.reimbursement_members;
  transaction_row finance.bank_transactions;
  saved finance.bank_transactions;
  subject_row finance.account_subjects;
  next_status text;
  next_subject uuid;
  audit_action text;
  note_value text:=nullif(trim(coalesce(p_note, '')), '');
begin
  actor:=finance.workflow_actor(p_org, p_actor, 'ADMIN');
  if p_action not in ('NOTE', 'CONFIRM', 'DEFER', 'EXCLUDE') then
    raise exception '지원하지 않는 은행거래 검토 작업이야.';
  end if;

  select * into transaction_row from finance.bank_transactions
  where id=p_transaction_id and organization_id=p_org and deleted_at is null
  for update;
  if not found then raise exception '검토할 은행거래를 찾을 수 없어.'; end if;

  if p_account_subject_id is not null then
    select * into subject_row from finance.account_subjects
    where id=p_account_subject_id and organization_id=p_org and is_active;
    if not found then raise exception '같은 조직의 사용 중인 계정과목만 선택할 수 있어.'; end if;
  end if;

  if p_action='CONFIRM' then
    if p_account_subject_id is null then raise exception '확정할 계정과목을 선택해줘.'; end if;
    next_status:='CONFIRMED';
    next_subject:=p_account_subject_id;
    audit_action:=case
      when transaction_row.confirmed_account_subject_id is null
        or transaction_row.classification_status<>'CONFIRMED' then 'CONFIRM'
      when transaction_row.confirmed_account_subject_id<>p_account_subject_id then 'CHANGE'
      else 'NOTE'
    end;
  elsif p_action='DEFER' then
    next_status:='DEFERRED'; next_subject:=null; audit_action:='DEFER';
  elsif p_action='EXCLUDE' then
    next_status:='EXCLUDED'; next_subject:=null; audit_action:='EXCLUDE';
  else
    next_status:=transaction_row.classification_status;
    next_subject:=transaction_row.confirmed_account_subject_id;
    audit_action:='NOTE';
  end if;

  update finance.bank_transactions
  set confirmed_account_subject_id=next_subject,
      classification_status=next_status,
      classification_note=note_value,
      classified_by=p_actor,
      classified_at=now()
  where id=p_transaction_id
  returning * into saved;

  insert into finance.bank_transaction_classification_audit_logs (
    organization_id,bank_transaction_id,account_subject_id,action,actor_id,actor_label,
    previous_data,confirmed_data
  ) values (
    p_org,saved.id,saved.confirmed_account_subject_id,audit_action,p_actor,actor.display_name,
    jsonb_build_object(
      'account_subject_id',transaction_row.confirmed_account_subject_id,
      'classification_status',transaction_row.classification_status,
      'classification_note',transaction_row.classification_note,
      'classified_by',transaction_row.classified_by,
      'classified_at',transaction_row.classified_at
    ),
    jsonb_build_object(
      'account_subject_id',saved.confirmed_account_subject_id,
      'classification_status',saved.classification_status,
      'classification_note',saved.classification_note,
      'classified_by',saved.classified_by,
      'classified_at',saved.classified_at
    )
  );

  transaction_id:=saved.id;
  account_subject_id:=saved.confirmed_account_subject_id;
  classification_status:=saved.classification_status;
  classification_note:=saved.classification_note;
  return next;
end
$$;

revoke all on function finance.save_bank_transaction_review(uuid,uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function finance.save_bank_transaction_review(uuid,uuid,uuid,uuid,text,text)
  to service_role;
