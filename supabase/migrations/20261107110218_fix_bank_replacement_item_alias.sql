-- PL/pgSQL 루프 변수와 INSERT SELECT 별칭이 모두 item이어서 발생한 모호성을 제거한다.
-- 기존 원장 보존, 감사 로그, 권한 및 원자적 교체 정책은 그대로 유지한다.
create or replace function finance.apply_ledger_bank_replacement(
  p_org uuid,p_actor uuid,p_bank_account_id uuid,p_expected_old_count integer,
  p_reason text,p_rows jsonb,p_source_system text default 'dbapt-ledger'
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  actor finance.reimbursement_members;
  preview jsonb;
  batch_id uuid:=gen_random_uuid();
  target_ids uuid[];
  ledger_account text;
  row_item jsonb;
  row_count integer;
  inserted_count integer:=0;
  old_deposit numeric:=0;
  old_withdrawal numeric:=0;
  new_deposit numeric:=0;
  new_withdrawal numeric:=0;
  source_id text;
  uid text;
  deposit_value numeric;
  withdrawal_value numeric;
begin
  actor:=finance.workflow_actor(p_org,p_actor);
  if not (actor.permissions && array['ADMIN','CLOSE']) then
    raise exception '은행 원장 교체는 관리자 또는 마감 담당자만 할 수 있습니다.';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 500 then
    raise exception '원장 교체 사유를 10자 이상 입력해주세요.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception '교체할 거래는 1건 이상 2,000건 이하로 입력해주세요.';
  end if;
  preview:=finance.preview_ledger_bank_replacement(p_org,p_actor,p_bank_account_id,p_source_system);
  if not coalesce((preview->>'ready')::boolean,false) then
    raise exception '후속 업무 연결 또는 원본 계좌 상태를 먼저 확인해주세요.';
  end if;
  if (preview->>'target_count')::integer<>p_expected_old_count then
    raise exception '교체 대상 건수가 달라졌습니다. 미리보기를 새로고침해주세요.';
  end if;
  if (select count(*) from jsonb_array_elements(p_rows)) <>
      (select count(distinct value->>'source_transaction_id') from jsonb_array_elements(p_rows)) then
    raise exception '거래고유번호가 중복되었습니다.';
  end if;

  for row_item in select value from jsonb_array_elements(p_rows) loop
    source_id:=trim(coalesce(row_item->>'source_transaction_id',''));
    uid:=trim(coalesce(row_item->>'bank_transaction_uid',''));
    deposit_value:=coalesce((row_item->>'deposit_amount')::numeric,0);
    withdrawal_value:=coalesce((row_item->>'withdrawal_amount')::numeric,0);
    if source_id='' or length(source_id)>200 or uid=''
      or coalesce(row_item->>'payload_hash','')!~'^[0-9a-f]{64}$'
      or coalesce(row_item->>'description','')=''
      or coalesce(row_item->>'transacted_at','')=''
      or coalesce(row_item->>'transaction_kind','') not in ('입금','출금')
      or deposit_value<0 or withdrawal_value<0 or ((deposit_value>0)=(withdrawal_value>0)) then
      raise exception '필수값 또는 입출금 방향을 확인해주세요. 거래고유번호: %',source_id;
    end if;
    if (row_item->>'transaction_kind'='입금')<>(deposit_value>0) then
      raise exception '거래구분과 입출금액이 일치하지 않습니다. 거래고유번호: %',source_id;
    end if;
    if exists(select 1 from finance.bank_transactions
      where bank_transaction_uid=uid and deleted_at is null) then
      raise exception '이미 등록된 거래고유번호입니다: %',source_id;
    end if;
    new_deposit:=new_deposit+deposit_value;
    new_withdrawal:=new_withdrawal+withdrawal_value;
  end loop;

  perform 1
  from finance.ledger_bank_transaction_sources s
  join finance.bank_transactions t on t.id=s.bank_transaction_id
  where s.organization_id=p_org and s.source_system=p_source_system
    and s.import_status='IMPORTED' and t.organization_id=p_org
    and t.bank_account_id=p_bank_account_id and t.deleted_at is null
  for update of s,t;

  select coalesce(array_agg(t.id order by t.id),'{}'::uuid[]),
    min(s.ledger_account_id),coalesce(sum(t.deposit_amount),0),coalesce(sum(t.withdrawal_amount),0)
  into target_ids,ledger_account,old_deposit,old_withdrawal
  from finance.ledger_bank_transaction_sources s
  join finance.bank_transactions t on t.id=s.bank_transaction_id
  where s.organization_id=p_org and s.source_system=p_source_system
    and s.import_status='IMPORTED' and t.organization_id=p_org
    and t.bank_account_id=p_bank_account_id and t.deleted_at is null;
  row_count:=cardinality(target_ids);
  if row_count<>p_expected_old_count then
    raise exception '교체 대상이 변경되었습니다. 다시 미리보기 해주세요.';
  end if;

  insert into finance.bank_transaction_replacement_batches(
    id,organization_id,bank_account_id,source_system,ledger_account_id,
    replaced_count,replacement_count,replaced_deposit_total,replaced_withdrawal_total,
    replacement_deposit_total,replacement_withdrawal_total,reason,input_hash,applied_by
  ) values(
    batch_id,p_org,p_bank_account_id,p_source_system,ledger_account,row_count,jsonb_array_length(p_rows),
    old_deposit,old_withdrawal,new_deposit,new_withdrawal,trim(p_reason),md5(p_rows::text),p_actor
  );

  update finance.bank_transactions set
    deleted_at=clock_timestamp(),superseded_by_batch_id=batch_id
  where id=any(target_ids);
  update finance.ledger_bank_transaction_sources set
    import_status='SUPERSEDED',issue_detail='ERP 원장 교체 배치 '||batch_id::text||'로 사용 제외',
    synced_at=clock_timestamp()
  where organization_id=p_org and source_system=p_source_system
    and bank_transaction_id=any(target_ids) and import_status='IMPORTED';

  insert into finance.bank_transactions(
    organization_id,bank_account_id,transacted_at,transaction_kind,description,
    deposit_amount,withdrawal_amount,balance_amount,counterparty,branch_name,
    uploaded_major_category,uploaded_account_title,recommended_account_subject_id,
    recommended_account_subject_name,match_status,raw_payload,memo,bank_transaction_uid,
    classification_status,recommendation_reason,source_system,source_transaction_id,
    source_payload_hash,source_readonly,source_imported_at,replacement_batch_id
  )
  select p_org,p_bank_account_id,(row_element.value->>'transacted_at')::timestamptz,row_element.value->>'transaction_kind',
    row_element.value->>'description',(row_element.value->>'deposit_amount')::numeric,
    (row_element.value->>'withdrawal_amount')::numeric,(row_element.value->>'balance_amount')::numeric,
    nullif(row_element.value->>'counterparty',''),nullif(row_element.value->>'branch_name',''),
    nullif(row_element.value->>'uploaded_major_category',''),nullif(row_element.value->>'uploaded_account_title',''),
    nullif(row_element.value->>'recommended_account_subject_id','')::uuid,
    nullif(row_element.value->>'recommended_account_subject_name',''),
    coalesce(nullif(row_element.value->>'match_status',''),'미분류'),
    coalesce(row_element.value->'raw_payload','{}'::jsonb),nullif(row_element.value->>'memo',''),
    row_element.value->>'bank_transaction_uid',
    case when nullif(row_element.value->>'recommended_account_subject_name','') is null
      then 'UNREVIEWED' else 'RECOMMENDED' end,
    nullif(row_element.value->>'recommendation_reason',''),'erp-bank-file',
    row_element.value->>'source_transaction_id',row_element.value->>'payload_hash',
    true,clock_timestamp(),batch_id
  from jsonb_array_elements(p_rows) as row_element(value);
  get diagnostics inserted_count=row_count;

  insert into audit.audit_logs(
    organization_id,actor_user_id,action,entity_schema,entity_table,entity_id,before_data,after_data
  ) values(
    p_org,p_actor,'BANK_LEDGER_REPLACED','finance','bank_transaction_replacement_batches',batch_id::text,
    jsonb_build_object('ledger_account_id',ledger_account,'count',p_expected_old_count,
      'deposit_total',old_deposit,'withdrawal_total',old_withdrawal),
    jsonb_build_object('count',inserted_count,'deposit_total',new_deposit,
      'withdrawal_total',new_withdrawal,'reason',trim(p_reason))
  );
  return jsonb_build_object('batch_id',batch_id,'replaced_count',p_expected_old_count,
    'replacement_count',inserted_count,'replacement_deposit_total',new_deposit,
    'replacement_withdrawal_total',new_withdrawal);
end $$;
