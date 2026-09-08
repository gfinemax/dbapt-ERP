-- Read-only payment workspace; commands remain the locked, audited workflow_command.
create function finance.payment_workspace(p_org uuid,p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members; t finance.workflow_transactions; c finance.workflow_contract_versions;
 fresh jsonb; amounts jsonb; eligible jsonb:='[]'; explanation text; available numeric;
begin
 m:=finance.workflow_actor(p_org,p_actor);
 if not(m.permissions && array['ADMIN','APPROVE','PAY','CLOSE','SENIOR']) then raise exception '지급 업무 조회 권한이 필요합니다.'; end if;
 for t in select * from finance.workflow_transactions where organization_id=p_org loop
  explanation:=''; available:=0;
  amounts:=finance.workflow_transaction_amounts(p_org,t.id);
  if t.payment_review_required then explanation:='과거 지급 근거 확인 필요';
  elsif t.legacy_payment_complete then explanation:='기존 지급완료';
  elsif (amounts->>'remaining')::numeric=0 then explanation:='지급완료 또는 과지급 회수 확인';
  else
   begin fresh:=finance.workflow_source(p_org,t.source_kind,t.source_id);
   exception when others then fresh:=null; explanation:='원본 조회·보존 상태 확인 필요'; end;
   if explanation='' then
    if fresh->>'signature' is distinct from t.source_signature then explanation:='원본 변경 재확인 필요';
    elsif fresh->'can_pay' is distinct from 'true'::jsonb then explanation:='내부 승인·지급 대상 확인 필요';
    else
     select * into c from finance.workflow_contract_versions where organization_id=p_org and id=t.contract_version_id and status='VERIFIED';
     if not found or t.route='UNKNOWN' then explanation:='계약·집행 경로 설정 필요';
     elsif t.route='TRUST_DIRECT' then
      select coalesce(sum(greatest(0,i.approved_amount-finance.trust_item_paid(p_org,i.id))),0) into available
       from finance.workflow_trust_items i join finance.workflow_trust_requests q on q.id=i.request_id
       where i.organization_id=p_org and i.transaction_id=t.id and i.status in('APPROVED','PARTIAL') and not i.needs_review
        and i.source_revision=t.revision and q.contract_version_id=t.contract_version_id and q.status not in('DRAFT','WITHDRAWN','REJECTED');
      available:=least(available,(amounts->>'remaining')::numeric);
      if available=0 then explanation:='유효한 신탁 승인 필요'; end if;
     elsif c.conditions->>'operating_allowed' is distinct from 'true' or coalesce(c.conditions->>'operating_basis','')='' then explanation:='운영계좌 집행 근거 설정 필요';
     else available:=least((amounts->>'remaining')::numeric,(amounts->>'requestable')::numeric);
      if available=0 then explanation:='다른 신탁 요청·승인에 예약 중'; end if;
     end if;
    end if;
   end if;
  end if;
  eligible:=eligible||jsonb_build_array(jsonb_build_object('transaction_id',t.id,'available',available,'reason',explanation));
 end loop;
 return finance.workflow_read(p_org,p_actor)||jsonb_build_object('eligibility',eligible,
 'banks',coalesce((select jsonb_agg(x order by x.transacted_at desc) from (
  select b.id,b.transacted_at,b.description,b.counterparty,b.withdrawal_amount,b.deposit_amount,
   a.bank_name||' · '||a.account_name||' · ***'||right(a.account_no,4) as account_label
  from finance.bank_transactions b join finance.bank_accounts a on a.id=b.bank_account_id
  where b.organization_id=p_org and a.organization_id=p_org and b.deleted_at is null and a.deleted_at is null
   and b.transacted_at<=now() and (b.withdrawal_amount>0)<>(b.deposit_amount>0)
   and finance.workflow_bank_available(p_org,b.id)
   and not exists(select 1 from finance.workflow_payments p where p.bank_transaction_id=b.id)
  order by b.transacted_at desc limit 200) x),'[]'),
 'transfers',coalesce((select jsonb_agg(jsonb_build_object('id',tr.id,'amount',b.withdrawal_amount,'paid_at',b.transacted_at,'reason',tr.reason,'created_at',tr.created_at) order by tr.created_at desc)
  from finance.workflow_transfers tr join finance.bank_transactions b on b.id=tr.withdrawal_id where tr.organization_id=p_org),'[]'),
 'reversals',coalesce((select jsonb_agg(jsonb_build_object('allocation_id',r.allocation_id,'reason',r.reason,'created_at',r.created_at)) from finance.workflow_allocation_reversals r where r.organization_id=p_org),'[]'));
end $$;
revoke all on function finance.payment_workspace(uuid,uuid) from public,anon,authenticated;
grant execute on function finance.payment_workspace(uuid,uuid) to service_role;
