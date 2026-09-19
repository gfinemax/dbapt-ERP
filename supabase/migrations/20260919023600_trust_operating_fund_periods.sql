-- Monthly trust operating-fund ledger. Actual cash movement is linked only from
-- organization-scoped bank transactions; expense use is linked only from an
-- enrolled OPERATING workflow transaction. No amount is invented from a request.
create table finance.trust_operating_periods (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references core.organizations(id),
 month date not null check(month=date_trunc('month',month)::date),
 contract_version_id uuid not null,
 title text not null check(length(trim(title))>0),
 requested_amount numeric(16,0) not null check(requested_amount>=0),
 opening_balance numeric(16,0) not null default 0 check(opening_balance>=0),
 closing_balance numeric(16,0),
 status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','OPEN','SETTLED')),
 lock_version integer not null default 1 check(lock_version>0),
 request_reference text not null default '',
 submitted_at timestamptz, settled_at timestamptz,
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,month),
 foreign key(organization_id,contract_version_id) references finance.workflow_contract_versions(organization_id,id),
 check((status='DRAFT' and submitted_at is null and settled_at is null and closing_balance is null)
   or (status in ('SUBMITTED','OPEN') and submitted_at is not null and settled_at is null and closing_balance is null)
   or (status='SETTLED' and submitted_at is not null and settled_at is not null and closing_balance is not null))
);

create table finance.trust_operating_bank_links (
 organization_id uuid not null,
 period_id uuid not null,
 bank_transaction_id uuid not null,
 kind text not null check(kind in ('RECEIPT','RETURN')),
 amount numeric(16,0) not null check(amount>0),
 reason text not null check(length(trim(reason))>0),
 linked_by uuid not null references auth.users(id), linked_at timestamptz not null default now(),
 primary key(organization_id,bank_transaction_id),
 foreign key(organization_id,period_id) references finance.trust_operating_periods(organization_id,id)
);

create table finance.trust_operating_usage (
 organization_id uuid not null,
 period_id uuid not null,
 transaction_id uuid not null,
 amount numeric(16,0) not null check(amount>0),
 source_revision integer not null check(source_revision>0),
 source_signature text not null,
 reason text not null check(length(trim(reason))>0),
 linked_by uuid not null references auth.users(id), linked_at timestamptz not null default now(),
 primary key(organization_id,transaction_id),
 foreign key(organization_id,period_id) references finance.trust_operating_periods(organization_id,id),
 foreign key(organization_id,transaction_id) references finance.workflow_transactions(organization_id,id)
);

create index trust_operating_period_month on finance.trust_operating_periods(organization_id,month desc);
create index trust_operating_bank_period on finance.trust_operating_bank_links(organization_id,period_id);
create index trust_operating_usage_period on finance.trust_operating_usage(organization_id,period_id);

alter table finance.trust_operating_periods enable row level security;
alter table finance.trust_operating_bank_links enable row level security;
alter table finance.trust_operating_usage enable row level security;
revoke all on finance.trust_operating_periods,finance.trust_operating_bank_links,finance.trust_operating_usage from public,anon,authenticated;
grant select,insert,update,delete on finance.trust_operating_periods,finance.trust_operating_bank_links,finance.trust_operating_usage to service_role;

create function finance.trust_operating_totals(p_org uuid,p_period uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'requested',p.requested_amount,
  'opening',p.opening_balance,
  'received',coalesce((select sum(l.amount) from finance.trust_operating_bank_links l where l.organization_id=p_org and l.period_id=p.id and l.kind='RECEIPT'),0),
  'used',coalesce((select sum(u.amount) from finance.trust_operating_usage u where u.organization_id=p_org and u.period_id=p.id),0),
  'returned',coalesce((select sum(l.amount) from finance.trust_operating_bank_links l where l.organization_id=p_org and l.period_id=p.id and l.kind='RETURN'),0),
  'balance',p.opening_balance
   +coalesce((select sum(l.amount) from finance.trust_operating_bank_links l where l.organization_id=p_org and l.period_id=p.id and l.kind='RECEIPT'),0)
   -coalesce((select sum(u.amount) from finance.trust_operating_usage u where u.organization_id=p_org and u.period_id=p.id),0)
   -coalesce((select sum(l.amount) from finance.trust_operating_bank_links l where l.organization_id=p_org and l.period_id=p.id and l.kind='RETURN'),0)
 ) from finance.trust_operating_periods p where p.organization_id=p_org and p.id=p_period;
