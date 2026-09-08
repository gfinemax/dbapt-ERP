-- Accounting A: existing double-entry tables, source-linked drafts only.
-- Confirmation/reversal commands remain unavailable until policy is configured.
create table finance.workflow_voucher_controls (
 voucher_id uuid primary key references finance.vouchers(id) on delete restrict,
 organization_id uuid not null references core.organizations(id), lock_version integer not null default 1 check(lock_version>0),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,voucher_id)
);
create table finance.workflow_voucher_links (
 voucher_id uuid primary key, organization_id uuid not null,
 source_kind text not null check(source_kind in ('RECOGNITION','PAYMENT','TRANSFER')), source_id uuid not null,
 source_signature text not null, source_snapshot jsonb not null,
 unique(organization_id,source_kind,source_id),
 foreign key(organization_id,voucher_id) references finance.workflow_voucher_controls(organization_id,voucher_id)
);
alter table finance.workflow_voucher_controls enable row level security;
alter table finance.workflow_voucher_links enable row level security;
revoke all on finance.workflow_voucher_controls,finance.workflow_voucher_links from public,anon,authenticated;
grant select,insert,update,delete on finance.workflow_voucher_controls,finance.workflow_voucher_links to service_role;

create function finance.accounting_source(p_org uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare t finance.workflow_transactions; p finance.workflow_payments; x finance.workflow_transfers; b finance.bank_transactions;
 s jsonb; snapshot jsonb; title text; number text; amount numeric; occurred text; existing uuid; bank_id uuid; resolution_id text;
begin
 if p_kind='RECOGNITION' then
  select * into t from finance.workflow_transactions where organization_id=p_org and id=p_id;
  if not found then raise exception '조직의 회계 원본을 찾을 수 없습니다.'; end if;
  s:=finance.workflow_source(p_org,t.source_kind,t.source_id);
  snapshot:=jsonb_build_object('transaction_id',t.id,'source_kind',t.source_kind,'source_id',t.source_id,'source',s);
  title:=s->>'title'; amount:=(s->>'amount')::numeric; number:=coalesce(t.source_snapshot->>'number',t.source_id);
  occurred:=s#>>'{snapshot,transactionDate}';
  if t.source_kind='RESOLUTION' then
   resolution_id:=t.source_id;
   select id into existing from finance.vouchers where organization_id=p_org and expense_resolution_id=t.source_id and deleted_at is null order by created_at limit 1;
  elsif t.source_kind='QUICK' and nullif(s#>>'{snapshot,linkedResolutionId}','') is not null then
   select id into existing from finance.vouchers where organization_id=p_org and expense_resolution_id=s#>>'{snapshot,linkedResolutionId}' and deleted_at is null order by created_at limit 1;
   if existing is null then
    select l.voucher_id into existing from finance.workflow_voucher_links l join finance.workflow_transactions q on q.id=l.source_id and q.organization_id=l.organization_id
    where l.organization_id=p_org and l.source_kind='RECOGNITION' and q.source_kind='RESOLUTION' and q.source_id=s#>>'{snapshot,linkedResolutionId}';
   end if;
  elsif t.source_kind='PERSONAL' and nullif(s#>>'{snapshot,sourceQuickId}','') is not null then
   select l.voucher_id into existing from finance.workflow_voucher_links l join finance.workflow_transactions q on q.id=l.source_id and q.organization_id=l.organization_id
   where l.organization_id=p_org and l.source_kind='RECOGNITION' and q.source_kind='QUICK' and q.source_id=s#>>'{snapshot,sourceQuickId}';
  end if;
  -- Symmetric bridge: a quick record and its personal reimbursement represent one usage.
  if existing is null and t.source_kind='QUICK' then
   select l.voucher_id into existing from finance.workflow_voucher_links l join finance.workflow_transactions q on q.id=l.source_id and q.organization_id=l.organization_id
   join finance.personal_reimbursements r on r.id::text=q.source_id and r.organization_id=p_org
   where l.organization_id=p_org and l.source_kind='RECOGNITION' and q.source_kind='PERSONAL' and r.source_quick_id::text=t.source_id limit 1;
  end if;
  -- Traverse explicit IDs in both directions, including QUICK -> RESOLUTION
  -- conversion and QUICK -> PERSONAL reimbursement. No name/amount matching.
  if existing is null then
   with usage_quick as (
    select qr.id from finance.quick_expense_records qr where qr.organization_id=p_org and
     ((t.source_kind='QUICK' and qr.id::text=t.source_id) or
      (t.source_kind='RESOLUTION' and qr.linked_resolution_id=t.source_id) or
      (t.source_kind='PERSONAL' and qr.id::text=s#>>'{snapshot,sourceQuickId}'))
   ), linked_origins as (
    select 'QUICK' kind,q.id::text id from usage_quick q
    union select 'RESOLUTION',qr.linked_resolution_id from finance.quick_expense_records qr join usage_quick q on q.id=qr.id where qr.linked_resolution_id is not null
    union select 'PERSONAL',r.id::text from finance.personal_reimbursements r join usage_quick q on q.id=r.source_quick_id where r.organization_id=p_org
   )
   select l.voucher_id into existing from finance.workflow_voucher_links l join finance.workflow_transactions q on q.id=l.source_id and q.organization_id=l.organization_id
    join linked_origins o on o.kind=q.source_kind and o.id=q.source_id
    where l.organization_id=p_org and l.source_kind='RECOGNITION' limit 1;
  end if;
 elsif p_kind='PAYMENT' then
  select * into p from finance.workflow_payments where organization_id=p_org and id=p_id;
  if not found then raise exception '조직의 실제 지급을 찾을 수 없습니다.'; end if;
  snapshot:=jsonb_build_object('payment',to_jsonb(p),'allocations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('reversed',exists(select 1 from finance.workflow_allocation_reversals r where r.allocation_id=a.id)) order by a.id) from finance.workflow_allocations a where a.organization_id=p_org and a.payment_id=p.id),'[]'));
  title:=p.counterparty||case when p.flow='OUT' then ' · 지급' else ' · 반납·회수' end; number:=null; amount:=p.amount; occurred:=p.paid_at::text; bank_id:=p.bank_transaction_id;
  select id into existing from finance.vouchers where organization_id=p_org and bank_transaction_id=bank_id and deleted_at is null order by created_at limit 1;
 elsif p_kind='TRANSFER' then
  select * into x from finance.workflow_transfers where organization_id=p_org and id=p_id;
  if not found then raise exception '조직의 계좌이체를 찾을 수 없습니다.'; end if;
  select * into b from finance.bank_transactions where organization_id=p_org and id=x.withdrawal_id;
  snapshot:=jsonb_build_object('transfer',to_jsonb(x),'amount',b.withdrawal_amount,'paid_at',b.transacted_at);
  title:='조합 계좌 간 이체'; number:=null; amount:=b.withdrawal_amount; occurred:=b.transacted_at::text;
  select id into existing from finance.vouchers where organization_id=p_org and bank_transaction_id in (x.withdrawal_id,x.deposit_id) and deleted_at is null order by created_at limit 1;
 else raise exception '지원하지 않는 회계 원본입니다.';
 end if;
 if amount is null or amount<=0 or amount<>trunc(amount) or amount>=100000000000000 then raise exception '전표의 원 단위 금액 범위를 확인해주세요.'; end if;
 select coalesce(existing,(select voucher_id from finance.workflow_voucher_links where organization_id=p_org and source_kind=p_kind and source_id=p_id)) into existing;
 return jsonb_build_object('kind',p_kind,'id',p_id,'title',title,'number',number,'amount',amount,'occurred_at',occurred,
  'signature',md5(snapshot::text),'snapshot',snapshot,'existing_voucher_id',existing,'bank_transaction_id',bank_id,'expense_resolution_id',resolution_id);
end $$;

create function finance.accounting_source_read(p_org uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 return finance.accounting_source(p_org,p_kind,p_id) - 'snapshot' - 'bank_transaction_id' - 'expense_resolution_id';
exception when others then
 return jsonb_build_object('kind',p_kind,'id',p_id,'title','원본 확인 필요','number',null,'amount',null,'occurred_at',null,'signature','',
  'existing_voucher_id',(select voucher_id from finance.workflow_voucher_links where organization_id=p_org and source_kind=p_kind and source_id=p_id),
  'blocked_reason','원본을 읽을 수 없거나 전표 금액 범위를 벗어났습니다. 원본 자료를 확인해주세요.');
end $$;

create function finance.accounting_workspace(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members; sources jsonb; vouchers jsonb; accounts jsonb;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not m.permissions && array['ADMIN','APPROVE','PAY','CLOSE','SENIOR'] then raise exception '회계 자료 조회 권한이 필요합니다.'; end if;
 select coalesce(jsonb_agg(s - 'snapshot' - 'bank_transaction_id' - 'expense_resolution_id' order by s->>'occurred_at' desc),'[]') into sources from (
  select finance.accounting_source_read(p_org,'RECOGNITION',id) s from finance.workflow_transactions where organization_id=p_org
  union all select finance.accounting_source_read(p_org,'PAYMENT',id) from finance.workflow_payments where organization_id=p_org
  union all select finance.accounting_source_read(p_org,'TRANSFER',id) from finance.workflow_transfers where organization_id=p_org
 ) q;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'voucher_no',v.voucher_no,'voucher_date',v.voucher_date,'approval_status',v.approval_status,'memo',v.memo,
  'managed',c.voucher_id is not null,'lock_version',c.lock_version,'source_kind',l.source_kind,'source_id',l.source_id,
  'source_stale',case when l.voucher_id is null then false else l.source_signature is distinct from finance.accounting_source_read(p_org,l.source_kind,l.source_id)->>'signature' end,
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',vl.id,'account_subject_id',vl.account_subject_id,'description',vl.description,'debit_amount',vl.debit_amount,'credit_amount',vl.credit_amount,'sort_order',vl.sort_order) order by vl.sort_order,vl.id) from finance.voucher_lines vl where vl.voucher_id=v.id),'[]')) order by v.voucher_date desc,v.created_at desc),'[]') into vouchers
 from finance.vouchers v left join finance.workflow_voucher_controls c on c.voucher_id=v.id and c.organization_id=p_org left join finance.workflow_voucher_links l on l.voucher_id=v.id
 where v.organization_id=p_org and v.deleted_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'subject_type',subject_type,'normal_balance',normal_balance,'is_active',is_active) order by sort_order,code),'[]') into accounts from finance.account_subjects where organization_id=p_org;
 return jsonb_build_object('vouchers',vouchers,'accounts',accounts,'sources',sources,'policy',jsonb_build_object('confirmation_enabled',false));
end $$;

-- Legacy REST actions cannot edit managed drafts or their lines. The command sets a
-- transaction-local capability for its one voucher, then restores it before return.
create function finance.accounting_draft_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare old_id uuid; new_id uuid; allowed text:=current_setting('finance.accounting_voucher',true);
begin
 if tg_table_name='vouchers' then
  if tg_op<>'INSERT' then old_id:=old.id; end if; if tg_op<>'DELETE' then new_id:=new.id; end if;
  if tg_op<>'DELETE' and new.organization_id is not null then
   perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,739));
   if allowed is distinct from new.id::text and not exists(select 1 from finance.workflow_voucher_controls where voucher_id=new.id) and (
    finance.accounting_resolution_managed(new.organization_id,new.expense_resolution_id)
    or exists(select 1 from finance.workflow_voucher_links l join finance.workflow_transfers x on x.id=l.source_id and x.organization_id=l.organization_id
     where l.organization_id=new.organization_id and l.source_kind='TRANSFER' and new.bank_transaction_id in(x.withdrawal_id,x.deposit_id))
   ) then raise exception '원본에 통합 전표가 연결돼 있습니다. 전표관리에서 확인해주세요.'; end if;
  end if;
 else
  if tg_op<>'INSERT' then old_id:=old.voucher_id; end if; if tg_op<>'DELETE' then new_id:=new.voucher_id; end if;
 end if;
 if (old_id is not null and exists(select 1 from finance.workflow_voucher_controls where voucher_id=old_id) and allowed is distinct from old_id::text)
 or (new_id is not null and exists(select 1 from finance.workflow_voucher_controls where voucher_id=new_id) and allowed is distinct from new_id::text) then
  raise exception '통합 회계 초안은 회계 저장 명령으로만 수정할 수 있습니다.';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger accounting_draft_guard before insert or update or delete on finance.vouchers for each row execute function finance.accounting_draft_guard();
create trigger accounting_draft_guard before insert or update or delete on finance.voucher_lines for each row execute function finance.accounting_draft_guard();
create trigger accounting_draft_guard before update or delete on finance.workflow_voucher_controls for each row execute function finance.accounting_draft_guard();
create trigger accounting_draft_guard before update or delete on finance.workflow_voucher_links for each row execute function finance.accounting_draft_guard();

create function finance.accounting_resolution_managed(p_org uuid,p_resolution_id text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from finance.workflow_voucher_links l
  join finance.workflow_transactions t on t.organization_id=l.organization_id and (
   (t.source_kind='RESOLUTION' and t.source_id=p_resolution_id) or
   (t.source_kind='QUICK' and exists(select 1 from finance.quick_expense_records q where q.organization_id=p_org and q.id::text=t.source_id and q.linked_resolution_id=p_resolution_id)) or
   (t.source_kind='PERSONAL' and exists(select 1 from finance.personal_reimbursements r join finance.quick_expense_records q on q.id=r.source_quick_id and q.organization_id=p_org where r.organization_id=p_org and r.id::text=t.source_id and q.linked_resolution_id=p_resolution_id)))
  where l.organization_id=p_org and ((l.source_kind='RECOGNITION' and l.source_id=t.id) or
   (l.source_kind='PAYMENT' and exists(select 1 from finance.workflow_allocations a where a.organization_id=p_org and a.payment_id=l.source_id and a.transaction_id=t.id))))
$$;
create function finance.accounting_legacy_check(p_org uuid,p_actor uuid,p_resolution_id text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform finance.workflow_actor(p_org,p_actor,'APPROVE');
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
 if not exists(select 1 from finance.expense_resolutions where organization_id=p_org and id=p_resolution_id and deleted_at is null) then raise exception '조직의 지출결의를 찾을 수 없습니다.'; end if;
 if finance.accounting_resolution_managed(p_org,p_resolution_id) then raise exception '통합 회계로 연결된 지출입니다. 전표관리에서 확인해주세요.'; end if;
end $$;
create function finance.accounting_resolution_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.organization_id is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(old.organization_id::text,739));
 if finance.accounting_resolution_managed(old.organization_id,old.id) and (
  row(new.voucher_no,new.voucher_status) is distinct from row(old.voucher_no,old.voucher_status) or
  (jsonb_build_array(new.resolution_data->'voucherNo',new.resolution_data->'voucherStatus',new.resolution_data->'voucherGenerated',new.resolution_data->'voucherConfirmedAt',new.resolution_data->'voucherConfirmedBy') is distinct from
    jsonb_build_array(old.resolution_data->'voucherNo',old.resolution_data->'voucherStatus',old.resolution_data->'voucherGenerated',old.resolution_data->'voucherConfirmedAt',old.resolution_data->'voucherConfirmedBy')) or
  jsonb_path_query_array(new.resolution_data,'$.expenseItems[*].voucherNo') is distinct from jsonb_path_query_array(old.resolution_data,'$.expenseItems[*].voucherNo') or
  jsonb_path_query_array(new.resolution_data,'$.expenseItems[*].voucherStatus') is distinct from jsonb_path_query_array(old.resolution_data,'$.expenseItems[*].voucherStatus')
 ) then raise exception '통합 회계로 연결된 지출입니다. 전표관리에서 확인해주세요.'; end if;
 return new;
end $$;
create trigger accounting_resolution_guard before update on finance.expense_resolutions for each row execute function finance.accounting_resolution_guard();

create function finance.accounting_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved finance.workflow_operations; c finance.workflow_voucher_controls; v finance.vouchers; link finance.workflow_voucher_links;
 s jsonb; item jsonb; account_id uuid; debit numeric; credit numeric; entity uuid; n integer; prefix text; number text; version integer;
 previous_setting text:=current_setting('finance.accounting_voucher',true); result jsonb; before_data jsonb; current_date_value date;
begin
 perform finance.workflow_actor(p_org,p_actor,'APPROVE');
 if p_command not in ('DRAFT_CREATE','DRAFT_SAVE') then raise exception '회계 확정·정정 정책 확인 전에는 초안만 저장할 수 있습니다.'; end if;
 if p_key is null or length(trim(p_key))=0 or length(p_key)>200 then raise exception '처리키를 확인해주세요.'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_data ?| array['organization_id','actor_id','p_org','p_actor'] then raise exception '회계 입력 형식을 확인해주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
 select * into saved from finance.workflow_operations where organization_id=p_org and operation_key='ACCOUNTING:'||p_key;
 if found then
  if saved.actor_id<>p_actor or saved.command<>p_command or saved.input<>p_data then raise exception '처리키가 다른 회계 입력에 이미 사용됐습니다.'; end if;
  return saved.result;
 end if;
 if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines')>200 then raise exception '분개행 배열을 확인해주세요.'; end if;
 current_date_value:=nullif(p_data->>'voucher_date','')::date;
 if current_date_value is null then raise exception '회계 귀속일을 입력해주세요.'; end if;
 if p_command='DRAFT_CREATE' then
  s:=finance.accounting_source(p_org,p_data->>'source_kind',(p_data->>'source_id')::uuid);
  if s->>'existing_voucher_id' is not null then raise exception '원본에 이미 연결된 전표가 있습니다. 기존 전표를 확인해주세요.'; end if;
  entity:=gen_random_uuid(); version:=1;
 else
  select * into c from finance.workflow_voucher_controls where organization_id=p_org and voucher_id=(p_data->>'id')::uuid for update;
  if not found then raise exception '조직의 통합 회계 초안을 찾을 수 없습니다.'; end if;
  select * into v from finance.vouchers where id=c.voucher_id and organization_id=p_org and deleted_at is null;
  if not found or v.approval_status<>'승인대기' then raise exception '수정할 수 있는 회계 초안이 아닙니다.'; end if;
  if c.lock_version is distinct from (p_data->>'lock_version')::integer then raise exception '다른 사용자가 수정했습니다. 최신 초안을 다시 불러와주세요.'; end if;
  select * into link from finance.workflow_voucher_links where voucher_id=c.voucher_id and organization_id=p_org;
  s:=finance.accounting_source(p_org,link.source_kind,link.source_id);
  if s->>'existing_voucher_id' is not null and (s->>'existing_voucher_id')::uuid<>c.voucher_id then raise exception '원본에 다른 전표가 연결됐습니다.'; end if;
  entity:=c.voucher_id; version:=c.lock_version+1;
  before_data:=jsonb_build_object('voucher',to_jsonb(v),'source',to_jsonb(link),'lines',coalesce((select jsonb_agg(to_jsonb(l) order by sort_order,id) from finance.voucher_lines l where l.voucher_id=entity),'[]'));
 end if;
 if (s->>'signature') is distinct from (p_data->>'source_signature') then raise exception '회계 원본이 변경됐습니다. 다시 조회하고 확인해주세요.'; end if;
 for item in select value from jsonb_array_elements(p_data->'lines') loop
  if jsonb_typeof(item)<>'object' or nullif(trim(item->>'description'),'') is null then raise exception '분개행 적요를 입력해주세요.'; end if;
  account_id:=nullif(item->>'account_subject_id','')::uuid;
  if account_id is not null and not exists(select 1 from finance.account_subjects where organization_id=p_org and id=account_id and is_active) then raise exception '조직의 활성 계정과목을 선택해주세요.'; end if;
  debit:=(item->>'debit_amount')::numeric; credit:=(item->>'credit_amount')::numeric;
  if debit is null or credit is null or debit<0 or credit<0 or debit<>trunc(debit) or credit<>trunc(credit) or debit>=100000000000000 or credit>=100000000000000 or (debit>0 and credit>0) then raise exception '분개행은 원 단위의 차변 또는 대변 금액으로 입력해주세요.'; end if;
 end loop;
 perform set_config('finance.accounting_voucher',entity::text,true);
 if p_command='DRAFT_CREATE' then
  prefix:='회계-'||extract(year from current_date_value)::integer||'-';
  select count(*)+1 into n from finance.vouchers where organization_id=p_org and voucher_no like prefix||'%';
  loop
   number:=prefix||lpad(n::text,6,'0');
   exit when not exists(select 1 from finance.vouchers where organization_id=p_org and voucher_no=number);
   n:=n+1;
  end loop;
  insert into finance.vouchers(id,organization_id,voucher_no,voucher_date,approval_status,memo,bank_transaction_id,expense_resolution_id)
   values(entity,p_org,number,current_date_value,'승인대기',coalesce(p_data->>'memo',''),(s->>'bank_transaction_id')::uuid,s->>'expense_resolution_id');
  insert into finance.workflow_voucher_controls(voucher_id,organization_id,created_by,updated_by) values(entity,p_org,p_actor,p_actor);
  insert into finance.workflow_voucher_links values(entity,p_org,s->>'kind',(s->>'id')::uuid,s->>'signature',s->'snapshot');
 else
  update finance.vouchers set voucher_date=current_date_value,memo=coalesce(p_data->>'memo',''),updated_at=now() where id=entity;
  update finance.workflow_voucher_controls set lock_version=version,updated_by=p_actor,updated_at=now() where voucher_id=entity;
  update finance.workflow_voucher_links set source_signature=s->>'signature',source_snapshot=s->'snapshot' where voucher_id=entity;
  delete from finance.voucher_lines where voucher_id=entity;
 end if;
 insert into finance.voucher_lines(voucher_id,account_subject_id,description,debit_amount,credit_amount,sort_order)
 select entity,nullif(value->>'account_subject_id','')::uuid,value->>'description',(value->>'debit_amount')::numeric,(value->>'credit_amount')::numeric,ordinality::integer from jsonb_array_elements(p_data->'lines') with ordinality;
 result:=jsonb_build_object('id',entity,'lock_version',version);
 insert into finance.workflow_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
 values(p_org,p_actor,entity,'ACCOUNTING_'||p_command,coalesce(p_data->>'memo',''),before_data,jsonb_build_object('input',p_data,'result',result,'source',s->'snapshot'));
 insert into finance.workflow_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,'ACCOUNTING:'||p_key,p_actor,p_command,p_data,result);
 perform set_config('finance.accounting_voucher',coalesce(previous_setting,''),true);
 return result;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='finance' and p.proname like 'accounting_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
