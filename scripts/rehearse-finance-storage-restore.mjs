// Restores a private backup into temporary buckets on an explicitly local Supabase target.
import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const root = await realpath(process.cwd());
const privateRoot = await realpath(path.join(root, ".tmp-repos"));
const [backupArg, envArg] = process.argv.slice(2);
if (!backupArg || !envArg) throw new Error("Usage: node scripts/rehearse-finance-storage-restore.mjs .tmp-repos/backup .tmp-repos/local-target.env");
const backup = await realpath(path.resolve(root, backupArg));
const targetEnv = await realpath(path.resolve(root, envArg));
for (const candidate of [backup, targetEnv]) {
  const relative = path.relative(privateRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Inputs must stay inside ignored .tmp-repos");
}

process.loadEnvFile(targetEnv);
const targetUrl = process.env.API_URL?.trim();
const targetKey = process.env.SERVICE_ROLE_KEY?.trim() || process.env.SECRET_KEY?.trim();
if (!targetUrl || !targetKey) throw new Error("Local target API URL and service key are required");
const parsedUrl = new URL(targetUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname)) throw new Error("Storage restore rehearsal target must be local");

const manifest = JSON.parse(await readFile(path.join(backup, "manifest.private.json"), "utf8"));
if (!manifest.complete || !manifest.readOnly || !Array.isArray(manifest.buckets)) throw new Error("Completed read-only Storage backup manifest required");
if (manifest.projectHost === parsedUrl.host) throw new Error("Source and restore target must differ");
const target = createClient(targetUrl, targetKey, { auth: { autoRefreshToken: false, persistSession: false } });
const run = randomUUID().replaceAll("-", "").slice(0, 12);
const created = [];
const report = { complete: false, operationalTarget: false, localTarget: parsedUrl.host, sourceHost: manifest.projectHost, buckets: [], totals: { objects: 0, bytes: 0 }, cleanupComplete: false };

try {
  for (const [index, sourceBucket] of manifest.buckets.entries()) {
    const bucketId = `restore-rehearsal-${run}-${index}`;
    if (!/^restore-rehearsal-[a-f0-9]{12}-\d+$/.test(bucketId)) throw new Error("Unsafe temporary bucket ID");
    const { error: createError } = await target.storage.createBucket(bucketId, {
      public: Boolean(sourceBucket.public),
      fileSizeLimit: sourceBucket.fileSizeLimit ?? undefined,
      allowedMimeTypes: sourceBucket.allowedMimeTypes ?? undefined,
    });
    if (createError) throw new Error(`Temporary bucket creation failed: ${createError.message}`);
    created.push(bucketId);
    let objects = 0, bytes = 0;
    for (const object of sourceBucket.objects ?? []) {
      const payload = await readFile(path.join(backup, object.stored));
      const beforeHash = createHash("sha256").update(payload).digest("hex");
      if (beforeHash !== object.sha256 || payload.length !== object.bytes) throw new Error("Backup object verification failed before restore");
      const { error: uploadError } = await target.storage.from(bucketId).upload(object.path, payload, { contentType: object.contentType ?? undefined, upsert: false });
      if (uploadError) throw new Error(`Temporary object restore failed: ${uploadError.message}`);
      const { data, error: downloadError } = await target.storage.from(bucketId).download(object.path);
      if (downloadError || !data) throw new Error(`Restored object read failed: ${downloadError?.message ?? "empty response"}`);
      const restored = Buffer.from(await data.arrayBuffer());
      if (restored.length !== object.bytes || createHash("sha256").update(restored).digest("hex") !== object.sha256) throw new Error("Restored object hash mismatch");
      objects += 1; bytes += restored.length;
    }
    report.buckets.push({ sourceBucket: sourceBucket.id, temporaryBucket: bucketId, objects, bytes });
    report.totals.objects += objects; report.totals.bytes += bytes;
  }
  report.complete = true;
} finally {
  let cleanupError = null;
  for (const bucketId of created.reverse()) {
    if (!bucketId.startsWith(`restore-rehearsal-${run}-`)) throw new Error("Refusing to clean an unowned bucket");
    const emptied = await target.storage.emptyBucket(bucketId);
    if (emptied.error) { cleanupError ??= emptied.error.message; continue; }
    const removed = await target.storage.deleteBucket(bucketId);
    if (removed.error) cleanupError ??= removed.error.message;
  }
  report.cleanupComplete = !cleanupError;
  report.cleanupError = cleanupError;
  report.finishedAt = new Date().toISOString();
  report.limits = ["Temporary target buckets were deleted after verification.", "This verifies Storage object upload/download, not PostgreSQL or operational project restoration."];
  await writeFile(path.join(backup, "restore-rehearsal.private.json"), JSON.stringify(report, null, 2), { flag: "wx" });
  if (cleanupError) throw new Error(`Temporary Storage cleanup failed: ${cleanupError}`);
}
console.log(JSON.stringify({ complete: report.complete, cleanupComplete: report.cleanupComplete, objects: report.totals.objects, bytes: report.totals.bytes }));
