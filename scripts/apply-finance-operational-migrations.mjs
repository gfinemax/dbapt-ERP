// Applies the rehearsed finance migration set atomically to one exact Supabase project.
import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const expectedProjectRef = "takwoubezzhxtjvxecpx";
const expectedBaseline = "20260906135650";
const compatibilityName = "20260908053346_finance_operational_schema_compatibility.sql";
const root = await realpath(process.cwd());
const privateRoot = await realpath(path.join(root, ".tmp-repos"));
const [envArg, finalBackupArg, rehearsalBackupArg, confirmation] = process.argv.slice(2);
if (!envArg || !finalBackupArg || !rehearsalBackupArg || confirmation !== `--confirm-project=${expectedProjectRef}`) {
  throw new Error(`Usage: node scripts/apply-finance-operational-migrations.mjs .tmp-repos/db.env .tmp-repos/final-backup .tmp-repos/rehearsed-backup --confirm-project=${expectedProjectRef}`);
}

const envFile = await realpath(path.resolve(root, envArg));
const finalBackup = await realpath(path.resolve(root, finalBackupArg));
const rehearsalBackup = await realpath(path.resolve(root, rehearsalBackupArg));
for (const candidate of [envFile, finalBackup, rehearsalBackup]) {
  const relative = path.relative(privateRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Credentials and backup evidence must stay inside ignored .tmp-repos");
}
process.loadEnvFile(envFile);
const source = new URL(process.env.DBAPT_BACKUP_SOURCE_URL?.trim() || "");
if (!["postgres:", "postgresql:"].includes(source.protocol) || !source.hostname.endsWith(".supabase.com")) throw new Error("Operational PostgreSQL URL required");
if (!source.hostname.includes(expectedProjectRef) && !decodeURIComponent(source.username).endsWith(`.${expectedProjectRef}`)) throw new Error("Operational URL does not match the confirmed project");
if (source.pathname !== "/postgres" || !source.password) throw new Error("Operational postgres database URL with password required");

const finalManifest = JSON.parse(await readFile(path.join(finalBackup, "manifest.private.json"), "utf8"));
const finalSummary = JSON.parse((await readFile(path.join(finalBackup, "source-summary.private.json"), "utf8")).trim());
const rehearsalManifest = JSON.parse(await readFile(path.join(rehearsalBackup, "manifest.private.json"), "utf8"));
const rehearsalReport = JSON.parse(await readFile(path.join(rehearsalBackup, "migration-rehearsal.private.json"), "utf8"));
if (!finalManifest.complete || !finalManifest.operationalSource || !rehearsalManifest.complete || !rehearsalReport.complete || !rehearsalReport.sourceMetricsPreserved) throw new Error("Fresh operational backup and completed migration rehearsal evidence are required");
const backupAgeMs = Date.now() - Date.parse(finalManifest.finishedAt);
if (!Number.isFinite(backupAgeMs) || backupAgeMs < 0 || backupAgeMs > 30 * 60 * 1000) throw new Error("Final operational backup must be less than 30 minutes old");

const migrationRoot = path.join(root, "supabase", "migrations");
const files = (await readdir(migrationRoot)).filter(name => /^\d{14}_.*\.sql$/.test(name)).sort();
const pendingNames = files.filter(name => name.slice(0, 14) > expectedBaseline && name !== compatibilityName);
assert.equal(pendingNames.length, 12, "Operational migration manifest changed");
const migrationTexts = new Map();
for (const name of [compatibilityName, ...pendingNames]) migrationTexts.set(name, await readFile(path.join(migrationRoot, name), "utf8"));
const rehearsedHashes = new Map(rehearsalReport.migrations.filter(item => item.sha256).map(item => [item.file, item.sha256]));
for (const [name, sql] of migrationTexts) assert.equal(createHash("sha256").update(sql).digest("hex"), rehearsedHashes.get(name), `Migration differs from completed rehearsal: ${name}`);

const childEnv = { ...process.env,
  PGHOST: source.hostname,
  PGPORT: source.port || "5432",
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password),
  PGDATABASE: source.pathname.slice(1),
  PGSSLMODE: "require",
};
delete childEnv.DBAPT_BACKUP_SOURCE_URL;

