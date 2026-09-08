begin;

do $$
declare
  org uuid:=gen_random_uuid();
  closed_org uuid:=gen_random_uuid();
  no_policy_org uuid:=gen_random_uuid();
  applicant uuid:=gen_random_uuid();
  closed_applicant uuid:=gen_random_uuid();
  no_policy_applicant uuid:=gen_random_uuid();
  budget uuid:=gen_random_uuid();
  closed_budget uuid:=gen_random_uuid();
  target_request_id uuid:=gen_random_uuid();
  closed_request_id uuid:=gen_random_uuid();
  rejected_request_id uuid:=gen_random_uuid();
  used_on date:=(now() at time zone 'Asia/Seoul')::date;
  target_month date:=date_trunc('month',now() at time zone 'Asia/Seoul')::date;
  path text;
  payload jsonb;
  result jsonb;
  period finance.reimbursement_periods%rowtype;
  count_value integer;
begin
  insert into core.organizations(id,name,status) values
    (org,'Automatic reimbursement period test','active'),
    (closed_org,'Closed reimbursement period test','active'),
    (no_policy_org,'Missing policy reimbursement test','active');
  insert into auth.users(id) values(applicant),(closed_applicant),(no_policy_applicant);
  insert into finance.reimbursement_members values
    (org,applicant,'Applicant','{}',true),
    (closed_org,closed_applicant,'Closed applicant','{}',true),
    (no_policy_org,no_policy_applicant,'No policy applicant','{}',true);
  insert into finance.reimbursement_policies values
    (org,5,10,60,now()),
    (closed_org,5,10,60,now());
  insert into approval.budgets(id,organization_id,fiscal_year,budget_item,approved_amount,executed_amount,monthly_amount) values
    (budget,org,extract(year from target_month),'Test budget',1200000,0,100000),
    (closed_budget,closed_org,extract(year from target_month),'Closed test budget',1200000,0,100000);

  path:=org||'/'||applicant||'/'||target_request_id||'/receipt';
  insert into storage.objects(bucket_id,name) values('personal-reimbursements',path);
  payload:=jsonb_build_object(
    'id',target_request_id,'used_on',used_on,'budget_id',budget,'amount',10000,
    'merchant','Test merchant','purpose','Office supplies','evidence_path',path,
    'evidence_hash',repeat('a',64),'delay_reason','','source_quick_id','',
    'payment_method','PERSONAL_CARD','evidence_kind','RECEIPT','missing_receipt_reason',''
  );
  result:=finance.reimbursement_submit_with_evidence(org,applicant,payload);

  select * into period from finance.reimbursement_periods where organization_id=org and month=target_month;
  if not found or period.status<>'OPEN'
     or period.submission_deadline<>(target_month+interval '1 month')::date+4
     or period.completion_deadline<>(target_month+interval '1 month')::date+9
     or period.long_delay_days<>60
  then raise exception 'TEST: intake period was not created from policy'; end if;
  if result->>'id'<>target_request_id::text or result->>'evidence_review_status'<>'READY' then raise exception 'TEST: first request was not saved'; end if;
  if (select count(*) from finance.reimbursement_audit where organization_id=org and action='AUTO_OPEN')<>1 then raise exception 'TEST: automatic open audit missing'; end if;
  if (select count(*) from finance.reimbursement_audit where organization_id=org and request_id=target_request_id and action='SUBMIT')<>1 then raise exception 'TEST: submit audit missing'; end if;

  if finance.reimbursement_submit_with_evidence(org,applicant,payload)<>result then raise exception 'TEST: retry changed saved request'; end if;
  select count(*) into count_value from finance.reimbursement_periods where organization_id=org;
  if count_value<>1 or (select count(*) from finance.reimbursement_audit where organization_id=org and action='AUTO_OPEN')<>1 then raise exception 'TEST: retry duplicated period or audit'; end if;

  insert into finance.reimbursement_periods(organization_id,month,status,submission_deadline,completion_deadline,long_delay_days,closed_at)
  values(closed_org,target_month,'CLOSED',(target_month+interval '1 month')::date+4,(target_month+interval '1 month')::date+9,60,now());
  path:=closed_org||'/'||closed_applicant||'/'||closed_request_id||'/receipt';
  insert into storage.objects(bucket_id,name) values('personal-reimbursements',path);
  payload:=jsonb_build_object(
    'id',closed_request_id,'used_on',used_on,'budget_id',closed_budget,'amount',12000,
    'merchant','Closed merchant','purpose','Late office supplies','evidence_path',path,
    'evidence_hash',repeat('b',64),'delay_reason','마감 후 발견된 지출',
    'source_quick_id','','payment_method','PERSONAL_TRANSFER','evidence_kind','BANK_TRANSFER',
    'missing_receipt_reason','영수증 미발급'
  );
  result:=finance.reimbursement_submit_with_evidence(closed_org,closed_applicant,payload);
  if (select status from finance.reimbursement_periods where organization_id=closed_org and month=target_month)<>'CLOSED'
     or (result->>'needs_exception')::boolean is not true
  then raise exception 'TEST: closed period was reopened'; end if;
  if exists(select 1 from finance.reimbursement_audit where organization_id=closed_org and action='AUTO_OPEN') then raise exception 'TEST: existing closed period recorded as auto-opened'; end if;

  path:=no_policy_org||'/'||no_policy_applicant||'/'||rejected_request_id||'/receipt';
  insert into storage.objects(bucket_id,name) values('personal-reimbursements',path);
  begin
    perform finance.reimbursement_submit_with_evidence(no_policy_org,no_policy_applicant,jsonb_build_object(
      'id',rejected_request_id,'used_on',used_on,'budget_id',gen_random_uuid(),'amount',1000,
      'merchant','No policy merchant','purpose','Office supplies','evidence_path',path,
      'evidence_hash',repeat('c',64),'delay_reason','','source_quick_id','',
      'payment_method','CASH','evidence_kind','RECEIPT','missing_receipt_reason',''
    ));
    raise exception 'TEST: request without policy was accepted';
  exception when others then
    if sqlerrm like 'TEST:%' then raise; end if;
    if sqlerrm not like '%자동 개설에 필요한%' then raise; end if;
  end;
  if exists(select 1 from finance.reimbursement_periods where organization_id=no_policy_org) then raise exception 'TEST: period was created without policy'; end if;
end $$;

rollback;
