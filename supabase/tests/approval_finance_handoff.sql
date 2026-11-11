begin;

do $$
declare
  org uuid:=gen_random_uuid();
  other_org uuid:=gen_random_uuid();
  admin_id uuid:=gen_random_uuid();
  reader_id uuid:=gen_random_uuid();
  expense_doc uuid:=gen_random_uuid();
  legacy_doc uuid:=gen_random_uuid();
  contract_doc uuid:=gen_random_uuid();
  contract_row_id uuid:=gen_random_uuid();
  payment_one uuid:=gen_random_uuid();
  payment_two uuid:=gen_random_uuid();
  budget_id uuid:=gen_random_uuid();
  transaction_id uuid;
  evidence_file_id uuid:=gen_random_uuid();
  workflow_payment_id uuid:=gen_random_uuid();
  allocation_id uuid:=gen_random_uuid();
  recognition_voucher_id uuid:=gen_random_uuid();
  payment_voucher_id uuid:=gen_random_uuid();
  accounting_source jsonb;
  result jsonb;
  expense_result jsonb;
  repeated jsonb;
  current_version integer;
begin
  insert into core.organizations(id,name,status)
  values(org,'Approval finance handoff','active'),(other_org,'Other organization','active');
  insert into auth.users(id) values(admin_id),(reader_id);
  insert into finance.reimbursement_members(organization_id,user_id,display_name,permissions,active)
  values(org,admin_id,'Finance Admin',array['ADMIN'],true),(org,reader_id,'Reader',array['APPROVE'],true);

  insert into approval.documents(
    id,organization_id,document_no,document_type,title,purpose,body,
    drafter_label,department_label,approval_status,meeting_status,
    execution_status,amount,reserved_amount,project_name,payment_schedule
  ) values(
    expense_doc,org,'HANDOFF-EXPENSE','EXPENSE','Approved expense','Purpose','Body',
    'Writer','Operations','APPROVED','NOT_REQUIRED','BUDGET_RESERVED',1000,1000,'Project','[]'
  ),(
    contract_doc,org,'HANDOFF-CONTRACT','CONTRACT','Approved contract','Purpose','Body',
    'Writer','Operations','APPROVED','NOT_REQUIRED','EXECUTION_READY',3000,0,'Project',
    jsonb_build_array(
      jsonb_build_object('dueDate','2026-11-20','amount',1000),
      jsonb_build_object('dueDate','2026-12-20','amount',2000)
    )
  ),(
    legacy_doc,org,'HANDOFF-LEGACY','EXPENSE','Legacy linked expense','Purpose','Body',
    'Writer','Operations','APPROVED','NOT_REQUIRED','EXPENSE_DRAFT',500,0,'Project','[]'
  );
  insert into approval.document_authorization_bindings(document_id,organization_id,drafter_user_id,version)
  values(expense_doc,org,admin_id,1),(contract_doc,org,admin_id,1),(legacy_doc,org,admin_id,1);
  insert into approval.budgets(id,organization_id,fiscal_year,budget_item,approved_amount)
  values(budget_id,org,2026,'Approved expense',1000);
  insert into approval.budget_reservations(document_id,budget_id,amount)
  values(expense_doc,budget_id,1000);
  insert into approval.contracts(id,document_id,contract_no,title,partner_name,contract_amount,status)
  values(contract_row_id,contract_doc,'HANDOFF-CONTRACT-1','Approved contract','Vendor',3000,'ACTIVE');
  insert into approval.contract_payments(id,contract_id,scheduled_date,requested_amount,status)
  values(payment_one,contract_row_id,'2026-11-20',1000,'SCHEDULED'),(payment_two,contract_row_id,'2026-12-20',2000,'SCHEDULED');

  result:=approval.handoff_to_finance(org,admin_id,expense_doc,null,1,'{}','expense-handoff');
  expense_result:=result;
  repeated:=approval.handoff_to_finance(org,admin_id,expense_doc,null,1,'{}','expense-handoff');
  if repeated<>result then raise exception 'TEST: handoff retry changed result'; end if;
  if (select count(*) from approval.document_execution_links where document_id=expense_doc)<>1
     or (select count(*) from finance.expense_resolutions where approval_document_id=expense_doc)<>1
     or (select count(*) from finance.workflow_transactions where source_kind='RESOLUTION' and source_id=expense_result->>'expense_resolution_id')<>1 then
    raise exception 'TEST: atomic expense handoff missing or duplicated';
  end if;
  if not exists(select 1 from approval.audit_logs where document_id=expense_doc and action_type='FINANCE_HANDOFF' and auth_actor_id=admin_id) then
    raise exception 'TEST: authenticated handoff audit missing';
  end if;

  insert into finance.expense_resolutions(
    id,organization_id,resolution_no,author_label,approval_status,payment_status,
    total_payment_amount,subject,resolution_data,approval_document_id
  ) values(
    'approval-expense-'||legacy_doc::text,org,'HANDOFF-LEGACY-RESOLUTION','Writer','작성중','지급전',
    500,'Legacy linked expense','{}',legacy_doc
  );
  insert into approval.document_execution_links(
    organization_id,document_id,execution_kind,expense_resolution_id,status,source_snapshot,created_by
  ) values(
    org,legacy_doc,'EXPENSE','approval-expense-'||legacy_doc::text,'HANDED_OFF','{}',admin_id
  );
  result:=approval.handoff_to_finance(org,admin_id,legacy_doc,null,1,'{}','legacy-workflow-bridge');
  if result->>'expense_resolution_id' is distinct from 'approval-expense-'||legacy_doc::text
     or result->>'workflow_transaction_id' is null
     or (select count(*) from finance.expense_resolutions where approval_document_id=legacy_doc)<>1 then
    raise exception 'TEST: legacy resolution was not preserved while adding the workflow bridge';
  end if;

  transaction_id:=(expense_result->>'workflow_transaction_id')::uuid;
  insert into finance.workflow_files(
    id,organization_id,transaction_id,purpose,bucket,path,file_name,content_hash,uploaded_by
  ) values(
    evidence_file_id,org,transaction_id,'PAYMENT','test','approval-finance-payment','payment.txt','payment-hash',admin_id
  );
  insert into finance.workflow_payments(
    id,organization_id,method,flow,amount,paid_at,evidence_file_id,counterparty,reason,created_by
  ) values(
    workflow_payment_id,org,'CASH','OUT',1000,now(),evidence_file_id,'Vendor','Approved payment',admin_id
  );
  insert into finance.workflow_allocations(
    id,organization_id,payment_id,transaction_id,purpose,amount,reason,created_by
  ) values(
    allocation_id,org,workflow_payment_id,transaction_id,'DISBURSEMENT',1000,'Approved payment',admin_id
  );
  if (select status from approval.document_execution_links where workflow_transaction_id=transaction_id)<>'PAID'
     or (select execution_status from approval.documents where id=expense_doc)<>'PAID'
     or (select status from approval.budget_reservations where document_id=expense_doc)<>'CONSUMED' then
    raise exception 'TEST: integrated payment did not update approval execution';
  end if;

  accounting_source:=finance.accounting_source(org,'RECOGNITION',transaction_id);
  perform set_config('finance.accounting_voucher',recognition_voucher_id::text,true);
  insert into finance.vouchers(id,organization_id,voucher_no,voucher_date,approval_status,memo,expense_resolution_id)
  values(recognition_voucher_id,org,'HANDOFF-REC-1',current_date,'승인대기','Recognition',expense_result->>'expense_resolution_id');
  insert into finance.workflow_voucher_controls(voucher_id,organization_id,created_by,updated_by)
  values(recognition_voucher_id,org,admin_id,admin_id);
  insert into finance.workflow_voucher_links(voucher_id,organization_id,source_kind,source_id,source_signature,source_snapshot)
  values(recognition_voucher_id,org,'RECOGNITION',transaction_id,accounting_source->>'signature',accounting_source->'snapshot');
  update finance.vouchers set approval_status='승인완료' where id=recognition_voucher_id;
  if (select status from approval.document_execution_links where workflow_transaction_id=transaction_id)<>'PAID' then
    raise exception 'TEST: recognition voucher alone completed execution';
  end if;

  accounting_source:=finance.accounting_source(org,'PAYMENT',workflow_payment_id);
  perform set_config('finance.accounting_voucher',payment_voucher_id::text,true);
  insert into finance.vouchers(id,organization_id,voucher_no,voucher_date,approval_status,memo)
  values(payment_voucher_id,org,'HANDOFF-PAY-1',current_date,'승인대기','Payment');
  insert into finance.workflow_voucher_controls(voucher_id,organization_id,created_by,updated_by)
  values(payment_voucher_id,org,admin_id,admin_id);
  insert into finance.workflow_voucher_links(voucher_id,organization_id,source_kind,source_id,source_signature,source_snapshot)
  values(payment_voucher_id,org,'PAYMENT',workflow_payment_id,accounting_source->>'signature',accounting_source->'snapshot');
  update finance.vouchers set approval_status='승인완료' where id=payment_voucher_id;
  if (select status from approval.document_execution_links where workflow_transaction_id=transaction_id)<>'VOUCHER_POSTED'
     or (select execution_status from approval.documents where id=expense_doc)<>'VOUCHER_POSTED' then
    raise exception 'TEST: current recognition and payment vouchers did not complete execution';
  end if;

  insert into finance.workflow_allocation_reversals(organization_id,allocation_id,reason,created_by)
  values(org,allocation_id,'Payment correction',admin_id);
  if (select status from approval.document_execution_links where workflow_transaction_id=transaction_id)<>'HANDED_OFF'
     or (select execution_status from approval.documents where id=expense_doc)<>'EXPENSE_DRAFT'
     or (select status from approval.budget_reservations where document_id=expense_doc)<>'ACTIVE'
     or (select reserved_amount from approval.documents where id=expense_doc)<>1000 then
    raise exception 'TEST: payment reversal did not reopen approval execution and reservation';
  end if;

  begin
    perform approval.handoff_to_finance(org,reader_id,expense_doc,null,2,'{}','reader-handoff');
    raise exception 'TEST: non-admin handoff accepted';
  exception when others then
    if sqlerrm like 'TEST:%' then raise; end if;
  end;
  begin
    perform approval.handoff_to_finance(other_org,admin_id,expense_doc,null,2,'{}','cross-org-handoff');
    raise exception 'TEST: cross-org handoff accepted';
  exception when others then
    if sqlerrm like 'TEST:%' then raise; end if;
  end;

  select version into current_version from approval.document_authorization_bindings where document_id=contract_doc;
  perform approval.handoff_to_finance(org,admin_id,contract_doc,payment_one,current_version,'{}','contract-payment-one');
  select version into current_version from approval.document_authorization_bindings where document_id=contract_doc;
  perform approval.handoff_to_finance(org,admin_id,contract_doc,payment_two,current_version,'{}','contract-payment-two');
  if (select count(*) from approval.document_execution_links where document_id=contract_doc and execution_kind='CONTRACT_PAYMENT')<>2
     or (select count(*) from finance.expense_resolutions where approval_document_id=contract_doc)<>2
     or (select count(*) from approval.contract_payments cp where cp.contract_id=contract_row_id and cp.status='REQUESTED' and cp.expense_resolution_id is not null)<>2 then
    raise exception 'TEST: contract installments were not linked independently';
  end if;
end $$;

set local role authenticated;
do $$
begin
  begin
    perform approval.handoff_to_finance(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,0,'{}','forged');
    raise exception 'TEST: authenticated handoff executable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from approval.document_execution_links;
    raise exception 'TEST: execution links exposed';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
