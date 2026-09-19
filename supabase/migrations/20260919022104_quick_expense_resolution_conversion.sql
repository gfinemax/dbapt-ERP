-- Conversion is an atomic handoff, never a client-side save followed by a status patch.
create function finance.quick_expense_conversion_snapshot(p_org uuid,p_actor uuid,p_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; q finance.quick_expense_records; evidence jsonb;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not(m.permissions&&array['ADMIN','APPROVE','PAY']) then raise exception '지출결의 작성 권한이 필요합니다.'; end if;
 select * into q from finance.quick_expense_records where organization_id=p_org and id=p_id;
 if not found then raise exception '조직의 간편지출을 찾을 수 없습니다.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'storage_bucket',j.storage_bucket,'storage_path',j.storage_path,
  'original_filename',j.original_filename,'content_type',j.content_type,'evidence_type',j.evidence_type,
  'status',j.status,'result_data',j.result_data,'updated_at',j.updated_at,'created_at',j.created_at,
  'file_size',coalesce(nullif(o.metadata->>'size','')::bigint,0),'uploaded_by_label',coalesce(u.display_name,q.recorded_by_label)) order by j.id),'[]') into evidence
 from finance.quick_expense_evidence e join finance.expense_evidence_ocr_jobs j on j.id=e.ocr_job_id and j.organization_id=p_org
 left join storage.objects o on o.bucket_id=j.storage_bucket and o.name=j.storage_path
 left join finance.reimbursement_members u on u.organization_id=p_org and u.user_id=j.created_by
 where e.organization_id=p_org and e.quick_expense_id=p_id;
 return jsonb_build_object('source',to_jsonb(q),'evidence',evidence);
end $$;

