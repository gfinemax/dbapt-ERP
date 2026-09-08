-- Explicit identity bindings; existing names and historical status are never auto-mapped.
create table finance.expense_authorization_bindings (
 resolution_id text primary key references finance.expense_resolutions(id) on delete restrict,
 organization_id uuid not null references core.organizations(id), author_user_id uuid references auth.users(id),
 steps jsonb not null default '[]' check(jsonb_typeof(steps)='array'), version integer not null default 1 check(version>0),
 bound_by uuid references auth.users(id), bound_at timestamptz, binding_reason text
);
create index expense_authorization_org_idx on finance.expense_authorization_bindings(organization_id,author_user_id);
create table finance.expense_authorization_operations (
 organization_id uuid not null references core.organizations(id), operation_key text not null, actor_id uuid not null references auth.users(id),
 command text not null, input_hash text not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(organization_id,operation_key)
);
alter table finance.expense_authorization_bindings enable row level security;
alter table finance.expense_authorization_operations enable row level security;
revoke all on finance.expense_authorization_bindings,finance.expense_authorization_operations from public,anon,authenticated;
grant all on finance.expense_authorization_bindings,finance.expense_authorization_operations to service_role;
alter table finance.expense_evidence_ocr_jobs add column organization_id uuid references core.organizations(id), add column created_by uuid references auth.users(id);
create index expense_ocr_owner_idx on finance.expense_evidence_ocr_jobs(organization_id,created_by);
alter table finance.expense_workflow_audit_logs add column actor_id uuid references auth.users(id);

-- Only explicit columns are populated; caller cannot choose relation names or SQL identifiers.
create function finance.legacy_expense_write_row(p_table text,p_row jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare cols text; vals text; updates text; invalid boolean;
begin
 if p_table not in ('expense_resolutions','expense_resolution_items','expense_account_allocations','expense_resolution_evidence','expense_detail_transactions') then raise exception '지원하지 않는 저장 대상입니다.'; end if;
 select exists(select 1 from jsonb_object_keys(p_row) k where not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=('finance.'||p_table)::regclass and a.attname=k and a.attnum>0 and not a.attisdropped)) into invalid;
 if invalid then raise exception '지원하지 않는 저장 필드입니다.'; end if;
 select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k),string_agg(format('%I=excluded.%I',k,k),',' order by k) filter(where k<>'id') into cols,vals,updates from jsonb_object_keys(p_row) k;
 execute format('insert into finance.%I(%s) select %s from jsonb_populate_record(null::finance.%I,$1) r on conflict(id) do update set %s',p_table,cols,vals,p_table,updates) using p_row;
end $$;
revoke all on function finance.legacy_expense_write_row(text,jsonb) from public,anon,authenticated;
grant execute on function finance.legacy_expense_write_row(text,jsonb) to service_role;

