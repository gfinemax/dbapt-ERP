-- Unified original-record read. Originals stay in their existing tables.
-- One JSON value avoids PostgREST's default row cap; no arbitrary recent-100 subset.
create function finance.expense_workspace(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare member finance.reimbursement_members; staff boolean; records jsonb;
begin
 member:=finance.workflow_actor(p_org,p_actor);
 staff:=member.permissions && array['ADMIN','APPROVE','PAY','CLOSE','SENIOR'];
 with originals as (
  select 'RESOLUTION'::text source_kind,r.id::text source_id,r.resolution_no::text number,coalesce(nullif(r.subject,''),r.resolution_no)::text title,r.total_payment_amount amount,
   r.created_at,r.actual_expense_date::text used_at,r.accounting_date::text accounting_date,null::text budget_month,r.approval_status::text approval_status,r.payment_status::text payment_status,
   r.author_label::text author_label,coalesce(r.resolution_data->>'paymentTarget',r.resolution_data->>'accountHolder')::text counterparty
  from finance.expense_resolutions r where staff and r.organization_id=p_org and r.deleted_at is null
  union all
  select 'QUICK',q.id::text,null,q.usage_description,q.amount,q.created_at,q.occurred_at::text,null,null,q.record_status,null,q.recorded_by_label,q.counterparty
  from finance.quick_expense_records q where staff and q.organization_id=p_org
  union all
  select 'PERSONAL',p.id::text,null,p.merchant||' · '||p.purpose,p.amount,p.submitted_at,p.used_on::text,null,p.budget_month::text,p.status,
   case when p.status='PAID' then '지급완료' else null end,m.display_name,p.merchant
  from finance.personal_reimbursements p left join finance.reimbursement_members m on m.organization_id=p.organization_id and m.user_id=p.applicant_id
  where p.organization_id=p_org and (staff or p.applicant_id=p_actor)
 )
 select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('transaction_id',t.id,'can_connect',t.id is null,
  'amounts',case when t.id is null then null else finance.workflow_transaction_amounts(p_org,t.id) end,
  'trust_items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'request_id',i.request_id,'request_no',r.request_no,'status',i.status,'requested_amount',i.requested_amount,'approved_amount',i.approved_amount,'paid_amount',finance.trust_item_paid(p_org,i.id),'needs_review',i.needs_review) order by r.created_at desc,i.id)
   from finance.workflow_trust_items i join finance.workflow_trust_requests r on r.id=i.request_id and r.organization_id=p_org where i.organization_id=p_org and i.transaction_id=t.id),'[]'),
  'vouchers',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'voucher_no',v.voucher_no,'status',v.approval_status,'source_kind',l.source_kind) order by v.voucher_date desc,v.id)
   from finance.vouchers v left join finance.workflow_voucher_links l on l.voucher_id=v.id and l.organization_id=p_org
   where v.organization_id=p_org and v.deleted_at is null and (
    (o.source_kind='RESOLUTION' and v.expense_resolution_id=o.source_id) or
    (l.source_kind='RECOGNITION' and l.source_id=t.id) or
    (l.source_kind='PAYMENT' and exists(select 1 from finance.workflow_allocations a where a.organization_id=p_org and a.payment_id=l.source_id and a.transaction_id=t.id)))),'[]')) order by o.created_at desc,o.source_kind,o.source_id),'[]') into records
 from originals o left join finance.workflow_transactions t on t.organization_id=p_org and t.source_kind=o.source_kind and t.source_id=o.source_id;
 return jsonb_build_object('records',records,'staff',staff);
end $$;
revoke all on function finance.expense_workspace(uuid,uuid) from public,anon,authenticated;
grant execute on function finance.expense_workspace(uuid,uuid) to service_role;
