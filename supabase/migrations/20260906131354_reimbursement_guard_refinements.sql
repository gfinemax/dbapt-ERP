-- Closing a budget must not prevent evidence-only updates to existing records.
create or replace function finance.guard_reimbursement_sources() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_org uuid; v_month date; v_affects_budget boolean;
begin
 v_org:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 if tg_table_name='quick_expense_records' then
   if current_setting('finance.reimbursement_mutation',true)='on' then return new; end if;
   if tg_op='INSERT' and new.payment_method='PERSONAL_PREPAID' and exists(select 1 from finance.reimbursement_policies where organization_id=v_org) then raise exception '개인 선지출은 개인 지출 정산에서 신청해주세요.'; end if;
   if tg_op<>'INSERT' and exists(select 1 from finance.personal_reimbursements where source_quick_id=old.id) then raise exception '정산 신청에 연결된 원본은 수정할 수 없습니다.'; end if;
   v_affects_budget:=case when tg_op='INSERT' then new.record_status='RECORDED' when tg_op='DELETE' then old.record_status='RECORDED'
     else (old.record_status='RECORDED' or new.record_status='RECORDED') and
       row(old.organization_id,old.amount,old.budget_item,old.occurred_at,old.record_status) is distinct from row(new.organization_id,new.amount,new.budget_item,new.occurred_at,new.record_status) end;
   v_month:=date_trunc('month',(case when tg_op='DELETE' then old.occurred_at else new.occurred_at end) at time zone 'Asia/Seoul')::date;
   if v_affects_budget and (exists(select 1 from finance.reimbursement_periods where organization_id=v_org and month=v_month and status='CLOSED')
     or (tg_op='UPDATE' and exists(select 1 from finance.reimbursement_periods where organization_id=old.organization_id and month=date_trunc('month',old.occurred_at at time zone 'Asia/Seoul')::date and status='CLOSED'))) then raise exception '마감된 월의 예산 사용액은 승인된 조정으로 처리해주세요.'; end if;
 else
   if tg_op<>'INSERT' and exists(select 1 from finance.personal_reimbursements where bank_transaction_id=old.id) then raise exception '정산에 연결된 출금거래는 연결 취소 후 수정해주세요.'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;

create or replace function finance.guard_quick_expense_budget()
returns trigger language plpgsql security invoker set search_path='' as $$
declare b approval.budgets%rowtype; m date; used numeric;
begin
 if new.record_status<>'RECORDED' then return new; end if;
 m:=date_trunc('month',new.occurred_at at time zone 'Asia/Seoul')::date;
 select * into b from approval.budgets where organization_id=new.organization_id and budget_item=new.budget_item and fiscal_year=extract(year from m) for update;
 if not found or b.monthly_amount<=0 then raise exception '승인된 월 예산이 없어 정식 지출결의가 필요합니다.'; end if;
 select coalesce(sum(amount),0) into used from finance.quick_expense_records where organization_id=new.organization_id and budget_item=new.budget_item
   and date_trunc('month',occurred_at at time zone 'Asia/Seoul')::date=m and record_status='RECORDED' and id<>new.id;
 used:=used+coalesce((select sum(amount) from finance.personal_reimbursements where budget_id=b.id and budget_month=m and status in ('APPROVED','PAID')),0)
   +coalesce((select sum(amount-released_amount) from approval.budget_reservations where budget_id=b.id and status='ACTIVE' and date_trunc('month',created_at at time zone 'Asia/Seoul')::date=m),0);
 if used+new.amount>b.monthly_amount then raise exception '이번 달 승인예산 잔액을 초과해 정식 지출결의가 필요합니다.'; end if;
 return new;
end; $$;
revoke all on function finance.guard_reimbursement_sources() from public,anon,authenticated;
grant execute on function finance.guard_reimbursement_sources() to service_role;
