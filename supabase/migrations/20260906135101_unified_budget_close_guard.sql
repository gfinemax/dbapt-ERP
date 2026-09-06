-- Do not close a month while unresolved workflow states would be frozen by source guards.
create function finance.budget_guard_first_close() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.status<>'CLOSED' and new.status='CLOSED' and exists(select 1 from finance.budget_effective_entries(new.organization_id)e where e.month=new.month and e.state='PENDING') then
   raise exception '해당 월의 심사·거래 확인 중인 지출을 먼저 처리해주세요.';
 end if;
 return new;
end;$$;
create trigger unified_budget_first_close before update on finance.reimbursement_periods for each row execute function finance.budget_guard_first_close();
revoke all on function finance.budget_guard_first_close() from public,anon,authenticated;
grant execute on function finance.budget_guard_first_close() to service_role;
