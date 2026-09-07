-- Additive, normalized workflow foundation. No historical source row is migrated or rewritten.
create table finance.workflow_transactions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references core.organizations(id),
 source_kind text not null check(source_kind in ('RESOLUTION','QUICK','PERSONAL','COLLECTION','REFUND','ADVANCE','TRANSFER')),
 source_id text not null,
 owner_id uuid references auth.users(id), created_by uuid not null references auth.users(id),
 title text not null, amount numeric(16,0) not null check(amount>0),
 legacy_paid_amount numeric(16,0) check(legacy_paid_amount>=0),
 legacy_payment_complete boolean not null default false,
 payment_review_required boolean not null default false,
 source_snapshot jsonb not null, source_signature text not null,
 route text not null default 'UNKNOWN' check(route in ('UNKNOWN','TRUST_DIRECT','OPERATING')),
 contract_version_id uuid,
 revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,source_kind,source_id), unique(organization_id,id)
);

create table finance.workflow_contract_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references core.organizations(id),
 contract_key uuid not null, version integer not null check(version>0),
 name text not null, trustee text not null, reference text not null,
 management_account_id uuid not null references finance.bank_accounts(id),
 status text not null check(status in ('DRAFT','VERIFIED','RETIRED')),
 conditions jsonb not null default '{}',
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 verified_by uuid references auth.users(id), verified_at timestamptz,
 unique(organization_id,contract_key,version), unique(organization_id,id)
);
alter table finance.workflow_transactions add foreign key(organization_id,contract_version_id)
 references finance.workflow_contract_versions(organization_id,id);

create table finance.workflow_trust_requests (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references core.organizations(id),
 request_no text not null, title text not null, request_date date,
 contract_version_id uuid not null, receipt_reference text not null default '',
 status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','REVIEWING','SUPPLEMENT','PARTIAL','APPROVED','REJECTED','WITHDRAWAL_PENDING','WITHDRAWN')),
 revision integer not null default 0, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,request_no), unique(organization_id,id),
 foreign key(organization_id,contract_version_id) references finance.workflow_contract_versions(organization_id,id)
);
create table finance.workflow_trust_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 request_id uuid not null, transaction_id uuid not null,
 requested_amount numeric(16,0) not null check(requested_amount>0),
 approved_amount numeric(16,0) not null default 0 check(approved_amount>=0 and approved_amount<=requested_amount),
 status text not null default 'PENDING' check(status in ('PENDING','REVIEWING','SUPPLEMENT','APPROVED','PARTIAL','REJECTED','WITHDRAWAL_PENDING','WITHDRAWN')),
 withdrawal_from_status text, reason text not null default '', needs_review boolean not null default false,
 source_revision integer, unique(request_id,transaction_id), unique(organization_id,id),
 foreign key(organization_id,request_id) references finance.workflow_trust_requests(organization_id,id),
 foreign key(organization_id,transaction_id) references finance.workflow_transactions(organization_id,id),
 check((status='APPROVED' and approved_amount=requested_amount) or
       (status='PARTIAL' and approved_amount>0 and approved_amount<requested_amount) or
       (status in ('PENDING','REVIEWING','SUPPLEMENT','REJECTED','WITHDRAWN') and approved_amount=0) or status='WITHDRAWAL_PENDING')
);
create table finance.workflow_submissions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, request_id uuid not null,
 revision integer not null, snapshot jsonb not null, submitted_by uuid not null references auth.users(id),
 submitted_at timestamptz not null default now(), unique(request_id,revision),
 foreign key(organization_id,request_id) references finance.workflow_trust_requests(organization_id,id)
);
create table finance.workflow_files (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references core.organizations(id),
 request_id uuid, transaction_id uuid, purpose text not null check(purpose in ('REQUEST','REPLY','EVIDENCE','CONTRACT','PAYMENT')),
 bucket text not null, path text not null, file_name text not null, content_hash text not null,
 uploaded_by uuid not null references auth.users(id), uploaded_at timestamptz not null default now(),
 unique(bucket,path), unique(organization_id,id),
 foreign key(organization_id,request_id) references finance.workflow_trust_requests(organization_id,id),
 foreign key(organization_id,transaction_id) references finance.workflow_transactions(organization_id,id)
);
create table finance.workflow_payments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references core.organizations(id),
 bank_transaction_id uuid references finance.bank_transactions(id),
 method text not null check(method in ('BANK','CASH')), flow text not null check(flow in ('OUT','IN')),
 amount numeric(16,0) not null check(amount>0), paid_at timestamptz not null,
 evidence_file_id uuid, counterparty text not null, reason text not null check(length(trim(reason))>0),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(bank_transaction_id), unique(organization_id,id),
 foreign key(organization_id,evidence_file_id) references finance.workflow_files(organization_id,id),
 check((method='BANK' and bank_transaction_id is not null) or (method='CASH' and bank_transaction_id is null and evidence_file_id is not null))
);
create table finance.workflow_allocations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 payment_id uuid not null, transaction_id uuid not null, trust_item_id uuid,
 purpose text not null check(purpose in ('DISBURSEMENT','RETURN')),
 amount numeric(16,0) not null check(amount>0), original_allocation_id uuid,
 reason text not null check(length(trim(reason))>0), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,payment_id) references finance.workflow_payments(organization_id,id),
 foreign key(organization_id,transaction_id) references finance.workflow_transactions(organization_id,id),
 foreign key(organization_id,trust_item_id) references finance.workflow_trust_items(organization_id,id),
 foreign key(organization_id,original_allocation_id) references finance.workflow_allocations(organization_id,id),
 check((purpose='RETURN' and original_allocation_id is not null) or (purpose='DISBURSEMENT' and original_allocation_id is null))
);
create table finance.workflow_allocation_reversals (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, allocation_id uuid not null unique,
 reason text not null check(length(trim(reason))>0), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(organization_id,allocation_id) references finance.workflow_allocations(organization_id,id)
);
create table finance.workflow_transfers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references core.organizations(id),
 withdrawal_id uuid not null unique references finance.bank_transactions(id), deposit_id uuid not null unique references finance.bank_transactions(id),
 reason text not null check(length(trim(reason))>0), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(withdrawal_id<>deposit_id)
);
create table finance.workflow_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references core.organizations(id),
 actor_id uuid not null references auth.users(id), entity_id uuid, action text not null, reason text not null default '',
 before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create table finance.workflow_operations (
 organization_id uuid not null references core.organizations(id), operation_key text not null,
 actor_id uuid not null references auth.users(id), command text not null, input jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(organization_id,operation_key)
);

