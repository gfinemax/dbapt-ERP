// Restore the single missing prerequisite without rewriting older migration history.
import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const project = "takwoubezzhxtjvxecpx";
const [envArg, backupArg, confirmation] = process.argv.slice(2);
assert(envArg && backupArg && confirmation === `--confirm-project=${project}`, "Explicit project and fresh backup required");
const privateRoot = await realpath(".tmp-repos");
const envFile = await realpath(envArg);
const backup = await realpath(backupArg);
for (const value of [envFile, backup]) {
  const relative = path.relative(privateRoot, value);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Private files must stay in .tmp-repos");
}
const manifest = JSON.parse(await readFile(path.join(backup, "manifest.private.json"), "utf8"));
assert(manifest.complete && manifest.operationalSource, "Completed operational backup required");
const age = Date.now() - Date.parse(manifest.finishedAt);
assert(age >= 0 && age < 30 * 60 * 1000, "Backup must be less than 30 minutes old");
process.loadEnvFile(envFile);
const source = new URL(process.env.DBAPT_BACKUP_SOURCE_URL);
assert(["postgres:", "postgresql:"].includes(source.protocol) && source.hostname.endsWith(".supabase.com"));
assert(source.hostname.includes(project) || decodeURIComponent(source.username).endsWith(`.${project}`));
assert(source.pathname === "/postgres" && source.password);
const env = { ...process.env, PGHOST: source.hostname, PGPORT: source.port || "5432", PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password), PGDATABASE: "postgres", PGSSLMODE: "require" };
delete env.DBAPT_BACKUP_SOURCE_URL;
function sql(query) {
  const r = spawnSync("docker", ["run", "--rm", "-i", ...["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSSLMODE"].flatMap(k => ["-e", k]),
    "postgres:17", "psql", "--no-password", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, encoding: "utf8", env, windowsHide: true });
  assert.equal(r.status, 0, String(r.stderr).replaceAll(decodeURIComponent(source.password), "[redacted]"));
  return r.stdout.trim();
}
const migration = await readFile("supabase/migrations/20260906234558_small_expense_chair_confirmation.sql", "utf8");
const tests = await readFile("supabase/tests/small_expense_confirmation.sql", "utf8");
const preflight = JSON.parse(sql(`select json_build_object('missing',to_regclass('approval.small_expense_roles') is null,
  'sources',(select count(*) from approval.small_expenses),
  'applied',exists(select 1 from supabase_migrations.schema_migrations where version='20260906234558'));`));
assert(preflight.missing && !preflight.applied && preflight.sources === 0, "Unexpected prerequisite state; do not overwrite existing work");
sql(`begin; set local lock_timeout='3s'; set local statement_timeout='30s'; ${migration}\n${tests}\nrollback;`);
console.log("PASS: small expense registration, review, evidence, transaction, budget, and authorization rollback suite");
const snapshot = `jsonb_build_object(
 'quick',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from finance.quick_expense_records t),
 'resolutions',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from finance.expense_resolutions t),
 'objects',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from storage.objects t))`;
// The advisory lock, preservation assertion, DDL, and exact historical version commit together.
const escaped = migration.replaceAll("'", "''");
sql(`begin; set local lock_timeout='3s'; set local statement_timeout='30s';
 select pg_advisory_xact_lock(739,20260919);
 create temporary table small_expense_before on commit drop as select ${snapshot} as fingerprint;
 ${migration}
 do $$ begin
 if (select fingerprint from small_expense_before) is distinct from ${snapshot} then raise exception 'Existing source or evidence changed'; end if;
 end $$;
 insert into supabase_migrations.schema_migrations(version,name,statements)
 values('20260906234558','small_expense_chair_confirmation',array['${escaped}']);
 notify pgrst,'reload schema';
 commit;`);
console.log("APPLIED: 20260906234558; existing expense and evidence fingerprints preserved; no real account roles assigned");
