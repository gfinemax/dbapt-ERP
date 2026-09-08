// Read-only Supabase Storage backup. Secrets are loaded locally and never written or logged.
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const privateRoot = path.resolve(root, ".tmp-repos");
const requested = process.argv[2] ?? `.tmp-repos/finance-storage-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const output = path.resolve(root, requested);
const relative = path.relative(privateRoot, output);
if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Backup output must be a new directory inside ignored .tmp-repos");
try { await stat(output); throw new Error("Backup output already exists"); } catch (error) { if (error?.code !== "ENOENT") throw error; }

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  try { process.loadEnvFile(path.join(root, ".env.local")); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error("Local Supabase URL and secret key are required");

await mkdir(path.join(output, "objects"), { recursive: true });
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: buckets, error: bucketError } = await db.storage.listBuckets();
if (bucketError) throw new Error(`Storage bucket inventory failed: ${bucketError.message}`);

const manifest = {
  complete: false,
  createdAt: new Date().toISOString(),
  projectHost: new URL(url).host,
  readOnly: true,
  buckets: [],
  totals: { buckets: 0, objects: 0, bytes: 0 },
  limits: [
    "This archive contains Storage objects and a private path manifest, not database rows or a PostgreSQL backup.",
    "A restore to an isolated Storage service must be verified separately before operational use.",
  ],
};

async function listObjects(bucketId, prefix = "", seen = new Set()) {
  const objects = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(bucketId).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Storage inventory failed for one bucket: ${error.message}`);
    for (const entry of data ?? []) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!entry.name || entry.name === "." || entry.name === ".." || entry.name.includes("/") || seen.has(objectPath)) throw new Error("Unsafe or duplicate Storage object path");
      seen.add(objectPath);
      if (entry.id) objects.push({ path: objectPath, metadata: entry.metadata ?? null });
      else objects.push(...await listObjects(bucketId, objectPath, seen));
    }
    if ((data ?? []).length < 100) break;
  }
  return objects;
}

for (const bucket of [...(buckets ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
  const entries = await listObjects(bucket.id);
  const saved = [];
  for (const entry of entries.sort((a, b) => a.path.localeCompare(b.path))) {
    const { data, error } = await db.storage.from(bucket.id).download(entry.path);
    if (error || !data) throw new Error(`Storage object download failed: ${error?.message ?? "empty response"}`);
    const bytes = Buffer.from(await data.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const stored = path.join("objects", sha256.slice(0, 2), `${sha256}.bin`);
    const absolute = path.join(output, stored);
    await mkdir(path.dirname(absolute), { recursive: true });
    try {
      const existing = await readFile(absolute);
      if (!existing.equals(bytes)) throw new Error("Hash collision in local backup");
    } catch (error) {
      if (error?.code === "ENOENT") await writeFile(absolute, bytes, { flag: "wx" });
      else throw error;
    }
    saved.push({ path: entry.path, bytes: bytes.length, sha256, stored: stored.replaceAll("\\", "/"), contentType: entry.metadata?.mimetype ?? null });
    manifest.totals.objects += 1;
    manifest.totals.bytes += bytes.length;
  }
  manifest.buckets.push({ id: bucket.id, name: bucket.name, public: bucket.public, fileSizeLimit: bucket.file_size_limit ?? null, allowedMimeTypes: bucket.allowed_mime_types ?? null, objects: saved });
}

for (const bucket of manifest.buckets) for (const object of bucket.objects) {
  const bytes = await readFile(path.join(output, object.stored));
  if (bytes.length !== object.bytes || createHash("sha256").update(bytes).digest("hex") !== object.sha256) throw new Error("Local Storage backup verification failed");
}
manifest.totals.buckets = manifest.buckets.length;
manifest.complete = true;
await writeFile(path.join(output, "manifest.private.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
console.log(JSON.stringify({ complete: true, buckets: manifest.totals.buckets, objects: manifest.totals.objects, bytes: manifest.totals.bytes, output: path.relative(root, output) }));
