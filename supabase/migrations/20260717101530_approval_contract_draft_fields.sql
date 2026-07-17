alter table approval.documents
  add column if not exists contract_payment_terms text,
  add column if not exists payment_schedule jsonb not null default '[]'::jsonb;

create or replace function approval.create_contract(p_document_id uuid,p_actor_label text,p_payment_terms text)
returns uuid language plpgsql security definer set search_path=approval,public as $$
declare v_document approval.documents%rowtype; v_contract_id uuid; v_no text;
begin
  select * into v_document from approval.documents where id=p_document_id for update;
  if v_document.document_type<>'CONTRACT' or v_document.approval_status<>'APPROVED' or v_document.meeting_status not in ('NOT_REQUIRED','APPROVED') then raise exception '결재와 의결이 완료된 계약기안만 계약으로 연결할 수 있습니다.'; end if;
  if v_document.contract_id is not null then return v_document.contract_id; end if;
  v_no:='CON-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into approval.contracts(document_id,contract_no,title,partner_id,partner_name,contract_amount,start_date,end_date,payment_terms,status)
  values(p_document_id,v_no,v_document.title,v_document.counterparty_id,coalesce(v_document.counterparty_name,'미지정'),v_document.amount,v_document.contract_start_date,v_document.contract_end_date,coalesce(nullif(p_payment_terms,''),v_document.contract_payment_terms,''),'ACTIVE') returning id into v_contract_id;
  insert into approval.contract_payments(contract_id,scheduled_date,requested_amount,status)
  select v_contract_id,nullif(item->>'dueDate','')::date,(item->>'amount')::numeric,'SCHEDULED'
  from jsonb_array_elements(v_document.payment_schedule) item where coalesce((item->>'amount')::numeric,0)>0;
  update approval.documents set contract_id=v_contract_id,execution_status=case when reserved_amount>0 then 'EXECUTION_READY' else execution_status end,updated_at=now() where id=p_document_id;
  insert into approval.audit_logs(document_id,action_type,actor_label,after_data) values(p_document_id,'CONTRACT_LINKED',p_actor_label,jsonb_build_object('contract_id',v_contract_id,'contract_no',v_no,'payment_schedule',v_document.payment_schedule));
  return v_contract_id;
end; $$;

create or replace function approval.create_contract_payment_expense(p_payment_id uuid,p_actor_label text,p_resolution_data jsonb)
returns text language plpgsql security definer set search_path=approval,finance,public as $$
declare v_payment approval.contract_payments%rowtype; v_contract approval.contracts%rowtype; v_document approval.documents%rowtype; v_year text; v_seq integer; v_no text; v_id text; v_data jsonb;
begin
  select * into v_payment from approval.contract_payments where id=p_payment_id for update;
  if not found or v_payment.status<>'SCHEDULED' then raise exception '지출결의서를 만들 수 없는 분할지급 일정입니다.'; end if;
  select * into v_contract from approval.contracts where id=v_payment.contract_id;
  select * into v_document from approval.documents where id=v_contract.document_id for update;
  if v_document.execution_status not in ('EXECUTION_READY','BUDGET_RESERVED','EXPENSE_DRAFT') then raise exception '집행 가능한 계약이 아닙니다.'; end if;
  perform pg_advisory_xact_lock(hashtext('finance.expense_resolution_no'));
  v_year:=to_char(current_date,'YYYY');
  select coalesce(max((regexp_match(resolution_no,'^지결-'||v_year||'-(\d+)$'))[1]::integer),0)+1 into v_seq from finance.expense_resolutions where resolution_no like '지결-'||v_year||'-%';
  v_no:='지결-'||v_year||'-'||lpad(v_seq::text,4,'0');v_id:='contract-payment-'||p_payment_id::text;v_data:=p_resolution_data||jsonb_build_object('id',v_id,'resolutionNo',v_no,'totalPaymentAmount',v_payment.requested_amount,'subject',v_contract.title||' 분할지급');
  insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,resolution_mode,expense_timing,input_method,execution_method,project_name,subject,total_payment_amount,settlement_status,resolution_data,approval_document_id)
  values(v_id,v_document.organization_id,v_no,p_actor_label,'작성중','지급전','SINGLE','ADVANCE','MANUAL','VENDOR_DIRECT',v_document.project_name,v_contract.title||' 분할지급',v_payment.requested_amount,'정산없음',v_data,v_document.id);
  update approval.contract_payments set expense_resolution_id=v_id,status='REQUESTED',updated_at=now() where id=p_payment_id;
  update approval.documents set expense_resolution_id=coalesce(expense_resolution_id,v_id),execution_status='EXPENSE_DRAFT',updated_at=now() where id=v_document.id;
  insert into approval.audit_logs(document_id,action_type,actor_label,after_data) values(v_document.id,'CONTRACT_PAYMENT_REQUESTED',p_actor_label,jsonb_build_object('payment_id',p_payment_id,'amount',v_payment.requested_amount,'resolution_id',v_id));
  return v_id;
end; $$;
grant execute on function approval.create_contract_payment_expense(uuid,text,jsonb) to service_role;

create or replace function approval.sync_contract_payment() returns trigger language plpgsql security definer set search_path=approval,finance,public as $$
declare v_contract_id uuid;
begin
  if new.payment_status='지급완료' and old.payment_status is distinct from new.payment_status then
    update approval.contract_payments set paid_amount=coalesce(new.actual_paid_amount,new.total_payment_amount),status='PAID',updated_at=now() where expense_resolution_id=new.id returning contract_id into v_contract_id;
    if v_contract_id is not null then update approval.contracts set paid_amount=(select coalesce(sum(paid_amount),0) from approval.contract_payments where contract_id=v_contract_id and status='PAID'),updated_at=now() where id=v_contract_id; end if;
  end if;return new;
end; $$;
drop trigger if exists approval_sync_contract_payment on finance.expense_resolutions;
create trigger approval_sync_contract_payment after update of payment_status,actual_paid_amount on finance.expense_resolutions for each row execute function approval.sync_contract_payment();
