-- Classification is metadata, never an approval, bank payment, or budget posting.
-- Existing sources remain untouched and unclassified until explicitly reviewed.
create table finance.expense_classifications (
 organization_id uuid not null,
 transaction_id uuid not null,
 cost_category text not null default 'UNKNOWN' check(cost_category in ('UNKNOWN','OPERATING','BUSINESS')),
 payment_method text not null default 'UNKNOWN' check(payment_method in ('UNKNOWN','CORPORATE_CARD','PERSONAL_CARD','BANK_TRANSFER','CASH','UNPAID')),
 funding_origin text not null default 'UNKNOWN' check(funding_origin in ('UNKNOWN','ORGANIZATION','PERSONAL','ADVANCE')),
 processing_route text not null default 'UNKNOWN' check(processing_route in ('UNKNOWN','SIMPLE','SMALL_CONFIRMATION','RESOLUTION')),
 -- This is an evaluated state, not a user assertion. The editor cannot grant WITHIN.
 budget_state text not null default 'UNKNOWN' check(budget_state in ('UNKNOWN','WITHIN','OVER_OR_UNBUDGETED')),
 budget_evaluation jsonb,
 advance_transaction_id uuid,
 source_signature text not null,
 version integer not null default 1 check(version>0),
 reason text not null check(length(trim(reason))>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(organization_id,transaction_id),
 foreign key(organization_id,transaction_id) references finance.workflow_transactions(organization_id,id),
 foreign key(organization_id,advance_transaction_id) references finance.workflow_transactions(organization_id,id),
 check((funding_origin='ADVANCE')=(advance_transaction_id is not null)),
 check(advance_transaction_id is distinct from transaction_id),
 check(payment_method<>'CORPORATE_CARD' or funding_origin in ('UNKNOWN','ORGANIZATION')),
 check(budget_state='UNKNOWN' or budget_evaluation is not null)
);
alter table finance.expense_classifications enable row level security;
revoke all on finance.expense_classifications from public,anon,authenticated;
grant select,insert,update on finance.expense_classifications to service_role;

create function finance.expense_classification_save(p_org uuid,p_actor uuid,p_data jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare tx finance.workflow_transactions; existing finance.expense_classifications; op finance.workflow_operations;
 src jsonb; advance_src jsonb; next_version integer; result jsonb; before_value jsonb;
begin
 perform finance.workflow_actor(p_org,p_actor,'APPROVE');
 if p_data is null or jsonb_typeof(p_data)<>'object' or exists (
   select 1 from jsonb_object_keys(p_data) k where k not in ('transaction_id','expected_version','source_signature','cost_category','payment_method','funding_origin','processing_route','advance_transaction_id','reason')
 ) then raise exception '지출 분류 입력 형식을 확인해주세요.'; end if;
 if nullif(trim(p_key),'') is null or length(p_key)>200 then raise exception '처리키를 확인해주세요.'; end if;
 if nullif(trim(p_data->>'reason'),'') is null or length(p_data->>'reason')>2000 then raise exception '분류 확인 사유를 입력해주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
 select * into op from finance.workflow_operations where organization_id=p_org and operation_key='CLASSIFY:'||p_key;
 if found then
  if op.actor_id<>p_actor or op.command<>'CLASSIFY' or op.input<>p_data then raise exception '처리키가 다른 입력에 사용됐습니다.'; end if;
  return op.result;
 end if;
 select * into tx from finance.workflow_transactions where organization_id=p_org and id=(p_data->>'transaction_id')::uuid for update;
 if not found or tx.source_kind not in ('RESOLUTION','QUICK','PERSONAL') then raise exception '조직의 지출 원본을 찾을 수 없습니다.'; end if;
 src:=finance.workflow_source(p_org,tx.source_kind,tx.source_id);
 if p_data->>'source_signature' is distinct from tx.source_signature or src->>'signature' is distinct from tx.source_signature then
  raise exception '지출 원본이 변경됐습니다. 원본을 갱신한 후 다시 확인해주세요.';
 end if;
 select * into existing from finance.expense_classifications where organization_id=p_org and transaction_id=tx.id;
 if coalesce(existing.version,0) is distinct from (p_data->>'expected_version')::integer then raise exception '분류가 변경됐습니다. 새로 조회해주세요.'; end if;
 before_value:=case when existing.transaction_id is null then null else to_jsonb(existing) end;
 next_version:=coalesce(existing.version,0)+1;
 if p_data->>'cost_category'='BUSINESS' and p_data->>'processing_route' not in ('UNKNOWN','RESOLUTION') then raise exception '사업비는 지출결의로 처리해야 합니다.'; end if;
 if p_data->>'cost_category'='BUSINESS' and tx.route='OPERATING' then raise exception '사업비는 조합 직접 지급 경로와 함께 지정할 수 없습니다. 집행 경로를 먼저 확인해주세요.'; end if;
 if p_data->>'funding_origin'='ADVANCE' then
  if p_data->>'payment_method' in ('UNPAID','CORPORATE_CARD') then raise exception '선지급금의 실제 사용 결제수단을 확인해주세요.'; end if;
  if tx.source_kind='PERSONAL' or (tx.source_kind='QUICK' and exists(select 1 from finance.personal_reimbursements where organization_id=p_org and source_quick_id::text=tx.source_id)) then
   raise exception '개인 환급과 선지급 정산의 중복 여부를 먼저 해소해주세요.';
  end if;
  advance_src:=finance.advance_settlement_source(p_org,(p_data->>'advance_transaction_id')::uuid);
  if coalesce((advance_src->>'legacy_review_required')::boolean,true) then raise exception '실제 선지급 내역의 확인이 필요합니다.'; end if;
  if jsonb_array_length(advance_src->'allocations')=0 then raise exception '실제로 지급된 선지급금만 연결할 수 있습니다.'; end if;
 end if;
 insert into finance.expense_classifications(organization_id,transaction_id,cost_category,payment_method,funding_origin,processing_route,advance_transaction_id,source_signature,version,reason,updated_by)
 values(p_org,tx.id,p_data->>'cost_category',p_data->>'payment_method',p_data->>'funding_origin',p_data->>'processing_route',nullif(p_data->>'advance_transaction_id','')::uuid,tx.source_signature,next_version,trim(p_data->>'reason'),p_actor)
 on conflict(organization_id,transaction_id) do update set cost_category=excluded.cost_category,payment_method=excluded.payment_method,
 funding_origin=excluded.funding_origin,processing_route=excluded.processing_route,advance_transaction_id=excluded.advance_transaction_id,
 source_signature=excluded.source_signature,version=excluded.version,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now(),
 budget_state='UNKNOWN',budget_evaluation=null;
 select to_jsonb(c) into result from finance.expense_classifications c where organization_id=p_org and transaction_id=tx.id;
 insert into finance.workflow_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
 values(p_org,p_actor,tx.id,'EXPENSE_CLASSIFY',trim(p_data->>'reason'),before_value,result);
 insert into finance.workflow_operations(organization_id,operation_key,actor_id,command,input,result)
 values(p_org,'CLASSIFY:'||p_key,p_actor,'CLASSIFY',p_data,result);
 return result;
end $$;
revoke all on function finance.expense_classification_save(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function finance.expense_classification_save(uuid,uuid,jsonb,text) to service_role;
