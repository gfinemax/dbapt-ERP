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
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
create policy isolated_legacy_open on storage.objects for all to authenticated using(true) with check(true);
create schema extensions; create extension pgcrypto with schema extensions;
alter database postgres set search_path=public,extensions;
`;
let created = false;
// Freeze inputs for a run; edits made while PostgreSQL starts belong to the next run.
const schemaQuery = await readFile(path.join(root, 'supabase/schema.sql'), 'utf8');
const migrationQueries = await Promise.all((await readdir(path.join(root, 'supabase/migrations'))).filter(f => f.endsWith('.sql')).sort()
  .map(file => readFile(path.join(root, 'supabase/migrations', file), 'utf8')));
const testFiles = ['personal_reimbursement.sql', 'unified_monthly_budget.sql', 'unified_budget_partial_reservation.sql', 'fund_workflow.sql', 'trust_request_versions.sql', 'payment_workspace.sql', 'accounting_drafts.sql', 'legacy_settlement_source.sql', 'expense_workspace.sql', 'finance_task_sources.sql', 'advance_settlement_drafts.sql'];
const testQueries = await Promise.all(testFiles.map(async file => ({ file, query: await readFile(path.join(root, 'supabase/tests', file), 'utf8') })));
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
  await sql(schemaQuery);
  for (const query of migrationQueries) {
    if (query.trim()) await sql(query);
  }
  console.log('PASS: clean schema and migrations in isolated PostgreSQL');
  for (const { file, query } of testQueries) {
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

  const trustSource = randomUUID(), trustContract = randomUUID();
  const trustFixture = await sql(`
insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data) values('${trustSource}','${org}','CONCURRENT-TRUST','Test','승인완료','지급대기',1000,'{}');
insert into finance.workflow_contract_versions(id,organization_id,contract_key,version,name,trustee,reference,management_account_id,status,conditions,created_by)
values('${trustContract}','${org}','${trustContract}',1,'Test trust','Trustee','Verified test terms','${acct}','VERIFIED','{"allowed_source_kinds":["RESOLUTION"],"required_document_types":[],"consent_roles":[],"no_limit":true,"operating_allowed":false,"operating_advance_allowed":false}','${actor}');
select finance.workflow_command('${org}','${actor}','ENROLL','{"source_kind":"RESOLUTION","source_id":"${trustSource}"}','trust-enroll');
select finance.trust_command('${org}','${actor}','ROUTE_ASSIGN',jsonb_build_object('id',(select id from finance.workflow_transactions where source_id='${trustSource}'),'revision',1,'route','TRUST_DIRECT','contract_version_id','${trustContract}','reason','Test contract'),'trust-route');
select finance.trust_command('${org}','${actor}','REQUEST_SAVE',jsonb_build_object('title','Concurrent 1','request_date',current_date,'contract_version_id','${trustContract}','items',jsonb_build_array(jsonb_build_object('transaction_id',(select id from finance.workflow_transactions where source_id='${trustSource}'),'requested_amount',600))),'trust-draft1');
select finance.trust_command('${org}','${actor}','REQUEST_SAVE',jsonb_build_object('title','Concurrent 2','request_date',current_date,'contract_version_id','${trustContract}','items',jsonb_build_array(jsonb_build_object('transaction_id',(select id from finance.workflow_transactions where source_id='${trustSource}'),'requested_amount',600))),'trust-draft2');
select jsonb_agg(jsonb_build_object('id',q.id,'item',i.id)) from finance.workflow_trust_requests q join finance.workflow_trust_items i on i.request_id=q.id where q.organization_id='${org}';
`);
  const trustRows = JSON.parse(trustFixture.trim().split('\n').at(-1));
  const trustInputs = trustRows.map(row => JSON.stringify({ id: row.id, lock_version: 1, receipt_reference: 'Test receipt', items: [{ id: row.item }], file_ids: [] }));
  const trustCommands = trustInputs.map((input, index) => `begin; set role service_role; select finance.trust_command('${org}','${actor}','REQUEST_SUBMIT','${input}','trust-race-${index}'); select pg_sleep(0.5); commit;`);
  const trustRaces = await Promise.all(trustCommands.map(query => run(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], query)));
  assert.equal(trustRaces.filter(result => result.code === 0).length, 1, JSON.stringify(trustRaces));
  assert(trustRaces.find(result => result.code !== 0)?.stderr.includes('요청 가능액을 초과'), 'second request must see the first committed reservation');
  const winningIndex = trustRaces.findIndex(result => result.code === 0);
  await sql(trustCommands[winningIndex]);
  assert.equal((await sql(`select count(*) from finance.workflow_submissions where organization_id='${org}';`)).trim(), '1');
  console.log('PASS: concurrent trust requests cannot reserve 1200 against 1000; same-key retry retains one submission');
  const accountingSignature = (await sql(`select finance.accounting_source('${org}','RECOGNITION','${ids.tx}')->>'signature';`)).trim();
  const accountingInput = JSON.stringify({ source_kind: 'RECOGNITION', source_id: ids.tx, source_signature: accountingSignature, voucher_date: '2026-09-08', memo: 'Concurrent draft', lines: [] });
  const accountingCommands = [1, 2].map(i => `begin; set role service_role; select finance.accounting_command('${org}','${actor}','DRAFT_CREATE','${accountingInput}','accounting-race-${i}'); select pg_sleep(0.5); commit;`);
  const accountingRaces = await Promise.all(accountingCommands.map(query => run(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], query)));
  assert.equal(accountingRaces.filter(result => result.code === 0).length, 1, JSON.stringify(accountingRaces));
  assert(accountingRaces.find(result => result.code !== 0)?.stderr.includes('이미 연결된 전표'), 'second accounting editor must see the committed source link');
  await sql(accountingCommands[accountingRaces.findIndex(result => result.code === 0)]);
  assert.equal((await sql(`select count(*) from finance.workflow_voucher_links where organization_id='${org}' and source_id='${ids.tx}';`)).trim(), '1');
  console.log('PASS: concurrent accounting draft creation produces one source voucher; same-key retry preserves it');
  const advanceUse = randomUUID();
  await sql(`insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,approval_skip_reason,direct_expense_decision,record_status,recorded_by_label) values('${advanceUse}','${org}','MANUAL','CASH','2026-03-15',50,'Shop','Concurrent use','Test','Reviewed','REQUIRED','NEEDS_RESOLUTION','Test');`);
  const advanceInputs = [];
  for (const index of [1, 2]) {
    const resolution = randomUUID(), bank = randomUUID(), payment = randomUUID(), allocationId = randomUUID();
    const prepared = await sql(`
insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,expense_timing,execution_method,resolution_data) values('${resolution}','${org}','ADV-RACE-${index}','Test','승인완료','지급대기',100,'ADVANCE','EMPLOYEE_ADVANCE','{}');
select finance.workflow_command('${org}','${actor}','ENROLL','{"source_kind":"RESOLUTION","source_id":"${resolution}"}','advance-enroll-race-${index}');
insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,description,withdrawal_amount,deposit_amount) values('${bank}','${org}','${acct}','2026-03-01','Advance race',100,0);
insert into finance.workflow_payments(id,organization_id,bank_transaction_id,method,flow,amount,paid_at,counterparty,reason,created_by) values('${payment}','${org}','${bank}','BANK','OUT',100,'2026-03-01','Test','Verified fixture','${actor}');
insert into finance.workflow_allocations(id,organization_id,payment_id,transaction_id,purpose,amount,reason,created_by) select '${allocationId}','${org}','${payment}',id,'DISBURSEMENT',100,'Verified fixture','${actor}' from finance.workflow_transactions where organization_id='${org}' and source_id='${resolution}';
select jsonb_build_object('transaction_id',id,'source_signature',finance.advance_settlement_source('${org}',id)->>'signature','title','Concurrent settlement','funding',jsonb_build_array(jsonb_build_object('allocation_id','${allocationId}','kind','INITIAL')),'usage',jsonb_build_array(jsonb_build_object('source_kind','QUICK','source_id','${advanceUse}','signature',finance.advance_settlement_usage_source('${org}','QUICK','${advanceUse}')->>'signature','evidence_file_id',null))) from finance.workflow_transactions where organization_id='${org}' and source_id='${resolution}';`);
    advanceInputs.push(prepared.trim().split('\n').at(-1));
  }
  const advanceCommands = advanceInputs.map((input, index) => `begin; set role service_role; select finance.advance_settlement_command('${org}','${actor}','DRAFT_SAVE','${input}','advance-race-${index}'); select pg_sleep(0.5); commit;`);
  const advanceRaces = await Promise.all(advanceCommands.map(query => run(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], query)));
  assert.equal(advanceRaces.filter(result => result.code === 0).length, 1, JSON.stringify(advanceRaces));
  assert(advanceRaces.find(result => result.code !== 0)?.stderr.includes('사용 원본이 정산'), 'second draft must see committed usage reservation');
  await sql(advanceCommands[advanceRaces.findIndex(result => result.code === 0)]);
  assert.equal((await sql(`select count(*) from finance.advance_settlement_drafts where organization_id='${org}';`)).trim(), '1');
  assert.equal((await sql(`select count(*) from finance.advance_settlement_claims where organization_id='${org}' and source_id='${advanceUse}';`)).trim(), '1');
  console.log('PASS: concurrent advance drafts reserve one original usage; failed draft rolls back and same-key retry reloads');
  const denied = await run(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], `set role authenticated; select * from finance.workflow_payments;`);
  assert.notEqual(denied.code, 0, 'authenticated direct privileged table read must fail');
  await sql(`insert into storage.objects(bucket_id,name) values('finance-workflow','isolated-private'),('isolated-public','legacy-visible');`);
  const storageRows = await sql(`set role authenticated; select count(*) from storage.objects where bucket_id='finance-workflow'; select count(*) from storage.objects where bucket_id='isolated-public';`);
  assert.deepEqual(storageRows.trim().split('\n').slice(-2), ['0', '1'], 'private workflow objects stay hidden even with a legacy broad Storage policy');
  console.log('PASS: database role access denied');
} finally {
  if (created) {
    const actualLabel = await checked(['inspect', '--format', '{{index .Config.Labels "dbapt-erp.test"}}', name]);
    assert.equal(actualLabel.trim(), 'finance-workflow', 'only this runner owned container can be removed');
    await checked(['rm', '--force', '--volumes', name]);
  }
}
