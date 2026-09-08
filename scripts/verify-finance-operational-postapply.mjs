// Verifies the applied finance workflow on the exact operational Supabase project.
import assert from "node:assert/strict";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const expectedProjectRef = "takwoubezzhxtjvxecpx";
const expectedMigrationHead = "20260908053346";
const suites = [
  "fund_workflow.sql",
  "trust_request_versions.sql",
  "payment_workspace.sql",
  "accounting_drafts.sql",
  "legacy_settlement_source.sql",
  "expense_workspace.sql",
  "finance_task_sources.sql",
  "advance_settlement_drafts.sql",
  "legacy_expense_authorization.sql",
  "approval_document_authorization.sql",
];

const root = await realpath(process.cwd());
const privateRoot = await realpath(path.join(root, ".tmp-repos"));
const [envArg, backupArg, confirmation] = process.argv.slice(2);
if (!envArg || !backupArg || confirmation !== `--confirm-project=${expectedProjectRef}`) {
  throw new Error(`Usage: node scripts/verify-finance-operational-postapply.mjs .tmp-repos/db.env .tmp-repos/final-backup --confirm-project=${expectedProjectRef}`);
}

const envFile = await realpath(path.resolve(root, envArg));
const backup = await realpath(path.resolve(root, backupArg));
for (const candidate of [envFile, backup]) {
  const relative = path.relative(privateRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Credentials and verification evidence must stay inside ignored .tmp-repos");
  }
}

process.loadEnvFile(envFile);
const source = new URL(process.env.DBAPT_BACKUP_SOURCE_URL?.trim() || "");
if (!["postgres:", "postgresql:"].includes(source.protocol) || !source.hostname.endsWith(".supabase.com")) {
  throw new Error("Operational PostgreSQL URL required");
}
if (!source.hostname.includes(expectedProjectRef) && !decodeURIComponent(source.username).endsWith(`.${expectedProjectRef}`)) {
  throw new Error("Operational URL does not match the confirmed project");
}
if (source.pathname !== "/postgres" || !source.password) {
  throw new Error("Operational postgres database URL with password required");
}

const manifest = JSON.parse(await readFile(path.join(backup, "manifest.private.json"), "utf8"));
const sourceSummary = JSON.parse((await readFile(path.join(backup, "source-summary.private.json"), "utf8")).trim());
const applyReport = JSON.parse(await readFile(path.join(backup, "operational-apply.private.json"), "utf8"));
if (!manifest.complete || !manifest.operationalSource || !applyReport.complete || !applyReport.atomic) {
  throw new Error("Completed operational backup and atomic apply evidence are required");
}
assert.equal(applyReport.projectRef, expectedProjectRef, "Apply evidence belongs to another project");
assert.equal(applyReport.migrationHead, expectedMigrationHead, "Apply evidence has an unexpected migration head");

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

function remotePsql(sql) {
  const args = [
    "run", "--rm", "-i",
    "-e", "PGHOST", "-e", "PGPORT", "-e", "PGUSER", "-e", "PGPASSWORD", "-e", "PGDATABASE", "-e", "PGSSLMODE",
    "postgres:17", "psql", "--no-password", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align",
  ];
  const result = spawnSync("docker", args, {
    input: sql,
    cwd: root,
    env: childEnv,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Operational verification SQL failed: ${String(result.stderr || result.stdout).slice(-4000)}`);
  }
  return result.stdout.trim();
}

const metricsSql = `select json_build_object(
  'expenseResolutionCount', (select count(*) from finance.expense_resolutions),
  'expenseResolutionAmount', (select coalesce(sum(total_payment_amount), 0) from finance.expense_resolutions),
  'quickExpenseCount', (select count(*) from finance.quick_expense_records),
  'voucherCount', (select count(*) from finance.vouchers),
  'approvalDocumentCount', (select count(*) from approval.documents),
  'authUserCount', (select count(*) from auth.users),
  'storageObjectCount', (select count(*) from storage.objects),
  'storageMetadataBytes', (select coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end), 0) from storage.objects)
)`;
const preflightSql = await readFile(path.join(root, "supabase", "preflight", "finance-operational-compatibility.sql"), "utf8");
const reportPath = path.join(backup, "operational-postapply.private.json");
try {
  await stat(reportPath);
  throw new Error("Operational post-apply report already exists for this backup");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const started = Date.now();
const report = {
  complete: false,
  projectRef: expectedProjectRef,
  migrationHead: expectedMigrationHead,
  startedAt: new Date(started).toISOString(),
  regressions: [],
};

try {
  const beforeMetrics = JSON.parse(remotePsql(metricsSql));
  assert.deepEqual(beforeMetrics, sourceSummary.metrics, "Operational source metrics differ from the final pre-apply backup");
  const preflight = JSON.parse(remotePsql(preflightSql));
  assert.equal(preflight.latest_migration, expectedMigrationHead, "Operational migration head changed after apply");
  assert(preflight.columns.every(column => column.present), "Operational compatibility columns are missing");
  assert(preflight.invalid_rows.every(rule => Number(rule.count) === 0), "Operational values violate compatibility constraints");

  for (const file of suites) {
    const sql = await readFile(path.join(root, "supabase", "tests", file), "utf8");
    assert.match(sql, /^\s*begin\s*;/im, `${file} must start a transaction`);
    assert.match(sql, /rollback\s*;\s*$/im, `${file} must end with rollback`);
    assert.doesNotMatch(sql, /^\s*commit\s*;/im, `${file} must not commit operational fixtures`);
    remotePsql(sql);
    assert.deepEqual(JSON.parse(remotePsql(metricsSql)), beforeMetrics, `${file} changed operational source metrics`);
    report.regressions.push(file);
  }

  const afterMetrics = JSON.parse(remotePsql(metricsSql));
  assert.deepEqual(afterMetrics, beforeMetrics, "Operational source metrics changed during post-apply verification");
  const afterPreflight = JSON.parse(remotePsql(preflightSql));
  assert.equal(afterPreflight.latest_migration, expectedMigrationHead, "Operational migration history changed during verification");
  assert(afterPreflight.columns.every(column => column.present), "Compatibility columns changed during verification");
  assert(afterPreflight.invalid_rows.every(rule => Number(rule.count) === 0), "Compatibility values changed during verification");

  report.complete = true;
  report.sourceMetricsPreserved = true;
  report.rollbackOnly = true;
  report.metrics = afterMetrics;
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - started;
  await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify({
    complete: true,
    rollbackOnly: true,
    regressions: report.regressions.length,
    migrationHead: expectedMigrationHead,
    sourceMetricsPreserved: true,
    durationMs: report.durationMs,
  }));
} catch (error) {
  report.error = String(error?.message ?? error);
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - started;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  throw error;
}
