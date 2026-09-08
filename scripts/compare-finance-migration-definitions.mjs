// Offline, read-only comparison of previously collected catalog/history JSON.
// No network client, credentials, SQL execution, migration repair or DB writes.
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = await realpath(process.cwd());
const privateRoot = await realpath(path.join(root, '.tmp-repos'));
async function input(relative) {
  const resolved = await realpath(path.resolve(root, relative));
  if (!resolved.startsWith(privateRoot + path.sep)) throw new Error('Input must stay inside ignored .tmp-repos');
  return JSON.parse(await readFile(resolved, 'utf8'));
}
// A conservative lexical comparison, not a general SQL equivalence proof.
// Preserve quoted values/identifiers; remove whitespace and SQL comments.
function tokens(sql = '') {
  return (sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9$]*|\d+(?:\.\d+)?|[^\s]/g) ?? [])
    .filter(t => !t.startsWith('--') && !t.startsWith('/*')).join(' ');
}
const sha = text => createHash('sha256').update(text).digest('hex');
const args = process.argv.slice(2);
if (args.length !== 5) throw new Error('Usage: node scripts/compare-finance-migration-definitions.mjs history.json remote-catalog.json local-catalog.json remote-details.json local-details.json');
const [history, remote, local, remoteDetails, localDetails] = await Promise.all(args.map(input));
const files = await readdir(path.join(root, 'supabase/migrations'));
const mappings = [];
for (const migration of history) {
  const file = files.find(f => f.endsWith(`_${migration.name}.sql`));
  if (!file) { mappings.push({ name: migration.name, remoteVersion: migration.version, result: 'REMOTE_ONLY_HISTORY' }); continue; }
  const localSql = await readFile(path.join(root, 'supabase/migrations', file), 'utf8');
  const remoteSql = migration.statements.join('\n');
  mappings.push({ name: migration.name, localVersion: file.slice(0, 14), remoteVersion: migration.version,
    result: tokens(localSql) === tokens(remoteSql) ? 'TOKEN_EQUAL' : 'SQL_DIFFERENCE',
    localSha256: sha(localSql), remoteSha256: sha(remoteSql) });
}
function compare(left, right, key, definition) {
  const lm = new Map(left.map(o => [key(o), o])), rm = new Map(right.map(o => [key(o), o]));
  const differences = [];
  for (const [id, value] of lm) {
    if (!rm.has(id)) differences.push({ object: id, result: 'LOCAL_ONLY' });
    else if (definition(value) !== definition(rm.get(id))) differences.push({ object: id, result: 'DEFINITION_DIFFERENCE' });
  }
  for (const id of rm.keys()) if (!lm.has(id)) differences.push({ object: id, result: 'REMOTE_ONLY' });
  return { localCount: left.length, remoteCount: right.length, differences };
}
const identity = o => [o.schema, o.table, o.name, o.identity].filter(Boolean).join('.');
const stable = value => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
const catalog = {};
for (const kind of ['functions', 'indexes', 'constraints']) catalog[kind] = compare(local[kind], remote[kind], identity, o => tokens(o.definition));
catalog.functionPermissions = compare(local.functions, remote.functions, identity, o => o.acl);
catalog.tableRls = compare(local.tables, remote.tables, identity, o => o.rls);
for (const kind of ['columns', 'triggers']) catalog[kind] = compare(localDetails[kind], remoteDetails[kind], identity, stable);
catalog.tablePrivileges = compare(localDetails.privileges, remoteDetails.privileges,
  o => [o.schema, o.table, o.role, o.privilege].join('.'), () => true);
console.log(JSON.stringify({ mappings, catalog, limits: [
  'SQL token equality is lexical evidence; execution order and historical data effects require separate review.',
  'Catalog evidence covers finance/approval plus the explicitly collected business_partners object.',
  'Only input snapshots are read. No operational connection or mutation occurs.'
] }, null, 2));
