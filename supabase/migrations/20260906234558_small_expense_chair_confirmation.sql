-- Named authenticated roles; no existing account is silently promoted.
create table approval.small_expense_roles (
 organization_id uuid primary key references core.organizations(id),
 director_id uuid not null, chair_id uuid not null, updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 check(director_id<>chair_id),
 foreign key(organization_id,director_id) references finance.reimbursement_members(organization_id,user_id),
 foreign key(organization_id,chair_id) references finance.reimbursement_members(organization_id,user_id)
);
alter table approval.small_expenses
 add column review_status text not null default 'PENDING' check(review_status in ('PENDING','RETURNED','CONFIRMED','CANCELLED','LEGACY_BATCH')),
 add column registered_by uuid references auth.users(id),
 add column spender_id uuid references auth.users(id),
 add column confirmed_by uuid references auth.users(id),
 add column confirmed_at timestamptz,
 add column confirmed_label text,
 add column policy_limit numeric,
 add column review_reason text not null default '',
 add column revision integer not null default 1,
 add column budget_id uuid references approval.budgets(id),
 add column payment_method text check(payment_method in ('CASH','BANK_TRANSFER','CORPORATE_CARD')),
 add column bank_transaction_id uuid references finance.bank_transactions(id),
 add column corporate_card_transaction_id uuid references finance.corporate_card_transactions(id),
 add column quick_record_id uuid unique references finance.quick_expense_records(id),
 add column evidence_hash text,
 add column submission_signature text;
