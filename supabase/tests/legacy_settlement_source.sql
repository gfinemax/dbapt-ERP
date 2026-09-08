begin;
do $$
declare org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
 origin text:=gen_random_uuid()::text; foreign_id text:=gen_random_uuid()::text; draft text:=gen_random_uuid()::text; legacy text:=gen_random_uuid()::text;
 tx uuid; bank uuid:=gen_random_uuid(); bank_tx uuid:=gen_random_uuid(); payment uuid:=gen_random_uuid(); data jsonb:='{"advancePaidAmount":600,"advancePaidAt":"2026-06-15"}';
begin
 insert into core.organizations(id,name,status) values(org,'Settlement local','active'),(other_org,'Other settlement','active');
 insert into auth.users(id) values(actor);
 insert into finance.reimbursement_members values(org,actor,'Admin',array['ADMIN'],true);
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,expense_timing,execution_method,total_payment_amount,actual_paid_amount,disbursed_at,resolution_data)
 values(origin,org,'ADVANCE','Admin','승인완료','지급완료','ADVANCE','EMPLOYEE_ADVANCE',1000,600,'2026-06-14 15:00:00+00','{}'),
 (foreign_id,other_org,'FOREIGN','Admin','승인완료','지급완료','ADVANCE','EMPLOYEE_ADVANCE',1000,600,'2026-06-15 00:00:00+09','{}');
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,expense_timing,original_resolution_id,total_payment_amount,resolution_data)
 values(draft,org,'SETTLE-DRAFT','Admin','작성중','지급전','SETTLEMENT',origin,400,'{}');
 if (select resolution_data from finance.expense_resolutions where id=draft)<>'{}'::jsonb then raise exception 'TEST: incomplete draft changed'; end if;
 begin update finance.expense_resolutions set approval_status='승인대기' where id=draft; raise exception 'TEST: missing actual allowed'; exception when others then if sqlerrm not like '%일치%' then raise; end if; end;
 update finance.expense_resolutions set resolution_data=data||'{"advancePaidAmount":1000}' where id=draft;
 begin update finance.expense_resolutions set approval_status='승인대기' where id=draft; raise exception 'TEST: approval total used'; exception when others then if sqlerrm not like '%일치%' then raise; end if; end;
 update finance.expense_resolutions set resolution_data=data,original_resolution_id=foreign_id where id=draft;
 begin update finance.expense_resolutions set approval_status='승인대기' where id=draft; raise exception 'TEST: foreign source'; exception when others then if sqlerrm not like '%같은 조직%' then raise; end if; end;
 update finance.expense_resolutions set original_resolution_id=origin where id=draft;
 update finance.expense_resolutions set resolution_data=data||'{"advancePaidAt":"2026-03-01"}' where id=draft;
 begin update finance.expense_resolutions set approval_status='승인대기' where id=draft; raise exception 'TEST: creation date used'; exception when others then if sqlerrm not like '%일치%' then raise; end if; end;
 update finance.expense_resolutions set resolution_data=data where id=draft;
 update finance.expense_resolutions set actual_paid_amount=null where id=origin;
 begin update finance.expense_resolutions set approval_status='승인대기' where id=draft; raise exception 'TEST: null actual allowed'; exception when others then if sqlerrm not like '%실제 지급액%' then raise; end if; end;
 update finance.expense_resolutions set actual_paid_amount=600,disbursed_at=null,resolution_data='{"paidAt":"2026-06-15"}' where id=origin;
 begin update finance.expense_resolutions set approval_status='승인대기' where id=draft; raise exception 'TEST: JSON date substituted'; exception when others then if sqlerrm not like '%실제 지급액%' then raise; end if; end;
 update finance.expense_resolutions set disbursed_at='2026-06-14 15:00:00+00',execution_method='VENDOR_DIRECT' where id=origin;
 begin update finance.expense_resolutions set approval_status='승인대기' where id=draft; raise exception 'TEST: vendor source'; exception when others then if sqlerrm not like '%담당자 선지급%' then raise; end if; end;
 update finance.expense_resolutions set execution_method='EMPLOYEE_ADVANCE' where id=origin;
 update finance.expense_resolutions set disbursed_at=now()+interval '2 days' where id=origin;
 begin update finance.expense_resolutions set approval_status='승인대기' where id=draft; raise exception 'TEST: future actual date'; exception when others then if sqlerrm not like '%실제 지급액%' then raise; end if; end;
 update finance.expense_resolutions set disbursed_at='2026-06-14 15:00:00+00' where id=origin;
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,expense_timing,original_resolution_id,total_payment_amount,resolution_data)
 values(gen_random_uuid()::text,org,'NEW-VALID','Admin','승인대기','지급전','SETTLEMENT',origin,100,data);
 update finance.expense_resolutions set approval_status='승인대기' where id=draft;
 if (select resolution_data from finance.expense_resolutions where id=draft)<>data then raise exception 'TEST: valid save changed input'; end if;
 -- Historical approved rows exist before this additive migration; unchanged edits remain possible.
 alter table finance.expense_resolutions disable trigger legacy_settlement_source_guard;
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,expense_timing,total_payment_amount,resolution_data)
 values(legacy,org,'HISTORICAL','Admin','승인완료','지급완료','SETTLEMENT',200,'{"advancePaidAmount":1000}');
 alter table finance.expense_resolutions enable trigger legacy_settlement_source_guard;
 update finance.expense_resolutions set subject='Historical note' where id=legacy;
 if (select resolution_data from finance.expense_resolutions where id=legacy)<>'{"advancePaidAmount":1000}'::jsonb then raise exception 'TEST: historical changed'; end if;
 update finance.expense_resolutions set approval_status='승인완료' where id=draft;
 tx:=(finance.workflow_command(org,actor,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',origin),'settlement-enroll')->>'id')::uuid;
 insert into finance.bank_accounts(id,organization_id,bank_name,account_no,account_name,account_type) values(bank,org,'Local','SETTLEMENT-TEST','Local account','운영계좌');
 insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,description,withdrawal_amount,deposit_amount) values(bank_tx,org,bank,'2026-06-15','Local advance',600,0);
 insert into finance.workflow_payments(id,organization_id,bank_transaction_id,method,flow,amount,paid_at,counterparty,reason,created_by) values(payment,org,bank_tx,'BANK','OUT',600,'2026-06-15','Staff','Local test',actor);
 insert into finance.workflow_allocations(organization_id,payment_id,transaction_id,purpose,amount,reason,created_by) values(org,payment,tx,'DISBURSEMENT',600,'Local test',actor);
 begin update finance.expense_resolutions set payment_status='지급대기' where id=draft; raise exception 'TEST: normalized payment double settlement'; exception when others then if sqlerrm not like '%통합 정산%' then raise; end if; end;
end;
$$;
rollback;
