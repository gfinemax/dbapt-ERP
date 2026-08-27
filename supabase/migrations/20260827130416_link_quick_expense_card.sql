create or replace function finance.link_quick_expense_card(p_record_id uuid,p_card_transaction_id uuid,p_record_status text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_record finance.quick_expense_records%rowtype; v_card finance.corporate_card_transactions%rowtype;
begin
  if p_record_status not in ('RECORDED','NEEDS_RESOLUTION') then raise exception '잘못된 연결 상태입니다.'; end if;
  select * into v_record from finance.quick_expense_records where id=p_record_id for update;
  select * into v_card from finance.corporate_card_transactions where id=p_card_transaction_id for update;
  if v_record.record_status<>'SOURCE_PENDING' then raise exception '카드내역 연결대기 기록이 아닙니다.'; end if;
  if v_card.linked_resolution_id is not null or v_card.resolution_status<>'UNRESOLVED' then raise exception '이미 처리된 카드 승인내역입니다.'; end if;
  if abs(v_record.amount-v_card.amount)>0.5 or abs(v_record.occurred_at::date-v_card.approved_at::date)>2 then raise exception '금액 또는 사용일이 일치하지 않습니다.'; end if;
  update finance.quick_expense_records set source_type='CORPORATE_CARD',corporate_card_transaction_id=v_card.id,occurred_at=v_card.approved_at,counterparty=v_card.merchant_name,evidence_status='ALTERNATIVE',record_status=p_record_status,updated_at=now() where id=v_record.id;
  update finance.corporate_card_transactions set resolution_status='APPROVED',updated_at=now() where id=v_card.id;
end; $$;
revoke all on function finance.link_quick_expense_card(uuid,uuid,text) from public,anon,authenticated;
grant execute on function finance.link_quick_expense_card(uuid,uuid,text) to service_role;
