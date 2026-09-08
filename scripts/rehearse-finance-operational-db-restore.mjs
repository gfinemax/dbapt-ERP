// Restores a private logical backup only into a dedicated local Supabase stack.
import { createHash } from "node:crypto";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = await realpath(process.cwd());
const privateRoot = await realpath(path.join(root, ".tmp-repos"));
const [backupArg, workdirArg] = process.argv.slice(2);
if (!backupArg || !workdirArg) throw new Error("Usage: node scripts/rehearse-finance-operational-db-restore.mjs .tmp-repos/backup .tmp-repos/isolated-local-workdir");
const backup = await realpath(path.resolve(root, backupArg));
const workdir = await realpath(path.resolve(root, workdirArg));
for (const candidate of [backup, workdir]) {
  const relative = path.relative(privateRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Backup and target workdir must stay inside ignored .tmp-repos");
}

const config = await readFile(path.join(workdir, "supabase", "config.toml"), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId || !/^dbapt-finance-restore-[a-z0-9-]+$/.test(projectId)) throw new Error("Target must use a dedicated dbapt-finance-restore-* local project ID");
const listed = spawnSync("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${workdir}`, "--format", "{{.Names}}"], { encoding: "utf8", windowsHide: true });
if (listed.status !== 0) throw new Error("Could not inspect the dedicated local Supabase stack");
const databaseContainers = listed.stdout.split(/\r?\n/).map(name => name.trim()).filter(name => name.startsWith("supabase_db_"));
if (databaseContainers.length !== 1) throw new Error("Expected exactly one database container for the dedicated local Supabase workdir");
const container = databaseContainers[0];
const inspect = spawnSync("docker", ["inspect", "--format", "{{.State.Running}}", container], { encoding: "utf8", windowsHide: true });
if (inspect.status !== 0 || inspect.stdout.trim() !== "true") throw new Error("Dedicated local Supabase database container is not running");

const manifest = JSON.parse(await readFile(path.join(backup, "manifest.private.json"), "utf8"));
if (!manifest.complete || !manifest.readOnlySource || !Array.isArray(manifest.files)) throw new Error("Completed read-only database backup manifest required");
const files = new Map(manifest.files.map(file => [file.name, file]));
for (const name of ["roles.sql", "schema.sql", "data.sql", "history_schema.sql", "history_data.sql", "source-summary.private.json"]) {
  const expected = files.get(name);
  if (!expected) throw new Error(`Backup manifest entry missing: ${name}`);
  const bytes = await readFile(path.join(backup, name));
  if (bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error(`Backup hash verification failed: ${name}`);
}

function dockerPsql(query, { input = undefined, tuples = false } = {}) {
  const args = ["exec", "-i", container, "psql", "--no-psqlrc", "--username", "postgres", "--dbname", "postgres", "--set", "ON_ERROR_STOP=1"];
  if (tuples) args.push("--tuples-only", "--no-align");
  if (query) args.push("--command", query);
  const result = spawnSync("docker", args, { input, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Local restore command failed: ${String(result.stderr || result.stdout).slice(-3000)}`);
  return result.stdout.trim();
}

const existing = Number(dockerPsql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in ('finance','approval','core')", { tuples: true }));
if (existing !== 0) throw new Error("Dedicated restore target already contains application tables");

const reportPath = path.join(backup, "db-restore-rehearsal.private.json");
try { await stat(reportPath); throw new Error("Restore report already exists for this backup"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
const started = Date.now();
const report = { complete: false, operationalTarget: false, localProjectId: projectId, sourceOperational: Boolean(manifest.operationalSource), startedAt: new Date(started).toISOString() };

try {
  const restoreSql = [
    await readFile(path.join(backup, "roles.sql"), "utf8"),
    await readFile(path.join(backup, "schema.sql"), "utf8"),
    "SET session_replication_role = replica;",
    await readFile(path.join(backup, "data.sql"), "utf8"),
  ].join("\n");
  dockerPsql(null, { input: `BEGIN;\n${restoreSql}\nCOMMIT;\n` });

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
  const restoredMetrics = JSON.parse(dockerPsql(metricsSql, { tuples: true }));
  const sourceSummary = JSON.parse((await readFile(path.join(backup, "source-summary.private.json"), "utf8")).trim());
  if (JSON.stringify(restoredMetrics) !== JSON.stringify(sourceSummary.metrics)) throw new Error("Restored financial/Auth/Storage metadata metrics differ from source");

  report.complete = true;
  report.metricsEqual = true;
  report.metrics = restoredMetrics;
  report.durationMs = Date.now() - started;
  report.finishedAt = new Date().toISOString();
  report.limits = [
    "The dedicated local stack is retained for review and must be stopped explicitly.",
    "This restores database metadata and rows; Storage object bytes are verified by the separate Storage rehearsal.",
    "Migration application and post-migration compatibility tests are a separate stage.",
  ];
  await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ complete: true, operationalTarget: false, metricsEqual: true, durationMs: report.durationMs }));
} catch (error) {
  report.error = String(error?.message ?? error);
  report.durationMs = Date.now() - started;
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  throw error;
}