create function finance.quick_expense_convert_resolution(p_org uuid,p_actor uuid,p_id uuid,p_expected jsonb,p_payload jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare snapshot jsonb; q finance.quick_expense_records; op finance.quick_expense_operations; m finance.reimbursement_members;
 request jsonb; doc jsonb; rowdata jsonb; initial_doc jsonb; initial_row jsonb; rid text; saved jsonb; result jsonb; evidence_rows jsonb;
begin
 -- Authorization happens before returning any prior idempotent result.
 perform finance.quick_expense_conversion_snapshot(p_org,p_actor,p_id);
 m:=finance.workflow_actor(p_org,p_actor);
 if coalesce(length(trim(p_key)),0) not between 1 and 150 or jsonb_typeof(p_payload) is distinct from 'object'
  or jsonb_typeof(p_expected) is distinct from 'object' then raise exception '전환 원본과 처리키가 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_id::text,741));
 request:=jsonb_build_object('source_id',p_id,'expected',p_expected,'payload',p_payload);
 select * into op from finance.quick_expense_operations where organization_id=p_org and operation_key=p_key;
 if found then
  if op.actor_id<>p_actor or op.command<>'CONVERT_RESOLUTION' or op.input is distinct from request then raise exception '다른 처리에 사용된 처리키입니다.'; end if;
  return op.result;
 end if;
 select * into q from finance.quick_expense_records where organization_id=p_org and id=p_id for update;
 snapshot:=finance.quick_expense_conversion_snapshot(p_org,p_actor,p_id);
 if snapshot is distinct from p_expected then raise exception '간편지출 또는 증빙이 변경되었습니다. 다시 확인해주세요.'; end if;
 if q.record_status<>'NEEDS_RESOLUTION' or q.linked_resolution_id is not null then raise exception '정식결의 필요 상태의 미전환 원본만 전환할 수 있습니다.'; end if;
 if exists(select 1 from finance.personal_reimbursements where organization_id=p_org and source_quick_id=p_id)
  or exists(select 1 from finance.workflow_transactions where organization_id=p_org and source_kind='QUICK' and source_id=p_id::text)
  or exists(select 1 from finance.budget_source_assignments where organization_id=p_org and source_kind='QUICK' and source_id=p_id::text)
 then raise exception '기존 정산·업무흐름·예산 배정 연결을 먼저 검토해야 합니다.'; end if;
 rowdata:=p_payload->'row'; doc:=rowdata->'resolution_data'; rid:=rowdata->>'id';
 if coalesce(trim(rid),'')='' or exists(select 1 from finance.expense_resolutions where id=rid) then raise exception '새 지출결의 ID가 필요합니다.'; end if;
 if (rowdata->>'total_payment_amount')::numeric is distinct from q.amount
  or (doc->>'totalPaymentAmount')::numeric is distinct from q.amount
  or doc->>'subject' is distinct from q.usage_description or rowdata->>'subject' is distinct from q.usage_description
  or doc->>'vendorName' is distinct from q.counterparty or doc->>'budgetItem' is distinct from q.budget_item
  or nullif(doc->>'expenseDetailId','') is distinct from q.expense_detail_id::text
  or nullif(rowdata->>'expense_detail_id','') is distinct from q.expense_detail_id::text
  or doc->>'actualExpenseDate' is distinct from (q.occurred_at at time zone 'Asia/Seoul')::date::text
  or rowdata->>'actual_expense_date' is distinct from (q.occurred_at at time zone 'Asia/Seoul')::date::text
  or nullif(doc->>'bankTransactionId','') is distinct from q.bank_transaction_id::text
  or nullif(rowdata->>'bank_transaction_id','') is distinct from q.bank_transaction_id::text
  or nullif(doc->>'cardTransactionId','') is distinct from q.corporate_card_transaction_id::text
 then raise exception '전환 원본의 금액·사용내용·거래처·예산·사용일·거래 연결을 유지해야 합니다.'; end if;
 -- Require the exact original evidence set; do not move/delete original files or links.
 if jsonb_typeof(p_payload->'evidence') is distinct from 'array' then raise exception '원본 증빙 목록이 필요합니다.'; end if;
 if jsonb_array_length(p_payload->'evidence')<>jsonb_array_length(snapshot->'evidence')
  or exists(select 1 from jsonb_array_elements(snapshot->'evidence') e where not exists(
   select 1 from jsonb_array_elements(p_payload->'evidence') a where a->>'storage_bucket'=e->>'storage_bucket'
    and a->>'storage_path'=e->>'storage_path' and a->>'original_filename'=e->>'original_filename'
    and a->>'content_type'=e->>'content_type' and a->>'evidence_type'=e->>'evidence_type'))
 then raise exception '원본 증빙을 빠짐없이 유지해야 합니다.'; end if;
 if exists(select 1 from jsonb_array_elements(snapshot->'evidence') e where (e->>'file_size')::bigint<=0)
 then raise exception '원본 증빙 파일 크기를 확인할 수 없습니다.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',a->>'id','resolution_id',rid,'item_id',a->'item_id','storage_bucket',e->>'storage_bucket',
   'storage_path',e->>'storage_path','original_filename',e->>'original_filename','content_type',e->>'content_type',
   'evidence_type',e->>'evidence_type','file_size',(e->>'file_size')::bigint,
   'ocr_status',case when e->>'status'='COMPLETED' then 'EXTRACTED' when e->>'status'='FAILED' then 'FAILED' else 'REVIEW_REQUIRED' end,
   'ocr_data',coalesce(e->'result_data','{}'),'uploaded_by_label',e->>'uploaded_by_label',
   'uploaded_at',e->>'created_at','updated_at',clock_timestamp()) order by a->>'id'),'[]') into evidence_rows
 from jsonb_array_elements(p_payload->'evidence') a join jsonb_array_elements(snapshot->'evidence') e
  on a->>'storage_bucket'=e->>'storage_bucket' and a->>'storage_path'=e->>'storage_path';
 if exists(select 1 from jsonb_array_elements(evidence_rows) e where coalesce(e->>'id','')='')
 then raise exception '증빙 연결 ID가 필요합니다.'; end if;
 p_payload:=jsonb_set(p_payload,'{evidence}',evidence_rows);
 -- Reserve the new draft and authenticated author inside this transaction so a card already owned by
 -- this quick original can be handed to the resolution without a duplicate-source window.
 initial_doc:=doc||jsonb_build_object('author',m.display_name,'history','[]'::jsonb);
 initial_row:=rowdata||jsonb_build_object('organization_id',p_org,'author_label',m.display_name,'resolution_data',initial_doc,'updated_at',clock_timestamp());
 perform finance.legacy_expense_write_row('expense_resolutions',initial_row);
 insert into finance.expense_authorization_bindings(resolution_id,organization_id,author_user_id,bound_by,bound_at,binding_reason)
 values(rid,p_org,p_actor,p_actor,clock_timestamp(),'간편지출 정식결의 전환');
 update finance.quick_expense_records set record_status='CONVERTED',linked_resolution_id=rid,updated_at=clock_timestamp() where id=p_id;
 p_payload:=jsonb_set(p_payload,'{expected_binding_version}','1');
 saved:=finance.legacy_expense_command(p_org,p_actor,'SAVE',rid,initial_doc,p_payload,'quick-convert:'||p_key);
 result:=jsonb_build_object('source_id',p_id,'resolution_id',rid,'resolution',saved);
 insert into finance.quick_expense_audit(organization_id,quick_expense_id,actor_id,action,before_data,after_data)
 values(p_org,p_id,p_actor,'CONVERT_RESOLUTION',snapshot,result);
 insert into finance.quick_expense_operations(organization_id,operation_key,actor_id,command,input,result)
 values(p_org,p_key,p_actor,'CONVERT_RESOLUTION',request,result);
 return result;
end $$;