create index workflow_tx_owner on finance.workflow_transactions(organization_id,owner_id);
-- A cash receipt identifies one actual payment; that payment can have many allocations.
create unique index workflow_cash_receipt_once on finance.workflow_payments(evidence_file_id) where method='CASH';
create index workflow_alloc_tx on finance.workflow_allocations(organization_id,transaction_id);
create index workflow_alloc_payment on finance.workflow_allocations(payment_id);
create index workflow_alloc_trust on finance.workflow_allocations(trust_item_id);
create index workflow_items_tx on finance.workflow_trust_items(organization_id,transaction_id);
create index workflow_events_org on finance.workflow_events(organization_id,created_at desc);

-- Service-only commands receive the actor solely from Auth-validated server context.
-- No client-supplied display label is used as authorization.
create function finance.workflow_actor(p_org uuid,p_actor uuid,p_permission text default null)
returns finance.reimbursement_members language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members;
begin
 select * into m from finance.reimbursement_members where organization_id=p_org and user_id=p_actor and active;
 if not found then raise exception '활성 조직 권한이 필요합니다.'; end if;
 if p_permission is not null and not ('ADMIN'=any(m.permissions) or p_permission=any(m.permissions)) then
  raise exception '이 업무를 처리할 권한이 없습니다.';
 end if;
 return m;
end $$;