update approval.small_expenses set review_status='LEGACY_BATCH' where batch_resolution_id is not null;
create unique index small_expense_bank_once on approval.small_expenses(bank_transaction_id) where review_status<>'CANCELLED';
create unique index small_expense_card_once on approval.small_expenses(corporate_card_transaction_id) where review_status<>'CANCELLED';
create index small_expense_registered_by on approval.small_expenses(registered_by);
create index small_expense_spender on approval.small_expenses(spender_id);
create index small_expense_confirmer on approval.small_expenses(confirmed_by);
create index small_expense_budget on approval.small_expenses(budget_id);
create index small_expense_bank_fk on approval.small_expenses(bank_transaction_id);
create index small_expense_card_fk on approval.small_expenses(corporate_card_transaction_id);
create table approval.small_expense_audit (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references core.organizations(id),
 expense_id uuid references approval.small_expenses(id), actor_id uuid not null references auth.users(id),
 actor_label text not null, action text not null, reason text not null default '',
 before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index small_expense_audit_org on approval.small_expense_audit(organization_id,created_at desc);
create index small_expense_audit_expense on approval.small_expense_audit(expense_id);
create index small_expense_audit_actor on approval.small_expense_audit(actor_id);
create index small_expense_roles_director on approval.small_expense_roles(director_id);
create index small_expense_roles_chair on approval.small_expense_roles(chair_id);
create index small_expense_roles_updater on approval.small_expense_roles(updated_by);
alter table approval.small_expense_roles enable row level security;
alter table approval.small_expense_audit enable row level security;
revoke all on approval.small_expense_roles,approval.small_expense_audit,approval.small_expenses from public,anon,authenticated;
grant all on approval.small_expense_roles,approval.small_expense_audit,approval.small_expenses to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('small-expense-evidence','small-expense-evidence',false,3145728,array['application/pdf','image/png','image/jpeg','image/webp']);

create function approval.small_expense_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members%rowtype; roles approval.small_expense_roles%rowtype;
 r approval.small_expenses%rowtype; old_row jsonb; b approval.budgets%rowtype;
 spender finance.reimbursement_members%rowtype; tx finance.bank_transactions%rowtype; ct finance.corporate_card_transactions%rowtype;
 lim numeric; amt numeric; used_on date; method text; evidence text; item jsonb; qid uuid;
 reason text:=trim(coalesce(p_data->>'reason','')); v_id uuid; sig text; n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 select * into m from finance.reimbursement_members where organization_id=p_org and user_id=p_actor and active;
 if not found then raise exception '활성 업무 계정이 필요합니다.'; end if;
 select * into roles from approval.small_expense_roles where organization_id=p_org;
 if p_command='CONFIGURE' then
   if not('ADMIN'=any(m.permissions)) then raise exception '담당자 설정은 관리자만 할 수 있습니다.'; end if;
   if reason='' then raise exception '담당자 변경 사유가 필요합니다.'; end if;
   select count(*) into n from finance.reimbursement_members where organization_id=p_org and active
    and user_id in ((p_data->>'director_id')::uuid,(p_data->>'chair_id')::uuid);
   if n<>2 then raise exception '서로 다른 활성 계정을 사무국장과 조합장으로 지정해주세요.'; end if;
   insert into approval.small_expense_roles values(p_org,(p_data->>'director_id')::uuid,(p_data->>'chair_id')::uuid,p_actor,now())
    on conflict(organization_id) do update set director_id=excluded.director_id,chair_id=excluded.chair_id,updated_by=p_actor,updated_at=now();
   insert into approval.small_expense_audit(organization_id,actor_id,actor_label,action,reason,before_data,after_data)
    values(p_org,p_actor,m.display_name,p_command,reason,to_jsonb(roles),p_data);
   return '{}'::jsonb;
 end if;
 if roles.organization_id is null or p_actor not in (roles.director_id,roles.chair_id) then raise exception '소액지출 담당 권한이 없습니다.'; end if;
 select coalesce((select small_expense_limit from approval.settings where organization_id=p_org),50000) into lim;
 if p_command='SUBMIT' then
   if p_actor<>roles.director_id then raise exception '소액지출은 사무국장이 등록합니다.'; end if;
   v_id:=(p_data->>'id')::uuid; sig:=md5((p_data-'revision')::text);
   select * into r from approval.small_expenses where id=v_id for update;
   if found then
     if r.organization_id is distinct from p_org then raise exception '다른 조합의 내역입니다.'; end if;
     if r.submission_signature=sig and r.review_status='PENDING' then return to_jsonb(r); end if;
     if r.review_status not in ('PENDING','RETURNED') or r.batch_resolution_id is not null then raise exception '확정·취소된 내역은 수정할 수 없습니다.'; end if;
     if r.revision<>coalesce((p_data->>'revision')::int,0) then raise exception '내역이 변경됐습니다. 새로고침해주세요.'; end if;
   end if;
   old_row:=case when r.id is null then null else to_jsonb(r) end;
   amt:=(p_data->>'amount')::numeric; used_on:=(p_data->>'expense_date')::date; method:=p_data->>'payment_method'; evidence:=p_data->>'evidence_path';
   if amt is null or amt<=0 or amt<>trunc(amt) or amt>lim then raise exception '소액 한도 이내의 양수 정수 금액이 필요합니다.'; end if;
   if used_on is null or used_on>(now() at time zone 'Asia/Seoul')::date then raise exception '실제 사용일을 확인해주세요.'; end if;
   if exists(select 1 from finance.reimbursement_periods where organization_id=p_org and month=date_trunc('month',used_on)::date and status='CLOSED') then raise exception '마감된 월은 소액지출을 등록·수정할 수 없습니다.'; end if;
   if coalesce(p_data->>'description','')||' '||coalesce(p_data->>'memo','') ~ '계약|조합원\s*환불|차입|상환|소송|예산\s*외|추가\s*부담' then raise exception '소액지출 제외 업무입니다. 정식 기안·결의로 처리해주세요.'; end if;
   if trim(coalesce(p_data->>'description',''))='' or trim(coalesce(p_data->>'account_subject_name',''))='' then raise exception '사용내용과 계정과목이 필요합니다.'; end if;
   if coalesce(method,'') not in ('CASH','BANK_TRANSFER','CORPORATE_CARD') then raise exception '개인 선지출은 개인 지출 정산에서 신청해주세요.'; end if;
   select * into spender from finance.reimbursement_members where organization_id=p_org and user_id=(p_data->>'spender_id')::uuid and active;
   if not found then raise exception '실제 사용자를 선택해주세요.'; end if;
   select * into b from approval.budgets where organization_id=p_org and id=(p_data->>'budget_id')::uuid and fiscal_year=extract(year from used_on);
   if not found then raise exception '사용연도에 맞는 예산항목을 선택해주세요.'; end if;
   if evidence is null or evidence not like p_org::text||'/'||p_actor::text||'/'||v_id::text||'/%' or
      not exists(select 1 from storage.objects where bucket_id='small-expense-evidence' and name=evidence) then raise exception '영수증을 첨부해주세요.'; end if;
   if nullif(p_data->>'evidence_hash','') is null then raise exception '증빙 확인 정보가 필요합니다.'; end if;
   if method='BANK_TRANSFER' then
     select * into tx from finance.bank_transactions where id=(p_data->>'bank_transaction_id')::uuid and organization_id=p_org and deleted_at is null for update;
     if not found or tx.withdrawal_amount<>amt or (tx.transacted_at at time zone 'Asia/Seoul')::date<>used_on then raise exception '금액·사용일이 일치하는 조합 출금거래를 선택해주세요.'; end if;
     if exists(select 1 from finance.quick_expense_records where bank_transaction_id=tx.id) or exists(select 1 from finance.expense_resolutions where bank_transaction_id=tx.id and deleted_at is null) or exists(select 1 from finance.personal_reimbursements where bank_transaction_id=tx.id) then raise exception '이미 처리된 출금거래입니다.'; end if;
   elsif method='CORPORATE_CARD' then
     select * into ct from finance.corporate_card_transactions where id=(p_data->>'corporate_card_transaction_id')::uuid and organization_id=p_org for update;
     if not found or ct.amount<>amt or (ct.approved_at at time zone 'Asia/Seoul')::date<>used_on or ct.linked_resolution_id is not null then raise exception '금액·사용일이 일치하는 미처리 법인카드 거래를 선택해주세요.'; end if;
     if exists(select 1 from finance.quick_expense_records where corporate_card_transaction_id=ct.id) then raise exception '이미 처리된 카드거래입니다.'; end if;
   end if;
   insert into approval.small_expenses(id,organization_id,expense_date,partner_name,description,project_name,account_subject_name,amount,payer_label,memo,
    created_by_label,registered_by,spender_id,budget_id,payment_method,bank_transaction_id,corporate_card_transaction_id,evidence_bucket,evidence_path,evidence_hash,submission_signature)
   values(v_id,p_org,used_on,coalesce(nullif(trim(p_data->>'partner_name'),''),'미확인'),trim(p_data->>'description'),coalesce(p_data->>'project_name',''),trim(p_data->>'account_subject_name'),amt,spender.display_name,coalesce(p_data->>'memo',''),
    m.display_name,p_actor,spender.user_id,b.id,method,tx.id,ct.id,'small-expense-evidence',evidence,p_data->>'evidence_hash',sig)
   on conflict(id) do update set expense_date=excluded.expense_date,partner_name=excluded.partner_name,description=excluded.description,project_name=excluded.project_name,account_subject_name=excluded.account_subject_name,
    amount=excluded.amount,payer_label=excluded.payer_label,memo=excluded.memo,registered_by=p_actor,created_by_label=m.display_name,spender_id=excluded.spender_id,budget_id=excluded.budget_id,payment_method=excluded.payment_method,
    bank_transaction_id=excluded.bank_transaction_id,corporate_card_transaction_id=excluded.corporate_card_transaction_id,evidence_bucket=excluded.evidence_bucket,evidence_path=excluded.evidence_path,evidence_hash=excluded.evidence_hash,
    submission_signature=sig,review_status='PENDING',review_reason='',revision=approval.small_expenses.revision+1,updated_at=now()
   returning * into r;
   insert into approval.small_expense_audit(organization_id,expense_id,actor_id,actor_label,action,before_data,after_data)
    values(p_org,r.id,p_actor,m.display_name,p_command,old_row,to_jsonb(r));
   return to_jsonb(r);
 end if;
 if p_command not in ('CONFIRM','RETURN','CANCEL') then raise exception '지원하지 않는 처리입니다.'; end if;
 if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception '처리할 내역을 1~100건 선택해주세요.'; end if;
 if p_command in ('RETURN','CANCEL') and reason='' then raise exception '처리 사유를 입력해주세요.'; end if;
 for item in select * from jsonb_array_elements(p_data->'items') order by value->>'id' loop
   select * into r from approval.small_expenses where id=(item->>'id')::uuid and organization_id=p_org and deleted_at is null for update;
   if not found or r.revision<>coalesce((item->>'revision')::int,0) then raise exception '내역이 변경됐습니다. 새로고침해주세요.'; end if;
   if r.review_status not in ('PENDING','RETURNED') or r.batch_resolution_id is not null then raise exception '확정·취소·기존 일괄결의 내역은 처리할 수 없습니다.'; end if;
   old_row:=to_jsonb(r);
   if p_command='CANCEL' then
     if p_actor<>roles.director_id then raise exception '등록 취소는 사무국장이 처리합니다.'; end if;
   else
     if p_actor<>roles.chair_id then raise exception '확인·확정은 조합장만 할 수 있습니다.'; end if;
     if r.registered_by is null or r.spender_id is null then raise exception '기존 내역의 등록자·사용자 정보를 먼저 보완해주세요.'; end if;
     if p_actor in (r.registered_by,r.spender_id) then raise exception '본인이 등록하거나 사용한 지출은 스스로 확정·검토할 수 없습니다.'; end if;
     if r.review_status<>'PENDING' then raise exception '보완 후 재등록된 내역을 확인해주세요.'; end if;
   end if;
   if p_command='CONFIRM' then
     if coalesce((p_data->>'evidence_verified')::boolean,false)=false then raise exception '사용내용과 증빙 확인이 필요합니다.'; end if;
     if r.amount>lim then raise exception '현재 소액 한도를 초과했습니다.'; end if;
     if r.partner_name='미확인' or trim(r.partner_name)='' then raise exception '거래처 확인 후 재등록해주세요.'; end if;
     if r.evidence_path is null or not exists(select 1 from storage.objects where bucket_id=r.evidence_bucket and name=r.evidence_path) then raise exception '증빙이 누락되었습니다.'; end if;
     select * into b from approval.budgets where id=r.budget_id and organization_id=p_org and fiscal_year=extract(year from r.expense_date);
     if not found then raise exception '예산항목을 확인해주세요.'; end if;
     if r.payment_method='BANK_TRANSFER' then
       select * into tx from finance.bank_transactions where id=r.bank_transaction_id and organization_id=p_org and deleted_at is null for update;
       if not found or tx.withdrawal_amount<>r.amount or (tx.transacted_at at time zone 'Asia/Seoul')::date<>r.expense_date
          or exists(select 1 from finance.expense_resolutions where bank_transaction_id=tx.id and deleted_at is null) then raise exception '출금거래가 변경되거나 다른 결의에 연결됐습니다.'; end if;
     elsif r.payment_method='CORPORATE_CARD' then
       select * into ct from finance.corporate_card_transactions where id=r.corporate_card_transaction_id and organization_id=p_org for update;
       if not found or ct.amount<>r.amount or (ct.approved_at at time zone 'Asia/Seoul')::date<>r.expense_date or ct.linked_resolution_id is not null then raise exception '카드거래가 변경되거나 다른 결의에 연결됐습니다.'; end if;
     end if;
     insert into finance.quick_expense_records(organization_id,source_type,bank_transaction_id,corporate_card_transaction_id,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,evidence_status,approval_skip_reason,direct_expense_decision,direct_expense_reasons,record_status,recorded_by_label)
      values(p_org,case r.payment_method when 'BANK_TRANSFER' then 'BANK_TRANSACTION' when 'CORPORATE_CARD' then 'CORPORATE_CARD' else 'MANUAL' end,
       r.bank_transaction_id,r.corporate_card_transaction_id,r.payment_method,r.expense_date::timestamp at time zone 'Asia/Seoul',r.amount,r.partner_name,r.description,b.budget_item,'GENERAL','소액지출 조합장 확인·확정','ALLOWED',array['소액지출 원본 '||r.id::text],'RECORDED',m.display_name) returning id into qid;
     update approval.small_expenses set review_status='CONFIRMED',confirmed_by=p_actor,confirmed_label=m.display_name,confirmed_at=now(),policy_limit=lim,quick_record_id=qid,revision=revision+1,updated_at=now() where id=r.id returning * into r;
   else
     update approval.small_expenses set review_status=case p_command when 'RETURN' then 'RETURNED' else 'CANCELLED' end,review_reason=reason,revision=revision+1,updated_at=now() where id=r.id returning * into r;
   end if;
   insert into approval.small_expense_audit(organization_id,expense_id,actor_id,actor_label,action,reason,before_data,after_data)
    values(p_org,r.id,p_actor,m.display_name,p_command,reason,old_row,to_jsonb(r));
 end loop;
 return '{}'::jsonb;
end;$$;
revoke all on function approval.small_expense_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function approval.small_expense_command(uuid,uuid,text,jsonb) to service_role;

-- Retire the old batch endpoint, including direct RPC calls.
create or replace function approval.create_small_expense_batch(p_ids uuid[],p_actor_label text,p_resolution_data jsonb)
returns text language plpgsql security invoker set search_path='' as $$
begin raise exception '소액지출은 조합장 확인·확정으로 처리합니다. 화면을 새로고침해주세요.'; end;$$;
revoke all on function approval.create_small_expense_batch(uuid[],text,jsonb) from public,anon,authenticated;

-- A derived budget record cannot be changed through the old quick-expense UI.
create function approval.guard_confirmed_small_expense_source() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from approval.small_expenses where quick_record_id=old.id) then raise exception '확정된 소액지출 원본은 일반 간편지출에서 수정·전환할 수 없습니다.'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end;$$;
create trigger small_expense_source_guard before update or delete on finance.quick_expense_records for each row execute function approval.guard_confirmed_small_expense_source();
revoke all on function approval.guard_confirmed_small_expense_source() from public,anon,authenticated;
grant execute on function approval.guard_confirmed_small_expense_source() to service_role;
create function approval.guard_small_expense_month_close() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='CLOSED' and exists(select 1 from approval.small_expenses where organization_id=new.organization_id and date_trunc('month',expense_date)::date=new.month and review_status in ('PENDING','RETURNED') and deleted_at is null) then raise exception '소액지출 확인대기·보완 내역을 먼저 처리해주세요.'; end if;
 return new;
end;$$;
create trigger small_expense_month_close before insert or update on finance.reimbursement_periods for each row execute function approval.guard_small_expense_month_close();
revoke all on function approval.guard_small_expense_month_close() from public,anon,authenticated;
grant execute on function approval.guard_small_expense_month_close() to service_role;

create function approval.prevent_small_expense_audit_mutation() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception '소액지출 처리 이력은 수정·삭제할 수 없습니다.'; end;$$;
create trigger small_expense_audit_immutable before update or delete on approval.small_expense_audit for each row execute function approval.prevent_small_expense_audit_mutation();
revoke all on function approval.prevent_small_expense_audit_mutation() from public,anon,authenticated;
grant execute on function approval.prevent_small_expense_audit_mutation() to service_role;