$$;

create function finance.trust_operating_usage_snapshot(p_org uuid,p_tx uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare t finance.workflow_transactions; amounts jsonb; snapshot jsonb;
begin
 select * into t from finance.workflow_transactions where organization_id=p_org and id=p_tx;
 if not found or t.route<>'OPERATING' or t.contract_version_id is null then raise exception '운영계좌 집행으로 분류된 지출만 연결할 수 있습니다.'; end if;
 amounts:=finance.workflow_transaction_amounts(p_org,p_tx);
 if coalesce((amounts->>'payment_review_required')::boolean,true) or (amounts->>'paid') is null then raise exception '실제 지급액을 먼저 확인해주세요.'; end if;
 if (amounts->>'paid')::numeric<=0 then raise exception '실제 지급이 연결된 지출만 사용할 수 있습니다.'; end if;
 snapshot:=jsonb_build_object('transaction_id',t.id,'title',t.title,'amount',t.amount,'paid',(amounts->>'paid')::numeric,
  'revision',t.revision,'source_signature',t.source_signature,'contract_version_id',t.contract_version_id);
 return snapshot||jsonb_build_object('signature',md5(snapshot::text));
end $$;

create function finance.trust_operating_read(p_org uuid,p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members; result jsonb;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not m.permissions && array['ADMIN','APPROVE','PAY','CLOSE','SENIOR'] then raise exception '운영비 신탁 업무 조회 권한이 필요합니다.'; end if;
 select jsonb_build_object(
  'periods',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('totals',finance.trust_operating_totals(p_org,p.id)) order by p.month desc) from finance.trust_operating_periods p where p.organization_id=p_org),'[]'),
  'bank_links',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('transacted_at',b.transacted_at,'description',b.description) order by b.transacted_at desc) from finance.trust_operating_bank_links l join finance.bank_transactions b on b.id=l.bank_transaction_id where l.organization_id=p_org),'[]'),
  'usage',coalesce((select jsonb_agg(to_jsonb(u)||jsonb_build_object('title',t.title,'current_revision',t.revision,'current_signature',t.source_signature) order by u.linked_at desc) from finance.trust_operating_usage u join finance.workflow_transactions t on t.id=u.transaction_id where u.organization_id=p_org),'[]'),
  'contracts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'conditions',c.conditions) order by c.version desc) from finance.workflow_contract_versions c where c.organization_id=p_org and c.status='VERIFIED' and c.conditions->>'operating_allowed'='true' and c.conditions->>'operating_advance_allowed'='true'),'[]'),
  'bank_candidates',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'transacted_at',b.transacted_at,'description',b.description,'deposit_amount',b.deposit_amount,'withdrawal_amount',b.withdrawal_amount,'bank_account_id',b.bank_account_id) order by b.transacted_at desc) from finance.bank_transactions b where b.organization_id=p_org and b.deleted_at is null and not exists(select 1 from finance.trust_operating_bank_links l where l.organization_id=p_org and l.bank_transaction_id=b.id)),'[]'),
  'usage_candidates',coalesce((select jsonb_agg(finance.trust_operating_usage_snapshot(p_org,t.id) order by t.updated_at desc) from finance.workflow_transactions t where t.organization_id=p_org and t.route='OPERATING' and t.contract_version_id is not null and not exists(select 1 from finance.trust_operating_usage u where u.organization_id=p_org and u.transaction_id=t.id) and (finance.workflow_transaction_amounts(p_org,t.id)->>'paid') is not null and coalesce((finance.workflow_transaction_amounts(p_org,t.id)->>'paid')::numeric,0)>0),'[]')
 ) into result;
 return result;
end $$;

create function finance.trust_operating_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op finance.workflow_operations; p finance.trust_operating_periods; c finance.workflow_contract_versions; b finance.bank_transactions; t finance.workflow_transactions;
 totals jsonb; usage jsonb; result jsonb; target uuid; opening numeric:=0; amount numeric; required_permission text;