function remotePsql(sql, { transaction = false } = {}) {
  const args = ["run", "--rm", "-i", "-e", "PGHOST", "-e", "PGPORT", "-e", "PGUSER", "-e", "PGPASSWORD", "-e", "PGDATABASE", "-e", "PGSSLMODE", "postgres:17", "psql", "--no-password", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align"];
  if (transaction) args.push("--single-transaction");
  const result = spawnSync("docker", args, { input: sql, cwd: root, env: childEnv, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Operational SQL failed: ${String(result.stderr || result.stdout).slice(-4000)}`);
  return result.stdout.trim();
}

const preflightSql = await readFile(path.join(root, "supabase", "preflight", "finance-operational-compatibility.sql"), "utf8");
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
const reportPath = path.join(finalBackup, "operational-apply.private.json");
try { await stat(reportPath); throw new Error("Operational apply report already exists for this final backup"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
const report = { complete: false, projectRef: expectedProjectRef, baseline: expectedBaseline, startedAt: new Date().toISOString(), atomic: true, migrations: [] };

try {
  const beforeMetrics = JSON.parse(remotePsql(metricsSql));
  assert.deepEqual(beforeMetrics, finalSummary.metrics, "Operational data changed after the final backup; create a new final backup");
  const before = JSON.parse(remotePsql(preflightSql));
  assert.equal(before.latest_migration, expectedBaseline, "Operational migration head changed");
  assert.equal(before.columns.filter(column => !column.present).length, 15, "Operational compatibility baseline changed");
  assert(before.invalid_rows.every(rule => Number(rule.count) === 0), "Operational data violates compatibility constraints");

  const statements = ["select pg_advisory_xact_lock(739, 20260908);", migrationTexts.get(compatibilityName)];
  for (const name of pendingNames) {
    const sql = migrationTexts.get(name);
    const version = name.slice(0, 14);
    const migrationName = name.slice(15, -4);
    const tag = `$migration_${createHash("sha256").update(sql).digest("hex").slice(0, 16)}$`;
    if (sql.includes(tag)) throw new Error(`Unexpected migration history delimiter collision: ${name}`);
    statements.push(sql);
    statements.push(`insert into supabase_migrations.schema_migrations(version,statements,name,created_by) values('${version}',array[${tag}${sql}${tag}],'${migrationName}','codex-operational-apply');`);
    report.migrations.push({ file: name, sha256: createHash("sha256").update(sql).digest("hex") });
  }
  const compatibility = migrationTexts.get(compatibilityName);
  const compatibilityVersion = compatibilityName.slice(0, 14);
  const compatibilityMigrationName = compatibilityName.slice(15, -4);
  const compatibilityTag = `$migration_${createHash("sha256").update(compatibility).digest("hex").slice(0, 16)}$`;
  statements.push(compatibility);
  statements.push(`insert into supabase_migrations.schema_migrations(version,statements,name,created_by) values('${compatibilityVersion}',array[${compatibilityTag}${compatibility}${compatibilityTag}],'${compatibilityMigrationName}','codex-operational-apply');`);
  report.migrations.push({ file: compatibilityName, sha256: createHash("sha256").update(compatibility).digest("hex") });
  remotePsql(statements.join("\n"), { transaction: true });

  const after = JSON.parse(remotePsql(preflightSql));
  assert.equal(after.latest_migration, compatibilityVersion, "Operational migration history did not reach the expected head");
  assert(after.columns.every(column => column.present), "Operational compatibility columns remain missing");
  assert(after.invalid_rows.every(rule => Number(rule.count) === 0), "Operational post-migration values violate compatibility constraints");
  assert.deepEqual(JSON.parse(remotePsql(metricsSql)), beforeMetrics, "Operational source metrics changed during migration");

  report.complete = true;
  report.finishedAt = new Date().toISOString();
  report.sourceMetricsPreserved = true;
  report.migrationHead = compatibilityVersion;
  report.preflight = { missingBefore: 15, missingAfter: 0, invalidBefore: 0, invalidAfter: 0 };
  await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ complete: true, atomic: true, migrations: report.migrations.length, migrationHead: report.migrationHead, sourceMetricsPreserved: true }));
} catch (error) {
  report.error = String(error?.message ?? error);
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  throw error;
}
