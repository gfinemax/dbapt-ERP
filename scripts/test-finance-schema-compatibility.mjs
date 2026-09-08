// Synthetic, owned PostgreSQL only. Never reads environment files or remote credentials.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const name = `dbapt-compat-test-${randomUUID().slice(0, 8)}`;
const label = 'dbapt-erp.test=schema-compatibility';
const migration = await readFile(new URL('../supabase/migrations/20260908053346_finance_operational_schema_compatibility.sql', import.meta.url), 'utf8');
const tests = await readFile(new URL('../supabase/tests/finance_schema_compatibility.sql', import.meta.url), 'utf8');
function run(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject); child.stdin.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr })); child.stdin.end(input);
  });
}
async function checked(args, input) { const r = await run(args, input); assert.equal(r.code, 0, r.stderr); return r.stdout; }
const query = input => run(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input);
async function sql(input) { const r = await query(input); assert.equal(r.code, 0, r.stderr); return r.stdout; }
const fixture = `create schema finance; create role compat_reader;
create table finance.account_subjects(id uuid primary key,organization_id uuid,code text,is_active boolean default true);
create table finance.bank_transactions(id uuid primary key,bank_account_id uuid,transacted_at timestamptz,deposit_amount numeric,withdrawal_amount numeric,deleted_at timestamptz);
create table finance.expense_resolutions(id text primary key,voucher_status text);
create table finance.expense_detail_transactions(id text primary key);
create table finance.vouchers(id uuid primary key,detail_transaction_id text);
create index bank_transactions_account_date_idx on finance.bank_transactions(bank_account_id,transacted_at desc);
alter table finance.bank_transactions enable row level security;grant select on finance.bank_transactions to compat_reader;
insert into finance.account_subjects values('00000000-0000-0000-0000-000000000001',null,'UNKNOWN',true);
insert into finance.bank_transactions values(gen_random_uuid(),null,'2026-03-01',100,0,null),(gen_random_uuid(),null,'2026-03-02',0,70,null),(gen_random_uuid(),null,'2026-03-03',0,0,null);
insert into finance.expense_resolutions values('preserved',null);
insert into finance.expense_detail_transactions values('detail');
insert into finance.vouchers values(gen_random_uuid(),'detail');`;
let created = false;
try {
  await checked(['run', '--detach', '--name', name, '--label', label, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16']); created = true;
  let ready = false;
  for (let i = 0; i < 60; i++) { if ((await run(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'])).code === 0) { ready = true; break; } await new Promise(r => setTimeout(r, 250)); }
  assert(ready);await sql(fixture);
  const snapshotQuery = `select md5(jsonb_build_object('accounts',(select jsonb_agg(to_jsonb(t)-array['subject_type','normal_balance','business_category','source','aliases','description','sort_order']) from finance.account_subjects t),'banks',(select jsonb_agg(to_jsonb(t)-array['transaction_kind','branch_name','uploaded_major_category','uploaded_account_title','recommended_account_subject_id','recommended_account_subject_name','match_status','raw_payload']) from finance.bank_transactions t),'vouchers',(select jsonb_agg(t) from finance.vouchers t),'expenses',(select jsonb_agg(t) from finance.expense_resolutions t))::text);`;
  const original = await sql(snapshotQuery);
  for (const [setup, error] of [
    ["alter table finance.account_subjects add subject_type integer;", 'column type mismatch'],
    ["alter table finance.expense_resolutions add constraint expense_resolutions_voucher_status_check check(true);", 'constraint mismatch'],
    ["update finance.expense_resolutions set voucher_status='invalid';", 'violated by some row'],
    ["update finance.vouchers set detail_transaction_id='orphan';", 'violates foreign key constraint'],
    ["alter table finance.vouchers add constraint vouchers_detail_transaction_id_fkey foreign key(detail_transaction_id) references finance.expense_detail_transactions(id) on delete cascade;", 'foreign key mismatch'],
    ["create index account_subjects_org_sort_idx on finance.account_subjects(code);", 'index mismatch'],
  ]) {
    const result = await query(`begin;${setup}${migration}commit;`);
    assert.notEqual(result.code, 0);assert(result.stderr.includes(error), result.stderr);
    assert.equal(await sql(snapshotQuery), original, 'failed prerequisite must roll back all data/DDL');
  }
  console.log('PASS: incompatible type/constraint/index, invalid status, and orphan FK fail atomically');
  await sql(migration);await sql(tests);
  const first = await sql(snapshotQuery);assert.equal(first, original, 'original row fields must remain identical');await sql(migration);await sql(tests);assert.equal(await sql(snapshotQuery), first);
  console.log('PASS: nullable historical classifications, amounts/grants/RLS/index preserved, valid constraints and identical retry');
  // Existing defaults are intentionally preserved, even when unlike new-column defaults.
  await sql("alter table finance.account_subjects alter subject_type set default '자산';");
  await sql(migration);
  assert((await sql("select pg_get_expr(adbin,adrelid) from pg_attrdef where adrelid='finance.account_subjects'::regclass and adnum=(select attnum from pg_attribute where attrelid='finance.account_subjects'::regclass and attname='subject_type');")).includes('자산'));
  console.log('PASS: existing custom defaults preserved');
} finally {
  if (created) { const actual = await checked(['inspect', '--format', '{{ index .Config.Labels "dbapt-erp.test" }}', name]);assert.equal(actual.trim(), 'schema-compatibility');await checked(['rm', '--force', name]); }
}
