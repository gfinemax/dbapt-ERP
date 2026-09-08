begin;
do $$
declare org uuid:=gen_random_uuid(); user_id uuid:=gen_random_uuid(); supplies_budget uuid:=gen_random_uuid(); detail_id uuid:=gen_random_uuid(); quick_id uuid:=gen_random_uuid(); resolution_id text:='detail-'||gen_random_uuid()::text;
begin
 insert into core.organizations(id,name,status) values(org,'Budget classification test','active');
 insert into auth.users(id) values(user_id);
 insert into finance.reimbursement_members values(org,user_id,'Budget admin',array['ADMIN'],true);
 insert into approval.budgets(id,organization_id,fiscal_year,budget_item,budget_code,plan_section,plan_item_label,approved_amount,executed_amount,monthly_amount)
 values(supplies_budget,org,2026,'일반운영비>사무용품비','OPERATING-SUPPLIES','운영비','사무용품비',2400000,0,200000);
 insert into finance.expense_detail_items(id,budget_id,code,group_name,name,status,quick_expense_eligible,sort_order)
 values(detail_id,supplies_budget,'GENERAL-SUPPLIES','일반운영비','사무용품비','CONFIRMED',true,1);
 insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,expense_detail_id,evidence_status,evidence_kind,evidence_review_status,approval_skip_reason,direct_expense_decision,direct_expense_reasons,record_status,recorded_by_label)
 values(quick_id,org,'MANUAL','CASH','2026-09-08',5000,'문구점','클리어파일','일반운영비>사무용품비',detail_id,'QUALIFIED','RECEIPT','READY','승인 예산 내 일상 지출','ALLOWED','{}','RECORDED','Budget admin');
 if (select budget_item from finance.quick_expense_records where id=quick_id)<>'일반운영비>사무용품비' then raise exception 'TEST: detail budget link was not preserved'; end if;
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data,subject,actual_expense_date,expense_detail_id)
 values(resolution_id,org,'TEST-'||resolution_id,'Budget admin','작성중','지급전',5000,'{"budgetItem":"일반운영비>사무용품비"}','클리어파일','2026-09-08',detail_id);
 if (select expense_detail_id from finance.expense_resolutions where id=resolution_id)<>detail_id then raise exception 'TEST: resolution detail link was not saved'; end if;
 begin
  update finance.quick_expense_records set budget_item='일반운영비>소모품비' where id=quick_id;
  raise exception 'TEST: mismatched detail and budget was accepted';
 exception when others then if sqlerrm not like '%일치하지 않습니다%' then raise; end if; end;
end $$;
rollback;
