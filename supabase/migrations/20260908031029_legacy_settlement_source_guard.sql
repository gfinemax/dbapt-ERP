-- Preserve historical settlements; validate new execution against typed payment facts.
create function finance.legacy_settlement_source_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare original finance.expense_resolutions; needs_check boolean;
begin
 if new.expense_timing is distinct from 'SETTLEMENT' or new.approval_status not in ('승인대기','승인완료') then return new; end if;
 needs_check:=tg_op='INSERT';
 if tg_op='UPDATE' then
  needs_check:=old.expense_timing is distinct from 'SETTLEMENT'
   or old.approval_status is distinct from new.approval_status
   or old.organization_id is distinct from new.organization_id
   or old.original_resolution_id is distinct from new.original_resolution_id
   or old.payment_status is distinct from new.payment_status
   or old.actual_paid_amount is distinct from new.actual_paid_amount
   or old.disbursed_at is distinct from new.disbursed_at
   or old.resolution_data->'advancePaidAmount' is distinct from new.resolution_data->'advancePaidAmount'
   or old.resolution_data->'advancePaidAt' is distinct from new.resolution_data->'advancePaidAt';
 end if;
 if not needs_check then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,739));
 select * into original from finance.expense_resolutions
  where organization_id=new.organization_id and id=new.original_resolution_id and deleted_at is null for update;
 if not found or original.id=new.id or original.expense_timing is distinct from 'ADVANCE'
  or original.execution_method is distinct from 'EMPLOYEE_ADVANCE' or original.payment_status<>'지급완료' then
  raise exception '같은 조직의 지급완료된 담당자 선지급 원결의를 확인해주세요.';
 end if;
 if original.actual_paid_amount is null or original.actual_paid_amount<=0 or original.actual_paid_amount<>trunc(original.actual_paid_amount)
  or original.actual_paid_amount>9007199254740991 or original.disbursed_at is null
  or original.disbursed_at>now() then
  raise exception '원결의의 실제 지급액·지급일 확인이 필요합니다. 승인금액이나 작성일로 대체할 수 없습니다.';
 end if;
 if jsonb_typeof(new.resolution_data->'advancePaidAmount') is distinct from 'number'
  or (new.resolution_data->>'advancePaidAmount')::numeric is distinct from original.actual_paid_amount
  or new.resolution_data->>'advancePaidAt' is distinct from to_char(original.disbursed_at at time zone 'Asia/Seoul','YYYY-MM-DD') then
  raise exception '선지급액·선지급일은 원결의의 확인된 실제 지급 내역과 일치해야 합니다.';
 end if;
 if exists(select 1 from finance.workflow_transactions t join finance.workflow_allocations a on a.organization_id=t.organization_id and a.transaction_id=t.id
  where t.organization_id=new.organization_id and t.source_kind='RESOLUTION' and t.source_id=original.id
   and not exists(select 1 from finance.workflow_allocation_reversals r where r.allocation_id=a.id)) then
  raise exception '통합 지급에 연결된 원본입니다. 이중 정산을 막기 위해 통합 정산에서 확인해주세요.';
 end if;
 return new;
end;
$$;
revoke all on function finance.legacy_settlement_source_guard() from public,anon,authenticated;
grant execute on function finance.legacy_settlement_source_guard() to service_role;
create trigger legacy_settlement_source_guard before insert or update on finance.expense_resolutions
 for each row execute function finance.legacy_settlement_source_guard();
