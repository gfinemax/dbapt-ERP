-- Connect an approved document to its finance execution records without
-- collapsing approval, payment and accounting into one mutable status row.
create table approval.document_execution_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id),
  document_id uuid not null references approval.documents(id) on delete restrict,
  execution_kind text not null check (execution_kind in ('EXPENSE','CONTRACT_PAYMENT')),
  contract_payment_id uuid references approval.contract_payments(id) on delete restrict,
  expense_resolution_id text not null references finance.expense_resolutions(id) on delete restrict,
  workflow_transaction_id uuid references finance.workflow_transactions(id) on delete restrict,
  status text not null default 'HANDED_OFF' check (status in ('HANDED_OFF','PAID','VOUCHER_POSTED','CLOSED','REVIEW_REQUIRED')),
  source_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(source_snapshot)='object'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expense_resolution_id),
  unique (workflow_transaction_id),
  check ((execution_kind='CONTRACT_PAYMENT')=(contract_payment_id is not null))
);

create unique index document_execution_regular_unique_idx
  on approval.document_execution_links(document_id,execution_kind)
  where contract_payment_id is null;
create unique index document_execution_contract_payment_unique_idx
  on approval.document_execution_links(contract_payment_id)
  where contract_payment_id is not null;
create index document_execution_document_idx
  on approval.document_execution_links(organization_id,document_id,created_at);
create index document_execution_document_fk_idx
  on approval.document_execution_links(document_id);
create index document_execution_created_by_idx
  on approval.document_execution_links(created_by)
  where created_by is not null;

alter table approval.document_execution_links enable row level security;
revoke all on approval.document_execution_links from public,anon,authenticated;
grant select,insert,update on approval.document_execution_links to service_role;
create policy document_execution_server
  on approval.document_execution_links to service_role
  using (true) with check (true);

-- A document can legitimately create several expense resolutions when a
-- contract has installments. Per-document/per-installment uniqueness now
-- belongs to document_execution_links instead of this legacy scalar FK.
drop index if exists finance.expense_resolutions_approval_document_unique_idx;
create index if not exists expense_resolutions_approval_document_idx
  on finance.expense_resolutions(approval_document_id)
  where approval_document_id is not null and deleted_at is null;

-- Preserve exact historical links. Do not infer by document title, partner or
-- amount. Contract installments are matched only by their stored resolution ID.
insert into approval.document_execution_links(
  organization_id,document_id,execution_kind,contract_payment_id,
  expense_resolution_id,workflow_transaction_id,status,source_snapshot
)
select d.organization_id,d.id,
  case when cp.id is null then 'EXPENSE' else 'CONTRACT_PAYMENT' end,
  cp.id,r.id,w.id,'HANDED_OFF',
  jsonb_build_object(
    'documentNo',d.document_no,'title',d.title,'approvedAmount',d.amount,
    'contractPaymentId',cp.id,'resolutionNo',r.resolution_no
  )
from finance.expense_resolutions r
join approval.documents d
  on d.id=r.approval_document_id and d.organization_id=r.organization_id
left join approval.contract_payments cp on cp.expense_resolution_id=r.id
left join finance.workflow_transactions w
  on w.organization_id=r.organization_id
 and w.source_kind='RESOLUTION' and w.source_id=r.id
where r.approval_document_id is not null and r.deleted_at is null
on conflict do nothing;

