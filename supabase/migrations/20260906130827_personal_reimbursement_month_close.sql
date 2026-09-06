-- Personal reimbursement is a budget subledger. It never backdates cash or posts GL entries.
create table finance.reimbursement_members (
  organization_id uuid not null references core.organizations(id),
  user_id uuid not null references auth.users(id),
  display_name text not null check (length(trim(display_name)) > 0),
  permissions text[] not null default '{}'
    check (permissions <@ array['ADMIN','APPROVE','SENIOR','CLOSE','PAY']::text[]),
  active boolean not null default true,
  primary key (organization_id,user_id)
);
create table finance.reimbursement_policies (
  organization_id uuid primary key references core.organizations(id),
  submission_day integer not null check (submission_day between 1 and 28),
  completion_day integer not null check (completion_day between submission_day and 28),
  long_delay_days integer not null check (long_delay_days > 0),
  updated_at timestamptz not null default now()
);
create table finance.reimbursement_periods (
  organization_id uuid not null references core.organizations(id),
  month date not null check (extract(day from month)=1),
  status text not null default 'OPEN' check (status in ('OPEN','SUPPLEMENT','CLOSED')),
  submission_deadline date not null,
  completion_deadline date not null check (completion_deadline >= submission_deadline),
  long_delay_days integer not null check (long_delay_days > 0),
  revision integer not null default 0,
  closed_at timestamptz,
  primary key (organization_id,month)
);
create table finance.personal_reimbursements (
  id uuid primary key,
  organization_id uuid not null references core.organizations(id),
  applicant_id uuid not null references auth.users(id),
  budget_id uuid not null references approval.budgets(id),
  used_on date not null,
  budget_month date not null,
  amount numeric(16,0) not null check (amount > 0),
  merchant text not null check (length(trim(merchant)) > 0),
  purpose text not null check (length(trim(purpose)) > 0),
  evidence_path text not null,
  evidence_hash text not null,
  delay_reason text not null default '',
  source_quick_id uuid unique references finance.quick_expense_records(id),
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED','APPROVED','PAID','REJECTED','CANCELLED')),
  needs_exception boolean not null,
  needs_senior boolean not null,
  exception_approved_at timestamptz,
  senior_approved_at timestamptz,
  over_budget_approved_at timestamptz,
  approved_at timestamptz,
  submitted_at timestamptz not null default now(),
  paid_at timestamptz,
  bank_transaction_id uuid unique references finance.bank_transactions(id),
  foreign key (organization_id,budget_month) references finance.reimbursement_periods(organization_id,month),
  check (budget_month = date_trunc('month',used_on)::date)
);
create unique index reimbursement_evidence_unique on finance.personal_reimbursements(organization_id,evidence_hash)
  where status not in ('REJECTED','CANCELLED');
create index reimbursement_period_idx on finance.personal_reimbursements(organization_id,budget_month,status);
create table finance.reimbursement_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id),
  request_id uuid references finance.personal_reimbursements(id),
  actor_id uuid not null references auth.users(id),
  action text not null,
  reason text not null default '',
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create table finance.reimbursement_reports (
  organization_id uuid not null,
  month date not null,
  revision integer not null,
  snapshot jsonb not null,
  reason text not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (organization_id,month,revision),
  foreign key (organization_id,month) references finance.reimbursement_periods(organization_id,month)
);
do $$ declare t text; begin
  foreach t in array array['reimbursement_members','reimbursement_policies','reimbursement_periods','personal_reimbursements','reimbursement_audit','reimbursement_reports'] loop
    execute format('alter table finance.%I enable row level security',t);
    execute format('revoke all on finance.%I from public,anon,authenticated',t);
    execute format('grant all on finance.%I to service_role',t);
    execute format('create policy server_only on finance.%I to service_role using (true) with check (true)',t);
  end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('personal-reimbursements','personal-reimbursements',false,3145728,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create function finance.reimbursement_budget_rows(p_org uuid,p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.budget_item),'[]'::jsonb) from (
 select b.id,b.budget_item,b.monthly_amount,b.approved_amount,b.executed_amount as annual_recorded_amount,
 coalesce((select sum(q.amount) from finance.quick_expense_records q where q.organization_id=p_org and q.budget_item=b.budget_item
   and date_trunc('month',q.occurred_at at time zone 'Asia/Seoul')::date=p_month and q.record_status='RECORDED'),0) as quick_amount,
 coalesce((select sum(r.amount) from finance.personal_reimbursements r where r.organization_id=p_org and r.budget_id=b.id
   and r.budget_month=p_month and r.status in ('APPROVED','PAID')),0) as personal_amount,
 coalesce((select sum(r.amount) from finance.personal_reimbursements r where r.organization_id=p_org and r.budget_id=b.id
   and r.budget_month=p_month and r.status='APPROVED'),0) as unpaid_amount,
 coalesce((select sum(br.amount-br.released_amount) from approval.budget_reservations br where br.budget_id=b.id
   and br.status='ACTIVE' and date_trunc('month',br.created_at at time zone 'Asia/Seoul')::date=p_month),0) as reserved_amount
 from approval.budgets b where b.organization_id=p_org and b.fiscal_year=extract(year from p_month)
 ) x;
