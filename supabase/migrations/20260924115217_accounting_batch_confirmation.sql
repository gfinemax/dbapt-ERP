-- Accounting B: keep draft creation explicit and allow an authorized reviewer to
-- confirm complete, source-current managed drafts in one atomic batch.

-- A non-partial unique index lets the Data API use bank_transaction_uid as an
-- ON CONFLICT target while PostgreSQL still permits multiple legacy NULL values.
drop index if exists finance.bank_transactions_uid_unique_idx;
create unique index bank_transactions_uid_unique_idx
  on finance.bank_transactions(bank_transaction_uid);

create function finance.accounting_batch_confirm(
  p_org uuid,
  p_actor uuid,
  p_data jsonb,
  p_key text
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  saved finance.workflow_operations;
  item jsonb;
  c finance.workflow_voucher_controls;
  v finance.vouchers;
  link finance.workflow_voucher_links;
  source jsonb;
  source_amount numeric;
  debit_total numeric;
  credit_total numeric;
  line_count integer;
  invalid_line_count integer;
  entity uuid;
  expected_version integer;
  reason text;
  seen uuid[] := array[]::uuid[];
  confirmed_ids jsonb := '[]'::jsonb;
  result jsonb;
  before_data jsonb;
  previous_setting text := current_setting('finance.accounting_voucher', true);
begin
  perform finance.workflow_actor(p_org,p_actor,'APPROVE');
  if p_key is null or length(trim(p_key))=0 or length(p_key)>200 then
    raise exception '처리키를 확인해주세요.';
  end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or p_data ?| array['organization_id','actor_id','p_org','p_actor'] then
    raise exception '회계 입력 형식을 확인해주세요.';
  end if;
  if jsonb_typeof(p_data->'items') is distinct from 'array'
    or jsonb_array_length(p_data->'items')<1
    or jsonb_array_length(p_data->'items')>100 then
    raise exception '확정할 전표를 1건 이상 100건 이하로 선택해주세요.';
  end if;
  reason:=trim(coalesce(p_data->>'reason',''));
  if length(reason)<2 or length(reason)>500 then
    raise exception '일괄 확인 근거를 2자 이상 500자 이하로 입력해주세요.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
  select * into saved
  from finance.workflow_operations
  where organization_id=p_org and operation_key='ACCOUNTING_CONFIRM:'||p_key;
  if found then
    if saved.actor_id<>p_actor or saved.command<>'BATCH_CONFIRM' or saved.input<>p_data then
      raise exception '처리키가 다른 회계 입력에 이미 사용됐습니다.';
    end if;
    return saved.result;
  end if;

  for item in select value from jsonb_array_elements(p_data->'items') loop
    if jsonb_typeof(item)<>'object' or nullif(item->>'id','') is null or nullif(item->>'lock_version','') is null then
      raise exception '확정할 전표와 버전을 다시 확인해주세요.';
    end if;
    entity:=(item->>'id')::uuid;
    expected_version:=(item->>'lock_version')::integer;
    if expected_version<1 or entity=any(seen) then
      raise exception '확정할 전표와 버전을 다시 확인해주세요.';
    end if;
    seen:=array_append(seen,entity);

    select * into c
    from finance.workflow_voucher_controls
    where organization_id=p_org and voucher_id=entity
    for update;
    if not found then raise exception '조직의 통합 회계 초안을 찾을 수 없습니다.'; end if;
    if c.lock_version<>expected_version then raise exception '다른 사용자가 전표를 변경했습니다. 최신 초안을 다시 불러와주세요.'; end if;

    select * into v
    from finance.vouchers
    where organization_id=p_org and id=entity and deleted_at is null;
    if not found or v.approval_status<>'승인대기' then
      raise exception '% 전표는 확정할 수 있는 초안이 아닙니다.',coalesce(v.voucher_no,entity::text);
    end if;
    select * into link
    from finance.workflow_voucher_links
    where organization_id=p_org and voucher_id=entity;
    if not found then raise exception '% 전표의 연결 원본을 확인해주세요.',v.voucher_no; end if;

    source:=finance.accounting_source(p_org,link.source_kind,link.source_id);
    if (source->>'signature') is distinct from link.source_signature then
      raise exception '% 전표의 원본이 변경됐습니다. 초안을 다시 검토해주세요.',v.voucher_no;
    end if;
    source_amount:=(source->>'amount')::numeric;

    select
      count(*)::integer,
      count(*) filter(where l.account_subject_id is null or a.id is null or not a.is_active
        or ((l.debit_amount>0)=(l.credit_amount>0)))::integer,
      coalesce(sum(l.debit_amount),0),
      coalesce(sum(l.credit_amount),0)
    into line_count,invalid_line_count,debit_total,credit_total
    from finance.voucher_lines l
    left join finance.account_subjects a
      on a.id=l.account_subject_id and a.organization_id=p_org
    where l.voucher_id=entity;

    if line_count<2 then raise exception '% 전표는 차변·대변 분개가 모두 필요합니다.',v.voucher_no; end if;
    if invalid_line_count>0 then raise exception '% 전표에 활성 계정과목 또는 차대 구분을 확인할 분개가 있습니다.',v.voucher_no; end if;
    if debit_total<=0 or debit_total<>credit_total then raise exception '% 전표의 차변과 대변 합계가 일치하지 않습니다.',v.voucher_no; end if;
    if debit_total<>source_amount then raise exception '% 전표의 분개 합계와 원본 금액이 일치하지 않습니다.',v.voucher_no; end if;

    before_data:=jsonb_build_object(
      'voucher',to_jsonb(v),
      'control',to_jsonb(c),
      'source',to_jsonb(link),
      'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.sort_order,l.id) from finance.voucher_lines l where l.voucher_id=entity),'[]'::jsonb)
    );
    perform set_config('finance.accounting_voucher',entity::text,true);
    update finance.vouchers
    set approval_status='승인완료',updated_at=now()
    where id=entity;
    update finance.workflow_voucher_controls
    set lock_version=lock_version+1,updated_by=p_actor,updated_at=now()
    where voucher_id=entity;
    insert into finance.workflow_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
    values(p_org,p_actor,entity,'ACCOUNTING_BATCH_CONFIRM',reason,before_data,
      jsonb_build_object('approval_status','승인완료','lock_version',expected_version+1));
    confirmed_ids:=confirmed_ids||jsonb_build_array(entity);
  end loop;

  perform set_config('finance.accounting_voucher',coalesce(previous_setting,''),true);
  result:=jsonb_build_object('confirmed_count',jsonb_array_length(confirmed_ids),'confirmed_ids',confirmed_ids);
  insert into finance.workflow_operations(organization_id,operation_key,actor_id,command,input,result)
  values(p_org,'ACCOUNTING_CONFIRM:'||p_key,p_actor,'BATCH_CONFIRM',p_data,result);
  return result;
end $$;

revoke all on function finance.accounting_batch_confirm(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function finance.accounting_batch_confirm(uuid,uuid,jsonb,text) to service_role;