create function approval.handoff_to_finance(
  p_org uuid,
  p_actor uuid,
  p_document_id uuid,
  p_contract_payment_id uuid,
  p_expected_version integer,
  p_resolution_data jsonb,
  p_key text
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  m finance.reimbursement_members;
  d approval.documents;
  b approval.document_authorization_bindings;
  payment approval.contract_payments;
  contract approval.contracts;
  link approval.document_execution_links;
  op approval.document_operations;
  workflow_result jsonb;
  result jsonb;
  input_hash text;
  resolution_id text;
  resolution_no text;
  resolution_data jsonb;
  resolution_amount numeric(16,0);
  resolution_title text;
  execution_kind text;
  year_text text;
  next_sequence integer;
begin
  if p_org is null or p_actor is null or p_document_id is null
     or p_expected_version is null or p_expected_version<0
     or coalesce(length(trim(p_key)),0) not between 1 and 180
     or jsonb_typeof(p_resolution_data) is distinct from 'object' then
    raise exception '기안 인계 정보와 처리키를 확인해주세요.';
  end if;

  m:=finance.workflow_actor(p_org,p_actor);
  if not ('ADMIN'=any(m.permissions)) then
    raise exception '회계·자금 인계는 관리자만 처리할 수 있습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
  perform set_config('TimeZone','Asia/Seoul',true);
  input_hash:=md5(jsonb_build_object(
    'document_id',p_document_id,
    'contract_payment_id',p_contract_payment_id,
    'expected_version',p_expected_version,
    'resolution_data',p_resolution_data
  )::text);

  select * into op
  from approval.document_operations
  where organization_id=p_org and operation_key=p_key;
  if found then
    if op.actor_id<>p_actor or op.command<>'FINANCE_HANDOFF' or op.input_hash<>input_hash then
      raise exception '처리키가 다른 요청에 사용되었습니다.';
    end if;
    return op.result;
  end if;

  select * into d
  from approval.documents
  where id=p_document_id and organization_id=p_org and deleted_at is null
  for update;
  if not found then raise exception '조직의 기안 문서를 찾을 수 없습니다.'; end if;
  select * into b
  from approval.document_authorization_bindings
  where document_id=d.id and organization_id=p_org
  for update;
  if not found or b.version<>p_expected_version then
    raise exception '기안이 변경되었습니다. 다시 조회해주세요.';
  end if;
  if d.approval_status<>'APPROVED' or d.meeting_status not in ('NOT_REQUIRED','APPROVED') then
    raise exception '내부결재와 필요한 의결이 완료되어야 합니다.';
  end if;

  if p_contract_payment_id is null then
    execution_kind:='EXPENSE';
    select l.* into link
    from approval.document_execution_links l
    where l.organization_id=p_org and l.document_id=d.id
      and l.execution_kind='EXPENSE' and l.contract_payment_id is null
    for update;
  else
    execution_kind:='CONTRACT_PAYMENT';
    select cp.* into payment
    from approval.contract_payments cp
    join approval.contracts c on c.id=cp.contract_id
    where cp.id=p_contract_payment_id and c.document_id=d.id
    for update of cp;
    if not found then raise exception '기안의 계약 분할지급 일정을 찾을 수 없습니다.'; end if;
    select * into contract
    from approval.contracts
    where id=payment.contract_id and document_id=d.id
    for update;
    select l.* into link
    from approval.document_execution_links l
    where l.organization_id=p_org and l.contract_payment_id=p_contract_payment_id
    for update;
  end if;

  if found then
    if link.workflow_transaction_id is null then
      workflow_result:=finance.workflow_command(
        p_org,p_actor,'ENROLL',
        jsonb_build_object('source_kind','RESOLUTION','source_id',link.expense_resolution_id),
        p_key||':workflow'
      );
      update approval.document_execution_links
      set workflow_transaction_id=(workflow_result->>'id')::uuid,updated_at=now()
      where id=link.id
      returning * into link;
    end if;
    result:=jsonb_build_object(
      'document_id',d.id,
      'execution_link_id',link.id,
      'expense_resolution_id',link.expense_resolution_id,
      'workflow_transaction_id',link.workflow_transaction_id,
      'contract_payment_id',link.contract_payment_id
    );
    insert into approval.document_operations(organization_id,operation_key,actor_id,command,input_hash,result)
    values(p_org,p_key,p_actor,'FINANCE_HANDOFF',input_hash,result);
    return result;
  end if;

  if execution_kind='CONTRACT_PAYMENT' then
    if payment.status<>'SCHEDULED' then
      raise exception '지출결의를 만들 수 없는 분할지급 일정입니다.';
    end if;
    resolution_id:='contract-payment-'||payment.id::text;
    resolution_amount:=payment.requested_amount;
    resolution_title:=contract.title||' 분할지급';
  else
    if d.document_type='CONTRACT' and jsonb_array_length(coalesce(d.payment_schedule,'[]'::jsonb))>0 then
      raise exception '분할지급 계약은 지급회차별로 회계·자금에 넘겨주세요.';
    end if;
    resolution_id:='approval-expense-'||d.id::text;
    resolution_amount:=d.amount;
    resolution_title:=d.title;
  end if;

  perform pg_advisory_xact_lock(hashtext('finance.expense_resolution_no'));
  year_text:=to_char(current_date,'YYYY');
  select coalesce(max((regexp_match(r.resolution_no,'^지결-'||year_text||'-(\d+)$'))[1]::integer),0)+1
  into next_sequence
  from finance.expense_resolutions r
  where r.resolution_no like '지결-'||year_text||'-%';
  resolution_no:='지결-'||year_text||'-'||lpad(next_sequence::text,4,'0');
  resolution_data:=p_resolution_data||jsonb_build_object(
    'id',resolution_id,'resolutionNo',resolution_no,
    'totalPaymentAmount',resolution_amount,'subject',resolution_title,
    'approvalDocumentId',d.id,'approvalDocumentNo',d.document_no,
    'creationSource',case when execution_kind='CONTRACT_PAYMENT' then 'CONTRACT_PAYMENT' else 'APPROVAL_LINKED' end
  );

  insert into finance.expense_resolutions(
    id,organization_id,resolution_no,author_label,current_approver_label,
    approval_status,payment_status,resolution_mode,expense_timing,input_method,
    execution_method,project_name,subject,total_payment_amount,
    settlement_status,resolution_data,approval_document_id
  ) values(
    resolution_id,p_org,resolution_no,m.display_name,null,
    '작성중','지급전','SINGLE','ADVANCE','MANUAL',
    'VENDOR_DIRECT',d.project_name,resolution_title,resolution_amount,
    '정산없음',resolution_data,d.id
  );

  workflow_result:=finance.workflow_command(
    p_org,p_actor,'ENROLL',
    jsonb_build_object('source_kind','RESOLUTION','source_id',resolution_id),
    p_key||':workflow'
  );

  insert into approval.document_execution_links(
    organization_id,document_id,execution_kind,contract_payment_id,
    expense_resolution_id,workflow_transaction_id,status,source_snapshot,created_by
  ) values(
    p_org,d.id,execution_kind,p_contract_payment_id,
    resolution_id,(workflow_result->>'id')::uuid,'HANDED_OFF',
    jsonb_build_object(
      'documentNo',d.document_no,'title',d.title,'approvedAmount',d.amount,
      'contractPaymentId',p_contract_payment_id,'resolutionNo',resolution_no,
      'resolutionAmount',resolution_amount
    ),p_actor
  ) returning * into link;

  if p_contract_payment_id is not null then
    update approval.contract_payments
    set expense_resolution_id=resolution_id,status='REQUESTED',updated_at=now()
    where id=p_contract_payment_id;
  end if;
  update approval.documents
  set expense_resolution_id=coalesce(expense_resolution_id,resolution_id),
      execution_status='EXPENSE_DRAFT',updated_at=now()
  where id=d.id;

  result:=jsonb_build_object(
    'document_id',d.id,
    'execution_link_id',link.id,
    'expense_resolution_id',resolution_id,
    'workflow_transaction_id',link.workflow_transaction_id,
    'contract_payment_id',p_contract_payment_id
  );
  insert into approval.audit_logs(
    document_id,action_type,actor_label,auth_actor_id,after_data
  ) values(
    d.id,'FINANCE_HANDOFF',m.display_name,p_actor,
    result||jsonb_build_object('resolution_no',resolution_no,'amount',resolution_amount)
  );
  insert into approval.document_operations(
    organization_id,operation_key,actor_id,command,input_hash,result
  ) values(p_org,p_key,p_actor,'FINANCE_HANDOFF',input_hash,result);
  return result;
end $$;

revoke all on function approval.handoff_to_finance(uuid,uuid,uuid,uuid,integer,jsonb,text)
  from public,anon,authenticated;
grant execute on function approval.handoff_to_finance(uuid,uuid,uuid,uuid,integer,jsonb,text)
  to service_role;

create function approval.refresh_document_execution(p_transaction_id uuid)
returns void
language plpgsql security definer set search_path='' as $$
declare
  link approval.document_execution_links;
  document approval.documents;
  amounts jsonb;
  paid_amount numeric(16,0):=0;
  transaction_amount numeric(16,0):=0;
  aggregate_paid numeric(16,0):=0;
  old_link_status text;
  target_link_status text;
  target_document_status text;
  recognition_posted boolean:=false;
  payments_posted boolean:=false;
  all_paid boolean:=false;
  has_review boolean:=false;
  link_count integer:=0;
begin
  select l.* into link
  from approval.document_execution_links l
  where l.workflow_transaction_id=p_transaction_id
  for update;
  if not found then return; end if;

  select d.* into document
  from approval.documents d
  where d.id=link.document_id and d.organization_id=link.organization_id
  for update;
  if not found then return; end if;

  amounts:=finance.workflow_transaction_amounts(link.organization_id,p_transaction_id);
  transaction_amount:=coalesce((amounts->>'amount')::numeric,0);
  paid_amount:=coalesce((amounts->>'paid')::numeric,0);
  old_link_status:=link.status;

  if coalesce((amounts->>'payment_review_required')::boolean,false)
     or paid_amount>transaction_amount then
    target_link_status:='REVIEW_REQUIRED';
  elsif transaction_amount>0 and paid_amount>=transaction_amount then
    select exists(
      select 1
      from finance.workflow_voucher_links vl
      join finance.vouchers v on v.id=vl.voucher_id
      where vl.organization_id=link.organization_id
        and vl.source_kind='RECOGNITION'
        and vl.source_id=p_transaction_id
        and v.organization_id=link.organization_id
        and v.approval_status='승인완료'
        and v.deleted_at is null
        and vl.source_signature=finance.accounting_source_read(
          link.organization_id,vl.source_kind,vl.source_id
        )->>'signature'
    ) into recognition_posted;

    select exists(
      select 1
      from finance.workflow_allocations a
      where a.organization_id=link.organization_id
        and a.transaction_id=p_transaction_id
        and not exists(
          select 1 from finance.workflow_allocation_reversals r
          where r.allocation_id=a.id
        )
    ) and not exists(
      select 1
      from finance.workflow_allocations a
      where a.organization_id=link.organization_id
        and a.transaction_id=p_transaction_id
        and not exists(
          select 1 from finance.workflow_allocation_reversals r
          where r.allocation_id=a.id
        )
        and not exists(
          select 1
          from finance.workflow_voucher_links vl
          join finance.vouchers v on v.id=vl.voucher_id
          where vl.organization_id=link.organization_id
            and vl.source_kind='PAYMENT'
            and vl.source_id=a.payment_id
            and v.organization_id=link.organization_id
            and v.approval_status='승인완료'
            and v.deleted_at is null
            and vl.source_signature=finance.accounting_source_read(
              link.organization_id,vl.source_kind,vl.source_id
            )->>'signature'
        )
    ) into payments_posted;

    target_link_status:=case
      when recognition_posted and payments_posted then 'VOUCHER_POSTED'
      else 'PAID'
    end;
  else
    target_link_status:='HANDED_OFF';
  end if;

  update approval.document_execution_links
  set status=target_link_status,updated_at=now()
  where id=link.id;

  if link.contract_payment_id is not null then
    update approval.contract_payments
    set paid_amount=greatest(paid_amount,0),
        status=case when target_link_status in ('PAID','VOUCHER_POSTED','CLOSED') then 'PAID' else 'REQUESTED' end,
        updated_at=now()
    where id=link.contract_payment_id;

    update approval.contracts c
    set paid_amount=(
          select coalesce(sum(cp.paid_amount),0)
          from approval.contract_payments cp
          where cp.contract_id=c.id
        ),
        updated_at=now()
    where c.id=(
      select cp.contract_id from approval.contract_payments cp
      where cp.id=link.contract_payment_id
    );
  end if;

  select count(*),
         coalesce(bool_and(l.status in ('PAID','VOUCHER_POSTED','CLOSED')),false),
         coalesce(bool_or(l.status='REVIEW_REQUIRED'),false),
         coalesce(sum(greatest(coalesce((finance.workflow_transaction_amounts(
           l.organization_id,l.workflow_transaction_id
         )->>'paid')::numeric,0),0)),0)
  into link_count,all_paid,has_review,aggregate_paid
  from approval.document_execution_links l
  where l.document_id=document.id and l.organization_id=document.organization_id;

  if document.execution_status='CLOSED' then
    target_document_status:='CLOSED';
  elsif has_review then
    target_document_status:='EXPENSE_DRAFT';
  elsif link_count>0 and not exists(
    select 1 from approval.document_execution_links l
    where l.document_id=document.id and l.organization_id=document.organization_id
      and l.status not in ('VOUCHER_POSTED','CLOSED')
  ) then
    target_document_status:='VOUCHER_POSTED';
  elsif all_paid then
    target_document_status:='PAID';
  else
    target_document_status:='EXPENSE_DRAFT';
  end if;

  if has_review or aggregate_paid>document.amount then
    update approval.budget_reservations
    set status='ADJUSTMENT_REQUIRED',
        release_reason='통합 지급액이 승인 범위를 초과하거나 원본 확인이 필요함',
        updated_at=now()
    where document_id=document.id and status in ('ACTIVE','CONSUMED');
  elsif all_paid then
    update approval.budget_reservations
    set status='CONSUMED',
        released_amount=greatest(amount-aggregate_paid,0),
        release_reason=case when amount>aggregate_paid then '실제 지급액 차액 해제' else null end,
        updated_at=now()
    where document_id=document.id and status in ('ACTIVE','ADJUSTMENT_REQUIRED');
  elsif document.execution_status in ('PAID','VOUCHER_POSTED')
        or old_link_status='REVIEW_REQUIRED' then
    update approval.budget_reservations
    set status='ACTIVE',released_amount=0,release_reason=null,updated_at=now()
    where document_id=document.id and status in ('CONSUMED','ADJUSTMENT_REQUIRED');
  end if;

  update approval.documents
  set execution_status=target_document_status,
      reserved_amount=case
        when target_document_status in ('PAID','VOUCHER_POSTED','CLOSED') then 0
        else coalesce((
          select sum(r.amount) from approval.budget_reservations r
          where r.document_id=document.id and r.status='ACTIVE'
        ),reserved_amount)
      end,
      completed_at=case
        when target_document_status in ('VOUCHER_POSTED','CLOSED') then coalesce(completed_at,now())
        else null
      end,
      updated_at=now()
  where id=document.id;

  if old_link_status is distinct from target_link_status
     or document.execution_status is distinct from target_document_status then
    insert into approval.audit_logs(
      document_id,action_type,actor_label,after_data
    ) values(
      document.id,
      case
        when target_link_status='REVIEW_REQUIRED' then 'FINANCE_EXECUTION_REVIEW_REQUIRED'
        when target_link_status='VOUCHER_POSTED' then 'FINANCE_VOUCHERS_POSTED'
        when target_link_status='PAID' then 'FINANCE_PAYMENT_COMPLETED'
        else 'FINANCE_EXECUTION_REOPENED'
      end,
      '회계·자금 시스템',
      jsonb_build_object(
        'execution_link_id',link.id,'workflow_transaction_id',p_transaction_id,
        'link_status',target_link_status,'document_status',target_document_status,
        'paid_amount',paid_amount,'aggregate_paid_amount',aggregate_paid
      )
    );
  end if;
end $$;

create function approval.refresh_document_execution_from_allocation()
returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform approval.refresh_document_execution(new.transaction_id);
  return new;
end $$;

create function approval.refresh_document_execution_from_reversal()
returns trigger
language plpgsql security definer set search_path='' as $$
declare transaction_id uuid;
begin
  select a.transaction_id into transaction_id
  from finance.workflow_allocations a
  where a.organization_id=new.organization_id and a.id=new.allocation_id;
  if transaction_id is not null then
    perform approval.refresh_document_execution(transaction_id);
  end if;
  return new;
end $$;

create function approval.refresh_document_execution_from_voucher()
returns trigger
language plpgsql security definer set search_path='' as $$
declare source finance.workflow_voucher_links;
  transaction_id uuid;
begin
  if old.approval_status is not distinct from new.approval_status then return new; end if;
  select * into source
  from finance.workflow_voucher_links
  where organization_id=new.organization_id and voucher_id=new.id;
  if not found then return new; end if;
  if source.source_kind='RECOGNITION' then
    perform approval.refresh_document_execution(source.source_id);
  elsif source.source_kind='PAYMENT' then
    for transaction_id in
      select distinct a.transaction_id
      from finance.workflow_allocations a
      where a.organization_id=new.organization_id and a.payment_id=source.source_id
        and not exists(
          select 1 from finance.workflow_allocation_reversals r
          where r.allocation_id=a.id
        )
    loop
      perform approval.refresh_document_execution(transaction_id);
    end loop;
  end if;
  return new;
end $$;

create trigger approval_refresh_execution_after_allocation
after insert on finance.workflow_allocations
for each row execute function approval.refresh_document_execution_from_allocation();

create trigger approval_refresh_execution_after_reversal
after insert on finance.workflow_allocation_reversals
for each row execute function approval.refresh_document_execution_from_reversal();

create trigger approval_refresh_execution_after_voucher
after update of approval_status on finance.vouchers
for each row execute function approval.refresh_document_execution_from_voucher();

revoke all on function approval.refresh_document_execution(uuid),
  approval.refresh_document_execution_from_allocation(),
  approval.refresh_document_execution_from_reversal(),
  approval.refresh_document_execution_from_voucher()
  from public,anon,authenticated;
grant execute on function approval.refresh_document_execution(uuid) to service_role;
