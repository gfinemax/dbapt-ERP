-- Explicit compatibility prerequisite for the 20260908 workflow deployment.
-- Run this exact file before the pending workflow migrations; its later regular
-- migration execution is idempotent. Do not backdate files or repair history.
-- No UPDATE, GRANT, RLS/default replacement, or existing index replacement.
do $compat$
declare s record; actual text; expected text; rel regclass;
begin
 -- A single DO statement keeps all DDL/validation atomic, including standalone use.
 perform pg_advisory_xact_lock(739, 53346);
 if to_regclass('finance.account_subjects') is null or to_regclass('finance.bank_transactions') is null
    or to_regclass('finance.expense_resolutions') is null or to_regclass('finance.vouchers') is null
    or to_regclass('finance.expense_detail_transactions') is null then
  raise exception 'Finance compatibility prerequisites are missing.';
 end if;
 for s in select * from (values
  ('account_subjects','subject_type','text',''),('account_subjects','normal_balance','text',''),
  ('account_subjects','business_category','text',$v$not null default '미분류'$v$),
  ('account_subjects','source','text',''),('account_subjects','aliases','text[]',$v$not null default array[]::text[]$v$),
  ('account_subjects','description','text',$v$not null default ''$v$),('account_subjects','sort_order','integer','not null default 0'),
  ('bank_transactions','transaction_kind','text',''),('bank_transactions','branch_name','text',''),
  ('bank_transactions','uploaded_major_category','text',''),('bank_transactions','uploaded_account_title','text',''),
  ('bank_transactions','recommended_account_subject_id','uuid',''),('bank_transactions','recommended_account_subject_name','text',''),
  ('bank_transactions','match_status','text',$v$not null default '미분류'$v$),('bank_transactions','raw_payload','jsonb',$v$not null default '{}'::jsonb$v$)
 ) v(tab,col,typ,opts) loop
  rel:=format('finance.%I',s.tab)::regclass;
  select format_type(atttypid,atttypmod) into actual from pg_attribute where attrelid=rel and attname=s.col and not attisdropped;
  if found then
   if actual<>s.typ then raise exception 'Finance compatibility column type mismatch: %.% expected %, got %',s.tab,s.col,s.typ,actual;end if;
  else execute format('alter table finance.%I add column %I %s %s',s.tab,s.col,s.typ,s.opts);end if;
 end loop;
 -- Canonical CHECK definitions are obtained from PostgreSQL itself. Same-name
 -- incompatible constraints are rejected, never silently accepted or replaced.
 create temporary table finance_compat_expected_checks (
  subject_type text,normal_balance text,source text,transaction_kind text,match_status text,voucher_status text,
  constraint account_subjects_subject_type_check check(subject_type in ('수입','지출','자산','부채','정산')),
  constraint account_subjects_normal_balance_check check(normal_balance in ('차변','대변')),
  constraint account_subjects_source_check check(source in ('운영비 예산안','수지분석표','직접등록')),
  constraint bank_transactions_transaction_kind_check check(transaction_kind in ('입금','출금')),
  constraint bank_transactions_match_status_check check(match_status in ('업로드분류','자동추천','신규후보','미분류')),
  constraint expense_resolutions_voucher_status_check check(voucher_status is null or voucher_status in ('전표초안','전표확정','전표취소'))
 ) on commit drop;
 for s in select conname,pg_get_constraintdef(oid) def from pg_constraint where conrelid='pg_temp.finance_compat_expected_checks'::regclass loop
  rel:=case when s.conname like 'account_subjects_%' then 'finance.account_subjects'::regclass when s.conname like 'bank_transactions_%' then 'finance.bank_transactions'::regclass else 'finance.expense_resolutions'::regclass end;
  select replace(pg_get_constraintdef(oid),' NOT VALID','') into actual from pg_constraint where conrelid=rel and conname=s.conname;
  if found then
   if actual<>s.def then raise exception 'Finance compatibility constraint mismatch: %',s.conname;end if;
  else execute format('alter table %s add constraint %I %s not valid',rel,s.conname,s.def);end if;
  execute format('alter table %s validate constraint %I',rel,s.conname);
 end loop;
 drop table pg_temp.finance_compat_expected_checks;
 for s in select * from (values
  ('bank_transactions','recommended_account_subject_id','account_subjects','id','bank_transactions_recommended_account_subject_id_fkey','a'),
  ('vouchers','detail_transaction_id','expense_detail_transactions','id','vouchers_detail_transaction_id_fkey','r')
 ) v(tab,col,target,targetcol,cname,delcode) loop
  rel:=format('finance.%I',s.tab)::regclass;
  if exists(select 1 from pg_constraint where conrelid=rel and conname=s.cname) then
   if not exists(select 1 from pg_constraint c where c.conrelid=rel and c.conname=s.cname and c.contype='f'
    and c.confrelid=format('finance.%I',s.target)::regclass and c.confdeltype::text=s.delcode and c.confupdtype='a'
    and not c.condeferrable and c.confmatchtype='s'
    and c.conkey=array[(select attnum from pg_attribute where attrelid=rel and attname=s.col)]::smallint[]
    and c.confkey=array[(select attnum from pg_attribute where attrelid=c.confrelid and attname=s.targetcol)]::smallint[])
   then raise exception 'Finance compatibility foreign key mismatch: %',s.cname;end if;
  else execute format('alter table %s add constraint %I foreign key (%I) references finance.%I(%I) on delete %s not valid',rel,s.cname,s.col,s.target,s.targetcol,case when s.delcode='r' then 'restrict' else 'no action' end);end if;
  execute format('alter table %s validate constraint %I',rel,s.cname);
 end loop;
 for s in select * from (values
  ('account_subjects','account_subjects_org_sort_idx',array['organization_id','sort_order','code'], '(is_active = true)', 'organization_id, sort_order, code','is_active = true'),
  ('bank_transactions','bank_transactions_match_status_idx',array['match_status','transacted_at'],'(deleted_at IS NULL)','match_status, transacted_at desc','deleted_at is null')
 ) v(tab,idx,cols,pred,keys,where_sql) loop
  rel:=format('finance.%I',s.tab)::regclass;
  if to_regclass(format('finance.%I',s.idx)) is null then execute format('create index %I on %s (%s) where %s',s.idx,rel,s.keys,s.where_sql);end if;
  if not exists(select 1 from pg_index i join pg_class ic on ic.oid=i.indexrelid join pg_am am on am.oid=ic.relam where i.indexrelid=format('finance.%I',s.idx)::regclass and i.indrelid=rel
   and i.indisvalid and i.indisready and not i.indisunique and i.indnkeyatts=array_length(s.cols,1) and i.indnatts=i.indnkeyatts
   and am.amname='btree' and pg_get_expr(i.indpred,i.indrelid)=s.pred
   and (select array_agg(a.attname::text order by k.ord) from unnest(i.indkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=rel and a.attnum=k.num)=s.cols
   and i.indoption::text=case when s.tab='account_subjects' then '0 0 0' else '0 3' end)
  then raise exception 'Finance compatibility index mismatch: %',s.idx;end if;
 end loop;
end $compat$;
