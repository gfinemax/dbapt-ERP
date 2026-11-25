-- The ordinary draft command continues to reject approved documents.
create function finance.expense_correction_month(p_source finance.expense_resolutions)
returns date language sql immutable security invoker set search_path='' as $$
  select coalesce(p_source.budget_month,
    date_trunc('month', coalesce(p_source.actual_expense_date, p_source.accounting_date)::timestamp)::date)
$$;

create function finance.expense_correction_account_block(p_source finance.expense_resolutions)
returns text language plpgsql stable security invoker set search_path='' as $$
declare
  source_data jsonb := p_source.resolution_data;
  source_month date := finance.expense_correction_month(p_source);
  linked_count integer;
  linked_amount numeric;
  invalid boolean;
begin
  if source_data->>'resolutionType' is distinct from 'SINGLE'
    or jsonb_array_length(coalesce(nullif(source_data->'accountAllocations', 'null'), '[]')) > 1
    or (select count(*) from finance.expense_account_allocations where resolution_id=p_source.id) > 1 then
    return '일괄결의·분할계정은 항목별 예산과 분개를 먼저 대조해야 해.';
  end if;
  if source_month is null or coalesce(p_source.total_payment_amount, 0) <= 0 then
    return '회계 귀속월과 결의 금액을 먼저 확인해줘.';
  end if;
  if exists (select 1 from finance.budget_source_assignments a
    where a.organization_id=p_source.organization_id and a.source_kind='RESOLUTION' and a.source_id=p_source.id) then
    return '월 예산·마감에서 별도 예산 배정이 적용된 문서야. 계정 정정 전에 배정 검토가 필요해.';
  end if;
  if exists (select 1 from finance.reimbursement_periods p
    where p.organization_id=p_source.organization_id and p.status='CLOSED'
      and (p.month in (source_month, date_trunc('month', p_source.accounting_date::timestamp)::date)
        or exists (select 1 from finance.vouchers v
          where v.organization_id=p_source.organization_id and v.expense_resolution_id=p_source.id
            and v.deleted_at is null and v.approval_status is distinct from '취소'
            and v.voucher_date >= p.month and v.voucher_date < p.month + interval '1 month'))) then
    return '마감된 월의 계정은 월 예산·마감에서 검토해줘.';
  end if;
  if finance.accounting_resolution_managed(p_source.organization_id, p_source.id) then
    return '통합 회계에 연결된 전표는 전표관리에서 정정 검토해줘.';
  end if;

  -- A single debit per voucher is required to avoid moving tax or split lines.
  select count(*), coalesce(sum(lines.debit), 0), coalesce(bool_or(
    lines.debit_count <> 1 or lines.debit <> lines.credit or lines.invalid_count <> 0
    or v.approval_status not in ('승인대기', '승인완료')
    or (p_source.expense_kind='BANK_POST_APPROVAL' and v.approval_status<>'승인완료')
  ), false)
  into linked_count, linked_amount, invalid
  from finance.vouchers v
  cross join lateral (
    select coalesce(sum(debit_amount), 0) as debit, coalesce(sum(credit_amount), 0) as credit,
      count(*) filter (where debit_amount>0) as debit_count,
      count(*) filter (where (debit_amount>0)=(credit_amount>0)) as invalid_count
    from finance.voucher_lines where voucher_id=v.id
  ) lines
  where v.organization_id=p_source.organization_id and v.expense_resolution_id=p_source.id
    and v.deleted_at is null and v.approval_status is distinct from '취소';
  if invalid or (linked_count>0 and linked_amount<>p_source.total_payment_amount)
    or (linked_count=0 and (p_source.voucher_no is not null or p_source.expense_kind='BANK_POST_APPROVAL')) then
    return '연결 전표의 상태·차변·대변과 결의 금액을 전표관리에서 먼저 확인해줘.';
  end if;
  return null;
end
$$;

create function finance.expense_correction_account_choices(p_source finance.expense_resolutions)
returns table(account_id uuid, account_name text, budget_id uuid, budget_name text, detail_id uuid, detail_name text)
language sql stable security invoker set search_path='' as $$
  select s.id, s.name, b.id, b.budget_item, d.id, d.name
  from finance.account_subject_budget_links l
  join finance.account_subjects s on s.id=l.account_subject_id and s.organization_id=l.organization_id
  join approval.budgets b on b.id=l.budget_id and b.organization_id=l.organization_id
  join finance.expense_detail_items d on d.budget_id=b.id
  where l.organization_id=p_source.organization_id and l.status='ACTIVE'
    and s.is_active and s.subject_type='지출' and s.normal_balance='차변'
    and d.is_active and d.status='CONFIRMED' and b.mapping_status='CONFIRMED'
    and b.fiscal_year=extract(year from finance.expense_correction_month(p_source))
    and (p_source.approval_document_id is null or b.id=p_source.budget_id)
  order by s.name, b.budget_item, d.sort_order, d.id