create function finance.guard_converted_quick_original() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.linked_resolution_id is not null and current_setting('finance.quick_original_correction_id',true) is distinct from old.id::text
 then raise exception '결의서에 연결된 간편지출 원본은 감사 정정 명령으로만 변경할 수 있습니다.'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger preserve_converted_quick_original before update or delete on finance.quick_expense_records
for each row execute function finance.guard_converted_quick_original();

create function finance.quick_expense_correct_converted(p_org uuid,p_actor uuid,p_id uuid,p_data jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; q finance.quick_expense_records; op finance.quick_expense_operations; before_value jsonb; result jsonb;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not(m.permissions&&array['ADMIN','APPROVE']) then raise exception '연결 원본 정정 권한이 없습니다.'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or coalesce(length(trim(p_key)),0) not between 1 and 150
  or p_data ?| array['id','organization_id','linked_resolution_id','record_status','bank_transaction_id','corporate_card_transaction_id','payment_method']
  or exists(select 1 from jsonb_object_keys(p_data) k where k<>all(array['expected_updated_at','reason','amount','usage_description','counterparty','budget_item','expense_detail_id']))
 then raise exception '정정 입력 형식을 확인해주세요.'; end if;
 if coalesce(length(trim(p_data->>'reason')),0)<2 then raise exception '원본 정정 사유가 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_id::text,741));
 select * into op from finance.quick_expense_operations where organization_id=p_org and operation_key=p_key;
 if found then
  if op.actor_id<>p_actor or op.command<>'CORRECT_CONVERTED' or op.input is distinct from p_data then raise exception '다른 처리에 사용된 처리키입니다.'; end if;
  return op.result;
 end if;
 select * into q from finance.quick_expense_records where organization_id=p_org and id=p_id for update;
 if not found or q.linked_resolution_id is null or q.record_status<>'CONVERTED' then raise exception '결의서에 연결된 전환 원본을 찾을 수 없습니다.'; end if;
 if p_data->>'expected_updated_at' is distinct from q.updated_at::text then raise exception '원본이 변경되었습니다. 다시 조회해주세요.'; end if;
 if p_data ? 'amount' and (coalesce((p_data->>'amount')::numeric,0)<=0 or (p_data->>'amount')::numeric<>trunc((p_data->>'amount')::numeric)) then raise exception '정정 금액을 확인해주세요.'; end if;
 if p_data ? 'usage_description' and coalesce(length(trim(p_data->>'usage_description')),0) not between 1 and 500 then raise exception '사용내용을 확인해주세요.'; end if;
 if p_data ? 'counterparty' and length(trim(coalesce(p_data->>'counterparty','')))>200 then raise exception '거래처를 확인해주세요.'; end if;
 if p_data ? 'budget_item' and coalesce(length(trim(p_data->>'budget_item')),0)=0 then raise exception '예산항목을 확인해주세요.'; end if;
 before_value:=to_jsonb(q);
 perform set_config('finance.quick_original_correction_id',p_id::text,true);
 update finance.quick_expense_records set
  amount=case when p_data ? 'amount' then (p_data->>'amount')::numeric else amount end,
  usage_description=case when p_data ? 'usage_description' then trim(p_data->>'usage_description') else usage_description end,
  counterparty=case when p_data ? 'counterparty' then trim(coalesce(p_data->>'counterparty','')) else counterparty end,
  budget_item=case when p_data ? 'budget_item' then trim(p_data->>'budget_item') else budget_item end,
  expense_detail_id=case when p_data ? 'expense_detail_id' then nullif(p_data->>'expense_detail_id','')::uuid else expense_detail_id end,
  updated_at=clock_timestamp() where id=p_id returning to_jsonb(quick_expense_records.*) into result;
 perform set_config('finance.quick_original_correction_id','',true);
 insert into finance.quick_expense_audit(organization_id,quick_expense_id,actor_id,action,before_data,after_data)
 values(p_org,p_id,p_actor,'CORRECT_CONVERTED:'||trim(p_data->>'reason'),before_value,result);
 insert into finance.quick_expense_operations(organization_id,operation_key,actor_id,command,input,result)
 values(p_org,p_key,p_actor,'CORRECT_CONVERTED',p_data,result);
 return result;
end $$;

revoke all on function finance.quick_expense_conversion_snapshot(uuid,uuid,uuid),finance.quick_expense_convert_resolution(uuid,uuid,uuid,jsonb,jsonb,text),finance.quick_expense_correct_converted(uuid,uuid,uuid,jsonb,text),finance.guard_converted_quick_original() from public,anon,authenticated;
grant execute on function finance.quick_expense_conversion_snapshot(uuid,uuid,uuid),finance.quick_expense_convert_resolution(uuid,uuid,uuid,jsonb,jsonb,text),finance.quick_expense_correct_converted(uuid,uuid,uuid,jsonb,text) to service_role;
notify pgrst,'reload schema';
