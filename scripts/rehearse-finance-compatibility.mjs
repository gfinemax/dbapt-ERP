// Offline-catalog / fake-data rehearsal. Never reads .env or connects to a remote database.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = process.cwd();
const container = 'supabase_db_dbapt-finance-e2e-20260908-a7c1';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const source = `finance_rehearsal_source_${suffix}`, restored = `finance_rehearsal_restore_${suffix}`;
const output = path.resolve(root, '.tmp-repos', `finance-compatibility-rehearsal-${suffix}`);
const compatibility = '20260908053346_finance_operational_schema_compatibility.sql';
const lastHistorical = '20260906135650';
const quote = s => '"' + s.replaceAll('"', '""') + '"';
const literal = s => "'" + s.replaceAll("'", "''") + "'";
const object = o => `${quote(o.schema)}.${quote(o.table ?? o.name)}`;
const identity = o => [o.schema, o.table, o.name, o.identity].filter(Boolean).join('.');
const stable = o => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const sha = value => createHash('sha256').update(value).digest('hex');
const tokens = s => (s ?? '').match(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9$]*|\d+(?:\.\d+)?|[^\s]/g)?.filter(t => !t.startsWith('--') && !t.startsWith('/*')).join(' ');
const report = { fakeDataOnly: true, operationalBackup: false, container, source, restored, stages: [], migrations: [] };
await fs.mkdir(output, { recursive: false });
async function record(stage, details = {}) {
  report.stages.push({ stage, ...details });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`PASS ${stage}`);
}
function docker(args, input = '', binary = false) {
  const r = spawnSync('docker', args, { input, encoding: binary ? undefined : 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`Local docker command failed: ${String(r.stderr).slice(-3000)}`);
  return r.stdout;
}
function sql(database, query) {
  assert([source, restored].includes(database), 'Only this run-created databases may receive SQL');
  return docker(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'], query);
}
const snapshotPath = name => path.join(root, '.tmp-repos', name);
const target = JSON.parse(await fs.readFile(snapshotPath('finance-operational-catalog.private.json'), 'utf8'));
const targetDetails = JSON.parse(await fs.readFile(snapshotPath('finance-operational-details.private.json'), 'utf8'));
const migrations = await Promise.all((await fs.readdir(path.join(root, 'supabase/migrations'))).filter(f => /^\d{14}_.*\.sql$/.test(f)).sort().map(async file => ({ file, text: await fs.readFile(path.join(root, 'supabase/migrations', file), 'utf8') })));
const compat = migrations.find(m => m.file === compatibility);
assert(compat?.text.trim(), 'Completed compatibility migration required');
const preflight = (await fs.readFile(path.join(root, 'supabase/preflight/finance-operational-compatibility.sql'), 'utf8'))
  .replace('(select max(version) from supabase_migrations.schema_migrations)', "'fake harness: see explicit migration manifest'");
const pending = migrations.filter(m => m.file.slice(0, 14) > lastHistorical && m.file !== compatibility);
assert.equal(pending.length, 12, 'Review manifest if the pending migration set changes');
report.inputHashes = { catalog: sha(JSON.stringify(target)), details: sha(JSON.stringify(targetDetails)), schema: sha(await fs.readFile(path.join(root, 'supabase/schema.sql'))), compatibility: sha(compat.text) };
const bootstrap = `create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb,raw_app_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,owner uuid,created_at timestamptz default now(),unique(bucket_id,name));
alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
create policy isolated_legacy_open on storage.objects for all to authenticated using(true) with check(true);
create schema extensions;create extension pgcrypto with schema extensions;`;
// Queries are embedded by the checked-in collector below; no external SQL is executed.
const catalogQuery = `select jsonb_build_object(
'functions',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'identity',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('finance','approval') and p.prokind='f'),
'indexes',(select coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',indexname,'definition',indexdef) order by schemaname,indexname),'[]') from pg_indexes where schemaname in ('finance','approval') or (schemaname='core' and tablename='business_partners')),
'constraints',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',con.conname,'definition',pg_get_constraintdef(con.oid,true)) order by n.nspname,c.relname,con.conname),'[]') from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('finance','approval') or (n.nspname='core' and c.relname='business_partners')),
'tables',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'acl',c.relacl::text) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and (n.nspname in ('finance','approval') or (n.nspname='core' and c.relname='business_partners'))))`;
const detailsQuery = `select jsonb_build_object(
'columns',(select jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'name',column_name,'type',udt_schema||'.'||udt_name,'nullable',is_nullable,'default',column_default,'precision',numeric_precision,'scale',numeric_scale,'length',character_maximum_length) order by table_schema,table_name,ordinal_position) from information_schema.columns where table_schema in ('finance','approval')),
'triggers',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid,true)) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('finance','approval')),
'privileges',(select jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'role',grantee,'privilege',privilege_type) order by table_schema,table_name,grantee,privilege_type) from information_schema.role_table_grants where table_schema in ('finance','approval')))`;
function catalog(database) { return JSON.parse(sql(database, catalogQuery)); }
function details(database) { return JSON.parse(sql(database, detailsQuery)); }
function sameSet(actual, expected, key = identity, value = stable) {
  assert.equal(actual.length, expected.length, 'Object counts differ');
  const map = new Map(expected.map(o => [key(o), value(o)]));
  for (const o of actual) assert.equal(value(o), map.get(key(o)), `Catalog differs: ${key(o)}`);
}
function verifyStructure(database) {
  const c = catalog(database), d = details(database);
  for (const kind of ['functions', 'indexes', 'constraints']) sameSet(c[kind], target[kind], identity, o => tokens(o.definition));
  sameSet(c.functions, target.functions, identity, o => o.acl);
  sameSet(c.tables, target.tables, identity, o => String(o.rls));
  for (const kind of ['columns', 'triggers']) sameSet(d[kind], targetDetails[kind]);
  sameSet(d.privileges, targetDetails.privileges, o => [o.schema,o.table,o.role,o.privilege].join('.'));
  return { tables: c.tables.length, functions: c.functions.length, indexes: c.indexes.length, constraints: c.constraints.length, columns: d.columns.length, triggers: d.triggers.length };
}
try {
  // The only SQL allowed against postgres is CREATE DATABASE with generated identifiers.
  for (const name of [source, restored]) {
    assert(/^finance_rehearsal_(source|restore)_[a-f0-9]{12}$/.test(name));
    docker(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], `create database ${quote(name)};`);
  }
  sql(source, bootstrap);
  sql(source, await fs.readFile(path.join(root, 'supabase/schema.sql'), 'utf8'));
  for (const m of migrations.filter(m => m.file.slice(0,14) <= lastHistorical && !m.file.includes('expose_approval_schema'))) sql(source, m.text);
  // Explicitly reconcile known baseline differences; never claim bootstrap equals production.
  const c = catalog(source), d = details(source);
  for (const con of c.constraints.filter(o => !target.constraints.some(t => identity(t) === identity(o)))) sql(source, `alter table ${object(con)} drop constraint ${quote(con.name)};`);
  for (const idx of c.indexes.filter(o => !target.indexes.some(t => identity(t) === identity(o)))) sql(source, `drop index if exists ${quote(idx.schema)}.${quote(idx.name)};`);
  for (const col of d.columns.filter(o => !targetDetails.columns.some(t => identity(t) === identity(o)))) sql(source, `alter table ${object(col)} drop column ${quote(col.name)};`);
  for (const col of targetDetails.columns) {
    const old = d.columns.find(o => identity(o) === identity(col));
    assert(old, 'No automatic unknown-column reconstruction');
    if (old.default !== col.default) sql(source, `alter table ${object(col)} alter column ${quote(col.name)} ${col.default === null ? 'drop default' : `set default ${col.default}`};`);
  }
  for (const idx of target.indexes) {
    const old = c.indexes.find(o => identity(o) === identity(idx));
    if (old && tokens(old.definition) !== tokens(idx.definition)) sql(source, `drop index ${quote(idx.schema)}.${quote(idx.name)};${idx.definition};`);
  }
  const privilegeKey = o => [o.schema,o.table,o.role,o.privilege].join('.');
  for (const p of d.privileges.filter(o => !targetDetails.privileges.some(t => privilegeKey(t) === privilegeKey(o)))) sql(source, `revoke ${p.privilege} on ${object(p)} from ${quote(p.role)};`);
  for (const p of targetDetails.privileges.filter(o => !d.privileges.some(t => privilegeKey(t) === privilegeKey(o)))) sql(source, `grant ${p.privilege} on ${object(p)} to ${quote(p.role)};`);
  await record('operational_catalog_scope_equal', verifyStructure(source));
  const org = randomUUID(), actor = randomUUID(), account = randomUUID(), bank = randomUUID(), doc = randomUUID(), attachment = randomUUID();
  const fakeBytes = Buffer.from('LOCAL FAKE ATTACHMENT — not operational data\n');
  await fs.writeFile(path.join(output, 'fake-attachment.txt'), fakeBytes);
  sql(source, `insert into core.organizations(id,name,status) values('${org}','LOCAL compatibility rehearsal','active');
insert into auth.users(id) values('${actor}');insert into finance.reimbursement_members values('${org}','${actor}','LOCAL admin',array['ADMIN'],true);
insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status) values('${account}','${org}','LOCAL','LOCAL','LOCAL-001','운영계좌','사용');
insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,description,deposit_amount,withdrawal_amount) values('${bank}','${org}','${account}','2026-03-01','LOCAL original',0,1000);
insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data) values('LOCAL-RESTORE-001','${org}','LOCAL-RESTORE-001','LOCAL original','승인대기','지급전',1000,'{"subject":"LOCAL preservation"}');
insert into approval.documents(id,organization_id,document_no,document_type,title,drafter_label,approval_status,amount) values('${doc}','${org}','LOCAL-RESTORE-APR','GENERAL','LOCAL original','LOCAL original','APPROVED',0);
insert into approval.approval_steps(document_id,step_order,approver_label,approver_role,status) values('${doc}',1,'LOCAL original','LOCAL','APPROVED');
insert into approval.attachments(id,document_id,storage_bucket,storage_path,original_filename,content_type,file_size,uploaded_by_label) values('${attachment}','${doc}','expense-evidence','local/fake-attachment.txt','fake-attachment.txt','text/plain',${fakeBytes.length},'LOCAL original');`);
  const protectedTables = ['bank_accounts','bank_transactions','expense_resolutions'].map(table=>({schema:'finance',table})).concat(['documents','approval_steps','attachments'].map(table=>({schema:'approval',table})));
  const projection = protectedTables.map(t => {
    const cols = targetDetails.columns.filter(c => c.schema===t.schema && c.table===t.table);
    return `${literal(`${t.schema}.${t.table}`)},(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select ${cols.map(c=>quote(c.name)).join(',')} from ${object(t)}) x)`;
  }).join(',');
  const fingerprintQuery = `select jsonb_build_object(${projection})`;
  const before = sql(source, fingerprintQuery).trim();
  const preflightBefore = JSON.parse(sql(source, preflight));
  assert(preflightBefore.invalid_rows.every(r => Number(r.count) === 0));
  assert.equal(preflightBefore.columns.filter(c => !c.present).length, 15);
  await fs.writeFile(path.join(output, 'preflight-before.json'), JSON.stringify(preflightBefore, null, 2));
  const dump = docker(['exec', container, 'pg_dump', '-U', 'postgres', '-d', source, '--format=custom', '--no-owner'], '', true);
  await fs.writeFile(path.join(output, 'fake-database.dump'), dump);
  docker(['exec','-i',container,'pg_restore','-U','postgres','-d',restored,'--no-owner','--exit-on-error'], dump);
  assert.equal(sql(restored, fingerprintQuery).trim(), before);
  verifyStructure(restored);
  await fs.copyFile(path.join(output,'fake-attachment.txt'),path.join(output,'restored-attachment.txt'));
  assert.equal(sha(await fs.readFile(path.join(output,'restored-attachment.txt'))),sha(fakeBytes));
  await record('fake_dump_restore_and_attachment_copy', { dumpBytes: dump.length, dumpSha256: sha(dump), attachmentBytes: fakeBytes.length, attachmentSha256: sha(fakeBytes) });
  sql(restored, compat.text);
  assert.equal(sql(restored,fingerprintQuery).trim(),before);
  const preflightAfter = JSON.parse(sql(restored, preflight));
  assert(preflightAfter.invalid_rows.every(r => Number(r.count) === 0));
  assert(preflightAfter.columns.every(c => c.present));
  await fs.writeFile(path.join(output, 'preflight-after.json'), JSON.stringify(preflightAfter, null, 2));
  await record('compatibility_before_pending_preserves_original_columns');
  for (const m of pending) { sql(restored,m.text);report.migrations.push({file:m.file,sha256:sha(m.text)});assert.equal(sql(restored,fingerprintQuery).trim(),before,`Original changed after ${m.file}`); }
  sql(restored,compat.text);
  assert.equal(sql(restored,fingerprintQuery).trim(),before);
  await record('twelve_pending_migrations_then_idempotent_compatibility');
  const suites = ['fund_workflow.sql','trust_request_versions.sql','payment_workspace.sql','accounting_drafts.sql','legacy_settlement_source.sql','expense_workspace.sql','finance_task_sources.sql','advance_settlement_drafts.sql','legacy_expense_authorization.sql','approval_document_authorization.sql'];
  for (const file of suites) { const query=await fs.readFile(path.join(root,'supabase/tests',file),'utf8');sql(restored,/^begin;/m.test(query)?query:`begin;\n${query}\nrollback;`);await record(`regression_${file}`); }
  assert.equal(sql(restored,fingerprintQuery).trim(),before);
  await record('final_original_preservation');
  report.complete = true;
  report.limits = ['Scope is collected finance/approval catalog, not full operational schema.', 'Auth/Storage are local test reference schemas, not real service backups.', 'Attachment recovery is a separate filesystem copy, not Supabase Storage restoration.', 'Fake pg_dump/restore is not an operational backup or PITR rehearsal.', 'No existing local QA database was modified. Run-created databases are retained for review.'];
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(`REPORT ${path.relative(root,output)}/report.json`);
} catch(error) {
  report.complete=false;report.error=error.message;
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.error(`FAILED; inspect ignored report ${path.relative(root,output)}/report.json`);
  throw error;
}
