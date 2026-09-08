// Applies an explicitly reviewed, document-by-document Auth UUID mapping.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const expectedProjectRef = "takwoubezzhxtjvxecpx";
const expectedMigrationHead = "20260908053346";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const root = await realpath(process.cwd());
const privateRoot = await realpath(path.join(root, ".tmp-repos"));
const [envArg, backupArg, mappingArg, confirmation] = process.argv.slice(2);
if (!envArg || !backupArg || !mappingArg || confirmation !== `--confirm-project=${expectedProjectRef}`) {
  throw new Error(`Usage: node scripts/link-finance-operational-accounts.mjs .tmp-repos/db.env .tmp-repos/final-backup .tmp-repos/account-link.private.json --confirm-project=${expectedProjectRef}`);
}

const envFile = await realpath(path.resolve(root, envArg));
const backup = await realpath(path.resolve(root, backupArg));
const mappingFile = await realpath(path.resolve(root, mappingArg));
for (const candidate of [envFile, backup, mappingFile]) {
  const relative = path.relative(privateRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Credentials, backups and identity mapping must stay inside ignored .tmp-repos");
  }
}

const postApply = JSON.parse(await readFile(path.join(backup, "operational-postapply.private.json"), "utf8"));
if (!postApply.complete || !postApply.rollbackOnly || postApply.migrationHead !== expectedMigrationHead) {
  throw new Error("Completed operational post-apply verification evidence is required");
}

const mappingText = await readFile(mappingFile, "utf8");
const mapping = JSON.parse(mappingText);
assert.equal(mapping.projectRef, expectedProjectRef, "Mapping belongs to another project");
assert.match(mapping.organizationId, uuidPattern, "Valid organization UUID required");
assert.match(mapping.actorUserId, uuidPattern, "Valid administrator UUID required");
assert.equal(mapping.identityConfirmation?.confirmed, true, "User identity confirmation is required");
assert.match(mapping.identityConfirmation?.userId ?? "", uuidPattern, "Confirmed identity UUID required");
assert.equal(mapping.identityConfirmation.userId, mapping.actorUserId, "Confirmed user and acting administrator must match for this mapping");
assert(String(mapping.identityConfirmation?.historicalPerson ?? "").trim(), "Confirmed historical person required");
assert(String(mapping.reason ?? "").trim(), "Mapping reason required");
assert(Array.isArray(mapping.expenseBindings) && mapping.expenseBindings.length > 0, "Expense bindings required");
assert(Array.isArray(mapping.documentBindings) && mapping.documentBindings.length > 0, "Document bindings required");

const seen = new Set();
for (const item of [...mapping.expenseBindings, ...mapping.documentBindings]) {
  assert(!seen.has(item.id), `Duplicate mapping target: ${item.id}`);
  seen.add(item.id);
  assert(Number.isInteger(item.expectedVersion) && item.expectedVersion >= 0, `Expected binding version required: ${item.id}`);
  assert.match(item.authorUserId, uuidPattern, `Author UUID required: ${item.id}`);
  assert.equal(item.authorUserId, mapping.identityConfirmation.userId, `Unconfirmed author UUID: ${item.id}`);
  assert(Array.isArray(item.steps), `Step mappings required: ${item.id}`);
  const orders = new Set();
  for (const step of item.steps) {
    assert(Number.isInteger(step.order) && step.order > 0 && !orders.has(step.order), `Unique positive step order required: ${item.id}`);
    orders.add(step.order);
    assert.match(step.userId, uuidPattern, `Step UUID required: ${item.id}/${step.order}`);
    assert.equal(step.userId, mapping.identityConfirmation.userId, `Unconfirmed step UUID: ${item.id}/${step.order}`);
  }
}

