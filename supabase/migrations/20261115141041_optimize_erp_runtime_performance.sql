-- Keep release cohorts and runtime transfer/long-task measurements without collecting business data.
alter table finance.performance_measurements
  add column if not exists deployment_sha text
  check (deployment_sha is null or deployment_sha ~ '^[0-9a-f]{7,40}$');

alter table finance.performance_measurements
  drop constraint if exists performance_measurements_metric_type_check,
  drop constraint if exists performance_measurements_metric_name_check,
  drop constraint if exists performance_measurements_unit_check;
alter table finance.performance_measurements
  add constraint performance_measurements_metric_type_check
    check (metric_type in ('WEB_VITAL','NAVIGATION','RUNTIME')),
  add constraint performance_measurements_metric_name_check
    check (metric_name in ('TTFB','FCP','LCP','CLS','INP','ROUTE_READY','NAVIGATION','LONG_TASK','NAV_TRANSFER','JS_TRANSFER')),
  add constraint performance_measurements_unit_check
    check (unit in ('ms','score','bytes'));

create index if not exists performance_measurements_org_deployment_time_idx
  on finance.performance_measurements(organization_id,deployment_sha,measured_at desc)
  where deployment_sha is not null;

-- This matches the top-N unresolved withdrawal lookup exactly and avoids reading/sorting
-- every transaction for the organization.
create index if not exists bank_transactions_org_withdrawal_date_idx
  on finance.bank_transactions(organization_id,transacted_at desc,id)
  where deleted_at is null and withdrawal_amount > 0;

-- Remove the per-bank-row workflow_bank_available() call from the dashboard source scan.
-- The direct anti-joins preserve the same eligibility checks while allowing set-based plans.
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
  from finance.bank_transactions b
  where staff and b.organization_id=p_org and b.deleted_at is null
   and exists(select 1 from finance.bank_accounts a where a.id=b.bank_account_id and a.organization_id=p_org and a.deleted_at is null)
   and not exists(select 1 from finance.expense_resolutions e where e.bank_transaction_id=b.id and e.deleted_at is null)
   and not exists(select 1 from finance.quick_expense_records q where q.bank_transaction_id=b.id)
   and not exists(select 1 from finance.personal_reimbursements r where r.bank_transaction_id=b.id)
   and not exists(select 1 from finance.workflow_transfers wt where wt.withdrawal_id=b.id or wt.deposit_id=b.id)
   and not exists(select 1 from finance.workflow_payments p where p.organization_id=p_org and p.bank_transaction_id=b.id)
 ) x),'[]'::jsonb);
end;
$$;

-- Aggregate external recognitions once per assessment instead of running the same
-- correlated sum twice for every assessment row.
create or replace function finance.collection_ledger_read(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare base jsonb; assessments jsonb; recognitions jsonb;
begin
  base:=finance.collection_ledger_read_legacy(p_org,p_actor);
  with recognition_totals as (
    select x.assessment_id,sum(x.recognized_amount) as recognized_amount
    from finance.collection_external_recognitions x
    where x.organization_id=p_org and x.status='ACTIVE'
    group by x.assessment_id
  )
  select coalesce(jsonb_agg(a.item||jsonb_build_object(
    'cash_allocated_amount',coalesce((a.item->>'allocated_amount')::numeric,0),
    'external_recognized_amount',coalesce(t.recognized_amount,0),
    'satisfied_amount',coalesce((a.item->>'allocated_amount')::numeric,0)+coalesce(t.recognized_amount,0)
  )),'[]'::jsonb)
  into assessments
  from jsonb_array_elements(base->'assessments') a(item)
  left join recognition_totals t on t.assessment_id=(a.item->>'id')::uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'assessment_id',x.assessment_id,'source_recognition_id',x.source_recognition_id,
    'source_root_recognition_id',x.source_root_recognition_id,
    'source_current_recognition_id',x.source_current_recognition_id,
    'source_assessment_id',x.source_assessment_id,'external_member_id',x.external_member_id,
    'member_name_snapshot',x.source_payload->>'member_name_snapshot',
    'recognized_on',x.recognized_on,'recognized_amount',x.recognized_amount,
    'claimed_amount',x.source_payload->>'claimed_amount',
    'recognition_type',x.recognition_type,'reason',x.reason,'status',x.status,
    'source_kind',x.source_kind,'accounting_treatment',x.accounting_treatment,
    'actual_fund_amount',x.actual_fund_amount,'loss_amount',x.loss_amount,
    'linkage_status',x.linkage_status,'linkage_issue_detail',x.linkage_issue_detail,
    'governance_status',x.source_payload#>>'{recognition,governance_status}',
    'sync_reason',x.source_payload->>'sync_reason','source_version',x.source_version,
    'source_updated_at',x.source_updated_at,'source_payload',x.source_payload
  ) order by x.source_updated_at desc,x.id),'[]'::jsonb)
  into recognitions
  from finance.collection_external_recognitions x where x.organization_id=p_org;
  return base||jsonb_build_object('assessments',assessments,'external_recognitions',recognitions);
end;
$$;

revoke all on function finance.finance_task_sources(uuid,uuid),finance.collection_ledger_read(uuid,uuid)
  from public,anon,authenticated;
grant execute on function finance.finance_task_sources(uuid,uuid),finance.collection_ledger_read(uuid,uuid)
  to service_role;

notify pgrst,'reload schema';
