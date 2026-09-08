create table approval.document_authorization_bindings(
 document_id uuid primary key references approval.documents(id) on delete restrict,
 organization_id uuid not null references core.organizations(id),drafter_user_id uuid references auth.users(id),
 steps jsonb not null default '[]' check(jsonb_typeof(steps)='array'),version integer not null default 1 check(version>0),
 bound_by uuid references auth.users(id),bound_at timestamptz,binding_reason text
);
-- Identity-free version stubs only: no historical names, signatures or document data change.
insert into approval.document_authorization_bindings(document_id,organization_id) select id,organization_id from approval.documents where organization_id is not null;
create index document_authorization_org_idx on approval.document_authorization_bindings(organization_id,drafter_user_id);
create table approval.document_operations(organization_id uuid not null references core.organizations(id),operation_key text not null,
 actor_id uuid not null references auth.users(id),command text not null,input_hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(organization_id,operation_key));
alter table approval.document_authorization_bindings enable row level security;
alter table approval.document_operations enable row level security;
revoke all on approval.document_authorization_bindings,approval.document_operations from public,anon,authenticated;
grant all on approval.document_authorization_bindings,approval.document_operations to service_role;
alter table approval.audit_logs add column auth_actor_id uuid references auth.users(id);
revoke all on approval.documents,approval.approval_steps,approval.document_lines,approval.audit_logs,approval.attachments from public,anon,authenticated;

create function approval.document_write_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_document_id uuid; org uuid; protected boolean; context_ok boolean;
begin
 v_document_id:=case when tg_table_name='documents' then coalesce(to_jsonb(old)->>'id',to_jsonb(new)->>'id') else coalesce(to_jsonb(old)->>'document_id',to_jsonb(new)->>'document_id') end;
 select organization_id into org from approval.documents where documents.id=v_document_id;
 if tg_table_name='documents' and tg_op='INSERT' then org:=new.organization_id; end if;
 context_ok:=coalesce(current_setting('approval.document_command_id',true),'')=v_document_id::text and coalesce(current_setting('approval.document_command_org',true),'')=org::text;
 if tg_table_name='documents' then
  protected:=tg_op in ('INSERT','DELETE') or (to_jsonb(new)-array['updated_at','execution_status','expense_resolution_id','voucher_id','meeting_id','meeting_status','contract_id','completed_at','reserved_amount']) is distinct from (to_jsonb(old)-array['updated_at','execution_status','expense_resolution_id','voucher_id','meeting_id','meeting_status','contract_id','completed_at','reserved_amount']);
 else protected:=true; end if;
 if protected and not context_ok and (exists(select 1 from approval.document_authorization_bindings where document_id=v_document_id) or current_setting('role',true) in ('service_role','authenticated','anon')) then raise exception '기안은 사용자 확인을 거친 문서 명령으로 처리해주세요.'; end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create function approval.document_version_bump() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_document_id uuid;
begin
 v_document_id:=(case when tg_table_name='documents' then coalesce(to_jsonb(old)->>'id',to_jsonb(new)->>'id') else coalesce(to_jsonb(old)->>'document_id',to_jsonb(new)->>'document_id') end)::uuid;
 update approval.document_authorization_bindings set version=version+1 where document_id=v_document_id;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger document_write_guard before insert or update or delete on approval.documents for each row execute function approval.document_write_guard();
create trigger document_write_guard before insert or update or delete on approval.approval_steps for each row execute function approval.document_write_guard();
create trigger document_write_guard before insert or update or delete on approval.document_lines for each row execute function approval.document_write_guard();
create trigger document_version_bump after update on approval.documents for each row execute function approval.document_version_bump();
create trigger document_version_bump after insert or update or delete on approval.approval_steps for each row execute function approval.document_version_bump();
create trigger document_version_bump after insert or update or delete on approval.document_lines for each row execute function approval.document_version_bump();