begin
 required_permission:=case when p_command in ('BANK_LINK') then 'PAY' when p_command='PERIOD_SETTLE' then 'CLOSE' else 'APPROVE' end;
 perform finance.workflow_actor(p_org,p_actor,required_permission);
 if p_command not in ('PERIOD_SAVE','PERIOD_SUBMIT','BANK_LINK','USAGE_LINK','PERIOD_SETTLE') then raise exception '지원하지 않는 운영비 신탁 업무입니다.'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_data ?| array['organization_id','actor_id','p_org','p_actor'] then raise exception '운영비 입력 형식을 확인해주세요.'; end if;
 if p_key is null or length(trim(p_key))=0 or length(p_key)>200 then raise exception '처리키를 확인해주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,927));
 select * into op from finance.workflow_operations where organization_id=p_org and operation_key='OPERATING:'||p_key;
 if found then
  if op.actor_id<>p_actor or op.command<>p_command or op.input<>p_data then raise exception '처리키가 다른 운영비 입력에 이미 사용됐습니다.'; end if;
  return op.result;
 end if;

 if p_command='PERIOD_SAVE' then
  select * into c from finance.workflow_contract_versions where organization_id=p_org and id=(p_data->>'contract_version_id')::uuid and status='VERIFIED' for share;
  if not found or c.conditions->>'operating_allowed'<>'true' or c.conditions->>'operating_advance_allowed'<>'true' then raise exception '월 운영비 선교부가 확인된 신탁 계약이 필요합니다.'; end if;
  if nullif(trim(p_data->>'title'),'') is null or (p_data->>'requested_amount')::numeric<0 then raise exception '운영비 요청 제목과 금액을 확인해주세요.'; end if;
  if (p_data->>'month')::date<>date_trunc('month',(p_data->>'month')::date)::date then raise exception '운영비 귀속월을 확인해주세요.'; end if;
  if nullif(p_data->>'id','') is null then
   if exists(select 1 from finance.trust_operating_periods where organization_id=p_org and status<>'SETTLED') then raise exception '기존 운영비 월을 먼저 정산해주세요.'; end if;
   select coalesce(closing_balance,0) into opening from finance.trust_operating_periods where organization_id=p_org and status='SETTLED' order by month desc limit 1;
   insert into finance.trust_operating_periods(organization_id,month,contract_version_id,title,requested_amount,opening_balance,request_reference,created_by,updated_by)
   values(p_org,(p_data->>'month')::date,c.id,trim(p_data->>'title'),(p_data->>'requested_amount')::numeric,coalesce(opening,0),coalesce(p_data->>'request_reference',''),p_actor,p_actor) returning * into p;
  else
   select * into p from finance.trust_operating_periods where organization_id=p_org and id=(p_data->>'id')::uuid for update;
   if not found or p.status<>'DRAFT' then raise exception '수정할 운영비 요청 초안을 찾을 수 없습니다.'; end if;
   if p.lock_version<>(p_data->>'lock_version')::integer then raise exception '다른 사용자가 운영비 요청을 수정했습니다.'; end if;
   update finance.trust_operating_periods set month=(p_data->>'month')::date,contract_version_id=c.id,title=trim(p_data->>'title'),requested_amount=(p_data->>'requested_amount')::numeric,request_reference=coalesce(p_data->>'request_reference',''),lock_version=lock_version+1,updated_by=p_actor,updated_at=now() where id=p.id returning * into p;
  end if;
  target:=p.id;
 elsif p_command='PERIOD_SUBMIT' then
  select * into p from finance.trust_operating_periods where organization_id=p_org and id=(p_data->>'id')::uuid for update;
  if not found or p.status<>'DRAFT' or p.lock_version<>(p_data->>'lock_version')::integer then raise exception '제출할 최신 운영비 요청 초안을 확인해주세요.'; end if;
  update finance.trust_operating_periods set status='SUBMITTED',submitted_at=now(),lock_version=lock_version+1,updated_by=p_actor,updated_at=now() where id=p.id returning * into p; target:=p.id;
 elsif p_command='BANK_LINK' then
  select * into p from finance.trust_operating_periods where organization_id=p_org and id=(p_data->>'period_id')::uuid for update;
  if not found or p.status not in ('SUBMITTED','OPEN') then raise exception '수령·반납을 연결할 운영비 월을 확인해주세요.'; end if;
  select * into c from finance.workflow_contract_versions where organization_id=p_org and id=p.contract_version_id and status='VERIFIED';
  select * into b from finance.bank_transactions where organization_id=p_org and id=(p_data->>'bank_transaction_id')::uuid and deleted_at is null for update;
  if not found or not ((c.conditions->'operating_account_ids') ? b.bank_account_id::text) then raise exception '계약에서 허용한 운영계좌 거래를 선택해주세요.'; end if;
  if p_data->>'kind'='RECEIPT' then amount:=b.deposit_amount; elsif p_data->>'kind'='RETURN' then amount:=b.withdrawal_amount; else raise exception '수령 또는 반납 유형을 확인해주세요.'; end if;
  if amount<=0 then raise exception '선택한 거래의 실제 입출금액을 확인해주세요.'; end if;
  insert into finance.trust_operating_bank_links values(p_org,p.id,b.id,p_data->>'kind',amount,trim(p_data->>'reason'),p_actor,now());
  update finance.trust_operating_periods set status='OPEN',lock_version=lock_version+1,updated_by=p_actor,updated_at=now() where id=p.id returning * into p; target:=p.id;
 elsif p_command='USAGE_LINK' then
  select * into p from finance.trust_operating_periods where organization_id=p_org and id=(p_data->>'period_id')::uuid for update;
  if not found or p.status not in ('SUBMITTED','OPEN') then raise exception '사용내역을 연결할 운영비 월을 확인해주세요.'; end if;
  usage:=finance.trust_operating_usage_snapshot(p_org,(p_data->>'transaction_id')::uuid);
  if usage->>'contract_version_id'<>p.contract_version_id::text or usage->>'signature' is distinct from p_data->>'signature' then raise exception '운영비 지출 원본 또는 계약이 변경됐습니다.'; end if;
  select * into t from finance.workflow_transactions where organization_id=p_org and id=(p_data->>'transaction_id')::uuid;
  insert into finance.trust_operating_usage values(p_org,p.id,t.id,(usage->>'paid')::numeric,t.revision,t.source_signature,trim(p_data->>'reason'),p_actor,now());
  update finance.trust_operating_periods set status='OPEN',lock_version=lock_version+1,updated_by=p_actor,updated_at=now() where id=p.id returning * into p; target:=p.id;
 else
  select * into p from finance.trust_operating_periods where organization_id=p_org and id=(p_data->>'id')::uuid for update;
  if not found or p.status not in ('SUBMITTED','OPEN') or p.lock_version<>(p_data->>'lock_version')::integer then raise exception '정산할 최신 운영비 월을 확인해주세요.'; end if;
  if exists(select 1 from finance.trust_operating_usage u join finance.workflow_transactions x on x.id=u.transaction_id where u.organization_id=p_org and u.period_id=p.id and (u.source_revision<>x.revision or u.source_signature<>x.source_signature)) then raise exception '변경된 운영비 사용 원본을 먼저 재검토해주세요.'; end if;
  totals:=finance.trust_operating_totals(p_org,p.id);
  if (totals->>'received')::numeric<=0 or (totals->>'balance')::numeric<0 then raise exception '실제 수령액과 사용·반납 차액을 확인해주세요.'; end if;
  update finance.trust_operating_periods set status='SETTLED',closing_balance=(totals->>'balance')::numeric,settled_at=now(),lock_version=lock_version+1,updated_by=p_actor,updated_at=now() where id=p.id returning * into p; target:=p.id;
 end if;

 result:=jsonb_build_object('id',target,'lock_version',p.lock_version,'status',p.status,'totals',finance.trust_operating_totals(p_org,target));
 insert into finance.workflow_events(organization_id,actor_id,entity_id,action,reason,after_data) values(p_org,p_actor,target,'OPERATING:'||p_command,coalesce(p_data->>'reason',p_data->>'request_reference',''),jsonb_build_object('input',p_data,'result',result));
 insert into finance.workflow_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,'OPERATING:'||p_key,p_actor,p_command,p_data,result);
 return result;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='finance' and p.proname like 'trust_operating_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