create function finance.workflow_source(p_org uuid,p_kind text,p_id text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r jsonb; amount numeric; paid numeric; complete boolean:=false; review boolean:=false;
 title text; owner_id uuid; approved boolean:=false; can_pay boolean:=false; snapshot jsonb;
begin
 if p_kind='RESOLUTION' then
  select to_jsonb(e) into r from finance.expense_resolutions e where e.organization_id=p_org and e.id=p_id and e.deleted_at is null;
  if r is null then raise exception '조직의 지출 원본을 찾을 수 없습니다.'; end if;
  amount:=(r->>'total_payment_amount')::numeric; paid:=(r->>'actual_paid_amount')::numeric;
  complete:=r->>'payment_status' in ('지급완료','정산완료');
  review:=complete and paid is null;
  title:=coalesce(nullif(r->>'subject',''),r->>'resolution_no');
  approved:=r->>'approval_status'='승인완료';
  if r->>'approval_document_id' is not null then
   approved:=approved and exists(select 1 from approval.documents d where d.organization_id=p_org and d.id=(r->>'approval_document_id')::uuid and d.deleted_at is null
     and d.approval_status='APPROVED' and d.meeting_status in ('NOT_REQUIRED','APPROVED') and (not d.is_out_of_budget or d.meeting_status='APPROVED'));
  end if;
  can_pay:=approved and not complete and coalesce(r->>'execution_method','')<>'AUTHORIZATION_ONLY'
   and coalesce(r->>'expense_burden_type','') not in ('CORPORATE_CARD','ORGANIZATION_PAID','CASH')
   and r->>'bank_transaction_id' is null;
  snapshot:=jsonb_build_object('number',r->'resolution_no','approval',r->'approval_status','approvalDocumentId',r->'approval_document_id',
   'recipient',coalesce(nullif(r->>'settlement_recipient_label',''),r#>>'{resolution_data,accountHolder}'),
   'account',r#>'{resolution_data,paymentAccountNo}','counterparty',r#>'{resolution_data,paymentTarget}',
   'transactionDate',r->'actual_expense_date','accountingDate',r->'accounting_date','budget',r#>'{resolution_data,budgetItem}',
   'dueDate',r->'settlement_due_date','evidenceStatus',r->'evidence_status','legacyBankId',r->'bank_transaction_id',
   'burden',r->'expense_burden_type','execution',r->'execution_method',
   'itemsSignature',md5(coalesce(r#>'{resolution_data,expenseItems}','[]'::jsonb)::text));
 elsif p_kind='QUICK' then
  select to_jsonb(q) into r from finance.quick_expense_records q where q.organization_id=p_org and q.id::text=p_id;
  if r is null then raise exception '조직의 간편지출 원본을 찾을 수 없습니다.'; end if;
  amount:=(r->>'amount')::numeric; title:=r->>'usage_description';
  -- Usage is not reimbursement; card usage is not the later card-bill withdrawal.
  paid:=null; complete:=false; review:=true; can_pay:=false;
  snapshot:=jsonb_build_object('approval',r->'record_status','method',r->'payment_method','counterparty',r->'counterparty',
   'transactionDate',r->'occurred_at','budget',r->'budget_item','evidenceStatus',r->'evidence_status',
   'legacyBankId',r->'bank_transaction_id','legacyCardId',r->'corporate_card_transaction_id','linkedResolutionId',r->'linked_resolution_id');
 elsif p_kind='PERSONAL' then
  select to_jsonb(x) into r from finance.personal_reimbursements x where x.organization_id=p_org and x.id::text=p_id;
  if r is null then raise exception '조직의 개인 정산 원본을 찾을 수 없습니다.'; end if;
  amount:=(r->>'amount')::numeric; title:=(r->>'merchant')||' · '||(r->>'purpose'); owner_id:=(r->>'applicant_id')::uuid;
  complete:=r->>'status'='PAID'; paid:=case when complete then amount else 0 end;
  approved:=r->>'status' in ('APPROVED','PAID'); can_pay:=r->>'status'='APPROVED';
  snapshot:=jsonb_build_object('approval',r->'status','recipientUserId',r->'applicant_id','counterparty',r->'merchant',
    'transactionDate',r->'used_on','accountingDate',r->'budget_month','budgetId',r->'budget_id','legacyBankId',r->'bank_transaction_id',
    'sourceQuickId',r->'source_quick_id','evidencePath',r->'evidence_path');
 else raise exception '이 원본 종류의 등록 경로는 아직 연결되지 않았습니다.';
 end if;
 if amount is null or amount<=0 or amount<>trunc(amount) then raise exception '양의 원 단위 금액이 필요합니다.'; end if;
 snapshot:=snapshot||jsonb_build_object('amount',amount,'legacyPaid',paid,'legacyComplete',complete,'title',title);
 return jsonb_build_object('title',title,'amount',amount,'owner_id',owner_id,'legacy_paid_amount',paid,
  'legacy_payment_complete',complete,'payment_review_required',review,'approved',approved,'can_pay',can_pay,
  'snapshot',snapshot,'signature',md5(snapshot::text));
end $$;

create function finance.workflow_transaction_amounts(p_org uuid,p_tx uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 with effective as (
 select a.* from finance.workflow_allocations a where a.organization_id=p_org and a.transaction_id=p_tx
 and not exists(select 1 from finance.workflow_allocation_reversals r where r.allocation_id=a.id)
 ), totals as (
 select coalesce(sum(case when purpose='RETURN' then -amount else amount end),0) paid from effective
 ), trust as (
 select coalesce(sum(case when i.status in ('REVIEWING','SUPPLEMENT') or (i.status='WITHDRAWAL_PENDING' and i.withdrawal_from_status in ('REVIEWING','SUPPLEMENT')) then i.requested_amount else 0 end),0) pending,
 coalesce(sum(case when i.status in ('APPROVED','PARTIAL') or (i.status='WITHDRAWAL_PENDING' and i.withdrawal_from_status in ('APPROVED','PARTIAL')) then i.approved_amount else 0 end),0) approved,
 coalesce(sum(case when i.status in ('APPROVED','PARTIAL') or (i.status='WITHDRAWAL_PENDING' and i.withdrawal_from_status in ('APPROVED','PARTIAL')) then greatest(0,i.approved_amount-coalesce((select sum(case when e.purpose='RETURN' then -e.amount else e.amount end) from effective e where e.trust_item_id=i.id),0)) else 0 end),0) approved_unpaid
 from finance.workflow_trust_items i where i.organization_id=p_org and i.transaction_id=p_tx
 ) select jsonb_build_object('amount',t.amount,'known_new_paid',totals.paid,
 'paid',case when t.payment_review_required then null else coalesce(t.legacy_paid_amount,0)+totals.paid end,
 'payment_review_required',t.payment_review_required,'legacy_payment_complete',t.legacy_payment_complete,
 'balance',case when t.payment_review_required then null else t.amount-coalesce(t.legacy_paid_amount,0)-totals.paid end,
 'remaining',case when t.payment_review_required then null else greatest(0,t.amount-coalesce(t.legacy_paid_amount,0)-totals.paid) end,
 'overpaid',case when t.payment_review_required then null else greatest(0,coalesce(t.legacy_paid_amount,0)+totals.paid-t.amount) end,
 'pending',trust.pending,'approved',trust.approved,'approved_unpaid',trust.approved_unpaid,
 'requestable',case when t.payment_review_required then null else greatest(0,t.amount-coalesce(t.legacy_paid_amount,0)-totals.paid-trust.pending-trust.approved_unpaid) end)
 from finance.workflow_transactions t cross join totals cross join trust where t.organization_id=p_org and t.id=p_tx;
$$;

create function finance.workflow_read(p_org uuid,p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members; whole boolean; result jsonb;
begin
 m:=finance.workflow_actor(p_org,p_actor); whole:=m.permissions && array['ADMIN','APPROVE','PAY','CLOSE','SENIOR'];
 select jsonb_build_object('transactions',coalesce(jsonb_agg(
  (to_jsonb(t)-'source_snapshot')||jsonb_build_object('source_snapshot',(t.source_snapshot-'account')||
    jsonb_build_object('accountMasked',case when length(coalesce(t.source_snapshot->>'account',''))>0 then '***'||right(t.source_snapshot->>'account',4) else '' end),
    'amounts',finance.workflow_transaction_amounts(p_org,t.id)) order by t.created_at desc),'[]'))
 into result from finance.workflow_transactions t where t.organization_id=p_org and (whole or t.owner_id=p_actor or t.created_by=p_actor);
 return result||jsonb_build_object('payments',case when whole then coalesce((select jsonb_agg(to_jsonb(p) order by p.paid_at desc) from finance.workflow_payments p where p.organization_id=p_org),'[]') else '[]'::jsonb end,
  'allocations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('reversed',exists(select 1 from finance.workflow_allocation_reversals r where r.allocation_id=a.id))) from finance.workflow_allocations a join finance.workflow_transactions t on t.id=a.transaction_id where a.organization_id=p_org and (whole or t.owner_id=p_actor or t.created_by=p_actor)),'[]'));
end $$;

create function finance.workflow_bank_available(p_org uuid,p_bank uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from finance.bank_transactions b join finance.bank_accounts a on a.id=b.bank_account_id
  where b.id=p_bank and b.organization_id=p_org and b.deleted_at is null and a.organization_id=p_org and a.deleted_at is null)
 and not exists(select 1 from finance.expense_resolutions e where e.bank_transaction_id=p_bank and e.deleted_at is null)
 and not exists(select 1 from finance.quick_expense_records q where q.bank_transaction_id=p_bank)
 and not exists(select 1 from finance.personal_reimbursements r where r.bank_transaction_id=p_bank)
 and not exists(select 1 from finance.workflow_transfers t where t.withdrawal_id=p_bank or t.deposit_id=p_bank);
$$;

create function finance.workflow_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; op finance.workflow_operations; tx finance.workflow_transactions; fresh jsonb; before_value jsonb; after_value jsonb;
 bank finance.bank_transactions; bank_in finance.bank_transactions; pay finance.workflow_payments; item jsonb; totals jsonb;
 contract finance.workflow_contract_versions; trust finance.workflow_trust_items; orig finance.workflow_allocations;
 result jsonb; entity uuid; n numeric; used numeric; reason text; required_role text; txid uuid; trustid uuid;
begin
 if p_org is null or p_actor is null or coalesce(length(trim(p_key)),0) not between 1 and 200 or jsonb_typeof(p_data) is distinct from 'object' then raise exception '처리 정보가 올바르지 않습니다.'; end if;
 required_role:=case when p_command in ('PAYMENT_RECORD','PAYMENT_ALLOCATE','ALLOCATION_REVERSE','TRANSFER') then 'PAY' when p_command='REFRESH' then 'APPROVE' else null end;
 m:=finance.workflow_actor(p_org,p_actor,required_role);
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
 select * into op from finance.workflow_operations where organization_id=p_org and operation_key=p_key;
 if found then
  if op.actor_id<>p_actor or op.command<>p_command or op.input<>p_data then raise exception '다른 처리에 사용된 처리키입니다.'; end if;
  return op.result;
 end if;
 reason:=trim(coalesce(p_data->>'reason',''));
 if p_command='ENROLL' then
  fresh:=finance.workflow_source(p_org,p_data->>'source_kind',p_data->>'source_id');
  if not (m.permissions && array['ADMIN','APPROVE','PAY','CLOSE','SENIOR']) and (fresh->>'owner_id') is distinct from p_actor::text then raise exception '본인의 원본만 연결할 수 있습니다.'; end if;
  select * into tx from finance.workflow_transactions where organization_id=p_org and source_kind=p_data->>'source_kind' and source_id=p_data->>'source_id';
  if not found then
   insert into finance.workflow_transactions(organization_id,source_kind,source_id,owner_id,created_by,title,amount,legacy_paid_amount,legacy_payment_complete,payment_review_required,source_snapshot,source_signature)
   values(p_org,p_data->>'source_kind',p_data->>'source_id',(fresh->>'owner_id')::uuid,p_actor,fresh->>'title',(fresh->>'amount')::numeric,
    (fresh->>'legacy_paid_amount')::numeric,(fresh->>'legacy_payment_complete')::boolean,(fresh->>'payment_review_required')::boolean,fresh->'snapshot',fresh->>'signature') returning * into tx;
  end if;
  entity:=tx.id; result:=jsonb_build_object('id',entity);
 elsif p_command='REFRESH' then
  select * into tx from finance.workflow_transactions where organization_id=p_org and id=(p_data->>'id')::uuid for update;
  if not found or reason='' then raise exception '거래와 변경 확인 사유가 필요합니다.'; end if;
  before_value:=to_jsonb(tx);
  fresh:=finance.workflow_source(p_org,tx.source_kind,tx.source_id);
  if fresh->>'signature'<>tx.source_signature then
   update finance.workflow_transactions set title=fresh->>'title',amount=(fresh->>'amount')::numeric,
    source_snapshot=fresh->'snapshot',source_signature=fresh->>'signature',revision=revision+1,updated_at=now() where id=tx.id;
   update finance.workflow_trust_items set needs_review=true where transaction_id=tx.id and status not in ('PENDING','REJECTED','WITHDRAWN');
  end if;
  select to_jsonb(t) into after_value from finance.workflow_transactions t where t.id=tx.id;
  entity:=tx.id; result:=jsonb_build_object('id',entity);
 elsif p_command='PAYMENT_RECORD' then
  if reason='' then raise exception '실제 지급 근거 확인 사유가 필요합니다.'; end if;
  if p_data->>'method'='BANK' then
   select * into bank from finance.bank_transactions where organization_id=p_org and id=(p_data->>'bank_transaction_id')::uuid and deleted_at is null for update;
   if not found or not finance.workflow_bank_available(p_org,bank.id) or (bank.withdrawal_amount>0)=(bank.deposit_amount>0) then raise exception '다른 지출에 연결되지 않은 실제 입출금 거래를 선택해주세요.'; end if;
   if bank.transacted_at>now() or greatest(bank.withdrawal_amount,bank.deposit_amount)<>trunc(greatest(bank.withdrawal_amount,bank.deposit_amount)) then raise exception '실제 거래일과 원 단위 금액을 확인해주세요.'; end if;
   select id into entity from finance.workflow_payments where bank_transaction_id=bank.id;
   if entity is null then
    insert into finance.workflow_payments(organization_id,bank_transaction_id,method,flow,amount,paid_at,counterparty,reason,created_by)
    values(p_org,bank.id,'BANK',case when bank.withdrawal_amount>0 then 'OUT' else 'IN' end,greatest(bank.withdrawal_amount,bank.deposit_amount),bank.transacted_at,coalesce(bank.counterparty,''),reason,p_actor) returning id into entity;
   end if;
  elsif p_data->>'method'='CASH' then
   n:=(p_data->>'amount')::numeric;
   if n is null or n<=0 or n<>trunc(n) or p_data->>'paid_at' is null or (p_data->>'paid_at')::timestamptz>now() or coalesce(p_data->>'counterparty','')='' then raise exception '현금 지급일·금액·수취인을 확인해주세요.'; end if;
   if not exists(select 1 from finance.workflow_files f where f.organization_id=p_org and f.id=(p_data->>'evidence_file_id')::uuid and f.purpose='PAYMENT') then raise exception '현금 지급 증빙이 필요합니다.'; end if;
   if exists(select 1 from finance.workflow_payments where evidence_file_id=(p_data->>'evidence_file_id')::uuid and method='CASH') then raise exception '이미 기록한 현금 지급 증빙입니다. 해당 지급 내역에 배분해주세요.'; end if;
   insert into finance.workflow_payments(organization_id,method,flow,amount,paid_at,counterparty,reason,evidence_file_id,created_by)
   values(p_org,'CASH',p_data->>'flow',n,(p_data->>'paid_at')::timestamptz,p_data->>'counterparty',reason,(p_data->>'evidence_file_id')::uuid,p_actor) returning id into entity;
  else raise exception '지급 근거 종류를 선택해주세요.';
  end if;
  result:=jsonb_build_object('id',entity);
 elsif p_command='PAYMENT_ALLOCATE' then
  select * into pay from finance.workflow_payments where organization_id=p_org and id=(p_data->>'payment_id')::uuid for update;
  if not found or reason='' or jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items')=0 then raise exception '지급·배분 항목·확인 사유가 필요합니다.'; end if;
  -- The receipt-month close is not a blanket accounting or cash-period lock.
  for item in select value from jsonb_array_elements(p_data->'items') loop
   txid:=(item->>'transaction_id')::uuid; trustid:=nullif(item->>'trust_item_id','')::uuid; n:=(item->>'amount')::numeric;
   if n is null or n<=0 or n<>trunc(n) then raise exception '양의 원 단위 배분금액이 필요합니다.'; end if;
   select * into tx from finance.workflow_transactions where organization_id=p_org and id=txid for update;
   if not found then raise exception '조직의 거래를 선택해주세요.'; end if;
   select coalesce(sum(a.amount),0) into used from finance.workflow_allocations a where a.payment_id=pay.id
    and not exists(select 1 from finance.workflow_allocation_reversals r where r.allocation_id=a.id);
   if used+n>pay.amount then raise exception '실제 지급의 미배분 금액을 초과합니다.'; end if;
   if item->>'purpose'='RETURN' then
    select * into orig from finance.workflow_allocations a where a.organization_id=p_org and a.id=(item->>'original_allocation_id')::uuid
     and a.transaction_id=tx.id and a.purpose='DISBURSEMENT' and not exists(select 1 from finance.workflow_allocation_reversals r where r.allocation_id=a.id);
    if not found or pay.flow<>'IN' then raise exception '반납·회수 입금과 원지급 배분을 연결해주세요.'; end if;
    if pay.paid_at<(select p.paid_at from finance.workflow_payments p where p.id=orig.payment_id) then raise exception '반납·회수 입금일은 원지급일 이후여야 합니다.'; end if;
    select coalesce(sum(a.amount),0) into used from finance.workflow_allocations a where a.original_allocation_id=orig.id and not exists(select 1 from finance.workflow_allocation_reversals r where r.allocation_id=a.id);
    if used+n>orig.amount then raise exception '원지급의 미회수 금액을 초과합니다.'; end if;
    trustid:=orig.trust_item_id;
   elsif item->>'purpose'='DISBURSEMENT' then
    if pay.flow<>'OUT' or tx.payment_review_required or tx.legacy_payment_complete then raise exception '지급 대상 또는 과거 지급 확인이 필요합니다.'; end if;
    fresh:=finance.workflow_source(p_org,tx.source_kind,tx.source_id);
    if fresh->>'signature'<>tx.source_signature or fresh->'can_pay' is distinct from 'true'::jsonb then raise exception '원본 변경·내부 승인·지급 조건을 먼저 확인해주세요.'; end if;
    if tx.source_kind='PERSONAL' and (pay.paid_at at time zone 'Asia/Seoul')::date<(fresh#>>'{snapshot,transactionDate}')::date then raise exception '개인 대납 환급일은 실제 사용일 이후여야 합니다.'; end if;
    totals:=finance.workflow_transaction_amounts(p_org,tx.id);
    if n>(totals->>'remaining')::numeric then raise exception '거래의 미지급액을 초과합니다.'; end if;
    select * into contract from finance.workflow_contract_versions where organization_id=p_org and id=tx.contract_version_id and status='VERIFIED';
    if not found or tx.route='UNKNOWN' then raise exception '계약과 집행 경로 설정이 필요합니다. 실제 입출금 기록은 유지됩니다.'; end if;
    if tx.route='TRUST_DIRECT' then
     select * into trust from finance.workflow_trust_items where organization_id=p_org and id=trustid and transaction_id=tx.id and status in ('APPROVED','PARTIAL') and not needs_review;
     if not found or trust.source_revision<>tx.revision then raise exception '유효한 신탁 승인 항목이 필요합니다.'; end if;
     if not exists(select 1 from finance.workflow_trust_requests q where q.organization_id=p_org and q.id=trust.request_id and q.contract_version_id=tx.contract_version_id and q.status not in ('DRAFT','WITHDRAWN','REJECTED')) then raise exception '지출 집행 경로와 승인받은 신탁 계약 버전이 다릅니다.'; end if;
     if pay.method<>'BANK' or not exists(select 1 from finance.bank_transactions b where b.id=pay.bank_transaction_id and b.bank_account_id=contract.management_account_id) then raise exception '계약 관리계좌의 지급 근거가 필요합니다.'; end if;
     select coalesce(sum(case when a.purpose='RETURN' then -a.amount else a.amount end),0) into used from finance.workflow_allocations a where a.trust_item_id=trust.id and not exists(select 1 from finance.workflow_allocation_reversals r where r.allocation_id=a.id);
     if used+n>trust.approved_amount then raise exception '신탁 승인액 중 미지급액을 초과합니다.'; end if;
    else
     if contract.conditions->>'operating_allowed' is distinct from 'true' or coalesce(contract.conditions->>'operating_basis','')='' then raise exception '계약상 운영계좌 집행 근거 설정이 필요합니다.'; end if;
     if trustid is not null then raise exception '집행 경로와 신탁 항목이 일치하지 않습니다.'; end if;
     if pay.method='BANK' and not exists(select 1 from finance.bank_transactions b where b.id=pay.bank_transaction_id and (contract.conditions->'operating_account_ids') ? b.bank_account_id::text) then raise exception '계약에 허용된 운영계좌를 확인해주세요.'; end if;
     if n>(totals->>'requestable')::numeric then raise exception '다른 신탁 요청·승인에 예약된 금액입니다.'; end if;
    end if;
   else raise exception '지급 또는 반납 목적을 선택해주세요.';
   end if;
   insert into finance.workflow_allocations(organization_id,payment_id,transaction_id,trust_item_id,purpose,amount,original_allocation_id,reason,created_by)
   values(p_org,pay.id,tx.id,trustid,item->>'purpose',n,nullif(item->>'original_allocation_id','')::uuid,reason,p_actor);
  end loop;
  entity:=pay.id; result:=jsonb_build_object('id',entity);
 elsif p_command='ALLOCATION_REVERSE' then
  select * into orig from finance.workflow_allocations where organization_id=p_org and id=(p_data->>'id')::uuid;
  if not found or reason='' then raise exception '정정 대상과 사유가 필요합니다.'; end if;
  if exists(select 1 from finance.workflow_allocations a where a.original_allocation_id=orig.id and not exists(select 1 from finance.workflow_allocation_reversals r where r.allocation_id=a.id)) then raise exception '반납 연결을 먼저 정정해주세요.'; end if;
  insert into finance.workflow_allocation_reversals(organization_id,allocation_id,reason,created_by) values(p_org,orig.id,reason,p_actor);
  entity:=orig.id; result:=jsonb_build_object('id',entity);
 elsif p_command='TRANSFER' then
  if reason='' then raise exception '동일 조합 계좌이체 확인 근거가 필요합니다.'; end if;
  select * into bank from finance.bank_transactions where organization_id=p_org and id=(p_data->>'withdrawal_id')::uuid and deleted_at is null for update;
  select * into bank_in from finance.bank_transactions where organization_id=p_org and id=(p_data->>'deposit_id')::uuid and deleted_at is null for update;
  if bank.id is null or bank_in.id is null or bank.withdrawal_amount<=0 or bank.deposit_amount<>0 or bank_in.deposit_amount<>bank.withdrawal_amount or bank_in.withdrawal_amount<>0 or bank.bank_account_id=bank_in.bank_account_id then raise exception '동일 조합의 다른 계좌 간 같은 금액의 입출금을 선택해주세요.'; end if;
  if bank.transacted_at>now() or bank_in.transacted_at>now() then raise exception '미래 거래는 실제 계좌이체로 확정할 수 없습니다.'; end if;
  if not finance.workflow_bank_available(p_org,bank.id) or not finance.workflow_bank_available(p_org,bank_in.id) or exists(select 1 from finance.workflow_payments p where p.bank_transaction_id in (bank.id,bank_in.id)) then raise exception '기존 지출·지급·수납에 연결된 거래입니다.'; end if;
  insert into finance.workflow_transfers(organization_id,withdrawal_id,deposit_id,reason,created_by) values(p_org,bank.id,bank_in.id,reason,p_actor) returning id into entity;
  result:=jsonb_build_object('id',entity);
 else raise exception '지원하지 않는 업무 명령입니다.';
 end if;
 insert into finance.workflow_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data) values(p_org,p_actor,entity,p_command,reason,before_value,coalesce(after_value,p_data||result));
 insert into finance.workflow_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,p_key,p_actor,p_command,p_data,result);
 return result;
end $$;

create function finance.workflow_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception '확정 근거와 감사 기록은 덮어쓰거나 삭제할 수 없습니다.'; end $$;
do $$ declare t text; begin
 foreach t in array array['workflow_submissions','workflow_files','workflow_payments','workflow_allocations','workflow_allocation_reversals','workflow_transfers','workflow_events','workflow_operations'] loop
 execute format('create trigger workflow_immutable before update or delete on finance.%I for each row execute function finance.workflow_immutable()',t);
 end loop;
 foreach t in array array['workflow_transactions','workflow_contract_versions','workflow_trust_requests','workflow_trust_items','workflow_submissions','workflow_files','workflow_payments','workflow_allocations','workflow_allocation_reversals','workflow_transfers','workflow_events','workflow_operations'] loop
 execute format('alter table finance.%I enable row level security',t);
 execute format('revoke all on finance.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update on finance.%I to service_role',t);
 execute format('create policy workflow_server on finance.%I to service_role using(true) with check(true)',t);
 end loop;
end $$;

create function finance.workflow_legacy_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare org uuid; bid uuid; tx finance.workflow_transactions;
begin
 org:=case when tg_op='INSERT' then new.organization_id else old.organization_id end;
 if org is null then if tg_op='DELETE' then return old; else return new; end if; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,739));
 if tg_table_name='bank_transactions' then
  if exists(select 1 from finance.workflow_payments where bank_transaction_id=old.id) or exists(select 1 from finance.workflow_transfers where withdrawal_id=old.id or deposit_id=old.id) then raise exception '지급·계좌이체 원장은 원본을 보존합니다. 정정 절차를 사용해주세요.'; end if;
 else
  if tg_op<>'INSERT' then
   select * into tx from finance.workflow_transactions where organization_id=org and source_id=old.id::text
    and source_kind=case tg_table_name when 'expense_resolutions' then 'RESOLUTION' when 'quick_expense_records' then 'QUICK' else 'PERSONAL' end;
   if found then
    if tg_op='DELETE' or new.organization_id is distinct from old.organization_id or (to_jsonb(new)->'deleted_at') is distinct from (to_jsonb(old)->'deleted_at') then raise exception '통합 거래에 연결된 원본을 삭제하거나 조직을 변경할 수 없습니다.'; end if;
    if (to_jsonb(new)->'actual_paid_amount') is distinct from (to_jsonb(old)->'actual_paid_amount') or (to_jsonb(new)->'bank_transaction_id') is distinct from (to_jsonb(old)->'bank_transaction_id') or
      ((to_jsonb(new)->'payment_status') is distinct from (to_jsonb(old)->'payment_status') and (to_jsonb(new)->>'payment_status' in ('지급완료','부분지급') or to_jsonb(old)->>'payment_status' in ('지급완료','부분지급'))) or
      (tg_table_name='personal_reimbursements' and ((to_jsonb(new)->>'status'='PAID') is distinct from (to_jsonb(old)->>'status'='PAID'))) then raise exception '실제 지급 변경은 통합 지급 배분에서 처리해주세요.'; end if;
    update finance.workflow_trust_items set needs_review=true where transaction_id=tx.id and status not in ('PENDING','REJECTED','WITHDRAWN') and (
      (to_jsonb(new)->'total_payment_amount') is distinct from (to_jsonb(old)->'total_payment_amount') or
      (to_jsonb(new)->'amount') is distinct from (to_jsonb(old)->'amount') or
      (to_jsonb(new)#>'{resolution_data,accountHolder}') is distinct from (to_jsonb(old)#>'{resolution_data,accountHolder}') or
      (to_jsonb(new)#>'{resolution_data,paymentAccountNo}') is distinct from (to_jsonb(old)#>'{resolution_data,paymentAccountNo}') or
      (to_jsonb(new)#>'{resolution_data,expenseItems}') is distinct from (to_jsonb(old)#>'{resolution_data,expenseItems}'));
   end if;
  end if;
  if tg_op<>'DELETE' then
   bid:=new.bank_transaction_id;
   if bid is not null and (exists(select 1 from finance.workflow_payments where bank_transaction_id=bid) or exists(select 1 from finance.workflow_transfers where withdrawal_id=bid or deposit_id=bid)) then raise exception '이미 통합 지급·이체에 연결된 계좌 거래입니다.'; end if;
  end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger workflow_legacy_guard before insert or update or delete on finance.expense_resolutions for each row execute function finance.workflow_legacy_guard();
create trigger workflow_legacy_guard before insert or update or delete on finance.quick_expense_records for each row execute function finance.workflow_legacy_guard();
create trigger workflow_legacy_guard before insert or update or delete on finance.personal_reimbursements for each row execute function finance.workflow_legacy_guard();
create trigger workflow_legacy_guard before update or delete on finance.bank_transactions for each row execute function finance.workflow_legacy_guard();
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='finance' and p.proname like 'workflow_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
