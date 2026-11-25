begin;
do $$
declare
  org uuid := gen_random_uuid();
  admin uuid := gen_random_uuid();
  writer uuid := gen_random_uuid();
  other_writer uuid := gen_random_uuid();
  subject_id uuid := gen_random_uuid();
  credit_id uuid := gen_random_uuid();
  budget uuid := gen_random_uuid();
  detail uuid := gen_random_uuid();
  voucher uuid := gen_random_uuid();
  rid text := gen_random_uuid()::text;
  original jsonb;
  result jsonb;
  classification jsonb;
begin
  insert into core.organizations(id,name,status) values(org,'Correction test','active');
  insert into auth.users(id) values(admin),(writer),(other_writer);
  insert into finance.reimbursement_members values
    (org,admin,'Admin',array['ADMIN'],true),(org,writer,'Writer',array['PAY'],true),(org,other_writer,'Writer',array['PAY'],true);
  insert into approval.budgets(id,organization_id,fiscal_year,budget_item,approved_amount,monthly_amount,mapping_status)
    values(budget,org,2026,'Test operating budget',12000,1000,'CONFIRMED');
  insert into finance.expense_detail_items(id,budget_id,code,group_name,name)
    values(detail,budget,'TEST-DETAIL','Expense','Test detail');
  insert into finance.account_subjects(id,organization_id,code,name,subject_type)
    values(subject_id,org,'TEST-EXP','Test expense','지출'),(credit_id,org,'TEST-BANK','Test deposit','자산');
  insert into finance.account_subject_budget_links(organization_id,account_subject_id,budget_id,confirmed_by)
    values(org,subject_id,budget,admin);
  original := jsonb_build_object('id',rid,'approvalStatus','승인완료','paymentStatus','지급완료',
    'resolutionType','SINGLE','reason','Original purpose','subject','Original subject','totalPaymentAmount',100,
    'history','[]'::jsonb,'approvalLine','[{"status":"승인완료"}]'::jsonb);
  insert into finance.expense_resolutions(id,organization_id,resolution_no,subject,author_label,approval_status,
    payment_status,total_payment_amount,actual_expense_date,resolution_data)
    values(rid,org,'CORRECT-TEST','Original subject','Writer','승인완료','지급완료',100,'2026-01-20',original);
  insert into finance.expense_authorization_bindings(resolution_id,organization_id,author_user_id,steps,version,bound_by,binding_reason)
    values(rid,org,writer,'[]',1,admin,'Fixture');
  insert into finance.vouchers(id,organization_id,voucher_no,voucher_date,approval_status,expense_resolution_id)
    values(voucher,org,'CORRECT-TEST-V','2026-01-20','승인완료',rid);
  insert into finance.voucher_lines(voucher_id,account_subject_id,description,debit_amount,credit_amount,sort_order)
    values(voucher,null,'Expense',100,0,1),(voucher,credit_id,'Deposit',0,100,2);

  begin
    perform finance.correct_approved_expense_resolution(org,other_writer,rid,0,'Fix', '{"reason":"Forged"}','actor');
    raise exception 'TEST: unbound writer changed record';
  exception when others then if sqlerrm not like '%연결된 작성자%' then raise; end if; end;
  begin
    perform finance.correct_approved_expense_resolution(org,admin,rid,0,'Fix','{"totalPaymentAmount":999}','amount');
    raise exception 'TEST: amount was editable';
  exception when others then if sqlerrm not like '%수정할 항목%' then raise; end if; end;
  result := finance.correct_approved_expense_resolution(org,writer,rid,0,'Typo fix','{"reason":"Corrected purpose","memo":"Internal"}','text');
  if result->>'reason'<>'Corrected purpose' or result->'approvalLine' is distinct from original->'approvalLine'
    or result->>'paymentStatus'<>'지급완료' or result->>'correctionRevision'<>'1'
    or not exists (select 1 from finance.expense_workflow_audit_logs where resolution_id=rid and actor_id=writer and before_data=original) then
    raise exception 'TEST: text correction did not preserve approval or record audit';
  end if;
  if finance.correct_approved_expense_resolution(org,writer,rid,0,'Typo fix','{"reason":"Corrected purpose","memo":"Internal"}','text')<>result then
    raise exception 'TEST: retry was not idempotent';
  end if;
  begin
    perform finance.correct_approved_expense_resolution(org,admin,rid,0,'Fix','{"memo":"Stale"}','stale');
    raise exception 'TEST: stale correction succeeded';
  exception when others then if sqlerrm not like '%먼저 정정%' then raise; end if; end;

  classification := jsonb_build_object('classification',jsonb_build_object('accountId',subject_id,'budgetId',budget,'detailId',detail));
  if jsonb_array_length(finance.approved_expense_correction_options(org,admin,rid)->'options')<>1 then
    raise exception 'TEST: active account/budget/detail option missing';
  end if;
  result := finance.correct_approved_expense_resolution(org,admin,rid,1,'Reclassify expense',classification,'classify');
  if result->>'correctedAccountSubjectId'<>subject_id::text or result->>'correctionRevision'<>'2'
    or not exists (select 1 from finance.expense_resolutions where id=rid and budget_id=budget and expense_detail_id=detail)
    or not exists (select 1 from finance.voucher_lines where voucher_id=voucher and account_subject_id=subject_id and debit_amount=100)
    or not exists (select 1 from finance.voucher_lines where voucher_id=voucher and account_subject_id=credit_id and credit_amount=100)
    or not exists (select 1 from finance.workflow_events where entity_id=voucher and action='ACCOUNTING_ACCOUNT_CORRECTION') then
    raise exception 'TEST: classification did not update budget and debit with audit';
  end if;
end
$$;
rollback;