$$;

create function finance.reimbursement_snapshot(p_org uuid,p_month date,p_actor uuid,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare v_revision integer;
begin
 update finance.reimbursement_periods set revision=revision+1,closed_at=now(),status='CLOSED'
 where organization_id=p_org and month=p_month returning revision into v_revision;
 insert into finance.reimbursement_reports(organization_id,month,revision,snapshot,reason,actor_id)
 values(p_org,p_month,v_revision,jsonb_build_object('budgets',finance.reimbursement_budget_rows(p_org,p_month),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'used_on',used_on,'amount',amount,'budget_id',budget_id,'status',status))
 from finance.personal_reimbursements where organization_id=p_org and budget_month=p_month and status in ('APPROVED','PAID')),'[]'::jsonb)),p_reason,p_actor);
end; $$;

-- All writes are serialized per organization, so closing and approving cannot cross each other.
create function finance.reimbursement_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 m finance.reimbursement_members%rowtype; r finance.personal_reimbursements%rowtype; old_r jsonb;
 p finance.reimbursement_periods%rowtype; cfg finance.reimbursement_policies%rowtype;
 b approval.budgets%rowtype; q finance.quick_expense_records%rowtype; tx finance.bank_transactions%rowtype;
 v_month date; v_today date := (now() at time zone 'Asia/Seoul')::date;
 v_reason text := trim(coalesce(p_data->>'reason','')); v_total numeric; v_reserved numeric; v_role text;
 v_id uuid; v_before jsonb; v_after jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 select * into m from finance.reimbursement_members where organization_id=p_org and user_id=p_actor and active;
 if not found then raise exception '정산 업무 접근 권한이 없습니다.'; end if;
 if p_command in ('POLICY','MEMBER') then
   if not ('ADMIN'=any(m.permissions)) then raise exception '관리자 권한이 필요합니다.'; end if;
   if p_command='POLICY' then
     select to_jsonb(t) into v_before from finance.reimbursement_policies t where organization_id=p_org;
     insert into finance.reimbursement_policies values(p_org,(p_data->>'submission_day')::int,(p_data->>'completion_day')::int,(p_data->>'long_delay_days')::int,now())
     on conflict (organization_id) do update set submission_day=excluded.submission_day,completion_day=excluded.completion_day,long_delay_days=excluded.long_delay_days,updated_at=now();
   else
     if (p_data->>'user_id')::uuid=p_actor then raise exception '본인 권한은 이 화면에서 변경할 수 없습니다.'; end if;
     select to_jsonb(t) into v_before from finance.reimbursement_members t where organization_id=p_org and user_id=(p_data->>'user_id')::uuid;
     insert into finance.reimbursement_members values(p_org,(p_data->>'user_id')::uuid,trim(p_data->>'display_name'),
       array(select jsonb_array_elements_text(p_data->'permissions')),(p_data->>'active')::boolean)
     on conflict (organization_id,user_id) do update set display_name=excluded.display_name,permissions=excluded.permissions,active=excluded.active;
   end if;
   v_after:=p_data;
 elsif p_command='OPEN' then
   if not ('CLOSE'=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '마감 권한이 필요합니다.'; end if;
   v_month:=(p_data->>'month')::date;
   if extract(day from v_month)<>1 or extract(year from v_month)<>extract(year from v_today) or v_month>v_today then raise exception '올해의 현재 월 또는 이전 월만 개설할 수 있습니다.'; end if;
   select * into cfg from finance.reimbursement_policies where organization_id=p_org;
   if not found then raise exception '제출·보완 마감일과 장기 지연 기준을 먼저 설정해주세요.'; end if;
   insert into finance.reimbursement_periods(organization_id,month,submission_deadline,completion_deadline,long_delay_days)
   values(p_org,v_month,(v_month+interval '1 month')::date+cfg.submission_day-1,(v_month+interval '1 month')::date+cfg.completion_day-1,cfg.long_delay_days);
   v_after:=p_data;
 elsif p_command in ('SUPPLEMENT','CLOSE') then
   if not ('CLOSE'=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '마감 권한이 필요합니다.'; end if;
   v_month:=(p_data->>'month')::date;
   select * into p from finance.reimbursement_periods where organization_id=p_org and month=v_month for update;
   if not found or p.status='CLOSED' then raise exception '접수 중인 월만 처리할 수 있습니다.'; end if;
   if v_reason='' then raise exception '처리 사유가 필요합니다.'; end if;
   v_before:=to_jsonb(p);
   if p_command='CLOSE' then
     if v_today<=p.completion_deadline then raise exception '보완 마감일이 지난 뒤 마감해주세요.'; end if;
     if exists(select 1 from finance.personal_reimbursements where organization_id=p_org and budget_month=v_month and status='SUBMITTED') then raise exception '심사 중인 정산을 먼저 처리해주세요.'; end if;
     perform finance.reimbursement_snapshot(p_org,v_month,p_actor,v_reason);
   else update finance.reimbursement_periods set status='SUPPLEMENT' where organization_id=p_org and month=v_month;
   end if;
   select to_jsonb(t) into v_after from finance.reimbursement_periods t where organization_id=p_org and month=v_month;
 elsif p_command='SUBMIT' then
   v_id:=(p_data->>'id')::uuid;
   if exists(select 1 from finance.personal_reimbursements where id=v_id and organization_id=p_org and applicant_id=p_actor) then return jsonb_build_object('id',v_id); end if;
   v_month:=date_trunc('month',(p_data->>'used_on')::date)::date;
   if extract(year from v_month)<>extract(year from v_today) or (p_data->>'used_on')::date>v_today then raise exception '올해 실제 사용분만 신청할 수 있습니다. 전년도분은 별도 회계 검토가 필요합니다.'; end if;
   select * into p from finance.reimbursement_periods where organization_id=p_org and month=v_month for update;
   if not found then raise exception '해당 사용월의 접수 기간을 먼저 개설해주세요.'; end if;
   if (v_today>p.submission_deadline or p.status='CLOSED' or v_today-(p_data->>'used_on')::date>p.long_delay_days) and trim(coalesce(p_data->>'delay_reason',''))='' then raise exception '지연 정산 사유가 필요합니다.'; end if;
   select * into b from approval.budgets where id=(p_data->>'budget_id')::uuid and organization_id=p_org and fiscal_year=extract(year from v_month);
   if not found then raise exception '해당 연도의 예산항목이 아닙니다.'; end if;
   if not exists(select 1 from storage.objects where bucket_id='personal-reimbursements' and name=p_data->>'evidence_path'
      and name like p_org::text||'/'||p_actor::text||'/'||v_id::text||'/%') then raise exception '저장된 증빙이 필요합니다.'; end if;
   if length(coalesce(p_data->>'evidence_hash',''))<>64 then raise exception '증빙 확인값이 필요합니다.'; end if;
   if nullif(p_data->>'source_quick_id','') is not null then
     if not ('APPROVE'=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '기존 선지출 연결은 정산 담당자가 확인해야 합니다.'; end if;
     select * into q from finance.quick_expense_records where id=(p_data->>'source_quick_id')::uuid and organization_id=p_org for update;
     if not found or q.payment_method<>'PERSONAL_PREPAID' or q.record_status='CONVERTED' or q.linked_resolution_id is not null
       or q.amount<>(p_data->>'amount')::numeric or q.budget_item<>b.budget_item or (q.occurred_at at time zone 'Asia/Seoul')::date<>(p_data->>'used_on')::date
       then raise exception '기존 개인 선지출의 날짜·금액·예산항목과 일치해야 합니다.'; end if;
   elsif exists(select 1 from finance.quick_expense_records where organization_id=p_org and payment_method='PERSONAL_PREPAID'
      and amount=(p_data->>'amount')::numeric and (occurred_at at time zone 'Asia/Seoul')::date=(p_data->>'used_on')::date and record_status<>'CONVERTED') then
     raise exception '같은 날짜·금액의 기존 개인 선지출을 연결해 중복 등록을 확인해주세요.';
   end if;
   if exists(select 1 from finance.personal_reimbursements where organization_id=p_org and applicant_id=p_actor and used_on=(p_data->>'used_on')::date
     and amount=(p_data->>'amount')::numeric and merchant=trim(p_data->>'merchant') and status not in ('REJECTED','CANCELLED')) then raise exception '동일한 개인 지출이 이미 신청되어 있습니다.'; end if;
   insert into finance.personal_reimbursements(id,organization_id,applicant_id,budget_id,used_on,budget_month,amount,merchant,purpose,evidence_path,evidence_hash,delay_reason,source_quick_id,needs_exception,needs_senior)
   values(v_id,p_org,p_actor,b.id,(p_data->>'used_on')::date,v_month,(p_data->>'amount')::numeric,trim(p_data->>'merchant'),trim(p_data->>'purpose'),p_data->>'evidence_path',p_data->>'evidence_hash',coalesce(p_data->>'delay_reason',''),q.id,
     v_today>p.submission_deadline or p.status='CLOSED',v_today-(p_data->>'used_on')::date>p.long_delay_days) returning to_jsonb(personal_reimbursements.*) into v_after;
 else
   select * into r from finance.personal_reimbursements where id=(p_data->>'id')::uuid and organization_id=p_org for update;
   if not found then raise exception '정산 신청을 찾을 수 없습니다.'; end if;
   v_id:=r.id; old_r:=to_jsonb(r); v_before:=old_r;
   select * into p from finance.reimbursement_periods where organization_id=p_org and month=r.budget_month for update;
   if p_command in ('EXCEPTION','SENIOR','OVER_BUDGET','APPROVE','REJECT') and r.applicant_id=p_actor then raise exception '본인 신청은 다른 승인자가 검토해야 합니다.'; end if;
   v_role:=case when p_command in ('SENIOR','OVER_BUDGET') then 'SENIOR' when p_command in ('PAY','REVERSE_PAYMENT') then 'PAY'
     when p_command='APPROVE' and p.status='CLOSED' then 'CLOSE' when p_command='CANCEL' and r.status='APPROVED' then 'CLOSE' else 'APPROVE' end;
   if not (p_command='CANCEL' and r.status='SUBMITTED' and r.applicant_id=p_actor) and not (v_role=any(m.permissions) or 'ADMIN'=any(m.permissions)) then raise exception '이 처리에 필요한 권한이 없습니다.'; end if;
   if v_reason='' then raise exception '승인·반려·취소 사유를 남겨주세요.'; end if;
   if p_command in ('EXCEPTION','SENIOR','OVER_BUDGET','APPROVE','REJECT') and r.status<>'SUBMITTED' then raise exception '심사 중인 신청만 처리할 수 있습니다.'; end if;
   if p_command='EXCEPTION' then
     update finance.personal_reimbursements set exception_approved_at=now() where id=r.id;
   elsif p_command='SENIOR' then
     update finance.personal_reimbursements set senior_approved_at=now() where id=r.id;
   elsif p_command='OVER_BUDGET' then
     update finance.personal_reimbursements set over_budget_approved_at=now() where id=r.id;
   elsif p_command='APPROVE' then
     if extract(year from r.budget_month)<>extract(year from v_today) then raise exception '전년도 정산은 별도 회계 검토가 필요합니다.'; end if;
     if r.needs_exception and r.exception_approved_at is null then raise exception '지연 정산 예외 승인이 먼저 필요합니다.'; end if;
     if r.needs_senior and r.senior_approved_at is null then raise exception '장기 지연 추가 승인이 먼저 필요합니다.'; end if;
     select * into b from approval.budgets where id=r.budget_id for update;
     select coalesce(sum(amount),0) into v_total from finance.personal_reimbursements where organization_id=p_org and budget_id=r.budget_id and budget_month=r.budget_month and status in ('APPROVED','PAID');
     v_total:=v_total+coalesce((select sum(amount) from finance.quick_expense_records where organization_id=p_org and budget_item=b.budget_item and record_status='RECORDED'
       and date_trunc('month',occurred_at at time zone 'Asia/Seoul')::date=r.budget_month and id is distinct from r.source_quick_id),0);
     select coalesce(sum(amount-released_amount),0) into v_reserved from approval.budget_reservations where budget_id=b.id and status='ACTIVE' and date_trunc('month',created_at at time zone 'Asia/Seoul')::date=r.budget_month;
     if (v_total+v_reserved+r.amount>b.monthly_amount or b.executed_amount+r.amount+coalesce((select sum(amount) from finance.personal_reimbursements where budget_id=b.id and status in ('APPROVED','PAID')),0)>b.approved_amount)
       and r.over_budget_approved_at is null then raise exception '예산 초과 추가 승인이 필요합니다.'; end if;
     perform set_config('finance.reimbursement_mutation','on',true);
     if r.source_quick_id is not null then update finance.quick_expense_records set record_status='CONVERTED',updated_at=now() where id=r.source_quick_id; end if;
     update finance.personal_reimbursements set status='APPROVED',approved_at=now() where id=r.id;
     if p.status='CLOSED' then perform finance.reimbursement_snapshot(p_org,r.budget_month,p_actor,v_reason); end if;
   elsif p_command='REJECT' then update finance.personal_reimbursements set status='REJECTED' where id=r.id;
   elsif p_command='CANCEL' then
     if r.status not in ('SUBMITTED','APPROVED') then raise exception '지급 전 신청만 취소할 수 있습니다. 지급 연결을 먼저 취소해주세요.'; end if;
     update finance.personal_reimbursements set status='CANCELLED' where id=r.id;
     if p.status='CLOSED' and r.status='APPROVED' then perform finance.reimbursement_snapshot(p_org,r.budget_month,p_actor,v_reason); end if;
   elsif p_command='PAY' then
     if r.status<>'APPROVED' then raise exception '예산 반영이 승인된 신청만 지급 연결할 수 있습니다.'; end if;
     select * into tx from finance.bank_transactions where id=(p_data->>'bank_transaction_id')::uuid and organization_id=p_org and deleted_at is null for update;
     if not found or tx.withdrawal_amount<>r.amount or tx.deposit_amount<>0 or (tx.transacted_at at time zone 'Asia/Seoul')::date<r.used_on or tx.transacted_at>now() then raise exception '사용일 이후의 동일 금액 출금거래를 선택해주세요.'; end if;
     if exists(select 1 from finance.expense_resolutions where bank_transaction_id=tx.id and deleted_at is null)
       or exists(select 1 from finance.quick_expense_records where bank_transaction_id=tx.id)
       or exists(select 1 from finance.personal_reimbursements where bank_transaction_id=tx.id) then raise exception '이미 다른 지출에 연결된 출금거래입니다.'; end if;
     update finance.personal_reimbursements set status='PAID',paid_at=tx.transacted_at,bank_transaction_id=tx.id where id=r.id;
   elsif p_command='REVERSE_PAYMENT' then
     if r.status<>'PAID' then raise exception '지급 연결된 신청만 연결 취소할 수 있습니다.'; end if;
     update finance.personal_reimbursements set status='APPROVED',paid_at=null,bank_transaction_id=null where id=r.id;
   else raise exception '지원하지 않는 처리입니다.';
   end if;
   select to_jsonb(t) into v_after from finance.personal_reimbursements t where id=r.id;
 end if;
 insert into finance.reimbursement_audit(organization_id,request_id,actor_id,action,reason,before_data,after_data)
 values(p_org,v_id,p_actor,p_command,v_reason,v_before,v_after);
 return coalesce(v_after,'{}'::jsonb);
end; $$;

-- Freeze changed source records in a closed month, while permitting the approved conversion above.
create function finance.guard_reimbursement_sources() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_org uuid; v_month date;
begin
 v_org:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 if tg_table_name='quick_expense_records' then
   if current_setting('finance.reimbursement_mutation',true)='on' then return new; end if;
   if tg_op='INSERT' and new.payment_method='PERSONAL_PREPAID' and exists(select 1 from finance.reimbursement_policies where organization_id=v_org) then raise exception '개인 선지출은 개인 지출 정산에서 신청해주세요.'; end if;
   if tg_op<>'INSERT' and exists(select 1 from finance.personal_reimbursements where source_quick_id=old.id) then raise exception '정산 신청에 연결된 원본은 수정할 수 없습니다.'; end if;
   v_month:=date_trunc('month',(case when tg_op='DELETE' then old.occurred_at else new.occurred_at end) at time zone 'Asia/Seoul')::date;
   if exists(select 1 from finance.reimbursement_periods where organization_id=v_org and month=v_month and status='CLOSED')
     or (tg_op='UPDATE' and exists(select 1 from finance.reimbursement_periods where organization_id=old.organization_id and month=date_trunc('month',old.occurred_at at time zone 'Asia/Seoul')::date and status='CLOSED')) then raise exception '마감된 월의 지출은 승인된 정산 조정으로 처리해주세요.'; end if;
 else
   if tg_op<>'INSERT' and exists(select 1 from finance.personal_reimbursements where bank_transaction_id=old.id) then raise exception '정산에 연결된 출금거래는 연결 취소 후 수정해주세요.'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;
create trigger aaa_reimbursement_source_guard before insert or update or delete on finance.quick_expense_records for each row execute function finance.guard_reimbursement_sources();
create trigger reimbursement_bank_guard before update or delete on finance.bank_transactions for each row execute function finance.guard_reimbursement_sources();

create function finance.guard_reimbursement_bank_link() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.bank_transaction_id is not null then
   perform 1 from finance.bank_transactions where id=new.bank_transaction_id for update;
   if exists(select 1 from finance.personal_reimbursements where bank_transaction_id=new.bank_transaction_id) then raise exception '개인 지출 정산에 연결된 출금거래입니다.'; end if;
 end if;
 return new;
end; $$;
create trigger reimbursement_bank_link_guard before insert or update of bank_transaction_id on finance.expense_resolutions for each row execute function finance.guard_reimbursement_bank_link();
create trigger reimbursement_bank_link_guard before insert or update of bank_transaction_id on finance.quick_expense_records for each row execute function finance.guard_reimbursement_bank_link();

create function finance.reimbursement_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception '마감 보고서와 감사 이력은 변경하거나 삭제할 수 없습니다.'; end; $$;
create trigger reimbursement_report_immutable before update or delete on finance.reimbursement_reports for each row execute function finance.reimbursement_immutable();
create trigger reimbursement_audit_immutable before update or delete on finance.reimbursement_audit for each row execute function finance.reimbursement_immutable();
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='finance' and (p.proname like 'reimbursement_%' or p.proname like 'guard_reimbursement_%') loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
create or replace function finance.guard_quick_expense_budget()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_budget approval.budgets%rowtype;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_quick_used numeric(18,2);
begin
  if new.record_status <> 'RECORDED' then return new; end if;
  select * into v_budget from approval.budgets
    where organization_id = new.organization_id
      and fiscal_year = extract(year from new.occurred_at at time zone 'Asia/Seoul')::integer
      and budget_item = new.budget_item
    for update;
  if not found then raise exception '승인된 예산항목을 찾을 수 없어 정식 지출결의가 필요합니다.'; end if;
  if v_budget.monthly_amount <= 0 then raise exception '월 예산이 등록되지 않아 정식 지출결의가 필요합니다.'; end if;

  v_month_start := date_trunc('month', new.occurred_at at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_month_end := v_month_start + interval '1 month';
  select coalesce(sum(amount), 0) into v_quick_used
    from finance.quick_expense_records
    where organization_id = new.organization_id and budget_item = new.budget_item
      and occurred_at >= v_month_start and occurred_at < v_month_end
      and record_status = 'RECORDED' and id <> new.id;
  v_quick_used := v_quick_used + coalesce((select sum(amount) from finance.personal_reimbursements
    where organization_id=new.organization_id and budget_id=v_budget.id
      and budget_month=(v_month_start at time zone 'Asia/Seoul')::date and status in ('APPROVED','PAID')),0);
  if v_budget.monthly_amount - v_quick_used < new.amount then
    raise exception '이번 달 승인예산 잔액을 초과해 정식 지출결의가 필요합니다.';
  end if;
  return new;
end;
$$;