process.loadEnvFile(envFile);
const source = new URL(process.env.DBAPT_BACKUP_SOURCE_URL?.trim() || "");
if (!["postgres:", "postgresql:"].includes(source.protocol) || !source.hostname.endsWith(".supabase.com")) throw new Error("Operational PostgreSQL URL required");
if (!source.hostname.includes(expectedProjectRef) && !decodeURIComponent(source.username).endsWith(`.${expectedProjectRef}`)) throw new Error("Operational URL does not match the confirmed project");
if (source.pathname !== "/postgres" || !source.password) throw new Error("Operational postgres database URL with password required");

const childEnv = {
  ...process.env,
  PGHOST: source.hostname,
  PGPORT: source.port || "5432",
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password),
  PGDATABASE: source.pathname.slice(1),
  PGSSLMODE: "require",
};
delete childEnv.DBAPT_BACKUP_SOURCE_URL;

function remotePsql(sql, { transaction = false } = {}) {
  const args = [
    "run", "--rm", "-i",
    "-e", "PGHOST", "-e", "PGPORT", "-e", "PGUSER", "-e", "PGPASSWORD", "-e", "PGDATABASE", "-e", "PGSSLMODE",
    "postgres:17", "psql", "--no-password", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align",
  ];
  if (transaction) args.push("--single-transaction");
  const result = spawnSync("docker", args, { input: sql, cwd: root, env: childEnv, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Operational account link SQL failed: ${String(result.stderr || result.stdout).slice(-4000)}`);
  return result.stdout.trim();
}

const sqlLiteral = value => `'${String(value).replaceAll("'", "''")}'`;
const jsonLiteral = value => {
  const json = JSON.stringify(value);
  const tag = `$mapping_${createHash("sha256").update(json).digest("hex").slice(0, 16)}$`;
  if (json.includes(tag)) throw new Error("Unexpected mapping delimiter collision");
  return `${tag}${json}${tag}::jsonb`;
};
const uuidList = values => values.map(value => `${sqlLiteral(value)}::uuid`).join(",");
const textList = values => values.map(sqlLiteral).join(",");

const expenseIds = mapping.expenseBindings.map(item => item.id);
const documentIds = mapping.documentBindings.map(item => item.id);
const sourceSnapshotSql = `select json_build_object(
  'expenseRows',(select count(*) from finance.expense_resolutions),
  'expenseAmount',(select coalesce(sum(total_payment_amount),0) from finance.expense_resolutions),
  'expenseFingerprint',(select md5(coalesce(string_agg(id||':'||to_jsonb(r)::text,'|' order by id),'')) from finance.expense_resolutions r),
  'documentRows',(select count(*) from approval.documents),
  'documentFingerprint',(select md5(coalesce(string_agg(id::text||':'||to_jsonb(d)::text,'|' order by id),'')) from approval.documents d),
  'stepFingerprint',(select md5(coalesce(string_agg(id::text||':'||to_jsonb(s)::text,'|' order by id),'')) from approval.approval_steps s),
  'storageRows',(select count(*) from storage.objects),
  'storageBytes',(select coalesce(sum(case when metadata->>'size'~'^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0) from storage.objects)
)`;
const evidenceSnapshotSql = `select json_build_object(
  'expenseBindingCount',(select count(*) from finance.expense_authorization_bindings),
  'documentBindingCount',(select count(*) from approval.document_authorization_bindings),
  'expenseBindAuditCount',(select count(*) from finance.expense_workflow_audit_logs where action='AUTH:BIND'),
  'documentBindAuditCount',(select count(*) from approval.audit_logs where action_type='AUTH:BIND'),
  'expenseOperationCount',(select count(*) from finance.expense_authorization_operations where command='BIND'),
  'documentOperationCount',(select count(*) from approval.document_operations where command='BIND')
)`;

const reportPath = path.join(path.dirname(mappingFile), "operational-account-link.private.json");
try {
  await stat(reportPath);
  throw new Error("Operational account link report already exists beside this mapping");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const actorSql = `select json_build_object('authExists',exists(select 1 from auth.users where id=${sqlLiteral(mapping.actorUserId)}::uuid),'activeAdmin',exists(select 1 from finance.reimbursement_members where organization_id=${sqlLiteral(mapping.organizationId)}::uuid and user_id=${sqlLiteral(mapping.actorUserId)}::uuid and active and 'ADMIN'=any(permissions)))`;
const targetsSql = `select json_build_object(
  'expenses',(select coalesce(json_agg(json_build_object('id',r.id,'author',r.resolution_data->>'author','stepCount',jsonb_array_length(coalesce(r.resolution_data->'approvalLine','[]')),'matchedPersonSteps',(select coalesce(jsonb_agg(x.ord order by x.ord),'[]') from jsonb_array_elements(coalesce(r.resolution_data->'approvalLine','[]')) with ordinality x(item,ord) where x.item->>'approver'=${sqlLiteral(mapping.identityConfirmation.historicalPerson)}),'version',coalesce(b.version,0)) order by r.id),'[]') from finance.expense_resolutions r left join finance.expense_authorization_bindings b on b.resolution_id=r.id where r.id in (${textList(expenseIds)})),
  'documents',(select coalesce(json_agg(json_build_object('id',d.id,'drafter',d.drafter_label,'stepCount',(select count(*) from approval.approval_steps s where s.document_id=d.id),'matchedPersonSteps',(select coalesce(jsonb_agg(s.step_order order by s.step_order),'[]') from approval.approval_steps s where s.document_id=d.id and s.approver_label=${sqlLiteral(mapping.identityConfirmation.historicalPerson)}),'version',coalesce(b.version,0)) order by d.id),'[]') from approval.documents d left join approval.document_authorization_bindings b on b.document_id=d.id where d.id in (${uuidList(documentIds)}))
)`;

const calls = [];
for (const item of mapping.expenseBindings) {
  const payload = { author_user_id: item.authorUserId, steps: item.steps.map(step => ({ order: step.order, approver_user_id: step.userId })), reason: mapping.reason, expected_binding_version: item.expectedVersion };
  const key = `operational-identity-${createHash("sha256").update(`expense:${item.id}:${mappingText}`).digest("hex").slice(0, 24)}`;
  calls.push(`select finance.legacy_expense_command(${sqlLiteral(mapping.organizationId)}::uuid,${sqlLiteral(mapping.actorUserId)}::uuid,'BIND',${sqlLiteral(item.id)},(select resolution_data from finance.expense_resolutions where id=${sqlLiteral(item.id)}),${jsonLiteral(payload)},${sqlLiteral(key)});`);
}
for (const item of mapping.documentBindings) {
  const payload = { drafter_user_id: item.authorUserId, steps: item.steps.map(step => ({ order: step.order, user_id: step.userId })), reason: mapping.reason };
  const key = `operational-identity-${createHash("sha256").update(`document:${item.id}:${mappingText}`).digest("hex").slice(0, 24)}`;
  calls.push(`select approval.document_command(${sqlLiteral(mapping.organizationId)}::uuid,${sqlLiteral(mapping.actorUserId)}::uuid,'BIND',${sqlLiteral(item.id)}::uuid,${item.expectedVersion},${jsonLiteral(payload)},${sqlLiteral(key)});`);
}

const expectedExpenseVersions = new Map(mapping.expenseBindings.map(item => [item.id, item.expectedVersion]));
const expectedDocumentVersions = new Map(mapping.documentBindings.map(item => [item.id, item.expectedVersion]));
const validateTargets = targets => {
  assert.equal(targets.expenses.length, mapping.expenseBindings.length, "Expense target set changed");
  assert.equal(targets.documents.length, mapping.documentBindings.length, "Document target set changed");
  for (const target of targets.expenses) {
    const planned = mapping.expenseBindings.find(item => item.id === target.id);
    assert.equal(Number(target.version), expectedExpenseVersions.get(target.id), `Expense binding version changed: ${target.id}`);
    assert(target.author.includes(mapping.identityConfirmation.historicalPerson), `Expense author label does not match confirmed person: ${target.id}`);
    assert.deepEqual(target.matchedPersonSteps.map(Number), planned.steps.map(step => step.order), `Expense step labels changed: ${target.id}`);
  }
  for (const target of targets.documents) {
    const planned = mapping.documentBindings.find(item => item.id === target.id);
    assert.equal(Number(target.version), expectedDocumentVersions.get(target.id), `Document binding version changed: ${target.id}`);
    assert(target.drafter.includes(mapping.identityConfirmation.historicalPerson), `Document drafter label does not match confirmed person: ${target.id}`);
    assert.deepEqual(target.matchedPersonSteps.map(Number), planned.steps.map(step => step.order), `Document step labels changed: ${target.id}`);
  }
};

const started = Date.now();
const report = { complete: false, projectRef: expectedProjectRef, startedAt: new Date(started).toISOString(), mappingSha256: createHash("sha256").update(mappingText).digest("hex"), expenseBindings: expenseIds, documentBindings: documentIds };
try {
  assert.equal(remotePsql("select max(version) from supabase_migrations.schema_migrations"), expectedMigrationHead, "Operational migration head changed");
  const actor = JSON.parse(remotePsql(actorSql));
  assert(actor.authExists && actor.activeAdmin, "Confirmed user must be an active administrator in the target organization");
  validateTargets(JSON.parse(remotePsql(targetsSql)));
  const beforeSource = JSON.parse(remotePsql(sourceSnapshotSql));
  const beforeEvidence = JSON.parse(remotePsql(evidenceSnapshotSql));

  remotePsql(`begin;\n${calls.join("\n")}\nrollback;`);
  assert.deepEqual(JSON.parse(remotePsql(sourceSnapshotSql)), beforeSource, "Dry run changed operational source data");
  assert.deepEqual(JSON.parse(remotePsql(evidenceSnapshotSql)), beforeEvidence, "Dry run left authorization evidence");

  remotePsql(calls.join("\n"), { transaction: true });
  const afterSource = JSON.parse(remotePsql(sourceSnapshotSql));
  assert.deepEqual(afterSource, beforeSource, "Account linking changed document, amount, approval-step or Storage originals");
  const afterEvidence = JSON.parse(remotePsql(evidenceSnapshotSql));
  assert.equal(Number(afterEvidence.expenseBindingCount) - Number(beforeEvidence.expenseBindingCount), mapping.expenseBindings.length, "Unexpected expense binding count");
  assert.equal(Number(afterEvidence.expenseBindAuditCount) - Number(beforeEvidence.expenseBindAuditCount), mapping.expenseBindings.length, "Unexpected expense BIND audit count");
  assert.equal(Number(afterEvidence.expenseOperationCount) - Number(beforeEvidence.expenseOperationCount), mapping.expenseBindings.length, "Unexpected expense BIND operation count");
  assert.equal(Number(afterEvidence.documentBindAuditCount) - Number(beforeEvidence.documentBindAuditCount), mapping.documentBindings.length, "Unexpected document BIND audit count");
  assert.equal(Number(afterEvidence.documentOperationCount) - Number(beforeEvidence.documentOperationCount), mapping.documentBindings.length, "Unexpected document BIND operation count");
  assert.equal(Number(afterEvidence.documentBindingCount), Number(beforeEvidence.documentBindingCount), "Existing document binding stubs must be updated in place");

  report.complete = true;
  report.atomic = true;
  report.dryRunPassed = true;
  report.sourceDataPreserved = true;
  report.beforeEvidence = beforeEvidence;
  report.afterEvidence = afterEvidence;
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - started;
  await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ complete: true, atomic: true, dryRunPassed: true, expenses: expenseIds.length, documents: documentIds.length, sourceDataPreserved: true, durationMs: report.durationMs }));
} catch (error) {
  report.error = String(error?.message ?? error);
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - started;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  throw error;
}
