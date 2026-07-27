alter table finance.expense_compliance_settings
  add column if not exists allow_direct_expense boolean not null default true,
  add column if not exists direct_expense_limit numeric(16,0) not null default 5000000 check (direct_expense_limit >= 0),
  add column if not exists direct_expense_required_keywords text[] not null default array['신규 계약','조합원 환불','추가부담','차입','상환','소송','토지매입','예산 외'];

alter table finance.expense_resolutions
  add column if not exists creation_source text not null default 'DIRECT' check (creation_source in ('DIRECT','APPROVAL_LINKED','SMALL_EXPENSE','CONTRACT_PAYMENT')),
  add column if not exists direct_expense_decision text not null default 'ALLOWED' check (direct_expense_decision in ('ALLOWED','RECOMMENDED','REQUIRED')),
  add column if not exists direct_expense_reasons text[] not null default '{}',
  add column if not exists approval_skip_reason text;

create index if not exists expense_resolutions_creation_source_idx on finance.expense_resolutions(creation_source) where deleted_at is null;

create or replace function finance.sync_expense_governance_columns() returns trigger
language plpgsql set search_path=finance,approval,public as $$
begin
  new.creation_source := coalesce(nullif(new.resolution_data->>'creationSource',''), case when new.approval_document_id is not null then 'APPROVAL_LINKED' else new.creation_source end, 'DIRECT');
  new.direct_expense_decision := coalesce(nullif(new.resolution_data->>'directExpenseDecision',''), new.direct_expense_decision, 'ALLOWED');
  new.direct_expense_reasons := case when jsonb_typeof(new.resolution_data->'directExpenseReasons')='array' then array(select jsonb_array_elements_text(new.resolution_data->'directExpenseReasons')) else coalesce(new.direct_expense_reasons,'{}') end;
  new.approval_skip_reason := coalesce(nullif(new.resolution_data->>'approvalSkipReason',''),new.approval_skip_reason);
  return new;
end; $$;

drop trigger if exists finance_sync_expense_governance_columns on finance.expense_resolutions;
create trigger finance_sync_expense_governance_columns before insert or update of resolution_data,approval_document_id on finance.expense_resolutions for each row execute function finance.sync_expense_governance_columns();

create or replace function finance.guard_expense_governance() returns trigger
language plpgsql security definer set search_path=finance,approval,public as $$
declare v_document approval.documents%rowtype; v_governed boolean;
begin
  v_governed := new.resolution_data ? 'creationSource' or new.approval_document_id is not null;
  if not v_governed then return new; end if;
  if not ((new.approval_status='승인완료' and old.approval_status is distinct from new.approval_status) or (new.payment_status='지급완료' and old.payment_status is distinct from new.payment_status)) then return new; end if;
  if new.approval_document_id is not null then
    select * into v_document from approval.documents where id=new.approval_document_id and deleted_at is null;
    if not found or v_document.approval_status<>'APPROVED' then raise exception '승인 완료된 기안만 지출결의에 연결할 수 있습니다.'; end if;
    if new.total_payment_amount>v_document.amount then raise exception '지출금액이 기안 승인금액을 초과했습니다.'; end if;
  end if;
  if new.direct_expense_decision='REQUIRED' and new.approval_document_id is null then raise exception '이 지출은 승인된 기안을 연결해야 합니다.'; end if;
  if new.creation_source='APPROVAL_LINKED' and new.approval_document_id is null then raise exception '기안 연결 지출결의에 연결 문서가 없습니다.'; end if;
  if new.creation_source='DIRECT' and coalesce(trim(new.approval_skip_reason),'')='' then raise exception '기안 생략 사유가 필요합니다.'; end if;
  return new;
end; $$;

drop trigger if exists finance_guard_expense_governance on finance.expense_resolutions;
create trigger finance_guard_expense_governance before update of approval_status,payment_status on finance.expense_resolutions for each row execute function finance.guard_expense_governance();