create function approval.document_command(p_org uuid,p_actor uuid,p_command text,p_id uuid,p_expected_version integer,p_payload jsonb,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m finance.reimbursement_members; b approval.document_authorization_bindings; d approval.documents; op approval.document_operations;
 doc jsonb; changes jsonb; step jsonb; line jsonb; steps jsonb; current_step approval.approval_steps; target approval.approval_steps;
 actor uuid; admin boolean; key text; idx integer; count_steps integer; before_value jsonb; result jsonb; h text; v_status text; amount_value numeric; lines_total numeric; budget approval.budgets; material boolean; out_link boolean;
begin
 m:=finance.workflow_actor(p_org,p_actor);admin:='ADMIN'=any(m.permissions);
 if not exists(select 1 from core.organizations where id=p_org and status='active') then raise exception '활성 조직이 아닙니다.';end if;
 if p_command not in ('CREATE','BIND','UPDATE','SUBMIT','RESUBMIT','APPROVE','REJECT','REVISION_REQUEST','CLOSE') or p_id is null or p_expected_version is null or p_expected_version<0 or coalesce(trim(p_key),'')='' or length(p_key)>200 or jsonb_typeof(p_payload) is distinct from 'object' then raise exception '기안 명령·버전·처리키를 확인해주세요.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,739));
 perform set_config('TimeZone','Asia/Seoul',true);
 h:=md5(jsonb_build_object('id',p_id,'version',p_expected_version,'payload',p_payload)::text);
 select * into op from approval.document_operations where organization_id=p_org and operation_key=p_key;
 if found then if op.actor_id<>p_actor or op.command<>p_command or op.input_hash<>h then raise exception '처리키가 다른 요청에 사용되었습니다.';end if;return op.result;end if;
 select * into d from approval.documents where id=p_id for update;
 if found then
  if p_command='CREATE' or d.organization_id is distinct from p_org or d.deleted_at is not null then raise exception '조직의 기안 또는 신규 원본 ID를 확인해주세요.';end if;
  select * into b from approval.document_authorization_bindings where document_id=p_id for update;
  if coalesce(b.version,0)<>p_expected_version then raise exception '기안이 변경되었습니다. 다시 조회해주세요.';end if;
 elsif p_command<>'CREATE' or p_expected_version<>0 then raise exception '조직의 기안을 찾을 수 없습니다.';end if;
 before_value:=jsonb_build_object('document',to_jsonb(d),'binding',to_jsonb(b),'steps',(select coalesce(jsonb_agg(to_jsonb(s) order by step_order),'[]') from approval.approval_steps s where document_id=p_id));
 perform set_config('approval.document_command_org',p_org::text,true);perform set_config('approval.document_command_id',p_id::text,true);
 if p_command='CREATE' then
  if not m.permissions&&array['ADMIN','APPROVE','PAY'] then raise exception '기안 작성 권한이 필요합니다.';end if;
  doc:=p_payload->'document';steps:=p_payload->'steps';
  if jsonb_typeof(doc) is distinct from 'object' or jsonb_typeof(steps) is distinct from 'array' or jsonb_typeof(p_payload->'lines') is distinct from 'array' then raise exception '기안·결재선·항목 입력을 확인해주세요.';end if;
  if doc ?| array['organization_id','organizationId','drafter_id','drafterUserId','approvalStatus','executionStatus','approvedAt','meetingId','contractId','expenseResolutionId','voucherId'] or coalesce((doc->>'meetingConfirmed')::boolean,false) or coalesce(doc->>'meetingStatus','NOT_REQUIRED') not in ('NOT_REQUIRED','REQUIRED') then raise exception '초안에 승인·의결·집행 결과를 저장할 수 없습니다.';end if;
  amount_value:=coalesce((doc->>'amount')::numeric,0);
  if amount_value::text in ('NaN','Infinity','-Infinity') or amount_value<0 or amount_value<>trunc(amount_value) or coalesce(trim(doc->>'title'),'')='' then raise exception '기안 제목과 금액을 확인해주세요.';end if;
  select coalesce(sum(coalesce((l->>'supplyAmount')::numeric,0)+coalesce((l->>'vatAmount')::numeric,0)),0) into lines_total from jsonb_array_elements(p_payload->'lines')l;
  if jsonb_array_length(p_payload->'lines')>0 and lines_total<>amount_value then raise exception '세부항목 합계와 기안 총액이 일치하지 않습니다.';end if;
  insert into approval.documents(id,organization_id,document_no,document_type,title,purpose,body,drafter_label,department_label,approval_status,meeting_status,execution_status,amount,budget_item,budget_year,counterparty_name,desired_execution_date,expected_effect,project_name,security_level,is_urgent,payment_due_date,payment_method,is_out_of_budget,has_member_burden,evidence_kind,is_contract_related,is_installment_payment)
   values(p_id,p_org,approval.next_document_no(),doc->>'documentType',doc->>'title',coalesce(doc->>'purpose',''),coalesce(doc->>'body',''),m.display_name,coalesce(doc->>'departmentLabel',''),'DRAFT',coalesce(doc->>'meetingStatus','NOT_REQUIRED'),'NOT_LINKED',amount_value,nullif(doc->>'budgetItem',''),nullif(doc->>'fiscalYear','')::integer,nullif(doc->>'counterpartyName',''),nullif(doc->>'desiredExecutionDate','')::date,coalesce(doc->>'expectedEffect',''),coalesce(doc->>'projectName',''),coalesce(doc->>'securityLevel','INTERNAL'),coalesce((doc->>'urgent')::boolean,false),nullif(doc->>'paymentDueDate','')::date,nullif(doc->>'paymentMethod',''),coalesce((doc->>'outOfBudget')::boolean,false),coalesce((doc->>'memberBurden')::boolean,false),nullif(doc->>'evidenceKind',''),coalesce((doc->>'contractRelated')::boolean,false),coalesce((doc->>'installmentPayment')::boolean,false));
  if jsonb_typeof(coalesce(doc->'paymentSchedule','[]'))<>'array' then raise exception '계약 지급일정 형식을 확인해주세요.';end if;
  update approval.documents set recommended_meeting_body=nullif(doc->>'recommendedMeetingBody',''),recommendation_reason=nullif(doc->>'recommendationReason',''),regulation_reference=nullif(doc->>'regulationReference',''),contract_start_date=nullif(doc->>'contractStartDate','')::date,contract_end_date=nullif(doc->>'contractEndDate','')::date,contract_payment_terms=coalesce(nullif(doc->>'contractPaymentTerms',''),nullif(doc->>'paymentTerms','')),payment_schedule=coalesce(doc->'paymentSchedule','[]'),related_document=nullif(doc->>'relatedDocument','') where id=p_id;
  for step,idx in select value,ordinality::integer from jsonb_array_elements(steps) with ordinality loop
   if coalesce(trim(step->>'approverLabel'),'')='' then raise exception '결재자 표시 이름을 확인해주세요.';end if;
   insert into approval.approval_steps(document_id,step_order,approver_label,approver_role,status) values(p_id,idx,step->>'approverLabel',coalesce(step->>'approverRole',''),'WAITING');
  end loop;
  for line,idx in select value,ordinality::integer from jsonb_array_elements(p_payload->'lines') with ordinality loop
   insert into approval.document_lines(document_id,line_no,partner_name,account_subject_name,budget_item,supply_amount,vat_amount,description) values(p_id,idx,coalesce(line->>'partnerName',''),coalesce(line->>'accountSubjectName',''),nullif(line->>'budgetItem',''),coalesce((line->>'supplyAmount')::numeric,0),coalesce((line->>'vatAmount')::numeric,0),coalesce(line->>'description',''));
  end loop;
  insert into approval.document_authorization_bindings(document_id,organization_id,drafter_user_id,bound_by,bound_at,binding_reason) values(p_id,p_org,p_actor,p_actor,now(),'신규 기안 작성자 로그인 확인');
 elsif p_command='BIND' then
  if not admin or coalesce(trim(p_payload->>'reason'),'')='' then raise exception '관리자 확인과 연결 사유가 필요합니다.';end if;
  actor:=nullif(p_payload->>'drafter_user_id','')::uuid;if actor is not null then perform finance.workflow_actor(p_org,actor);end if;
  steps:='[]';if jsonb_typeof(p_payload->'steps') is distinct from 'array' then raise exception '결재선 연결 형식을 확인해주세요.';end if;
  for step in select value from jsonb_array_elements(p_payload->'steps') loop
   idx:=(step->>'order')::integer;
   select * into target from approval.approval_steps where document_id=p_id and step_order=idx;
   if not found or exists(select 1 from jsonb_array_elements(steps)s where (s->>'order')::integer=idx) then raise exception '기존 결재 순번을 확인해주세요.';end if;
   if step->>'user_id' is not null and not exists(select 1 from finance.reimbursement_members where organization_id=p_org and user_id=(step->>'user_id')::uuid and active and permissions&&array['ADMIN','APPROVE']) then raise exception '조직의 결재자 계정 권한을 확인해주세요.';end if;
   steps:=steps||jsonb_build_array(jsonb_build_object('order',idx,'user_id',step->>'user_id','legacy_step',jsonb_build_object('step_id',target.id,'approver_label',target.approver_label,'approver_role',target.approver_role)));
  end loop;
  insert into approval.document_authorization_bindings(document_id,organization_id,drafter_user_id,steps,version,bound_by,bound_at,binding_reason) values(p_id,p_org,actor,steps,coalesce(b.version,0)+1,p_actor,now(),p_payload->>'reason') on conflict(document_id) do update set drafter_user_id=excluded.drafter_user_id,steps=excluded.steps,version=excluded.version,bound_by=excluded.bound_by,bound_at=excluded.bound_at,binding_reason=excluded.binding_reason;
 else
  out_link:=d.expense_resolution_id is not null or d.contract_id is not null or d.voucher_id is not null or exists(select 1 from finance.expense_resolutions where approval_document_id=p_id and deleted_at is null) or exists(select 1 from approval.contracts where document_id=p_id) or exists(select 1 from approval.budget_reservations where document_id=p_id and (status='CONSUMED' or (released_amount>0 and status='ACTIVE')));
  if p_command in ('UPDATE','SUBMIT','RESUBMIT') and b.drafter_user_id is distinct from p_actor and not(p_command='UPDATE' and admin) then raise exception '연결된 기안자만 처리할 수 있습니다.';end if;
  if p_command in ('UPDATE','RESUBMIT') then
   if d.approval_status not in ('DRAFT','REJECTED','REVISION_REQUESTED') or out_link then raise exception '미집행 초안·반려·보완요청 문서만 수정할 수 있습니다.';end if;
   changes:=coalesce(p_payload->'changes','{}');
   if exists(select 1 from jsonb_object_keys(changes)k where k<>all(array['title','body','purpose','amount','counterpartyName','budgetItem','projectName'])) then raise exception '수정할 수 없는 기안 필드입니다.';end if;
   amount_value:=coalesce((changes->>'amount')::numeric,d.amount);if amount_value::text in ('NaN','Infinity','-Infinity') or amount_value<0 or amount_value<>trunc(amount_value) then raise exception '기안 금액을 확인해주세요.';end if;
   if p_payload ? 'lines' then
    if jsonb_typeof(p_payload->'lines') is distinct from 'array' then raise exception '기안 항목 형식을 확인해주세요.';end if;
    select coalesce(sum(coalesce((l->>'supplyAmount')::numeric,0)+coalesce((l->>'vatAmount')::numeric,0)),0) into lines_total from jsonb_array_elements(p_payload->'lines')l;
    if jsonb_array_length(p_payload->'lines')>0 and lines_total<>amount_value then raise exception '세부항목 합계와 기안 총액이 일치하지 않습니다.';end if;
    -- Existing line IDs are retained by ordinal; callers cannot reassign a foreign ID.
    for line,idx in select value,ordinality::integer from jsonb_array_elements(p_payload->'lines') with ordinality loop
     if line ? 'id' and not exists(select 1 from approval.document_lines where document_id=p_id and id=(line->>'id')::uuid and line_no=idx) then raise exception '다른 기안 또는 순번의 항목 ID입니다.';end if;
     insert into approval.document_lines(document_id,line_no,partner_name,account_subject_name,budget_item,supply_amount,vat_amount,description) values(p_id,idx,coalesce(line->>'partnerName',''),coalesce(line->>'accountSubjectName',''),nullif(line->>'budgetItem',''),coalesce((line->>'supplyAmount')::numeric,0),coalesce((line->>'vatAmount')::numeric,0),coalesce(line->>'description','')) on conflict(document_id,line_no) do update set partner_name=excluded.partner_name,account_subject_name=excluded.account_subject_name,budget_item=excluded.budget_item,supply_amount=excluded.supply_amount,vat_amount=excluded.vat_amount,description=excluded.description;
    end loop;
    delete from approval.document_lines where document_id=p_id and line_no>jsonb_array_length(p_payload->'lines');
   elsif exists(select 1 from approval.document_lines where document_id=p_id) and (select sum(total_amount) from approval.document_lines where document_id=p_id)<>amount_value then raise exception '금액 변경 시 세부항목 합계도 확인해주세요.';end if;
   update approval.documents set title=coalesce(nullif(trim(changes->>'title'),''),title),body=coalesce(changes->>'body',body),purpose=coalesce(changes->>'purpose',purpose),amount=amount_value,counterparty_name=case when changes ? 'counterpartyName' then nullif(changes->>'counterpartyName','') else counterparty_name end,budget_item=case when changes ? 'budgetItem' then nullif(changes->>'budgetItem','') else budget_item end,project_name=coalesce(changes->>'projectName',project_name),updated_at=now() where id=p_id;
  end if;
  if p_command in ('SUBMIT','RESUBMIT') then
   select * into d from approval.documents where id=p_id;
   if coalesce(trim(d.title),'')='' or coalesce(trim(d.drafter_label),'')='' or coalesce(trim(d.department_label),'')='' or coalesce(trim(d.purpose),'')='' then raise exception '상신할 제목·기안자·부서·목적을 확인해주세요.';end if;
   if d.document_type in ('EXPENSE','CONTRACT') and d.amount<=0 then raise exception '지출·계약 기안은 금액이 필요합니다.';end if;
   if (p_command='SUBMIT' and d.approval_status<>'DRAFT') or (p_command='RESUBMIT' and d.approval_status not in ('REJECTED','REVISION_REQUESTED')) then raise exception '상신 가능한 기안 상태가 아닙니다.';end if;
   select count(*) into count_steps from approval.approval_steps where document_id=p_id;if count_steps=0 then raise exception '결재선이 필요합니다.';end if;
   for target in select * from approval.approval_steps where document_id=p_id order by step_order loop
    select s into step from jsonb_array_elements(b.steps)s where (s->>'order')::integer=target.step_order;
    if step->>'user_id' is null or step->'legacy_step' is distinct from jsonb_build_object('step_id',target.id,'approver_label',target.approver_label,'approver_role',target.approver_role) then raise exception '기안 결재자 UUID 연결을 확인해주세요.';end if;
    perform finance.workflow_actor(p_org,(step->>'user_id')::uuid);
    if not exists(select 1 from finance.reimbursement_members where organization_id=p_org and user_id=(step->>'user_id')::uuid and active and permissions&&array['ADMIN','APPROVE']) then raise exception '조직의 결재자 계정 권한을 확인해주세요.';end if;
   end loop;
   update approval.budget_reservations set status='RELEASED',released_amount=amount,release_reason='반려 문서 재상신',updated_at=now() where document_id=p_id and status='ACTIVE';
   update approval.approval_steps set status=case when step_order=(select min(step_order) from approval.approval_steps where document_id=p_id) then 'PENDING' else 'WAITING' end,comment=null,acted_at=null where document_id=p_id;
   update approval.documents set approval_status='SUBMITTED',execution_status='NOT_LINKED',reserved_amount=0,submitted_at=now(),approved_at=null,rejected_at=null,updated_at=now() where id=p_id;
  elsif p_command in ('APPROVE','REJECT','REVISION_REQUEST') then
   if not m.permissions&&array['ADMIN','APPROVE'] then raise exception '현재 결재 실행 권한이 필요합니다.';end if;
   if d.approval_status not in ('SUBMITTED','IN_REVIEW') then raise exception '결재 가능한 기안이 아닙니다.';end if;
   if (select count(*) from approval.approval_steps where document_id=p_id and status='PENDING')<>1 then raise exception '현재 결재 단계를 확인해주세요.';end if;
   select * into current_step from approval.approval_steps where document_id=p_id and status='PENDING' for update;
   if exists(select 1 from approval.approval_steps where document_id=p_id and step_order<current_step.step_order and status not in ('APPROVED','SKIPPED')) then raise exception '이전 결재 단계가 완료되지 않았습니다.';end if;
   select s into step from jsonb_array_elements(b.steps)s where (s->>'order')::integer=current_step.step_order;
   if step->>'user_id' is distinct from p_actor::text or step->'legacy_step' is distinct from jsonb_build_object('step_id',current_step.id,'approver_label',current_step.approver_label,'approver_role',current_step.approver_role) then raise exception '현재 연결된 UUID 결재자만 처리할 수 있습니다.';end if;
   if p_command<>'APPROVE' and coalesce(trim(p_payload->>'comment'),'')='' then raise exception '반려 또는 보완요청 사유가 필요합니다.';end if;
   update approval.approval_steps set status=case when p_command='APPROVE' then 'APPROVED' else 'REJECTED' end,comment=p_payload->>'comment',acted_at=now() where id=current_step.id;
   if p_command='APPROVE' then
    select * into target from approval.approval_steps where document_id=p_id and step_order>current_step.step_order and status='WAITING' order by step_order limit 1;
    if found then update approval.approval_steps set status='PENDING' where id=target.id;v_status:='IN_REVIEW';else v_status:='APPROVED';end if;
   elsif p_command='REJECT' then v_status:='REJECTED';else v_status:='REVISION_REQUESTED';end if;
   amount_value:=0;
   if v_status='APPROVED' and d.document_type in ('EXPENSE','CONTRACT') and not d.is_out_of_budget then
    if d.budget_item is null or (select count(*) from approval.budgets where organization_id=p_org and fiscal_year=coalesce(d.budget_year,extract(year from current_date)::integer) and budget_item=d.budget_item)<>1 then raise exception '최종 승인할 조직·연도 예산을 확인해주세요.';end if;
    select * into budget from approval.budgets where organization_id=p_org and fiscal_year=coalesce(d.budget_year,extract(year from current_date)::integer) and budget_item=d.budget_item;
    if exists(select 1 from approval.budget_reservations where document_id=p_id and status='ACTIVE') then raise exception '기존 활성 예산예약을 확인해주세요.';end if;
    insert into approval.budget_reservations(document_id,budget_id,amount) values(p_id,budget.id,d.amount);amount_value:=d.amount;
   end if;
   update approval.documents set approval_status=v_status,reserved_amount=amount_value,execution_status=case when v_status='APPROVED' and amount_value>0 and meeting_status='NOT_REQUIRED' and not is_out_of_budget then 'BUDGET_RESERVED' else 'NOT_LINKED' end,approved_at=case when v_status='APPROVED' then now() else null end,rejected_at=case when v_status in ('REJECTED','REVISION_REQUESTED') then now() else null end,updated_at=now() where id=p_id;
  elsif p_command='CLOSE' then
   v_status:=p_payload->>'action';
   if v_status not in ('WITHDRAWN','CANCELLED') or coalesce(trim(p_payload->>'reason'),'')='' then raise exception '종료 종류와 사유가 필요합니다.';end if;
   if (v_status='WITHDRAWN' and b.drafter_user_id is distinct from p_actor) or (v_status='CANCELLED' and not admin) then raise exception '기안 회수·취소 권한이 없습니다.';end if;
   if out_link or d.approval_status in ('WITHDRAWN','CANCELLED') then raise exception '집행 연결 또는 이미 종료된 기안은 원본을 취소할 수 없습니다.';end if;
   update approval.budget_reservations set status='RELEASED',released_amount=amount,release_reason=p_payload->>'reason',updated_at=now() where document_id=p_id and status='ACTIVE';
   update approval.documents set approval_status=v_status,reserved_amount=0,execution_status='NOT_LINKED',updated_at=now() where id=p_id;
  end if;
 end if;
 select jsonb_build_object('id',d2.id,'version',b2.version,'approval_status',d2.approval_status) into result from approval.documents d2 join approval.document_authorization_bindings b2 on b2.document_id=d2.id where d2.id=p_id;
 insert into approval.audit_logs(document_id,action_type,actor_label,auth_actor_id,comment,before_data,after_data) values(p_id,'AUTH:'||p_command,m.display_name,p_actor,coalesce(p_payload->>'comment',p_payload->>'reason'),before_value,result||jsonb_build_object('binding',(select to_jsonb(a) from approval.document_authorization_bindings a where document_id=p_id),'steps',(select coalesce(jsonb_agg(to_jsonb(s) order by step_order),'[]') from approval.approval_steps s where document_id=p_id)));
 insert into approval.document_operations(organization_id,operation_key,actor_id,command,input_hash,result) values(p_org,p_key,p_actor,p_command,h,result);
 perform set_config('approval.document_command_org','',true);perform set_config('approval.document_command_id','',true);
 return result;
end $$;

-- Retire name-based entry points; linked execution functions keep service access but lose public EXECUTE.
create or replace function approval.create_document(p_document jsonb,p_steps jsonb,p_lines jsonb,p_submit boolean) returns uuid language plpgsql security invoker set search_path='' as $$begin raise exception '사용자 확인 후 document_command로 기안을 작성해주세요.';end $$;
create or replace function approval.decide_document(p_document_id uuid,p_actor_label text,p_decision text,p_comment text default null) returns text language plpgsql security invoker set search_path='' as $$begin raise exception '사용자 확인 후 document_command로 결재해주세요.';end $$;
create or replace function approval.update_document(p_document_id uuid,p_actor_label text,p_changes jsonb) returns void language plpgsql security invoker set search_path='' as $$begin raise exception '사용자 확인 후 document_command로 수정해주세요.';end $$;
create or replace function approval.resubmit_document(p_document_id uuid,p_actor_label text,p_changes jsonb) returns text language plpgsql security invoker set search_path='' as $$begin raise exception '사용자 확인 후 document_command로 재상신해주세요.';end $$;
create or replace function approval.release_reservation(p_document_id uuid,p_actor_label text,p_action text,p_reason text) returns void language plpgsql security invoker set search_path='' as $$begin raise exception '사용자 확인 후 document_command로 회수·취소해주세요.';end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='approval' loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;
end $$;
grant execute on function approval.document_command(uuid,uuid,text,uuid,integer,jsonb,text),approval.document_write_guard(),approval.document_version_bump() to service_role;

-- Task visibility follows the same explicit UUID binding used by document_command.
create or replace function finance.finance_task_sources(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare member finance.reimbursement_members; staff boolean; t finance.workflow_transactions; fresh jsonb; amounts jsonb; ready jsonb:='[]';
begin
 member:=finance.workflow_actor(p_org,p_actor);
 staff:=member.permissions && array['ADMIN','APPROVE','PAY','CLOSE','SENIOR'];
 if staff then
  for t in select * from finance.workflow_transactions w where w.organization_id=p_org and w.route='TRUST_DIRECT'
    and not w.payment_review_required and not w.legacy_payment_complete
    and exists(select 1 from finance.workflow_contract_versions c where c.organization_id=p_org and c.id=w.contract_version_id and c.status='VERIFIED') loop
   begin fresh:=finance.workflow_source(p_org,t.source_kind,t.source_id);
   exception when sqlstate 'P0001' then continue; end;
   if fresh->>'signature' is distinct from t.source_signature or fresh->'can_pay' is distinct from 'true'::jsonb then continue; end if;
   amounts:=finance.workflow_transaction_amounts(p_org,t.id);
   if (amounts->>'requestable')::numeric>0 then
    ready:=ready||jsonb_build_array(jsonb_build_object('id','TRUST_READY:'||t.id::text,'kind','TRUST_READY','title',t.title,
      'detail','요청가능액 '||to_char((amounts->>'requestable')::numeric,'FM999,999,999,999,999,999')||'원 · 서류/제출조건 확인 · 원본 선택','href','/finance/trust'));
   end if;
  end loop;
 end if;
 return ready||coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'title',x.title,'detail',x.detail,'href',x.href) order by x.kind,x.id) from (
  select 'APPROVAL:'||s.id::text id,'MY_APPROVAL' kind,d.document_no||' · '||d.title title,'내 결재 순서 · 문서 확인' detail,'/approval/'||d.id::text href
  from approval.approval_steps s join approval.documents d on d.id=s.document_id
  join approval.document_authorization_bindings binding on binding.document_id=d.id and binding.organization_id=d.organization_id
  where d.organization_id=p_org and d.deleted_at is null and d.approval_status in('SUBMITTED','IN_REVIEW')
   and s.status='PENDING' and member.permissions&&array['ADMIN','APPROVE']
   and (select count(*) from approval.approval_steps pending where pending.document_id=d.id and pending.status='PENDING')=1
   and exists(select 1 from jsonb_array_elements(binding.steps) identity_step
     where identity_step->>'order'=s.step_order::text and identity_step->>'user_id'=p_actor::text
      and identity_step->'legacy_step'=jsonb_build_object('step_id',s.id,'approver_label',s.approver_label,'approver_role',s.approver_role))
   and not exists(select 1 from approval.approval_steps prior where prior.document_id=d.id and prior.step_order<s.step_order and prior.status not in('APPROVED','SKIPPED'))
  union all
  select 'OVERDUE:'||r.id,'SETTLEMENT_OVERDUE',r.resolution_no||' · '||coalesce(r.subject,''),'정산기한 '||r.settlement_due_date::text,'/finance/expenses?source_kind=RESOLUTION&source_id='||r.id
  from finance.expense_resolutions r where staff and r.organization_id=p_org and r.deleted_at is null
   and r.settlement_due_date<(now() at time zone 'Asia/Seoul')::date
   and r.approval_status='승인완료' and r.expense_timing='ADVANCE' and r.execution_method='EMPLOYEE_ADVANCE'
   and r.actual_paid_amount>0
   and r.payment_status in('부분지급','지급완료') and r.settlement_status is distinct from '정산완료'
   and not exists(select 1 from finance.expense_resolutions c where c.organization_id=p_org and c.original_resolution_id=r.id and c.deleted_at is null and c.expense_timing='SETTLEMENT' and c.approval_status='승인완료' and c.settlement_status='정산완료')
  union all
  select 'EVIDENCE:'||r.id,'EVIDENCE_REVIEW',r.resolution_no||' · '||coalesce(r.subject,''),'증빙 보완 필요','/finance/expenses?source_kind=RESOLUTION&source_id='||r.id
  from finance.expense_resolutions r where staff and r.organization_id=p_org and r.deleted_at is null
   and r.approval_status<>'반려' and r.evidence_status in('NONE','DEFICIENT')
  union all
  select 'BANK:'||b.id::text,'BANK_UNMATCHED','은행 거래 · '||(b.transacted_at at time zone 'Asia/Seoul')::date::text,
   case when b.deposit_amount>0 and b.withdrawal_amount=0 then '입금 연결 확인' when b.withdrawal_amount>0 and b.deposit_amount=0 then '출금 연결 확인' else '입출금 원본 확인 필요' end,
   '/finance/bank-transactions'
  from finance.bank_transactions b where staff and b.organization_id=p_org and finance.workflow_bank_available(p_org,b.id)
   and not exists(select 1 from finance.workflow_payments p where p.organization_id=p_org and p.bank_transaction_id=b.id)
 ) x),'[]'::jsonb);
end;
$$;
revoke all on function finance.finance_task_sources(uuid,uuid) from public,anon,authenticated;
grant execute on function finance.finance_task_sources(uuid,uuid) to service_role;
