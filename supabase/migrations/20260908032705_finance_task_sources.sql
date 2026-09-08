create function finance.finance_task_sources(p_org uuid,p_actor uuid) returns jsonb
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
  where d.organization_id=p_org and d.deleted_at is null and d.approval_status in('SUBMITTED','IN_REVIEW')
   and s.approver_id=p_actor and s.status='PENDING'
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
