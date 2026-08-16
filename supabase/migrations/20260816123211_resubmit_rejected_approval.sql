create or replace function approval.resubmit_document(
  p_document_id uuid,
  p_actor_label text,
  p_changes jsonb
) returns text
language plpgsql
security definer
set search_path = approval, public
as $$
declare
  v_before approval.documents%rowtype;
  v_title text;
  v_body text;
  v_purpose text;
  v_amount numeric(16, 0);
begin
  select * into v_before
  from approval.documents
  where id = p_document_id and deleted_at is null
  for update;

  if not found then
    raise exception '기안 문서를 찾을 수 없습니다.';
  end if;
  if v_before.approval_status not in ('REJECTED', 'REVISION_REQUESTED') then
    raise exception '반려 또는 보완요청 문서만 재상신할 수 있습니다.';
  end if;
  if trim(v_before.drafter_label) <> trim(p_actor_label) then
    raise exception '기안자만 수정 후 재상신할 수 있습니다.';
  end if;

  v_title := coalesce(nullif(trim(p_changes->>'title'), ''), v_before.title);
  v_body := coalesce(nullif(trim(p_changes->>'body'), ''), v_before.body);
  v_purpose := coalesce(nullif(trim(p_changes->>'purpose'), ''), v_before.purpose);
  v_amount := coalesce(nullif(p_changes->>'amount', '')::numeric, v_before.amount);

  if v_title = '' or v_body = '' or v_purpose = '' then
    raise exception '제목, 기안 내용, 목적을 입력해주세요.';
  end if;
  if v_amount < 0 or (v_before.document_type <> 'GENERAL' and v_amount <= 0) then
    raise exception '지출·계약 기안은 올바른 금액이 필요합니다.';
  end if;

  update approval.documents
  set title = v_title,
      body = v_body,
      purpose = v_purpose,
      amount = v_amount,
      counterparty_name = nullif(trim(p_changes->>'counterpartyName'), ''),
      budget_item = nullif(trim(p_changes->>'budgetItem'), ''),
      project_name = coalesce(trim(p_changes->>'projectName'), ''),
      approval_status = 'SUBMITTED',
      execution_status = 'NOT_LINKED',
      reserved_amount = 0,
      submitted_at = now(),
      approved_at = null,
      rejected_at = null,
      updated_at = now()
  where id = p_document_id;

  update approval.approval_steps
  set status = case when step_order = 1 then 'PENDING' else 'WAITING' end,
      comment = null,
      acted_at = null
  where document_id = p_document_id;

  update approval.budget_reservations
  set status = 'RELEASED',
      released_amount = amount,
      release_reason = '반려 문서 재상신',
      updated_at = now()
  where document_id = p_document_id and status = 'ACTIVE';

  insert into approval.audit_logs(
    document_id,
    action_type,
    actor_label,
    comment,
    before_data,
    after_data
  ) values (
    p_document_id,
    'RESUBMITTED',
    p_actor_label,
    '반려 문서 수정 후 재상신',
    to_jsonb(v_before),
    p_changes || jsonb_build_object('approval_status', 'SUBMITTED')
  );

  return 'SUBMITTED';
end;
$$;

revoke all on function approval.resubmit_document(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function approval.resubmit_document(uuid, text, jsonb) to service_role;
