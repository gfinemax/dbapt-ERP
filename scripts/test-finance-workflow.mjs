// Isolated integration runner. No .env files, remote URLs, or operational credentials are read.
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = `dbapt-erp-finance-test-${randomUUID().slice(0, 8)}`;
const label = 'dbapt-erp.test=finance-workflow';
function run(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.on('error', reject);
    child.stdin.end(input);
  });
}
async function checked(args, input) {
  const result = await run(args, input);
  if (result.code !== 0) throw new Error(`${args.slice(0, 3).join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}
const sql = (query) => checked(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], query);
const bootstrap = `
create role anon nologin; create role authenticated nologin; create role authenticator nologin;
create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb,raw_app_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,owner uuid,created_at timestamptz default now(),unique(bucket_id,name));
create schema extensions; create extension pgcrypto with schema extensions;
alter database postgres set search_path=public,extensions;
`;
let created = false;
try {
  await checked(['run', '--detach', '--name', name, '--label', label, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--publish', '127.0.0.1::5432', 'postgres:16']);
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    // The image briefly starts a socket-only bootstrap server; wait for final TCP readiness.
    if ((await run(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'])).code === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, 'isolated database startup');
  await sql(bootstrap);
  await sql(await readFile(path.join(root, 'supabase/schema.sql'), 'utf8'));
  for (const file of (await readdir(path.join(root, 'supabase/migrations'))).filter(f => f.endsWith('.sql')).sort()) {
    const query = await readFile(path.join(root, 'supabase/migrations', file), 'utf8');
    if (query.trim()) await sql(query);
  }
  console.log('PASS: clean schema and migrations in isolated PostgreSQL');
  for (const file of ['personal_reimbursement.sql', 'unified_monthly_budget.sql', 'unified_budget_partial_reservation.sql', 'fund_workflow.sql']) {
    const query = await readFile(path.join(root, 'supabase/tests', file), 'utf8');
    // Earlier suites are DO blocks intended for an external rollback wrapper.
    await sql(/^begin;/m.test(query) ? query : `begin;\n${query}\nrollback;`);
    console.log(`PASS: ${file}`);
  }

  const org = randomUUID(), actor = randomUUID(), acct = randomUUID(), bank = randomUUID(), contract = randomUUID(), source = randomUUID();
  const fixture = await sql(`
insert into core.organizations(id,name,status) values('${org}','Concurrent test','active');
insert into auth.users(id) values('${actor}');
insert into finance.reimbursement_members values('${org}','${actor}','Test admin',array['ADMIN'],true);
insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status) values('${acct}','${org}','Test','Test','CONCURRENT','운영계좌','사용');
insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,description,withdrawal_amount,deposit_amount) values('${bank}','${org}','${acct}',now(),'Test withdrawal',1000,0);
insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data) values('${source}','${org}','CONCURRENT','Test','승인완료','지급대기',100,'{}');
select finance.workflow_command('${org}','${actor}','ENROLL','{"source_kind":"RESOLUTION","source_id":"${source}"}','fixture-enroll');
select finance.workflow_command('${org}','${actor}','PAYMENT_RECORD','{"method":"BANK","bank_transaction_id":"${bank}","reason":"Test bank"}','fixture-pay');
insert into finance.workflow_contract_versions(id,organization_id,contract_key,version,name,trustee,reference,management_account_id,status,conditions,created_by)
values('${contract}','${org}','${contract}',1,'Test','Test','Test clause','${acct}','VERIFIED','{"operating_allowed":true,"operating_basis":"Test clause","operating_account_ids":["${acct}"]}','${actor}');
update finance.workflow_transactions set route='OPERATING',contract_version_id='${contract}' where organization_id='${org}';
select jsonb_build_object('tx',(select id from finance.workflow_transactions where organization_id='${org}'),'pay',(select id from finance.workflow_payments where organization_id='${org}'));
`);
  const ids = JSON.parse(fixture.trim().split('\n').at(-1));
  const allocation = JSON.stringify({ payment_id: ids.pay, reason: 'Concurrency test', items: [{ transaction_id: ids.tx, purpose: 'DISBURSEMENT', amount: 60 }] });
  const commands = [1, 2].map(i => `begin; set role service_role; select finance.workflow_command('${org}','${actor}','PAYMENT_ALLOCATE','${allocation}','race-${i}'); select pg_sleep(0.5); commit;`);
  const races = await Promise.all(commands.map(query => run(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], query)));
  assert.equal(races.filter(r => r.code === 0).length, 1, `one concurrent allocation must succeed: ${JSON.stringify(races)}`);
  assert(races.find(r => r.code !== 0)?.stderr.includes('미지급액을 초과'), 'other allocation fails due to refreshed balance');
  assert.equal((await sql(`select sum(amount) from finance.workflow_allocations where transaction_id='${ids.tx}';`)).trim(), '60');
  console.log('PASS: concurrent database sessions serialize over-allocation (60 of 100)');

  const duplicate = `set role service_role; select finance.workflow_command('${org}','${actor}','PAYMENT_ALLOCATE','${allocation}','race-duplicate');`;
  // First reverse the winning allocation; retain the bank fact and audit.
  await sql(`select finance.workflow_command('${org}','${actor}','ALLOCATION_REVERSE',jsonb_build_object('id',(select id from finance.workflow_allocations where transaction_id='${ids.tx}'),'reason','Test correction'),'reverse-race');`);
  const duplicates = await Promise.all([run(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], duplicate), run(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], duplicate)]);
  assert(duplicates.every(r => r.code === 0), JSON.stringify(duplicates));
  assert.equal((await sql(`select count(*) from finance.workflow_operations where organization_id='${org}' and operation_key='race-duplicate';`)).trim(), '1');
  assert.equal((await sql(`select count(*) from finance.workflow_allocations where transaction_id='${ids.tx}';`)).trim(), '2');
  console.log('PASS: concurrent identical operation persisted once and reloaded');
  const denied = await run(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], `set role authenticated; select * from finance.workflow_payments;`);
  assert.notEqual(denied.code, 0, 'authenticated direct privileged table read must fail');
  console.log('PASS: database role access denied');
} finally {
  if (created) {
    const actualLabel = await checked(['inspect', '--format', '{{index .Config.Labels "dbapt-erp.test"}}', name]);
    assert.equal(actualLabel.trim(), 'finance-workflow', 'only this runner owned container can be removed');
    await checked(['rm', '--force', '--volumes', name]);
  }
}
