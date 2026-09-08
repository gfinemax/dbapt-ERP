// Read-only logical backup for the dbapt ERP Supabase database.
// The connection URL is loaded from an ignored env file and never passed as a process argument.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = await realpath(process.cwd());
const privateRoot = path.join(root, ".tmp-repos");
const [envArg, outputArg] = process.argv.slice(2);
if (!envArg) throw new Error("Usage: node scripts/backup-finance-operational-db.mjs .tmp-repos/finance-operational-db.env [.tmp-repos/output]");

const envFile = await realpath(path.resolve(root, envArg));
const envRelative = path.relative(privateRoot, envFile);
if (!envRelative || envRelative.startsWith("..") || path.isAbsolute(envRelative)) throw new Error("Connection env file must stay inside ignored .tmp-repos");
process.loadEnvFile(envFile);

const connection = process.env.DBAPT_BACKUP_SOURCE_URL?.trim();
if (!connection) throw new Error("DBAPT_BACKUP_SOURCE_URL is required in the private env file");
const source = new URL(connection);
if (!["postgres:", "postgresql:"].includes(source.protocol)) throw new Error("Source must be a PostgreSQL URL");
if (!source.hostname || !source.username || !source.password || !source.pathname.slice(1)) throw new Error("Source URL must include host, user, password, and database");
if (/YOUR-PASSWORD|REPLACE_WITH/i.test(decodeURIComponent(source.password))) throw new Error("Replace the database password placeholder in the private env file before backup");

const projectRef = process.env.DBAPT_BACKUP_PROJECT_REF?.trim() || "takwoubezzhxtjvxecpx";
if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("DBAPT_BACKUP_PROJECT_REF must be a 20-character Supabase project ref");
const localHost = ["127.0.0.1", "localhost", "::1"].includes(source.hostname);
const allowLocal = process.env.DBAPT_BACKUP_ALLOW_LOCAL_SOURCE === "true";
const refMatches = source.hostname.includes(projectRef) || decodeURIComponent(source.username).endsWith(`.${projectRef}`);
if (localHost ? !allowLocal : !refMatches) throw new Error("Source URL does not match the expected Supabase project");
if (!localHost && !source.hostname.endsWith(".supabase.com")) throw new Error("Operational source host must be a Supabase host");
if (!localHost && source.pathname !== "/postgres") throw new Error("Operational source database must be postgres");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const requested = outputArg ?? `.tmp-repos/finance-operational-db-backup-${stamp}-${randomUUID().slice(0, 8)}`;
const output = path.resolve(root, requested);
const outputRelative = path.relative(privateRoot, output);
if (!outputRelative || outputRelative.startsWith("..") || path.isAbsolute(outputRelative)) throw new Error("Backup output must be a new directory inside ignored .tmp-repos");
try { await stat(output); throw new Error("Backup output already exists"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
await mkdir(output, { recursive: false });

const report = {
  complete: false,
  createdAt: new Date().toISOString(),
  readOnlySource: true,
  operationalSource: !localHost,
  projectRef,
  sourceHost: source.hostname,
  sourceDatabase: source.pathname.slice(1),
  format: "Supabase CLI-compatible roles/schema/data SQL plus migration history",
  files: [],
  consistency: "Data is one pg_dump snapshot; roles, schema, history, and data are separate commands. Use a write freeze for a release backup.",
  limits: [
    "Storage object bytes are not included; use the separate Storage backup.",
    "Auth, Storage, Realtime, Edge Function, API key, and platform settings may require separate restore steps.",
    "A backup is not accepted for release until an isolated restore and data/reference comparison pass.",
  ],
};

try {
  const childEnv = { ...process.env,
    PGHOST: localHost ? "host.docker.internal" : source.hostname,
    PGPORT: source.port || "5432",
    PGUSER: decodeURIComponent(source.username),
    PGPASSWORD: decodeURIComponent(source.password),
    PGDATABASE: source.pathname.slice(1),
    PGSSLMODE: localHost ? "prefer" : "require",
  };
  delete childEnv.DBAPT_BACKUP_SOURCE_URL;
  const result = spawnSync("docker", [
    "run", "--rm",
    "-e", "PGHOST", "-e", "PGPORT", "-e", "PGUSER", "-e", "PGPASSWORD", "-e", "PGDATABASE", "-e", "PGSSLMODE",
    "-v", `${root.replaceAll("\\", "/")}:/workspace:ro`,
    "-v", `${output.replaceAll("\\", "/")}:/backup`,
    "postgres:17", "bash", "/workspace/scripts/lib/finance-operational-db-dump.sh",
  ], { cwd: root, env: childEnv, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Database dump failed: ${String(result.stderr || result.stdout).slice(-2000)}`);

  for (const name of ["roles.sql", "schema.sql", "data.sql", "history_schema.sql", "history_data.sql", "source-summary.private.json"]) {
    const bytes = await readFile(path.join(output, name));
    if (bytes.length === 0) throw new Error(`Backup file is empty: ${name}`);
    report.files.push({ name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const summary = JSON.parse((await readFile(path.join(output, "source-summary.private.json"), "utf8")).trim());
  report.serverVersion = summary.serverVersion;
  report.sourceCapturedAt = summary.capturedAt;
  report.complete = true;
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, "manifest.private.json"), JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ complete: true, operationalSource: report.operationalSource, files: report.files.length, bytes: report.files.reduce((sum, file) => sum + file.bytes, 0), output: path.relative(root, output) }));
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.error = String(error?.message ?? error).replaceAll(connection, "[REDACTED]");
  await writeFile(path.join(output, "manifest.private.json"), JSON.stringify(report, null, 2));
  throw error;
}