$$;

create function finance.approved_expense_correction_options(p_org uuid, p_actor uuid, p_id text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  source finance.expense_resolutions;
  blocked text;
begin
  perform finance.workflow_actor(p_org,p_actor,'ADMIN');
  select * into source from finance.expense_resolutions
    where organization_id=p_org and id=p_id and deleted_at is null and approval_status='승인완료';
  if not found then raise exception '승인완료 지출결의서를 찾을 수 없어.'; end if;
  blocked := finance.expense_correction_account_block(source);
  if blocked is not null then return jsonb_build_object('options', '[]'::jsonb, 'blockedReason', blocked); end if;
  return jsonb_build_object('options', coalesce((select jsonb_agg(jsonb_build_object(
    'accountId', c.account_id, 'accountName', c.account_name, 'budgetId', c.budget_id,
    'budgetName', c.budget_name, 'detailId', c.detail_id, 'detailName', c.detail_name
  ) order by c.account_name, c.budget_name, c.detail_name) from finance.expense_correction_account_choices(source) c), '[]'));
end
$$;

create function finance.correct_approved_expense_resolution(
  p_org uuid, p_actor uuid, p_id text, p_revision integer, p_reason text, p_patch jsonb, p_key text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  member finance.reimbursement_members;
  source finance.expense_resolutions;
  prior finance.expense_authorization_operations;
  voucher finance.vouchers;
  classification record;
  allocation jsonb;
  batch_item jsonb;
  field text;
  next_value text;
  blocked text;
  target_month date;
  budget_row jsonb;
  used_amount numeric;
  expected_amount numeric;
  remaining_amount numeric;
  usage_rate numeric;
  before_lines jsonb;
  after_lines jsonb;
  before_data jsonb;
  after_data jsonb;
  item_purposes jsonb;
  changes jsonb := '[]';
  revision integer;
  op_hash text;
  changed_at timestamptz := clock_timestamp();
  previous_org text := current_setting('finance.legacy_expense_command_org', true);
  previous_id text := current_setting('finance.legacy_expense_command_id', true);
  previous_voucher text := current_setting('finance.accounting_voucher', true);
begin
  member := finance.workflow_actor(p_org,p_actor);
  if not exists (select 1 from core.organizations where id=p_org and status='active') then
    raise exception '활성 조직이 아니야.';
  end if;
  p_reason := btrim(coalesce(p_reason,''));
  if char_length(p_reason) not between 2 and 500 or coalesce(char_length(p_key),0) not between 1 and 200
    or p_revision is null or p_revision < 0 or jsonb_typeof(p_patch) is distinct from 'object'
    or p_patch - array['subject','reason','memo','itemPurposes','classification'] <> '{}' then
    raise exception '정정 사유와 수정할 항목을 확인해줘.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
  op_hash := md5(jsonb_build_array(p_id,p_revision,p_reason,p_patch)::text);
  select * into prior from finance.expense_authorization_operations where organization_id=p_org and operation_key=p_key;
  if found then
    if prior.actor_id<>p_actor or prior.command<>'CORRECT_APPROVED' or prior.input_hash<>op_hash then
      raise exception '처리키가 다른 정정에 사용됐어.';
    end if;
    return prior.result;
  end if;
  select * into source from finance.expense_resolutions
    where organization_id=p_org and id=p_id and deleted_at is null for update;
  if not found or source.approval_status is distinct from '승인완료'
    or source.resolution_data->>'approvalStatus' is distinct from '승인완료'
    or source.expense_kind='PETTY_CASH_BATCH' or source.resolution_data->>'expenseKind'='PETTY_CASH_BATCH'
    or source.resolution_data->>'creationSource'='SMALL_EXPENSE'
    or source.resolution_data->>'approvalSkipReason'='소액경비 일괄결의' then
    raise exception '정정할 수 있는 승인완료 지출결의서를 찾을 수 없어.';
  end if;
  if not ('ADMIN'=any(member.permissions)) and not (
    member.permissions && array['APPROVE','PAY'] and exists (
      select 1 from finance.expense_authorization_bindings b
      where b.resolution_id=p_id and b.organization_id=p_org and b.author_user_id=p_actor
    )
  ) then raise exception '연결된 작성자 또는 관리자만 정정할 수 있어.'; end if;
  before_data := source.resolution_data;
  revision := coalesce((before_data->>'correctionRevision')::integer, 0);
  if revision<>p_revision then raise exception '다른 담당자가 먼저 정정했어. 상세 화면을 다시 열어줘.'; end if;
  after_data := before_data;
  for field in select unnest(array['subject','reason','memo']) loop
    if not (p_patch ? field) then continue; end if;
    next_value := btrim(p_patch->>field);
    if jsonb_typeof(p_patch->field) is distinct from 'string'
      or char_length(next_value)>(case when field='subject' then 60 else 4000 end)
      or (field<>'memo' and next_value='') then raise exception '정정할 문구를 확인해줘.'; end if;
    if coalesce(before_data->>field,'') is distinct from next_value then
      changes := changes || jsonb_build_array(jsonb_build_object(
        'label', case field when 'subject' then '건명' when 'reason' then '업무목적' else '내부메모' end,
        'before', coalesce(before_data->>field,''), 'after', next_value));
      after_data := jsonb_set(after_data,array[field],to_jsonb(next_value));
    end if;
  end loop;
  perform set_config('finance.legacy_expense_command_org',p_org::text,true);
  perform set_config('finance.legacy_expense_command_id',p_id,true);

  if p_patch ? 'itemPurposes' then
    item_purposes := p_patch->'itemPurposes';
    if jsonb_typeof(item_purposes) is distinct from 'object'
      or before_data->>'resolutionType' is distinct from 'BATCH' then raise exception '일괄결의 항목을 확인해줘.'; end if;
    for field in select jsonb_object_keys(item_purposes) loop
      select item into batch_item from jsonb_array_elements(before_data->'expenseItems') item where item->>'id'=field;
      next_value := btrim(item_purposes->>field);
      if not found or jsonb_typeof(item_purposes->field) is distinct from 'string'
        or char_length(next_value) not between 1 and 4000 then raise exception '일괄결의 항목의 업무목적을 확인해줘.'; end if;
      if coalesce(batch_item->>'businessPurpose','')=next_value then continue; end if;
      changes := changes || jsonb_build_array(jsonb_build_object(
        'label', concat(batch_item->>'itemNo','행 업무목적'),
        'before', coalesce(nullif(batch_item->>'businessPurpose',''),before_data->>'reason',''), 'after', next_value));
      update finance.expense_resolution_items set item_data=item_data||jsonb_build_object('businessPurpose',next_value),
        updated_at=changed_at where id=field and resolution_id=p_id and item_kind='BATCH';
      update finance.expense_detail_transactions set business_purpose=next_value, updated_at=changed_at
        where id=field and resolution_id=p_id and deleted_at is null;
    end loop;
    for field in select unnest(array['expenseItems','pettyCashTransactions']) loop
      if jsonb_typeof(after_data->field)='array' then
        after_data := jsonb_set(after_data,array[field],(
          select coalesce(jsonb_agg(
            case when item_purposes ? (item->>'id') then item||jsonb_build_object(
              'businessPurpose',btrim(item_purposes->>(item->>'id'))) else item end order by ord
          ),'[]') from jsonb_array_elements(after_data->field) with ordinality as rows(item,ord)
        ));
      end if;
    end loop;
  end if;

  if p_patch ? 'classification' then
    if not ('ADMIN'=any(member.permissions)) then raise exception '계정·예산 정정은 관리자만 할 수 있어.'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
    blocked := finance.expense_correction_account_block(source);
    if blocked is not null then raise exception '%',blocked; end if;
    select * into classification from finance.expense_correction_account_choices(source) c
      where c.account_id::text=p_patch->'classification'->>'accountId'
        and c.budget_id::text=p_patch->'classification'->>'budgetId'
        and c.detail_id::text=p_patch->'classification'->>'detailId';
    if not found then raise exception '조합에서 사용 중인 계정과 확정된 예산·세부항목을 선택해줘.'; end if;
    target_month := finance.expense_correction_month(source);
    allocation := before_data->'accountAllocations'->0;
    if allocation is not null and (allocation->>'amount')::numeric is distinct from source.total_payment_amount then
      raise exception '기존 계정 배분과 결의서 금액을 확인해줘.';
    end if;
    allocation := coalesce(allocation,jsonb_build_object('id',gen_random_uuid()::text,'description',''))
      || jsonb_build_object('accountTitle',classification.account_name,'budgetItem',classification.budget_name,
        'amount',source.total_payment_amount::text);
    changes := changes || jsonb_build_array(jsonb_build_object(
      'label','계정과목 · 예산 · 세부항목',
      'before',concat_ws(' · ',before_data->'accountAllocations'->0->>'accountTitle',before_data->>'budgetItem',before_data->>'operationExpenseDetail'),
      'after',concat_ws(' · ',classification.account_name,classification.budget_name,classification.detail_name)));
    after_data := after_data || jsonb_build_object(
      'correctedAccountSubjectId',classification.account_id, 'representativeAccountTitle',classification.account_name,
      'budgetId',classification.budget_id,'budgetMonth',target_month,'budgetItem',classification.budget_name,
      'expenseDetailId',classification.detail_id,'operationExpenseDetail',classification.detail_name,
      'accountAllocations',jsonb_build_array(allocation)
    );
    if exists (select 1 from finance.expense_account_allocations a
      where a.resolution_id=p_id and (a.id<>allocation->>'id' or a.amount<>source.total_payment_amount)) then
      raise exception '저장된 계정 배분을 결의서와 먼저 대조해줘.';
    end if;
    insert into finance.expense_account_allocations(id,resolution_id,account_title,budget_item,amount,description,allocation_data,updated_at)
      values(allocation->>'id',p_id,classification.account_name,classification.budget_name,
        source.total_payment_amount,allocation->>'description',allocation,changed_at)
      on conflict(id) do update set account_title=excluded.account_title,budget_item=excluded.budget_item,
        allocation_data=excluded.allocation_data,updated_at=excluded.updated_at
      where expense_account_allocations.resolution_id=p_id;
    if not found then raise exception '계정 배분 원본이 일치하지 않아.'; end if;

    for voucher in select * from finance.vouchers v where v.organization_id=p_org and v.expense_resolution_id=p_id
      and v.deleted_at is null and v.approval_status is distinct from '취소' order by v.id for update
    loop
      select jsonb_agg(to_jsonb(l) order by l.sort_order,l.id) into before_lines from finance.voucher_lines l where l.voucher_id=voucher.id;
      perform set_config('finance.accounting_voucher',voucher.id::text,true);
      update finance.voucher_lines set account_subject_id=classification.account_id
        where voucher_id=voucher.id and debit_amount>0 and account_subject_id is distinct from classification.account_id;
      if not found then continue; end if;
      update finance.vouchers set updated_at=changed_at where id=voucher.id;
      update finance.workflow_voucher_controls set lock_version=lock_version+1,updated_by=p_actor,updated_at=changed_at
        where voucher_id=voucher.id and organization_id=p_org;
      select jsonb_agg(to_jsonb(l) order by l.sort_order,l.id) into after_lines from finance.voucher_lines l where l.voucher_id=voucher.id;
      insert into finance.workflow_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
        values(p_org,p_actor,voucher.id,'ACCOUNTING_ACCOUNT_CORRECTION',p_reason,
          jsonb_build_object('voucher',to_jsonb(voucher),'lines',before_lines),
          jsonb_build_object('voucher_id',voucher.id,'resolution_id',p_id,'lines',after_lines));
    end loop;
    perform set_config('finance.accounting_voucher',coalesce(previous_voucher,''),true);
  end if;

  if changes='[]' or after_data=before_data then raise exception '변경된 항목이 없어.'; end if;
  revision := revision+1;
  after_data := after_data || jsonb_build_object('correctionRevision',revision,'history',
    coalesce(nullif(before_data->'history','null'),'[]') || jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid(),'actionType','UPDATED','actionLabel','승인완료 문서 정정',
      'actionAt',to_char(changed_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS'),
      'actorName',member.display_name,'actorTitle','','comment',p_reason,'changes',changes
    )));

  if p_patch ? 'classification' then
    update finance.expense_resolutions set subject=case when p_patch ? 'subject' then after_data->>'subject' else subject end,
      resolution_data=after_data,budget_id=classification.budget_id,budget_month=target_month,
      expense_detail_id=classification.detail_id,updated_at=changed_at where id=p_id;
    select entry into budget_row from jsonb_array_elements(finance.reimbursement_budget_rows(p_org,target_month)) entry
      where entry->>'id'=classification.budget_id::text;
    if budget_row is null then raise exception '변경 후 예산 집계를 확인하지 못했어.'; end if;
    used_amount := (budget_row->>'quick_amount')::numeric+(budget_row->>'personal_amount')::numeric
      +(budget_row->>'resolution_amount')::numeric+(budget_row->>'manual_amount')::numeric;
    expected_amount := used_amount+(budget_row->>'reserved_amount')::numeric+(budget_row->>'pending_amount')::numeric;
    remaining_amount := (budget_row->>'monthly_amount')::numeric-expected_amount;
    usage_rate := coalesce(round(100*expected_amount/nullif((budget_row->>'monthly_amount')::numeric,0),1),0);
    if source.budget_id is distinct from classification.budget_id and (
      used_amount+(budget_row->>'reserved_amount')::numeric>(budget_row->>'monthly_amount')::numeric
      or (budget_row->>'annual_used_amount')::numeric+(budget_row->>'annual_reserved_amount')::numeric>(budget_row->>'approved_amount')::numeric
    ) then raise exception '변경 후 예산이 초과돼. 예산 조정 후 다시 시도해줘.'; end if;
    after_data := jsonb_set(after_data,'{budgetSnapshot}',jsonb_build_object(
      'budgetId',classification.budget_id,'budgetPeriod',to_char(target_month,'YYYY-MM'),
      'budgetCheckStatus',case when remaining_amount<0 then '예산초과' when usage_rate>=90 then '주의' else '정상' end,
      'calculationBasis',classification.budget_name,
      'currentRequestAmount',source.total_payment_amount,'currentAnnualBudgetAmount',budget_row->'approved_amount',
      'monthlyBudgetAmount',budget_row->'monthly_amount','paymentWaitingAmount',budget_row->'reserved_amount',
      'reservedAmount',budget_row->'reserved_amount','pendingApprovalAmount',budget_row->'pending_amount',
      'previousAnnualBudgetAmount',0,'usedAmount',used_amount,'budgetUsageRate',usage_rate,
      'expectedUsedAmount',expected_amount,'remainingBudgetAmount',remaining_amount
    ));
    update finance.expense_resolutions set resolution_data=after_data where id=p_id returning resolution_data into after_data;
  else
    update finance.expense_resolutions set subject=case when p_patch ? 'subject' then after_data->>'subject' else subject end,
      resolution_data=after_data,updated_at=changed_at where id=p_id returning resolution_data into after_data;
  end if;
  insert into finance.expense_workflow_audit_logs(resolution_id,action,actor_label,actor_id,before_data,after_data)
    values(p_id,'CORRECT_APPROVED',member.display_name,p_actor,before_data,after_data);
  insert into finance.expense_authorization_operations(organization_id,operation_key,actor_id,command,input_hash,result)
    values(p_org,p_key,p_actor,'CORRECT_APPROVED',op_hash,after_data);
  perform set_config('finance.legacy_expense_command_org',coalesce(previous_org,''),true);
  perform set_config('finance.legacy_expense_command_id',coalesce(previous_id,''),true);
  return after_data;
end
$$;

create function finance.guard_expense_correction_revision()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if coalesce((new.resolution_data->>'correctionRevision')::integer,0)
    < coalesce((old.resolution_data->>'correctionRevision')::integer,0) then
    raise exception '담당자가 먼저 문서를 정정했어. 다시 조회한 뒤 처리해줘.';
  end if;
  return new;
end
$$;
create trigger guard_expense_correction_revision before update of resolution_data on finance.expense_resolutions
  for each row execute function finance.guard_expense_correction_revision();

revoke all on function finance.expense_correction_month(finance.expense_resolutions),
  finance.expense_correction_account_block(finance.expense_resolutions),
  finance.expense_correction_account_choices(finance.expense_resolutions),
  finance.approved_expense_correction_options(uuid,uuid,text),
  finance.correct_approved_expense_resolution(uuid,uuid,text,integer,text,jsonb,text),
  finance.guard_expense_correction_revision()
  from public,anon,authenticated;
grant execute on function finance.expense_correction_month(finance.expense_resolutions),
  finance.expense_correction_account_block(finance.expense_resolutions),
  finance.expense_correction_account_choices(finance.expense_resolutions),
  finance.approved_expense_correction_options(uuid,uuid,text),
  finance.correct_approved_expense_resolution(uuid,uuid,text,integer,text,jsonb,text),
  finance.guard_expense_correction_revision()
  to service_role;
notify pgrst, 'reload schema';
