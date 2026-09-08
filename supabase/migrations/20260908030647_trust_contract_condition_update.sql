-- Preserve contract draft edits by separating the local JSON value from the conditions column.
create or replace function finance.trust_command(p_org uuid,p_actor uuid,p_command text,p_data jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; op finance.workflow_operations;
 c finance.workflow_contract_versions; previous finance.workflow_contract_versions;
 q finance.workflow_trust_requests; i finance.workflow_trust_items; tx finance.workflow_transactions;
 f finance.workflow_files; item jsonb; entry jsonb; v_conditions jsonb; result jsonb; before_value jsonb;
 snapshot jsonb; print_value jsonb; source_value jsonb; totals jsonb; amount_value numeric; own_reserved numeric; item_paid numeric; changed_source boolean;
 entity uuid; target uuid; contract_id uuid; file_ids uuid[]; item_ids uuid[]; selected_count integer;
 v_reason text:=trim(coalesce(p_data->>'reason','')); next_status text; permission text; account_label text; seq bigint;
begin
 if p_org is null or p_actor is null or coalesce(length(trim(p_key)),0) not between 1 and 200 or jsonb_typeof(p_data) is distinct from 'object' then raise exception '처리 정보가 올바르지 않습니다.'; end if;
 permission:=case when p_command in ('CONTRACT_SAVE','CONTRACT_VERIFY','CONTRACT_RETIRE','ROUTE_ASSIGN') then 'ADMIN' when p_command='FILE_REGISTER' then null else 'APPROVE' end;
 m:=finance.workflow_actor(p_org,p_actor,permission);
 if p_command='FILE_REGISTER' and not m.permissions && array['ADMIN','APPROVE','PAY'] then raise exception '증빙 등록 권한이 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
 select * into op from finance.workflow_operations where organization_id=p_org and operation_key=p_key;
 if found then
  if op.actor_id<>p_actor or op.command<>'TRUST:'||p_command or op.input<>p_data then raise exception '다른 처리에 사용된 처리키입니다.'; end if;
  return op.result;
 end if;
 target:=nullif(p_data->>'id','')::uuid;

 if p_command='CONTRACT_SAVE' then
  v_conditions:=coalesce(p_data->'conditions','{}');
  if jsonb_typeof(v_conditions)<>'object' then raise exception '계약 조건 형식을 확인해주세요.'; end if;
  contract_id:=nullif(p_data->>'management_account_id','')::uuid;
  if contract_id is not null and not exists(select 1 from finance.bank_accounts where organization_id=p_org and id=contract_id and deleted_at is null) then raise exception '조합 관리계좌를 확인해주세요.'; end if;
  if target is null then
   if nullif(p_data->>'previous_version_id','') is not null then
    select * into previous from finance.workflow_contract_versions where organization_id=p_org and id=(p_data->>'previous_version_id')::uuid;
    if not found or previous.status='DRAFT' then raise exception '이전 확정 계약 버전을 확인해주세요.'; end if;
   end if;
   insert into finance.workflow_contract_versions(organization_id,contract_key,version,name,trustee,reference,management_account_id,status,conditions,created_by,previous_version_id)
   values(p_org,coalesce(previous.contract_key,gen_random_uuid()),coalesce((select max(version)+1 from finance.workflow_contract_versions where organization_id=p_org and contract_key=previous.contract_key),1),
    trim(coalesce(p_data->>'name','')),trim(coalesce(p_data->>'trustee','')),trim(coalesce(p_data->>'reference','')),contract_id,'DRAFT',v_conditions,p_actor,previous.id) returning * into c;
  else
   select * into c from finance.workflow_contract_versions where organization_id=p_org and id=target for update;
   if not found or c.status<>'DRAFT' then raise exception '수정할 계약 초안을 확인해주세요.'; end if;
   if c.lock_version is distinct from (p_data->>'lock_version')::integer then raise exception '계약이 변경되었습니다. 다시 조회해주세요.'; end if;
   before_value:=to_jsonb(c);
   update finance.workflow_contract_versions set name=trim(coalesce(p_data->>'name','')),trustee=trim(coalesce(p_data->>'trustee','')),reference=trim(coalesce(p_data->>'reference','')),
    management_account_id=contract_id,conditions=v_conditions,lock_version=lock_version+1 where id=c.id returning * into c;
  end if;
  entity:=c.id; result:=jsonb_build_object('id',entity,'lock_version',c.lock_version);

 elsif p_command in ('CONTRACT_VERIFY','CONTRACT_RETIRE') then
  select * into c from finance.workflow_contract_versions where organization_id=p_org and id=target for update;
  if not found or c.lock_version is distinct from (p_data->>'lock_version')::integer or v_reason='' then raise exception '현재 계약 버전과 확인 사유가 필요합니다.'; end if;
  before_value:=to_jsonb(c); v_conditions:=c.conditions;
  if p_command='CONTRACT_VERIFY' then
   if c.status<>'DRAFT' or trim(c.name)='' or trim(c.trustee)='' or trim(c.reference)='' or c.management_account_id is null then raise exception '계약명·신탁사·계약 근거·관리계좌를 설정해주세요.'; end if;
   if not exists(select 1 from finance.bank_accounts where id=c.management_account_id and organization_id=p_org and deleted_at is null) then raise exception '조합 관리계좌를 확인해주세요.'; end if;
   if jsonb_typeof(v_conditions->'allowed_source_kinds') is distinct from 'array' or jsonb_array_length(v_conditions->'allowed_source_kinds')=0 or
      jsonb_typeof(v_conditions->'required_document_types') is distinct from 'array' or jsonb_typeof(v_conditions->'consent_roles') is distinct from 'array' or
      jsonb_typeof(v_conditions->'operating_allowed') is distinct from 'boolean' or jsonb_typeof(v_conditions->'operating_advance_allowed') is distinct from 'boolean' then raise exception '적용 거래·필수서류·공동 동의·운영비 조건을 명시적으로 확인해주세요.'; end if;
   if exists(select 1 from jsonb_array_elements_text(v_conditions->'allowed_source_kinds') v where v not in ('RESOLUTION','QUICK','PERSONAL','REFUND','ADVANCE')) then raise exception '계약 적용 거래 유형을 확인해주세요.'; end if;
   if v_conditions->>'no_limit' is distinct from 'true' and (coalesce((v_conditions->>'max_request_amount')::numeric,0)<=0 or (v_conditions->>'max_request_amount')::numeric<>trunc((v_conditions->>'max_request_amount')::numeric)) then raise exception '집행 한도 또는 한도 없음의 계약 근거를 확인해주세요.'; end if;
   if v_conditions->>'operating_allowed'='true' then
    if trim(coalesce(v_conditions->>'operating_basis',''))='' or jsonb_typeof(v_conditions->'operating_account_ids') is distinct from 'array' or jsonb_array_length(v_conditions->'operating_account_ids')=0 then raise exception '운영계좌 집행 근거와 계좌를 설정해주세요.'; end if;
    if exists(select 1 from jsonb_array_elements_text(v_conditions->'operating_account_ids') v where not exists(select 1 from finance.bank_accounts a where a.organization_id=p_org and a.id::text=v and a.deleted_at is null and a.id<>c.management_account_id)) then raise exception '조합 운영계좌를 확인해주세요.'; end if;
   end if;
   if v_conditions->>'operating_advance_allowed'='true' and (v_conditions->>'operating_allowed'<>'true' or trim(coalesce(v_conditions->>'advance_settlement_terms',''))='') then raise exception '운영비 선교부와 정산 조건을 확인해주세요.'; end if;
   if not exists(select 1 from finance.workflow_files where organization_id=p_org and contract_version_id=c.id and purpose='CONTRACT') then raise exception '확인할 계약서 원본을 첨부해주세요.'; end if;
   update finance.workflow_contract_versions set status='VERIFIED',verified_by=p_actor,verified_at=now(),lock_version=lock_version+1 where id=c.id returning * into c;
  else
   if c.status='RETIRED' then raise exception '이미 폐기된 계약입니다.'; end if;
   update finance.workflow_contract_versions set status='RETIRED',lock_version=lock_version+1 where id=c.id returning * into c;
  end if;
  entity:=c.id; result:=jsonb_build_object('id',entity,'lock_version',c.lock_version);

 elsif p_command='FILE_REGISTER' then
  if p_data->>'bucket' is distinct from 'finance-workflow' or coalesce(p_data->>'content_hash','') !~ '^[0-9a-f]{64}$' or trim(coalesce(p_data->>'file_name',''))='' then raise exception '증빙 파일 정보를 확인해주세요.'; end if;
  if split_part(p_data->>'path','/',1)<>p_org::text or split_part(p_data->>'path','/',2)<>p_actor::text or
     not exists(select 1 from storage.objects where bucket_id='finance-workflow' and name=p_data->>'path') then raise exception '업로드된 조합 증빙을 확인해주세요.'; end if;
  contract_id:=nullif(p_data->>'contract_version_id','')::uuid;
  if contract_id is not null and not exists(select 1 from finance.workflow_contract_versions where organization_id=p_org and id=contract_id and status='DRAFT') then raise exception '계약 초안의 첨부만 추가할 수 있습니다.'; end if;
  if p_data->>'purpose'='CONTRACT' and (contract_id is null or not 'ADMIN'=any(m.permissions)) then raise exception '계약 원본은 관리자만 등록할 수 있습니다.'; end if;
  if p_data->>'purpose' in ('REQUEST','REPLY') and nullif(p_data->>'request_id','') is null then raise exception '연결할 신탁 요청이 필요합니다.'; end if;
  if nullif(p_data->>'request_id','') is not null and not exists(select 1 from finance.workflow_trust_requests where organization_id=p_org and id=(p_data->>'request_id')::uuid) then raise exception '조합의 신탁 요청을 확인해주세요.'; end if;
  if nullif(p_data->>'transaction_id','') is not null and not exists(select 1 from finance.workflow_transactions where organization_id=p_org and id=(p_data->>'transaction_id')::uuid) then raise exception '조합 거래를 확인해주세요.'; end if;
  select * into f from finance.workflow_files where bucket='finance-workflow' and path=p_data->>'path';
  if found then
   if f.organization_id<>p_org or f.uploaded_by<>p_actor or f.content_hash<>p_data->>'content_hash' or f.purpose<>p_data->>'purpose' or
      f.request_id is distinct from nullif(p_data->>'request_id','')::uuid or f.contract_version_id is distinct from contract_id or
      f.transaction_id is distinct from nullif(p_data->>'transaction_id','')::uuid or f.document_type<>coalesce(p_data->>'document_type','') then raise exception '다른 근거로 연결된 파일입니다.'; end if;
  else
   insert into finance.workflow_files(organization_id,request_id,transaction_id,contract_version_id,purpose,document_type,bucket,path,file_name,content_hash,uploaded_by)
   values(p_org,nullif(p_data->>'request_id','')::uuid,nullif(p_data->>'transaction_id','')::uuid,contract_id,p_data->>'purpose',coalesce(p_data->>'document_type',''),'finance-workflow',p_data->>'path',p_data->>'file_name',p_data->>'content_hash',p_actor) returning * into f;
  end if;
  entity:=f.id; result:=jsonb_build_object('id',entity);

 elsif p_command='ROUTE_ASSIGN' then
  select * into tx from finance.workflow_transactions where organization_id=p_org and id=target for update;
  select * into c from finance.workflow_contract_versions where organization_id=p_org and id=(p_data->>'contract_version_id')::uuid and status='VERIFIED';
  if tx.id is null or c.id is null or v_reason='' or tx.revision is distinct from (p_data->>'revision')::integer then raise exception '현재 거래와 확인된 계약·변경 근거가 필요합니다.'; end if;
  if not (c.conditions->'allowed_source_kinds') ? tx.source_kind then raise exception '계약 적용 대상 거래가 아닙니다.'; end if;
  if p_data->>'route' not in ('TRUST_DIRECT','OPERATING') or p_data->>'route' is null then raise exception '계약에 따른 집행 경로를 선택해주세요.'; end if;
  if p_data->>'route'='OPERATING' and (c.conditions->>'operating_allowed' is distinct from 'true' or trim(coalesce(c.conditions->>'operating_basis',''))='') then raise exception '계약상 운영계좌 집행 근거가 필요합니다.'; end if;
  if exists(select 1 from finance.workflow_trust_items where transaction_id=tx.id and status not in ('PENDING','REJECTED','WITHDRAWN')) and (tx.route is distinct from p_data->>'route' or tx.contract_version_id<>c.id) then raise exception '기존 신탁 요청의 철회·정정을 먼저 확인해주세요.'; end if;
  before_value:=jsonb_build_object('route',tx.route,'contract_version_id',tx.contract_version_id,'revision',tx.revision);
  update finance.workflow_transactions set route=p_data->>'route',contract_version_id=c.id,updated_at=now() where id=tx.id;
  entity:=tx.id; result:=jsonb_build_object('id',entity);

 elsif p_command='REQUEST_SAVE' then
  if jsonb_typeof(p_data->'items') is distinct from 'array' then raise exception '신탁 요청 항목을 확인해주세요.'; end if;
  contract_id:=nullif(p_data->>'contract_version_id','')::uuid;
  if contract_id is not null and not exists(select 1 from finance.workflow_contract_versions where organization_id=p_org and id=contract_id and status<>'RETIRED') then raise exception '조합의 계약 버전을 확인해주세요.'; end if;
  if target is null then
   select count(*)+1 into seq from finance.workflow_trust_requests where organization_id=p_org;
   insert into finance.workflow_trust_requests(organization_id,request_no,title,request_date,contract_version_id,receipt_reference,created_by)
   values(p_org,'신탁-'||to_char(now() at time zone 'Asia/Seoul','YYYY')||'-'||lpad(seq::text,6,'0'),coalesce(p_data->>'title',''),nullif(p_data->>'request_date','')::date,contract_id,coalesce(p_data->>'receipt_reference',''),p_actor) returning * into q;
  else
   select * into q from finance.workflow_trust_requests where organization_id=p_org and id=target for update;
   if not found or q.status<>'DRAFT' or q.revision<>0 then raise exception '요청 준비 중인 초안만 수정할 수 있습니다.'; end if;
   if q.lock_version is distinct from (p_data->>'lock_version')::integer then raise exception '요청이 변경되었습니다. 다시 조회해주세요.'; end if;
   before_value:=to_jsonb(q);
   update finance.workflow_trust_requests set title=coalesce(p_data->>'title',''),request_date=nullif(p_data->>'request_date','')::date,contract_version_id=contract_id,
    receipt_reference=coalesce(p_data->>'receipt_reference',''),lock_version=lock_version+1,updated_at=now() where id=q.id returning * into q;
  end if;
  if (select count(*)<>count(distinct v->>'transaction_id') from jsonb_array_elements(p_data->'items') v) then raise exception '같은 거래가 요청에 중복되어 있습니다.'; end if;
  update finance.workflow_trust_items set status='WITHDRAWN',reason='초안에서 제외' where request_id=q.id;
  for item in select value from jsonb_array_elements(p_data->'items') loop
   select * into tx from finance.workflow_transactions where organization_id=p_org and id=(item->>'transaction_id')::uuid;
   amount_value:=(item->>'requested_amount')::numeric;
   if tx.id is null or amount_value is null or amount_value<=0 or amount_value<>trunc(amount_value) or amount_value>tx.amount then raise exception '요청 거래와 정수 금액을 확인해주세요.'; end if;
   insert into finance.workflow_trust_items(organization_id,request_id,transaction_id,requested_amount,source_revision)
   values(p_org,q.id,tx.id,amount_value,tx.revision) on conflict(request_id,transaction_id) do update set requested_amount=excluded.requested_amount,status='PENDING',reason='',source_revision=excluded.source_revision;
  end loop;
  entity:=q.id; result:=jsonb_build_object('id',entity,'lock_version',q.lock_version,'revision',q.revision);

 elsif p_command in ('REQUEST_SUBMIT','REVIEW_START','REPLY_RECORD','WITHDRAW_REQUEST','WITHDRAW_CONFIRM') then
  select * into q from finance.workflow_trust_requests where organization_id=p_org and id=target for update;
  if not found or q.lock_version is distinct from (p_data->>'lock_version')::integer then raise exception '요청이 변경되었습니다. 다시 조회해주세요.'; end if;
  before_value:=to_jsonb(q);
  if p_command='REVIEW_START' then
   if q.status<>'SUBMITTED' then raise exception '제출된 요청만 심사를 시작할 수 있습니다.'; end if;
   update finance.workflow_trust_requests set status='REVIEWING' where id=q.id;
  else
   if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items')=0 then raise exception '처리할 신탁 항목을 선택해주세요.'; end if;
   select array_agg((v->>'id')::uuid),count(*) into item_ids,selected_count from jsonb_array_elements(p_data->'items') v;
   if (select count(distinct v) from unnest(item_ids) v)<>selected_count or (select count(*) from finance.workflow_trust_items where organization_id=p_org and request_id=q.id and id=any(item_ids))<>selected_count then raise exception '요청에 속한 항목을 중복 없이 선택해주세요.'; end if;
   if p_command='REQUEST_SUBMIT' then
    select * into c from finance.workflow_contract_versions where organization_id=p_org and id=q.contract_version_id and status='VERIFIED';
    if c.id is null then raise exception '제출하려면 계약 조건 확인이 필요합니다. 초안은 보관됩니다.'; end if;
    if q.revision=0 and exists(select 1 from finance.workflow_trust_items where request_id=q.id and status='PENDING' and not id=any(item_ids)) then raise exception '첫 제출에는 초안의 모든 요청 항목을 포함해주세요.'; end if;
    if trim(q.title)='' or q.request_date is null or q.request_date>(now() at time zone 'Asia/Seoul')::date or trim(coalesce(p_data->>'receipt_reference',''))='' then raise exception '요청명·실제 요청일·접수정보를 입력해주세요.'; end if;
    if jsonb_typeof(p_data->'file_ids') is distinct from 'array' then raise exception '제출할 첨부 목록을 확인해주세요.'; end if;
    select coalesce(array_agg(value::uuid),'{}') into file_ids from jsonb_array_elements_text(p_data->'file_ids');
    if (select count(distinct v) from unnest(file_ids) v)<>cardinality(file_ids) or (select count(*) from finance.workflow_files where organization_id=p_org and id=any(file_ids) and purpose in ('REQUEST','EVIDENCE','CONTRACT') and (request_id=q.id or contract_version_id=c.id or transaction_id in (select transaction_id from finance.workflow_trust_items where request_id=q.id)))<>cardinality(file_ids) then raise exception '요청과 계약에 연결된 첨부를 선택해주세요.'; end if;
    if exists(select 1 from jsonb_array_elements_text(c.conditions->'required_document_types') v where not exists(select 1 from finance.workflow_files where organization_id=p_org and id=any(file_ids) and document_type=v)) then raise exception '계약상 필수서류를 첨부해주세요.'; end if;
    if exists(select 1 from jsonb_array_elements_text(c.conditions->'consent_roles') v where not exists(select 1 from jsonb_array_elements(coalesce(p_data->'consents','[]')) consent join finance.workflow_files cf on cf.id=(consent->>'file_id')::uuid where consent->>'role'=v and trim(coalesce(consent->>'name',''))<>'' and cf.id=any(file_ids) and cf.organization_id=p_org)) then raise exception '계약상 공동 동의자와 동의 근거를 확인해주세요.'; end if;
    for item in select value from jsonb_array_elements(p_data->'items') loop
     select * into i from finance.workflow_trust_items where id=(item->>'id')::uuid;
     if i.status not in ('PENDING','SUPPLEMENT') then raise exception '준비·보완 항목만 제출할 수 있습니다. 승인 항목은 유지됩니다.'; end if;
     select * into tx from finance.workflow_transactions where organization_id=p_org and id=i.transaction_id for update;
     source_value:=finance.workflow_source(p_org,tx.source_kind,tx.source_id);
     if source_value->>'signature'<>tx.source_signature then raise exception '원본이 변경되었습니다. 지출 정보를 새로 확인해주세요.'; end if;
     if source_value->'can_pay' is distinct from 'true'::jsonb or tx.payment_review_required or tx.route<>'TRUST_DIRECT' or tx.contract_version_id is distinct from c.id or not (c.conditions->'allowed_source_kinds') ? tx.source_kind then raise exception '내부 승인·과거 지급 확인·계약 집행 경로를 확인해주세요.'; end if;
     amount_value:=coalesce((item->>'requested_amount')::numeric,i.requested_amount);
     item_paid:=finance.trust_item_paid(p_org,i.id);
     own_reserved:=case when i.status='SUPPLEMENT' then greatest(0,i.requested_amount-item_paid) else 0 end;
     totals:=finance.workflow_transaction_amounts(p_org,tx.id);
     if amount_value<=0 or amount_value<item_paid or amount_value<>trunc(amount_value) or amount_value-item_paid>greatest(0,(totals->>'amount')::numeric-(totals->>'paid')::numeric-(totals->>'approved_unpaid')::numeric-(totals->>'pending')::numeric+own_reserved) then raise exception '이미 요청·승인·지급된 금액을 제외한 요청 가능액을 초과합니다.'; end if;
     update finance.workflow_trust_items set requested_amount=amount_value,status='REVIEWING',approved_amount=0,needs_review=false,source_revision=tx.revision,reason='' where id=i.id;
    end loop;
    if c.conditions->>'no_limit' is distinct from 'true' and (select sum(requested_amount) from finance.workflow_trust_items where request_id=q.id and status<>'WITHDRAWN')>(c.conditions->>'max_request_amount')::numeric then raise exception '계약의 요청 한도를 초과합니다.'; end if;
    select concat_ws(' ',bank_name,account_name,'***'||right(account_no,4)) into account_label from finance.bank_accounts where organization_id=p_org and id=c.management_account_id and deleted_at is null;
    if account_label is null then raise exception '현재 조합 관리계좌를 확인해주세요.'; end if;
    print_value:=jsonb_build_object('requestNo',q.request_no,'title',q.title,'requestDate',q.request_date,'revision',q.revision+1,'submittedAt',now(),
     'trustee',c.trustee,'contractName',c.name,'contractReference',c.reference,'managementAccountLabel',account_label,'receiptReference',p_data->>'receipt_reference',
     'items',(select jsonb_agg(jsonb_build_object('id',it.id,'sourceNo',coalesce(t.source_snapshot->>'number',t.source_id),'title',t.title,'recipient',coalesce(t.source_snapshot->>'recipient',''),'accountMasked',case when coalesce(t.source_snapshot->>'account','')='' then '' else '***'||right(t.source_snapshot->>'account',4) end,'requestedAmount',it.requested_amount) order by it.id) from finance.workflow_trust_items it join finance.workflow_transactions t on t.id=it.transaction_id where it.request_id=q.id and it.id=any(item_ids)),
     'files',coalesce((select jsonb_agg(jsonb_build_object('name',file_name,'sha256',content_hash) order by id) from finance.workflow_files where id=any(file_ids)),'[]'));
    snapshot:=jsonb_build_object('request',to_jsonb(q)||jsonb_build_object('revision',q.revision+1,'receipt_reference',p_data->>'receipt_reference'),'contract',to_jsonb(c),'selected_item_ids',to_jsonb(item_ids),'consents',coalesce(p_data->'consents','[]'),'print',print_value,
     'items',(select jsonb_agg(to_jsonb(it)||jsonb_build_object('source_snapshot',t.source_snapshot,'source_signature',t.source_signature)) from finance.workflow_trust_items it join finance.workflow_transactions t on t.id=it.transaction_id where it.request_id=q.id),
     'files',coalesce((select jsonb_agg(to_jsonb(wf)) from finance.workflow_files wf where id=any(file_ids)),'[]'));
    insert into finance.workflow_submissions(organization_id,request_id,revision,snapshot,submitted_by) values(p_org,q.id,q.revision+1,snapshot,p_actor);
    update finance.workflow_trust_requests set status=case when q.revision=0 then 'SUBMITTED' else finance.trust_status(p_org,q.id) end,revision=revision+1,receipt_reference=p_data->>'receipt_reference' where id=q.id;
   else
    if q.revision=0 then raise exception '제출 전 요청은 회신·철회 처리 대상이 아닙니다.'; end if;
    if v_reason='' then raise exception '회신·철회 처리 사유를 입력해주세요.'; end if;
    if p_command in ('REPLY_RECORD','WITHDRAW_CONFIRM') and not exists(select 1 from finance.workflow_files where organization_id=p_org and request_id=q.id and id=(p_data->>'reply_file_id')::uuid and purpose='REPLY') then raise exception '이 요청의 신탁사 회신을 첨부해주세요.'; end if;
    for item in select value from jsonb_array_elements(p_data->'items') loop
     select * into i from finance.workflow_trust_items where id=(item->>'id')::uuid;
     if p_command='REPLY_RECORD' then
      select * into tx from finance.workflow_transactions where id=i.transaction_id;
      source_value:=finance.workflow_source(p_org,tx.source_kind,tx.source_id);
      changed_source:=i.needs_review or i.source_revision is distinct from tx.revision or tx.source_signature is distinct from source_value->>'signature' or source_value->'can_pay' is distinct from 'true'::jsonb;
      -- The trustee's reply is a fact for its submitted version. Changed originals remain blocked for payment.
      -- A documented request to reopen a changed approval moves it to supplement, preserving all actual payments.
      if i.status<>'REVIEWING' and not (i.status in ('APPROVED','PARTIAL') and changed_source and item->>'status' in ('SUPPLEMENT','REJECTED')) then raise exception '심사 중이거나 변경으로 재검토가 필요한 항목을 확인해주세요.'; end if;
      next_status:=item->>'status'; amount_value:=coalesce((item->>'approved_amount')::numeric,0);
      if next_status not in ('APPROVED','PARTIAL','SUPPLEMENT','REJECTED') or next_status is null or amount_value<>trunc(amount_value) or
       (next_status='APPROVED' and amount_value<>i.requested_amount) or (next_status='PARTIAL' and (amount_value<=0 or amount_value>=i.requested_amount)) or (next_status in ('SUPPLEMENT','REJECTED') and amount_value<>0) then raise exception '항목별 결과와 승인금액을 확인해주세요.'; end if;
      if next_status in ('APPROVED','PARTIAL') and amount_value<finance.trust_item_paid(p_org,i.id) then raise exception '승인액이 기지급액보다 적습니다. 반려·회수 근거를 확인해주세요.'; end if;
      update finance.workflow_trust_items set status=next_status,approved_amount=amount_value,
       requested_amount=case when i.status in ('APPROVED','PARTIAL') and next_status='SUPPLEMENT' then i.approved_amount else i.requested_amount end,
       needs_review=changed_source,reason=coalesce(nullif(trim(item->>'reason'),''),v_reason) where id=i.id;
     elsif p_command='WITHDRAW_REQUEST' then
      if i.status not in ('REVIEWING','SUPPLEMENT','APPROVED','PARTIAL') or finance.trust_item_paid(p_org,i.id)>0 then raise exception '미지급 항목만 철회 요청할 수 있습니다. 지급분은 회수·정정을 확인해주세요.'; end if;
      update finance.workflow_trust_items set withdrawal_from_status=status,status='WITHDRAWAL_PENDING',reason=v_reason where id=i.id;
     else
      if i.status<>'WITHDRAWAL_PENDING' or finance.trust_item_paid(p_org,i.id)>0 then raise exception '미지급 철회 요청 항목을 확인해주세요.'; end if;
      update finance.workflow_trust_items set status='WITHDRAWN',approved_amount=0,reason=v_reason where id=i.id;
     end if;
    end loop;
    update finance.workflow_trust_requests set status=finance.trust_status(p_org,q.id) where id=q.id;
   end if;
  end if;
  update finance.workflow_trust_requests set lock_version=lock_version+1,updated_at=now() where id=q.id returning * into q;
  entity:=q.id; result:=jsonb_build_object('id',entity,'lock_version',q.lock_version,'revision',q.revision);
 else raise exception '지원하지 않는 신탁 업무입니다.';
 end if;
 insert into finance.workflow_events(organization_id,actor_id,entity_id,action,reason,before_data,after_data)
 values(p_org,p_actor,entity,'TRUST:'||p_command,v_reason,before_value,p_data||result);
 insert into finance.workflow_operations(organization_id,operation_key,actor_id,command,input,result)
 values(p_org,p_key,p_actor,'TRUST:'||p_command,p_data,result);
 return result;
end $$;
