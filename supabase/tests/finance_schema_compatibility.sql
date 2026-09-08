do $$
begin
 if exists(select 1 from finance.account_subjects where subject_type is not null or normal_balance is not null or source is not null)
 or exists(select 1 from finance.bank_transactions where transaction_kind is not null) then raise exception 'TEST: historical classification invented';end if;
 if (select sum(deposit_amount) from finance.bank_transactions)<>100 or (select sum(withdrawal_amount) from finance.bank_transactions)<>70 then raise exception 'TEST: historical amounts changed';end if;
 if (select count(*) from pg_constraint where connamespace='finance'::regnamespace and convalidated and contype in ('c','f'))<>8 then raise exception 'TEST: eight constraints not validated';end if;
 if (select count(*) from pg_indexes where schemaname='finance' and indexname in ('account_subjects_org_sort_idx','bank_transactions_match_status_idx'))<>2 then raise exception 'TEST: compatibility indexes missing';end if;
 if not exists(select 1 from pg_indexes where indexname='bank_transactions_account_date_idx' and indexdef not like '%WHERE%') then raise exception 'TEST: existing index replaced';end if;
 if not has_table_privilege('compat_reader','finance.bank_transactions','SELECT') or has_table_privilege('compat_reader','finance.bank_transactions','UPDATE') then raise exception 'TEST: table grants changed';end if;
 if not (select relrowsecurity from pg_class where oid='finance.bank_transactions'::regclass) then raise exception 'TEST: RLS changed';end if;
 if exists(select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='finance.account_subjects'::regclass and a.attname in ('subject_type','normal_balance','source')) then raise exception 'TEST: classification defaults invented';end if;
 begin update finance.account_subjects set subject_type='invalid';raise exception 'TEST: invalid subject allowed';exception when check_violation then null;end;
 begin update finance.bank_transactions set recommended_account_subject_id='00000000-0000-0000-0000-000000000099';raise exception 'TEST: orphan recommendation allowed';exception when foreign_key_violation then null;end;
 begin update finance.vouchers set detail_transaction_id='missing';raise exception 'TEST: orphan voucher allowed';exception when foreign_key_violation then null;end;
end $$;
