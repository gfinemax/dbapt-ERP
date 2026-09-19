begin;
do $$
declare org uuid:=gen_random_uuid(); office uuid:=gen_random_uuid(); travel uuid:=gen_random_uuid(); prior uuid:=gen_random_uuid();
 yr integer:=extract(year from now() at time zone 'Asia/Seoul'); march date; april date;
 resolution text:=gen_random_uuid()::text; data jsonb;
begin
 march:=make_date(yr,3,1); april:=make_date(yr,4,1);
 insert into core.organizations(id,name,status) values(org,'Unknown month review','active');
 insert into approval.budgets(id,organization_id,fiscal_year,budget_item,approved_amount,monthly_amount,executed_amount)
 values(office,org,yr,'Office',1200000,100000,90000),(travel,org,yr,'Travel',1200000,100000,0),(prior,org,yr-1,'Office',1200000,100000,5000);
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data,subject)
 values(resolution,org,'UNKNOWN-MONTH','Staff','승인완료','지급전',80000,'{"budgetItem":"Office"}','Unknown use month');
 select x into data from jsonb_array_elements(finance.reimbursement_budget_rows(org,march)) x where x->>'id'=office::text;
 if (data->>'unresolved_count')::integer<>2 or (data->>'unresolved_unknown_month_count')::integer<>2 then raise exception 'TEST: unknown sources disappeared or prior-year manual leaked: %',data; end if;
 if (data->>'annual_used_amount')::numeric<>0 or (data->>'resolution_amount')::numeric<>0 then raise exception 'TEST: unknown amount assigned to guessed month'; end if;
 select x into data from jsonb_array_elements(finance.reimbursement_budget_rows(org,march)) x where x->>'id'=travel::text;
 if (data->>'unresolved_count')::integer<>0 then raise exception 'TEST: identified Office sources blocked Travel'; end if;
 update finance.expense_resolutions set actual_expense_date=april+1 where id=resolution;
 select x into data from jsonb_array_elements(finance.reimbursement_budget_rows(org,march)) x where x->>'id'=office::text;
 if (data->>'unresolved_count')::integer<>1 then raise exception 'TEST: identified April source blocked March'; end if;
 select x into data from jsonb_array_elements(finance.reimbursement_budget_rows(org,april)) x where x->>'id'=office::text;
 if (data->>'unresolved_count')::integer<>2 or (data->>'unresolved_unknown_month_count')::integer<>1 then raise exception 'TEST: actual month attribution lost'; end if;
end $$;
rollback;
