// Applies pending finance migrations only to a dedicated local restore target.
import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const root = await realpath(process.cwd());
const privateRoot = await realpath(path.join(root, ".tmp-repos"));
const [backupArg, workdirArg] = process.argv.slice(2);
if (!backupArg || !workdirArg) throw new Error("Usage: node scripts/rehearse-finance-operational-migrations.mjs .tmp-repos/backup .tmp-repos/isolated-local-workdir");
const backup = await realpath(path.resolve(root, backupArg));
const workdir = await realpath(path.resolve(root, workdirArg));
for (const candidate of [backup, workdir]) {
  const relative = path.relative(privateRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Backup and target workdir must stay inside ignored .tmp-repos");
}

const manifest = JSON.parse(await readFile(path.join(backup, "manifest.private.json"), "utf8"));
const restore = JSON.parse(await readFile(path.join(backup, "db-restore-rehearsal.private.json"), "utf8"));
if (!manifest.complete || !manifest.operationalSource || !restore.complete || restore.operationalTarget) throw new Error("Completed operational backup and isolated local restore are required");
const config = await readFile(path.join(workdir, "supabase", "config.toml"), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId || !/^dbapt-finance-restore-[a-z0-9-]+$/.test(projectId)) throw new Error("Target must use a dedicated dbapt-finance-restore-* local project ID");
const listed = spawnSync("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${workdir}`, "--format", "{{.Names}}"], { encoding: "utf8", windowsHide: true });
if (listed.status !== 0) throw new Error("Could not inspect the dedicated local Supabase stack");
const containers = listed.stdout.split(/\r?\n/).map(name => name.trim()).filter(name => name.startsWith("supabase_db_"));
if (containers.length !== 1) throw new Error("Expected exactly one database container for the dedicated local Supabase workdir");
const container = containers[0];

function psql(sql) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "--no-psqlrc", "--username", "postgres", "--dbname", "postgres", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align"], { input: sql, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Local migration rehearsal failed: ${String(result.stderr || result.stdout).slice(-3000)}`);
  return result.stdout.trim();
}

const reportPath = path.join(backup, "migration-rehearsal.private.json");
let previousAttempt = null;
try {
  await stat(reportPath);
  previousAttempt = JSON.parse(await readFile(reportPath, "utf8"));
  if (previousAttempt.complete) throw new Error("Completed migration rehearsal report already exists for this backup");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const started = Date.now();
const report = { complete: false, operationalTarget: false, localProjectId: projectId, startedAt: new Date(started).toISOString(), migrations: [], regressions: [] };
const preflightSql = (await readFile(path.join(root, "supabase", "preflight", "finance-operational-compatibility.sql"), "utf8"))
  .replace("(select max(version) from supabase_migrations.schema_migrations)", "'isolated restore: see backup history files'");
const compatibilityName = "20260908053346_finance_operational_schema_compatibility.sql";
const migrationRoot = path.join(root, "supabase", "migrations");
const lastOperational = "20260906135650";
const files = (await readdir(migrationRoot)).filter(name => /^\d{14}_.*\.sql$/.test(name)).sort();
const compatibility = await readFile(path.join(migrationRoot, compatibilityName), "utf8");
const pending = files.filter(name => name.slice(0, 14) > lastOperational && name !== compatibilityName);
assert.equal(pending.length, 12, "Pending migration manifest changed; review before rehearsal");

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

try {
  const sourceSummary = JSON.parse((await readFile(path.join(backup, "source-summary.private.json"), "utf8")).trim());
  const beforeMetrics = JSON.parse(psql(metricsSql));
  assert.deepEqual(beforeMetrics, sourceSummary.metrics, "Restored baseline differs from operational backup");
  const before = JSON.parse(psql(preflightSql));
  assert.equal(before.columns.filter(column => !column.present).length, 15, "Expected 15 operational compatibility columns to be missing before migration");
  assert(before.invalid_rows.every(rule => Number(rule.count) === 0), "Operational baseline contains incompatible values");

  psql(compatibility);
  report.migrations.push({ phase: "compatibility-prerequisite", file: compatibilityName, sha256: createHash("sha256").update(compatibility).digest("hex") });
  for (const file of pending) {
    const sql = await readFile(path.join(migrationRoot, file), "utf8");
    psql(sql);
    assert.deepEqual(JSON.parse(psql(metricsSql)), beforeMetrics, `Source metrics changed after ${file}`);
    report.migrations.push({ phase: "pending", file, sha256: createHash("sha256").update(sql).digest("hex") });
  }
  psql(compatibility);
  report.migrations.push({ phase: "idempotency-rerun", file: compatibilityName });

  const after = JSON.parse(psql(preflightSql));
  assert(after.columns.every(column => column.present), "Compatibility columns are still missing after migration");
  assert(after.invalid_rows.every(rule => Number(rule.count) === 0), "Post-migration compatibility values are invalid");
  const beforeOriginals = new Map(before.originals.map(item => [item.object, item]));
  for (const item of after.originals) {
    const original = beforeOriginals.get(item.object);
    assert.equal(item.rows, original?.rows, `Original row count changed: ${item.object}`);
    assert.equal(item.amount, original?.amount, `Original amount changed: ${item.object}`);
    if (item.object === "expense_resolutions") assert.equal(item.fingerprint, original?.fingerprint, "Expense resolution originals changed");
  }
  assert.deepEqual(JSON.parse(psql(metricsSql)), beforeMetrics, "Final source metrics changed");

  const suites = ["fund_workflow.sql", "trust_request_versions.sql", "payment_workspace.sql", "accounting_drafts.sql", "legacy_settlement_source.sql", "expense_workspace.sql", "finance_task_sources.sql", "advance_settlement_drafts.sql", "legacy_expense_authorization.sql", "approval_document_authorization.sql"];
  for (const file of suites) {
    const sql = await readFile(path.join(root, "supabase", "tests", file), "utf8");
    psql(/^begin;/m.test(sql) ? sql : `begin;\n${sql}\nrollback;`);
    report.regressions.push(file);
  }
  assert.deepEqual(JSON.parse(psql(metricsSql)), beforeMetrics, "Regression suites changed source metrics");

  report.complete = true;
  report.preflight = { missingBefore: 15, missingAfter: 0, invalidBefore: 0, invalidAfter: 0 };
  report.sourceMetricsPreserved = true;
  report.durationMs = Date.now() - started;
  report.finishedAt = new Date().toISOString();
  report.limits = ["All SQL ran only in the dedicated local restore target.", "Operational migration history and the operational database were not changed.", "Actual operational apply still requires a write freeze and a fresh final backup."];
  await writeFile(reportPath, JSON.stringify(report, null, 2), previousAttempt ? {} : { flag: "wx" });
  console.log(JSON.stringify({ complete: true, migrations: report.migrations.length, regressions: report.regressions.length, sourceMetricsPreserved: true, durationMs: report.durationMs }));
} catch (error) {
  report.error = String(error?.message ?? error);
  report.durationMs = Date.now() - started;
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  throw error;
}
