-- Read-only inventory: no business values, credentials or schema changes are returned.
-- Missing candidate columns are inspected via to_jsonb so this runs before compatibility DDL.
with expected(table_name,column_name,data_type) as (values
 ('account_subjects','subject_type','text'),('account_subjects','normal_balance','text'),
 ('account_subjects','business_category','text'),('account_subjects','source','text'),
 ('account_subjects','aliases','text[]'),('account_subjects','description','text'),('account_subjects','sort_order','integer'),
 ('bank_transactions','transaction_kind','text'),('bank_transactions','branch_name','text'),
 ('bank_transactions','uploaded_major_category','text'),('bank_transactions','uploaded_account_title','text'),
 ('bank_transactions','recommended_account_subject_id','uuid'),('bank_transactions','recommended_account_subject_name','text'),
 ('bank_transactions','match_status','text'),('bank_transactions','raw_payload','jsonb')
), column_check as (
 select e.*,a.attname is not null present,format_type(a.atttypid,a.atttypmod) actual_type,
   a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) default_expression
 from expected e join pg_namespace n on n.nspname='finance'
 join pg_class t on t.relnamespace=n.oid and t.relname=e.table_name
 left join pg_attribute a on a.attrelid=t.oid and a.attname=e.column_name and a.attnum>0 and not a.attisdropped
 left join pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum
), invalid_rows as (
 select 'account_subjects.subject_type' rule,count(*) count from finance.account_subjects r
 where to_jsonb(r)->>'subject_type' is not null and to_jsonb(r)->>'subject_type' not in ('수입','지출','자산','부채','정산')
 union all select 'account_subjects.normal_balance',count(*) from finance.account_subjects r
 where to_jsonb(r)->>'normal_balance' is not null and to_jsonb(r)->>'normal_balance' not in ('차변','대변')
 union all select 'account_subjects.source',count(*) from finance.account_subjects r
 where to_jsonb(r)->>'source' is not null and to_jsonb(r)->>'source' not in ('운영비 예산안','수지분석표','직접등록')
 union all select 'bank_transactions.transaction_kind',count(*) from finance.bank_transactions r
 where to_jsonb(r)->>'transaction_kind' is not null and to_jsonb(r)->>'transaction_kind' not in ('입금','출금')
 union all select 'bank_transactions.match_status',count(*) from finance.bank_transactions r
 where to_jsonb(r)->>'match_status' is not null and to_jsonb(r)->>'match_status' not in ('업로드분류','자동추천','신규후보','미분류')
 union all select 'expense_resolutions.voucher_status',count(*) from finance.expense_resolutions r
 where r.voucher_status is not null and r.voucher_status not in ('전표초안','전표확정','전표취소')
 union all select 'bank_transactions.recommended_account_subject_id',count(*) from finance.bank_transactions r
 where to_jsonb(r)->>'recommended_account_subject_id' is not null
 and not exists(select 1 from finance.account_subjects a where a.id::text=to_jsonb(r)->>'recommended_account_subject_id')
 union all select 'vouchers.detail_transaction_id',count(*) from finance.vouchers r
 where r.detail_transaction_id is not null and not exists(select 1 from finance.expense_detail_transactions d where d.id=r.detail_transaction_id)
), originals as (
 select 'expense_resolutions' object,count(*) rows,coalesce(sum(total_payment_amount),0) amount,
 md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),'')) fingerprint from finance.expense_resolutions r
 union all select 'account_subjects',count(*),null,md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),'')) from finance.account_subjects r
 union all select 'bank_transactions',count(*),coalesce(sum(deposit_amount-withdrawal_amount),0),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),'')) from finance.bank_transactions r
 union all select 'vouchers',count(*),null,md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),'')) from finance.vouchers r
)
select jsonb_build_object(
 'observed_at',now(),'server_version',current_setting('server_version'),
 'latest_migration',(select max(version) from supabase_migrations.schema_migrations),
 'columns',(select jsonb_agg(to_jsonb(c) order by table_name,column_name) from column_check c),
 'invalid_rows',(select jsonb_agg(to_jsonb(i) order by rule) from invalid_rows i),
 'originals',(select jsonb_agg(to_jsonb(o) order by object) from originals o),
 'pending_classification',jsonb_build_object(
   'accounts',(select count(*) from finance.account_subjects r where to_jsonb(r)->>'subject_type' is null or to_jsonb(r)->>'normal_balance' is null or to_jsonb(r)->>'source' is null),
   'bank_direction',(select count(*) from finance.bank_transactions r where to_jsonb(r)->>'transaction_kind' is null)),
 'limits','A read-only point-in-time preflight, not a backup, restore test, migration approval or full integrity audit.'
) as compatibility_preflight;
