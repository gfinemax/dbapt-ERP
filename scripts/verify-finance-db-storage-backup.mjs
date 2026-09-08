// Verifies restored database Storage references against the separate object backup.
import { createHash } from "node:crypto";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const root = await realpath(process.cwd());
const privateRoot = await realpath(path.join(root, ".tmp-repos"));
const [databaseBackupArg, storageBackupArg, workdirArg] = process.argv.slice(2);
if (!databaseBackupArg || !storageBackupArg || !workdirArg) throw new Error("Usage: node scripts/verify-finance-db-storage-backup.mjs .tmp-repos/db-backup .tmp-repos/storage-backup .tmp-repos/isolated-local-workdir");
const databaseBackup = await realpath(path.resolve(root, databaseBackupArg));
const storageBackup = await realpath(path.resolve(root, storageBackupArg));
const workdir = await realpath(path.resolve(root, workdirArg));
for (const candidate of [databaseBackup, storageBackup, workdir]) {
  const relative = path.relative(privateRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("All inputs must stay inside ignored .tmp-repos");
}

const databaseManifest = JSON.parse(await readFile(path.join(databaseBackup, "manifest.private.json"), "utf8"));
const restoreReport = JSON.parse(await readFile(path.join(databaseBackup, "db-restore-rehearsal.private.json"), "utf8"));
const migrationReport = JSON.parse(await readFile(path.join(databaseBackup, "migration-rehearsal.private.json"), "utf8"));
const storageManifest = JSON.parse(await readFile(path.join(storageBackup, "manifest.private.json"), "utf8"));
if (!databaseManifest.complete || !databaseManifest.operationalSource || !restoreReport.complete || !migrationReport.complete) throw new Error("Completed operational database backup, restore, and migration rehearsal are required");
if (!storageManifest.complete || !storageManifest.readOnly || !Array.isArray(storageManifest.buckets)) throw new Error("Completed read-only Storage backup is required");

const config = await readFile(path.join(workdir, "supabase", "config.toml"), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId || !/^dbapt-finance-restore-[a-z0-9-]+$/.test(projectId)) throw new Error("Target must use a dedicated dbapt-finance-restore-* local project ID");
const listed = spawnSync("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${workdir}`, "--format", "{{.Names}}"], { encoding: "utf8", windowsHide: true });
if (listed.status !== 0) throw new Error("Could not inspect the dedicated local Supabase stack");
const containers = listed.stdout.split(/\r?\n/).map(name => name.trim()).filter(name => name.startsWith("supabase_db_"));
if (containers.length !== 1) throw new Error("Expected exactly one database container for the dedicated local Supabase workdir");
const container = containers[0];

const query = `select coalesce(json_agg(json_build_object(
  'bucketId', bucket_id,
  'path', name,
  'bytes', case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end
) order by bucket_id,name),'[]'::json) from storage.objects`;
const result = spawnSync("docker", ["exec", container, "psql", "--no-psqlrc", "--username", "postgres", "--dbname", "postgres", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", query], { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
if (result.status !== 0) throw new Error(`Storage reference query failed: ${String(result.stderr || result.stdout).slice(-2000)}`);
const databaseObjects = JSON.parse(result.stdout.trim());
const backupObjects = [];
for (const bucket of storageManifest.buckets) {
  for (const object of bucket.objects ?? []) {
    const payload = await readFile(path.join(storageBackup, object.stored));
    assert.equal(payload.length, object.bytes, "Storage backup byte length changed");
    assert.equal(createHash("sha256").update(payload).digest("hex"), object.sha256, "Storage backup object hash changed");
    backupObjects.push({ bucketId: bucket.id, path: object.path, bytes: object.bytes });
  }
}
backupObjects.sort((a, b) => a.bucketId.localeCompare(b.bucketId) || a.path.localeCompare(b.path));
assert.deepEqual(databaseObjects, backupObjects, "Database Storage references differ from the separate object backup");

const reportPath = path.join(databaseBackup, "storage-reference-rehearsal.private.json");
try { await stat(reportPath); throw new Error("Storage reference report already exists for this backup"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
const report = {
  complete: true,
  operationalTarget: false,
  localProjectId: projectId,
  objects: backupObjects.length,
  bytes: backupObjects.reduce((sum, object) => sum + object.bytes, 0),
  databaseReferencesEqual: true,
  objectHashesValid: true,
  verifiedAt: new Date().toISOString(),
  limits: ["Comparison ran against the dedicated local database restore.", "No object was uploaded to or deleted from operational Storage."],
};
await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ complete: true, objects: report.objects, bytes: report.bytes, databaseReferencesEqual: true, objectHashesValid: true }));
