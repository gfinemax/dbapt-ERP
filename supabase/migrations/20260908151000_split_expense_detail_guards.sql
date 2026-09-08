drop trigger if exists expense_detail_link_guard on finance.quick_expense_records;
drop trigger if exists expense_detail_link_guard on finance.expense_resolutions;
drop function if exists finance.guard_expense_detail_link();

create function finance.guard_quick_expense_detail_link() returns trigger language plpgsql security invoker set search_path='' as $$
declare detail finance.expense_detail_items%rowtype; budget approval.budgets%rowtype; expense_year integer;
begin
 if new.expense_detail_id is null then return new; end if;
 select * into detail from finance.expense_detail_items where id=new.expense_detail_id and is_active;
 if not found then raise exception '활성 지출 세부항목을 찾을 수 없습니다.'; end if;
 select * into budget from approval.budgets where id=detail.budget_id;
 expense_year:=extract(year from new.occurred_at at time zone 'Asia/Seoul')::integer;
 if budget.organization_id<>new.organization_id or budget.fiscal_year<>expense_year then raise exception '지출 세부항목의 조직·연도가 지출과 일치하지 않습니다.'; end if;
 if new.budget_item<>budget.budget_item then raise exception '지출 세부항목과 승인 예산항목이 일치하지 않습니다.'; end if;
 if (detail.status<>'CONFIRMED' or not detail.quick_expense_eligible) and new.record_status not in ('SOURCE_PENDING','CONVERTED') then new.record_status:='NEEDS_RESOLUTION'; end if;
 return new;
end $$;

create function finance.guard_resolution_expense_detail_link() returns trigger language plpgsql security invoker set search_path='' as $$
declare detail finance.expense_detail_items%rowtype; budget approval.budgets%rowtype; expense_year integer; linked_budget_item text;
begin
 if new.expense_detail_id is null then return new; end if;
 select * into detail from finance.expense_detail_items where id=new.expense_detail_id and is_active;
 if not found then raise exception '활성 지출 세부항목을 찾을 수 없습니다.'; end if;
 select * into budget from approval.budgets where id=detail.budget_id;
 expense_year:=extract(year from coalesce(new.actual_expense_date,current_date))::integer;
 linked_budget_item:=coalesce(new.resolution_data->>'budgetItem','');
 if budget.organization_id<>new.organization_id or budget.fiscal_year<>expense_year then raise exception '지출 세부항목의 조직·연도가 지출과 일치하지 않습니다.'; end if;
 if linked_budget_item<>budget.budget_item then raise exception '지출 세부항목과 승인 예산항목이 일치하지 않습니다.'; end if;
 return new;
end $$;

create trigger expense_detail_link_guard before insert or update of expense_detail_id,budget_item,occurred_at,record_status on finance.quick_expense_records for each row execute function finance.guard_quick_expense_detail_link();
create trigger expense_detail_link_guard before insert or update of expense_detail_id,actual_expense_date,resolution_data on finance.expense_resolutions for each row execute function finance.guard_resolution_expense_detail_link();
revoke all on function finance.guard_quick_expense_detail_link() from public,anon,authenticated;
revoke all on function finance.guard_resolution_expense_detail_link() from public,anon,authenticated;
grant execute on function finance.guard_quick_expense_detail_link() to service_role;
grant execute on function finance.guard_resolution_expense_detail_link() to service_role;