create function finance.legacy_expense_command(p_org uuid,p_actor uuid,p_command text,p_id text,p_expected jsonb,p_payload jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; oldrow finance.expense_resolutions; binding finance.expense_authorization_bindings;
 op finance.expense_authorization_operations; h text; result jsonb; rowdata jsonb; beforedata jsonb; afterdata jsonb;
 steps jsonb; step jsonb; oldstep jsonb; newstep jsonb; item jsonb; list jsonb; table_name text; list_key text; existing_parent text;
 is_admin boolean; exists_row boolean; author uuid; approver uuid; idx integer; active_idx integer; next_idx integer; command text;
 allowed text[]:=array['approvalLine','approvalStatus','currentApprover','history','approvedAt','rejectionReason','paymentStatus','settlementStatus','disbursedAt','expenseItems'];
 expected_status text; expected_payment text; expected_settlement text; timing text; key text; linecount integer; line_total numeric; total numeric;
 old_bank uuid; new_bank uuid; old_card uuid; new_card uuid; ref_id uuid; link_status text;
 fact_input jsonb; old_fact finance.expense_fact_confirmations; fact_id uuid; fact_detail text; fact_revision integer;
begin
 m:=finance.workflow_actor(p_org,p_actor); is_admin:='ADMIN'=any(m.permissions);
 perform set_config('TimeZone','Asia/Seoul',true);
 if not exists(select 1 from core.organizations where id=p_org and status='active') then raise exception '활성 조직이 아닙니다.'; end if;
 if p_command not in ('SAVE','APPROVAL','DELETE','BIND','FACT_SAVE','FACT_DELETE') then raise exception '지원하지 않는 지출결의 명령입니다.'; end if;
 if coalesce(trim(p_id),'')='' or coalesce(trim(p_key),'')='' or length(p_key)>200 or jsonb_typeof(p_payload)<>'object' then raise exception '원본 및 처리키를 확인해주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
 h:=md5(jsonb_build_object('id',p_id,'expected',p_expected,'payload',p_payload)::text);
 select * into op from finance.expense_authorization_operations where organization_id=p_org and operation_key=p_key;
 if found then
  if op.actor_id<>p_actor or op.command<>p_command or op.input_hash<>h then raise exception '처리키가 다른 요청에 사용되었습니다.'; end if;
  return op.result;
 end if;
 select * into oldrow from finance.expense_resolutions where id=p_id for update; exists_row:=found;
 if exists_row and (oldrow.organization_id is distinct from p_org or oldrow.deleted_at is not null) then raise exception '조직의 지출결의를 찾을 수 없습니다.'; end if;
 if exists_row and oldrow.resolution_data is distinct from p_expected then raise exception '원본이 변경되었습니다. 새로 조회해주세요.'; end if;
 if not exists_row and (p_command<>'SAVE' or p_expected is not null) then raise exception '지출결의 원본을 찾을 수 없습니다.'; end if;
 select * into binding from finance.expense_authorization_bindings where resolution_id=p_id for update;
 if binding.resolution_id is not null and binding.organization_id<>p_org then raise exception '조직 연결이 일치하지 않습니다.'; end if;
 if p_payload ? 'expected_binding_version' and (p_payload->>'expected_binding_version')::integer<>coalesce(binding.version,0) then raise exception '권한 연결이 변경되었습니다. 다시 확인해주세요.'; end if;
 beforedata:=oldrow.resolution_data;
 perform set_config('finance.legacy_expense_command_org',p_org::text,true);
 perform set_config('finance.legacy_expense_command_id',p_id,true);
 if p_command='BIND' then
  if not is_admin then raise exception '관리자만 사용자 연결을 확인할 수 있습니다.'; end if;
  if not p_payload ? 'expected_binding_version' or coalesce(trim(p_payload->>'reason'),'')='' then raise exception '연결 버전과 확인 사유가 필요합니다.'; end if;
  author:=nullif(p_payload->>'author_user_id','')::uuid;
  if author is not null then perform finance.workflow_actor(p_org,author); end if;
  list:=coalesce(p_payload->'steps','[]'); steps:='[]';
  if jsonb_typeof(list)<>'array' then raise exception '결재선 형식을 확인해주세요.'; end if;
  for step in select value from jsonb_array_elements(list) loop
   idx:=(step->>'order')::integer; approver:=nullif(step->>'approver_user_id','')::uuid;
   if idx<1 or idx>jsonb_array_length(coalesce(beforedata->'approvalLine','[]')) or exists(select 1 from jsonb_array_elements(steps)s where (s->>'order')::integer=idx) then raise exception '결재 순번을 확인해주세요.'; end if;
   if approver is not null then
    perform finance.workflow_actor(p_org,approver);
    if not exists(select 1 from finance.reimbursement_members where organization_id=p_org and user_id=approver and active and permissions&&array['ADMIN','APPROVE','PAY']) then raise exception '결재자로 지정할 업무 권한이 없습니다.'; end if;
   end if;
   oldstep:=beforedata->'approvalLine'->(idx-1);
   steps:=steps||jsonb_build_array(jsonb_build_object('order',idx,'approver_user_id',approver,'legacy_step',oldstep-'status'-'processedAt'));
  end loop;
  insert into finance.expense_authorization_bindings(resolution_id,organization_id,author_user_id,steps,version,bound_by,bound_at,binding_reason)
   values(p_id,p_org,author,steps,coalesce(binding.version,0)+1,p_actor,now(),p_payload->>'reason')
   on conflict(resolution_id) do update set author_user_id=excluded.author_user_id,steps=excluded.steps,version=excluded.version,bound_by=excluded.bound_by,bound_at=excluded.bound_at,binding_reason=excluded.binding_reason returning to_jsonb(expense_authorization_bindings.*) into result;
 elsif p_command='SAVE' then
  if not exists_row and not(m.permissions&&array['ADMIN','APPROVE','PAY']) then raise exception '지출결의 작성 권한이 필요합니다.'; end if;
  if exists_row and not is_admin and binding.author_user_id is distinct from p_actor then raise exception '작성자 연결 또는 관리자 권한이 필요합니다.'; end if;
  if exists_row and oldrow.approval_status not in ('작성중','반려','승인대기') then raise exception '작성중·반려·승인대기 문서만 수정할 수 있습니다.'; end if;
  rowdata:=p_payload->'row'; afterdata:=rowdata->'resolution_data';
  if jsonb_typeof(rowdata)<>'object' or jsonb_typeof(afterdata)<>'object' or rowdata->>'id' is distinct from p_id or afterdata->>'id' is distinct from p_id or rowdata->>'approval_status' is distinct from '작성중' or afterdata->>'approvalStatus' is distinct from '작성중' then raise exception '초안 원본 형식을 확인해주세요.'; end if;
  if rowdata ? 'deleted_at' or rowdata ? 'created_at' then raise exception '원본 보존 필드를 변경할 수 없습니다.'; end if;
  if coalesce(afterdata->>'voucherNo','')<>coalesce(rowdata->>'voucher_no','') or coalesce(afterdata->>'voucherStatus','')<>coalesce(rowdata->>'voucher_status','') or coalesce((afterdata->>'actualPaidAmount')::numeric,0)<>coalesce((rowdata->>'actual_paid_amount')::numeric,0) then raise exception '실제 지급 또는 전표 원본이 일치하지 않습니다.'; end if;
  if nullif(afterdata->>'currentApprover','') is not null or nullif(rowdata->>'current_approver_label','') is not null or nullif(afterdata->>'approvedAt','') is not null or nullif(rowdata->>'approved_at','') is not null then raise exception '초안에 승인 결과를 저장할 수 없습니다.'; end if;
  if rowdata ? 'organization_id' and rowdata->>'organization_id' is distinct from p_org::text then raise exception '조직을 변경할 수 없습니다.'; end if;
  if exists_row then
   if ((rowdata->>'actual_paid_amount')::numeric,rowdata->>'voucher_no',rowdata->>'voucher_status',nullif(rowdata->>'disbursed_at','')::timestamptz,nullif(rowdata->>'settlement_completed_at','')::timestamptz) is distinct from (oldrow.actual_paid_amount,oldrow.voucher_no,oldrow.voucher_status,oldrow.disbursed_at,oldrow.settlement_completed_at) then raise exception '초안 저장으로 실제 지급 또는 전표를 변경할 수 없습니다.'; end if;
   foreach key in array array['paidAt','disbursedAt','settlementCompletedAt','voucherNo','voucherStatus','voucherConfirmedAt','voucherConfirmedBy','voucherGenerated'] loop
    if nullif(afterdata->>key,'') is distinct from nullif(beforedata->>key,'') then raise exception '기존 실제 지급·정산·전표 결과를 변경할 수 없습니다: %',key; end if;
   end loop;
   if coalesce((afterdata->>'actualPaidAmount')::numeric,0)<>coalesce((beforedata->>'actualPaidAmount')::numeric,0) then raise exception '실제 지급 금액을 변경할 수 없습니다.'; end if;
   if oldrow.payment_status='지급완료' or beforedata->>'paymentStatus'='지급완료' or beforedata->>'settlementStatus'='정산완료' or oldrow.settlement_status='정산완료' then raise exception '실제 완료 기록은 초안으로 되돌릴 수 없습니다.'; end if;
  elsif coalesce((rowdata->>'actual_paid_amount')::numeric,0)<>0 or nullif(rowdata->>'voucher_no','') is not null or nullif(rowdata->>'voucher_status','') is not null or nullif(rowdata->>'disbursed_at','') is not null or nullif(rowdata->>'settlement_completed_at','') is not null then raise exception '새 초안에 실제 지급 또는 전표를 생성할 수 없습니다.';
  end if;
  if not exists_row then
   foreach key in array array['paidAt','disbursedAt','settlementCompletedAt','voucherConfirmedAt','voucherConfirmedBy'] loop if nullif(afterdata->>key,'') is not null then raise exception '새 초안에 실제 완료 결과를 저장할 수 없습니다: %',key; end if; end loop;
   if coalesce((afterdata->>'voucherGenerated')::boolean,false) then raise exception '새 초안에 전표 결과를 저장할 수 없습니다.'; end if;
  end if;
  foreach key in array array['paidAt','disbursedAt','settlementCompletedAt'] loop
   if nullif(afterdata->>key,'') is not null then
    if nullif(rowdata->>case when key='settlementCompletedAt' then 'settlement_completed_at' else 'disbursed_at' end,'') is null then raise exception '실제 완료일의 JSON·저장 필드가 일치하지 않습니다.'; end if;
    if length(afterdata->>key)=10 then
     if (afterdata->>key)::date is distinct from (rowdata->>case when key='settlementCompletedAt' then 'settlement_completed_at' else 'disbursed_at' end)::timestamptz::date then raise exception '실제 완료일의 JSON·저장 필드가 일치하지 않습니다.'; end if;
    elsif (afterdata->>key)::timestamptz is distinct from (rowdata->>case when key='settlementCompletedAt' then 'settlement_completed_at' else 'disbursed_at' end)::timestamptz then raise exception '실제 완료일의 JSON·저장 필드가 일치하지 않습니다.'; end if;
   end if;
  end loop;
  if afterdata->>'settlementStatus'='정산완료' or rowdata->>'settlement_status'='정산완료' then raise exception '초안에서 정산완료를 처리할 수 없습니다.'; end if;
  -- Editing pending approval invalidates all previous step decisions; history remains intact.
  select coalesce(jsonb_agg((s.value-'processedAt')||jsonb_build_object('status',case when s.ordinality=1 then '결재대기' else '대기' end) order by s.ordinality),'[]') into steps from jsonb_array_elements(coalesce(afterdata->'approvalLine','[]')) with ordinality s;
  afterdata:=afterdata||jsonb_build_object('approvalLine',steps);
  rowdata:=rowdata||jsonb_build_object('resolution_data',afterdata);
  if rowdata->>'payment_status' not in ('지급전','지급대기') or afterdata->>'paymentStatus' is distinct from rowdata->>'payment_status' then raise exception '초안 지급 상태를 확인해주세요.'; end if;
  if rowdata->>'total_payment_amount' is null or (rowdata->>'total_payment_amount')::numeric is distinct from (afterdata->>'totalPaymentAmount')::numeric then raise exception '원본 금액이 일치하지 않습니다.'; end if;
  if afterdata->>'bankTransactionId' is distinct from rowdata->>'bank_transaction_id' then raise exception '통장 연결 원본이 일치하지 않습니다.'; end if;
  total:=(rowdata->>'total_payment_amount')::numeric;
  if rowdata->>'approval_document_id' is not null and not exists(select 1 from approval.documents where id=(rowdata->>'approval_document_id')::uuid and organization_id=p_org and deleted_at is null) then raise exception '조직의 기안이 아닙니다.'; end if;
  if rowdata->>'bank_transaction_id' is not null and not exists(select 1 from finance.bank_transactions where id=(rowdata->>'bank_transaction_id')::uuid and organization_id=p_org) then raise exception '조직의 통장거래가 아닙니다.'; end if;
  if rowdata->>'original_resolution_id' is not null and not exists(select 1 from finance.expense_resolutions where id=rowdata->>'original_resolution_id' and organization_id=p_org and deleted_at is null) then raise exception '조직의 선지급 원본이 아닙니다.'; end if;
  -- Validate every child ID before any delete/update; existing foreign IDs cannot be stolen.
  for table_name,list_key in select * from (values('expense_resolution_items','items'),('expense_account_allocations','allocations'),('expense_resolution_evidence','evidence'),('expense_detail_transactions','details')) t loop
   list:=p_payload->list_key;
   if jsonb_typeof(list) is distinct from 'array' then raise exception '전체 상세 항목이 필요합니다: %',list_key; end if;
   if exists(select 1 from jsonb_array_elements(list)e group by e->>'id' having count(*)>1) then raise exception '상세 ID가 중복되었습니다.'; end if;
   for item in select value from jsonb_array_elements(list) loop
    if coalesce(item->>'id','')='' or item->>'resolution_id' is distinct from p_id then raise exception '상세 원본 ID가 일치하지 않습니다.'; end if;
    execute format('select resolution_id from finance.%I where id=$1',table_name) into existing_parent using item->>'id';
    if existing_parent is not null and existing_parent<>p_id then raise exception '다른 원본의 상세 ID입니다.'; end if;
    if item->>'item_id' is not null and not exists(select 1 from jsonb_array_elements(p_payload->'items')i where i->>'id'=item->>'item_id') then raise exception '연결 항목이 원본에 없습니다.'; end if;
    if item->>'fact_confirmation_id' is not null and not exists(select 1 from finance.expense_fact_confirmations f where f.id=(item->>'fact_confirmation_id')::uuid and f.resolution_id=p_id and f.deleted_at is null) then raise exception '사실확인 원본이 다릅니다.'; end if;
   end loop;
  end loop;
  -- SINGLE and BATCH may both exist as legacy representations; compare the active kind only.
  select count(*),coalesce(sum((i->>'total_amount')::numeric),0) into linecount,line_total from jsonb_array_elements(p_payload->'items')i where i->>'item_kind'=case when afterdata->>'resolutionType'='BATCH' then 'BATCH' else 'SINGLE' end;
  if linecount>0 and line_total<>total then raise exception '지출 항목 합계가 원본 총액과 다릅니다.'; end if;
  if jsonb_array_length(p_payload->'allocations')>0 and (select sum((i->>'amount')::numeric) from jsonb_array_elements(p_payload->'allocations')i)<>total then raise exception '계정 배분 합계가 원본 총액과 다릅니다.'; end if;
  rowdata:=rowdata||jsonb_build_object('organization_id',p_org,'updated_at',now());
  if exists_row then rowdata:=rowdata||jsonb_build_object('author_label',oldrow.author_label,'resolution_data',afterdata||jsonb_build_object('author',beforedata->>'author','history',coalesce(beforedata->'history','[]'))); end if;
  if not exists_row then rowdata:=rowdata||jsonb_build_object('author_label',m.display_name,'resolution_data',afterdata||jsonb_build_object('author',m.display_name,'history','[]'::jsonb)); end if;
  perform finance.legacy_expense_write_row('expense_resolutions',rowdata);
  -- Park ordinal keys, retain IDs, and delete only removed unreferenced rows.
  update finance.expense_resolution_items set item_no=item_no+100000 where resolution_id=p_id;
  update finance.expense_detail_transactions set line_no=line_no+100000 where resolution_id=p_id and deleted_at is null;
  delete from finance.expense_resolution_evidence where resolution_id=p_id and id not in(select e->>'id' from jsonb_array_elements(p_payload->'evidence')e);
  delete from finance.expense_account_allocations where resolution_id=p_id and id not in(select e->>'id' from jsonb_array_elements(p_payload->'allocations')e);
  delete from finance.expense_resolution_items where resolution_id=p_id and id not in(select e->>'id' from jsonb_array_elements(p_payload->'items')e);
  update finance.expense_detail_transactions set deleted_at=now(),updated_at=now() where resolution_id=p_id and id not in(select e->>'id' from jsonb_array_elements(p_payload->'details')e) and deleted_at is null;
  for table_name,list_key in select * from (values('expense_resolution_items','items'),('expense_account_allocations','allocations'),('expense_resolution_evidence','evidence'),('expense_detail_transactions','details'))t loop
   for item in select value from jsonb_array_elements(p_payload->list_key) loop perform finance.legacy_expense_write_row(table_name,item); end loop;
  end loop;
  if not exists_row then insert into finance.expense_authorization_bindings(resolution_id,organization_id,author_user_id,bound_by,bound_at,binding_reason) values(p_id,p_org,p_actor,p_actor,now(),'신규 작성자 로그인 확인');
  elsif binding.resolution_id is not null then update finance.expense_authorization_bindings set version=version+1 where resolution_id=p_id; end if;
  select resolution_data into result from finance.expense_resolutions where id=p_id;
 elsif p_command in ('FACT_SAVE','FACT_DELETE') then
  if not is_admin and binding.author_user_id is distinct from p_actor then raise exception '작성자 연결 또는 관리자 권한이 필요합니다.'; end if;
  fact_input:=p_payload->'input';
  if jsonb_typeof(fact_input) is distinct from 'object' or fact_input->>'resolutionId' is distinct from p_id then raise exception '사실확인 원본을 확인해주세요.'; end if;
  if fact_input ?| array['confirmerLabel','confirmedAt','electronicConfirmation'] then raise exception '사실확인 서명은 권한 정책 확인 후 처리할 수 있습니다.'; end if;
  if binding.resolution_id is not null and not p_payload ? 'expected_binding_version' then raise exception '사실확인 저장 버전이 필요합니다.'; end if;
  if fact_input->>'id' is not null then
   select * into old_fact from finance.expense_fact_confirmations where id=(fact_input->>'id')::uuid and resolution_id=p_id and is_current and deleted_at is null for update;
   if not found then raise exception '수정할 현재 사실확인서를 찾을 수 없습니다.'; end if;
   if old_fact.confirmed_at is not null or old_fact.confirmer_label is not null or old_fact.electronic_confirmation<>'{}'::jsonb then raise exception '서명된 사실확인서는 초안으로 변경할 수 없습니다.'; end if;
  end if;
  if p_command='FACT_DELETE' then
   if old_fact.id is null then raise exception '삭제할 사실확인서를 확인해주세요.'; end if;
   update finance.expense_fact_confirmations set deleted_at=now(),is_current=false where id=old_fact.id;
   update finance.expense_detail_transactions set fact_confirmation_id=null,evidence_status='DEFICIENT',updated_at=now() where resolution_id=p_id and fact_confirmation_id=old_fact.id;
   result:=jsonb_build_object('id',old_fact.id);
  else
   foreach key in array array['actualSpender','actualExpenseDate','vendorName','itemDescription','businessPurpose','missingReceiptReason','paymentMethod'] loop if coalesce(trim(fact_input->>key),'')='' then raise exception '사실확인 필수 항목이 필요합니다: %',key; end if; end loop;
   if coalesce((fact_input->>'amount')::numeric,0)<=0 or (fact_input->>'amount')::numeric<>trunc((fact_input->>'amount')::numeric) then raise exception '사실확인 금액을 확인해주세요.'; end if;
   fact_detail:=nullif(fact_input->>'detailTransactionId','');
   if fact_detail is not null then
    if not exists(select 1 from finance.expense_detail_transactions where id=fact_detail and resolution_id=p_id and deleted_at is null) then raise exception '사실확인 상세거래가 원본에 없습니다.'; end if;
    if exists(select 1 from finance.expense_detail_transactions where id=fact_detail and fact_confirmation_id is not null and fact_confirmation_id is distinct from old_fact.id) then raise exception '이미 연결된 사실확인서를 수정해주세요.'; end if;
   end if;
   fact_revision:=coalesce(old_fact.revision_no,0)+1;
   if old_fact.id is not null then
    update finance.expense_fact_confirmations set is_current=false where id=old_fact.id;
    if old_fact.detail_transaction_id is distinct from fact_detail then update finance.expense_detail_transactions set fact_confirmation_id=null,evidence_status='DEFICIENT',updated_at=now() where resolution_id=p_id and fact_confirmation_id=old_fact.id; end if;
   end if;
   insert into finance.expense_fact_confirmations(resolution_id,detail_transaction_id,revision_no,actual_spender_label,actual_expense_date,vendor_name,item_description,amount,business_purpose,missing_receipt_reason,payment_method,author_label)
    values(p_id,fact_detail,fact_revision,fact_input->>'actualSpender',(fact_input->>'actualExpenseDate')::date,fact_input->>'vendorName',fact_input->>'itemDescription',(fact_input->>'amount')::numeric,fact_input->>'businessPurpose',fact_input->>'missingReceiptReason',fact_input->>'paymentMethod',m.display_name) returning id into fact_id;
   if fact_detail is not null then update finance.expense_detail_transactions set fact_confirmation_id=fact_id,evidence_kind='EXPENSE_FACT_CONFIRMATION',evidence_status='ALTERNATIVE',updated_at=now() where id=fact_detail and resolution_id=p_id; end if;
   result:=jsonb_build_object('id',fact_id);
  end if;
  update finance.expense_authorization_bindings set version=version+1 where resolution_id=p_id;
  beforedata:=jsonb_build_object('resolution',beforedata,'fact',to_jsonb(old_fact));
 elsif p_command='DELETE' then
  if not is_admin and binding.author_user_id is distinct from p_actor then raise exception '작성자 연결 또는 관리자 권한이 필요합니다.'; end if;
  if oldrow.approval_status not in ('작성중','반려') or oldrow.payment_status='지급완료' or oldrow.voucher_no is not null or coalesce(oldrow.actual_paid_amount,0)>0 then raise exception '집행 또는 승인된 문서는 삭제할 수 없습니다.'; end if;
  if coalesce(trim(p_payload->>'reason'),'')='' then raise exception '삭제 사유가 필요합니다.'; end if;
  update finance.expense_resolutions set deleted_at=now(),updated_at=now() where id=p_id;
  result:=beforedata;
 else
  command:=p_payload->>'command'; afterdata:=p_payload->'after';
  if command not in ('REQUEST','APPROVE','REJECT','CANCEL') or jsonb_typeof(afterdata) is distinct from 'object' then raise exception '승인 명령 형식을 확인해주세요.'; end if;
  if (afterdata-allowed) is distinct from (beforedata-allowed) then raise exception '승인 중 금액 또는 원본 정보를 변경할 수 없습니다.'; end if;
  steps:=coalesce(beforedata->'approvalLine','[]'); linecount:=jsonb_array_length(steps);
  if linecount=0 or jsonb_array_length(coalesce(afterdata->'approvalLine','[]'))<>linecount then raise exception '기존 결재선 연결이 필요합니다.'; end if;
  for idx in 0..linecount-1 loop
   oldstep:=steps->idx; newstep:=afterdata->'approvalLine'->idx;
   if oldstep-'status'-'processedAt' is distinct from newstep-'status'-'processedAt' then raise exception '승인 중 결재선을 변경할 수 없습니다.'; end if;
  end loop;
  if command='REQUEST' then
   if oldrow.approval_status not in ('작성중','반려') or binding.author_user_id is distinct from p_actor then raise exception '연결된 작성자만 승인요청할 수 있습니다.'; end if;
   for idx in 1..linecount loop
    select s into step from jsonb_array_elements(binding.steps)s where (s->>'order')::integer=idx;
    if step->>'approver_user_id' is null or step->'legacy_step' is distinct from ((steps->(idx-1))-'status'-'processedAt') then raise exception '결재자 UUID 연결을 확인해주세요.'; end if;
    perform finance.workflow_actor(p_org,(step->>'approver_user_id')::uuid);
   end loop;
   expected_status:='승인대기'; expected_payment:='지급전'; active_idx:=0;
  elsif command='CANCEL' then
   if not is_admin or oldrow.approval_status<>'승인완료' or oldrow.payment_status='지급완료' or oldrow.voucher_no is not null then raise exception '승인취소 권한 또는 집행 상태를 확인해주세요.'; end if;
   if coalesce(afterdata->'history'->-1->>'comment','')='' then raise exception '승인취소 사유가 필요합니다.'; end if;
   expected_status:='작성중'; expected_payment:='지급전'; active_idx:=0;
  else
   if oldrow.approval_status<>'승인대기' then raise exception '승인대기 문서만 처리할 수 있습니다.'; end if;
   select (ordinality-1)::integer into active_idx from jsonb_array_elements(steps) with ordinality s where value->>'status'='결재대기';
   if active_idx is null or (select count(*) from jsonb_array_elements(steps)s where s->>'status'='결재대기')<>1 then raise exception '현재 결재 단계를 확인해주세요.'; end if;
   select s into step from jsonb_array_elements(binding.steps)s where (s->>'order')::integer=active_idx+1;
   if step->>'approver_user_id' is distinct from p_actor::text or step->'legacy_step' is distinct from ((steps->active_idx)-'status'-'processedAt') then raise exception '현재 연결된 결재자만 처리할 수 있습니다.'; end if;
   if command='REJECT' then expected_status:='반려';expected_payment:='지급전'; if coalesce(trim(afterdata->>'rejectionReason'),'')='' then raise exception '반려 사유가 필요합니다.'; end if;
   elsif active_idx<linecount-1 then expected_status:='승인대기';expected_payment:=oldrow.payment_status;
   else
    expected_status:='승인완료';timing:=coalesce(beforedata->>'expenseTiming',oldrow.expense_timing);
    expected_payment:=case when beforedata->>'expenseKind'='BANK_POST_APPROVAL' then '지급완료' when timing='SETTLEMENT' then case when coalesce((beforedata->>'settlementDifference')::numeric,0)<0 then '지급대기' else '지급완료' end when timing='REIMBURSEMENT' and beforedata->>'expenseBurdenType' in ('CORPORATE_CARD','ORGANIZATION_PAID') then '지급완료' else '지급대기' end;
   end if;
  end if;
  if afterdata->>'approvalStatus' is distinct from expected_status or afterdata->>'paymentStatus' is distinct from expected_payment then raise exception '승인 상태 전환이 일치하지 않습니다.'; end if;
  expected_settlement:=beforedata->>'settlementStatus';
  if command='APPROVE' and expected_status='승인완료' then
   if beforedata->>'expenseKind'='BANK_POST_APPROVAL' then expected_settlement:='정산없음';
   elsif timing='SETTLEMENT' then expected_settlement:=case when coalesce((beforedata->>'settlementDifference')::numeric,0)>0 then '환급필요' when coalesce((beforedata->>'settlementDifference')::numeric,0)<0 then '추가지급' else '정산완료' end; end if;
  end if;
  if afterdata->>'settlementStatus' is distinct from expected_settlement then raise exception '정산 상태 전환이 일치하지 않습니다.'; end if;
  if afterdata->'disbursedAt' is distinct from beforedata->'disbursedAt' and not(command='APPROVE' and expected_status='승인완료' and beforedata->>'expenseKind'='BANK_POST_APPROVAL' and afterdata->>'disbursedAt'=beforedata->>'actualExpenseDate') then raise exception '실제 지급일을 변경할 수 없습니다.'; end if;
  for idx in 0..linecount-1 loop
   expected_status:=case when command in ('REQUEST','CANCEL') then case when idx=0 then '결재대기' else '대기' end when idx=active_idx then case when command='APPROVE' then '승인완료' else '반려' end when command='APPROVE' and idx=active_idx+1 then '결재대기' else steps->idx->>'status' end;
   if afterdata->'approvalLine'->idx->>'status' is distinct from expected_status then raise exception '결재 단계 전환이 일치하지 않습니다.'; end if;
  end loop;
  if afterdata->>'approvalStatus'='승인대기' then next_idx:=case when command='REQUEST' then 0 else active_idx+1 end;
   if afterdata->>'currentApprover' is distinct from concat(steps->next_idx->>'approver',' ',steps->next_idx->>'role') then raise exception '다음 결재자가 일치하지 않습니다.'; end if;
  elsif nullif(afterdata->>'currentApprover','') is not null then raise exception '종료된 결재자 표시가 남았습니다.'; end if;
  if jsonb_array_length(coalesce(afterdata->'expenseItems','[]'))<>jsonb_array_length(coalesce(beforedata->'expenseItems','[]')) then raise exception '지출 항목을 변경할 수 없습니다.'; end if;
  for item,idx in select value,(ordinality-1)::integer from jsonb_array_elements(coalesce(afterdata->'expenseItems','[]')) with ordinality s loop
   if item-'paymentStatus' is distinct from ((beforedata->'expenseItems'->idx)-'paymentStatus') then raise exception '항목 금액을 변경할 수 없습니다.'; end if;
   if item->'paymentStatus' is distinct from beforedata->'expenseItems'->idx->'paymentStatus' and not((command='REJECT' and item->>'paymentStatus'='지급전') or (command='APPROVE' and afterdata->>'approvalStatus'='승인완료' and beforedata->>'resolutionType'='BATCH' and item->>'paymentStatus'=expected_payment)) then raise exception '항목 지급 상태가 일치하지 않습니다.'; end if;
  end loop;
  if jsonb_typeof(afterdata->'history') is distinct from 'array' or jsonb_array_length(afterdata->'history')<=jsonb_array_length(coalesce(beforedata->'history','[]')) then raise exception '결재 이력이 필요합니다.'; end if;
  for idx in 0..jsonb_array_length(coalesce(beforedata->'history','[]'))-1 loop if afterdata->'history'->idx is distinct from beforedata->'history'->idx then raise exception '기존 이력을 변경할 수 없습니다.'; end if; end loop;
  update finance.expense_resolutions set resolution_data=afterdata,approval_status=afterdata->>'approvalStatus',current_approver_label=afterdata->>'currentApprover',approved_at=nullif(afterdata->>'approvedAt','')::timestamptz,payment_status=expected_payment,settlement_status=expected_settlement,disbursed_at=coalesce(nullif(afterdata->>'disbursedAt','')::timestamptz,oldrow.disbursed_at),updated_at=now() where id=p_id;
  update finance.expense_authorization_bindings set version=version+1 where resolution_id=p_id;
  result:=afterdata;
 end if;
 -- Keep bank/card review linkage in this transaction as well; never manufacture payments.
 if p_command in ('SAVE','APPROVAL','DELETE') then
  old_bank:=oldrow.bank_transaction_id;old_card:=nullif(beforedata->>'cardTransactionId','')::uuid;
  new_bank:=case when p_command='DELETE' then null else nullif(result->>'bankTransactionId','')::uuid end;
  new_card:=case when p_command='DELETE' then null else nullif(result->>'cardTransactionId','')::uuid end;
  for ref_id in select distinct x from unnest(array[old_bank,new_bank])x where x is not null loop
   if not exists(select 1 from finance.bank_transactions where id=ref_id and organization_id=p_org) then raise exception '조직의 통장거래가 아닙니다.'; end if;
   if exists(select 1 from finance.expense_resolutions where organization_id=p_org and id<>p_id and bank_transaction_id=ref_id and deleted_at is null) then raise exception '통장거래가 다른 원본에 연결되어 있습니다.'; end if;
  end loop;
  for ref_id in select distinct x from unnest(array[old_card,new_card])x where x is not null loop
   if not exists(select 1 from finance.corporate_card_transactions where id=ref_id and organization_id=p_org) then raise exception '조직의 카드내역이 아닙니다.'; end if;
   if exists(select 1 from finance.corporate_card_transactions where id=ref_id and linked_resolution_id is not null and linked_resolution_id<>p_id) or exists(select 1 from finance.quick_expense_records where organization_id=p_org and corporate_card_transaction_id=ref_id and linked_resolution_id is distinct from p_id) then raise exception '카드내역이 다른 원본에 연결되어 있습니다.'; end if;
  end loop;
  link_status:=case when result->>'approvalStatus'='승인완료' then 'APPROVED' when result->>'evidenceStatus' in ('NONE','DEFICIENT') then 'EVIDENCE_MISSING' else 'DRAFTING' end;
  if p_command in ('SAVE','DELETE') then
   if old_bank is not null and old_bank is distinct from new_bank then update finance.bank_transactions set resolution_status='UNRESOLVED' where id=old_bank and organization_id=p_org; end if;
   if old_card is not null and old_card is distinct from new_card then update finance.corporate_card_transactions set linked_resolution_id=null,resolution_status='UNRESOLVED',updated_at=now() where id=old_card and organization_id=p_org; end if;
  end if;
  if p_command='SAVE' or (p_command='APPROVAL' and result->>'approvalStatus'='승인완료') then
   if new_bank is not null then update finance.bank_transactions set resolution_status=link_status where id=new_bank and organization_id=p_org; end if;
   if new_card is not null then update finance.corporate_card_transactions set linked_resolution_id=p_id,resolution_status=link_status,updated_at=now() where id=new_card and organization_id=p_org; end if;
  end if;
 end if;
 insert into finance.expense_workflow_audit_logs(resolution_id,action,actor_label,actor_id,before_data,after_data) values(p_id,'AUTH:'||p_command,m.display_name,p_actor,beforedata,result);
 insert into finance.expense_authorization_operations(organization_id,operation_key,actor_id,command,input_hash,result) values(p_org,p_key,p_actor,p_command,h,result);
 perform set_config('finance.legacy_expense_command_org','',true);
 perform set_config('finance.legacy_expense_command_id','',true);
 return result;
end $$;
revoke all on function finance.legacy_expense_command(uuid,uuid,text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function finance.legacy_expense_command(uuid,uuid,text,text,jsonb,jsonb,text) to service_role;

-- Bound originals use the atomic path for author/approval/draft changes. Existing actual
-- payment, voucher and budget transitions remain governed by their dedicated guards.
create function finance.legacy_expense_bound_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare rid text; org uuid; changed boolean;
begin
 rid:=case when tg_table_name='expense_resolutions' then coalesce(to_jsonb(old)->>'id',to_jsonb(new)->>'id') else coalesce(to_jsonb(old)->>'resolution_id',to_jsonb(new)->>'resolution_id') end;
 select organization_id into org from finance.expense_authorization_bindings where resolution_id=rid;
 if org is null then if tg_op='DELETE' then return old; else return new; end if; end if;
 if current_setting('finance.legacy_expense_command_org',true)=org::text and current_setting('finance.legacy_expense_command_id',true)=rid then if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_table_name='expense_resolutions' then
  changed:=tg_op='DELETE' or row(new.organization_id,new.author_label,new.approval_status,new.current_approver_label,new.total_payment_amount,new.subject,new.deleted_at) is distinct from row(old.organization_id,old.author_label,old.approval_status,old.current_approver_label,old.total_payment_amount,old.subject,old.deleted_at)
   or jsonb_build_array(new.resolution_data->'approvalLine',new.resolution_data->'author',new.resolution_data->'approvalStatus',new.resolution_data->'currentApprover',new.resolution_data->'totalPaymentAmount') is distinct from jsonb_build_array(old.resolution_data->'approvalLine',old.resolution_data->'author',old.resolution_data->'approvalStatus',old.resolution_data->'currentApprover',old.resolution_data->'totalPaymentAmount');
 else changed:=true; end if;
 if changed then raise exception '연결된 지출결의는 사용자 확인을 거친 원자적 저장으로 처리해주세요.'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger legacy_expense_bound_guard before update or delete on finance.expense_resolutions for each row execute function finance.legacy_expense_bound_guard();
create trigger legacy_expense_bound_guard before insert or update or delete on finance.expense_resolution_items for each row execute function finance.legacy_expense_bound_guard();
create trigger legacy_expense_bound_guard before insert or update or delete on finance.expense_account_allocations for each row execute function finance.legacy_expense_bound_guard();
create trigger legacy_expense_bound_guard before insert or update or delete on finance.expense_resolution_evidence for each row execute function finance.legacy_expense_bound_guard();
create trigger legacy_expense_bound_guard before insert or update or delete on finance.expense_detail_transactions for each row execute function finance.legacy_expense_bound_guard();
create trigger legacy_expense_bound_guard before insert or update or delete on finance.expense_fact_confirmations for each row execute function finance.legacy_expense_bound_guard();
revoke all on function finance.legacy_expense_bound_guard() from public,anon,authenticated;
grant execute on function finance.legacy_expense_bound_guard() to service_role;
