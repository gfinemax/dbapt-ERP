// Offline report preparation only: no credentials, network, SQL execution or account matching.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateRoot = path.join(root, '.tmp-repos');
function privatePath(value) {
  const resolved = path.resolve(root, value);
  const relative = path.relative(privateRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Reports must remain inside ignored .tmp-repos');
  return resolved;
}
const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw Error('Usage: node scripts/prepare-finance-release-report.mjs .tmp-repos/inventory.json .tmp-repos/release-review');
const input = JSON.parse(await readFile(privatePath(inputArg), 'utf8'));
const output = privatePath(outputArg);
if (!input.checkedAt || !Array.isArray(input.migrations) || !Array.isArray(input.inventory?.expenses)) throw Error('Invalid inventory');
await mkdir(output, { recursive: true });
const remote = new Map(input.migrations.map(m => [m.name, m.version]));
const latest = input.migrations.map(m => m.version).sort().at(-1) ?? '';
const comparison = [];
for (const file of (await readdir(path.join(root, 'supabase/migrations'))).filter(f => f.endsWith('.sql')).sort()) {
  const [, version, name] = file.match(/^(\d+)_(.+)\.sql$/) ?? [];
  if (!version) throw Error('Unexpected migration filename');
  const bytes = await readFile(path.join(root, 'supabase/migrations', file));
  comparison.push({ file, version, name, remoteVersion: remote.get(name) ?? '', sha256: createHash('sha256').update(bytes).digest('hex'), classification:
    remote.get(name) === version ? 'VERSION_MATCH' : remote.has(name) ? 'NAME_MATCH_VERSION_DIFF_REVIEW' : version > latest ? 'PENDING_CANDIDATE' : 'HISTORICAL_REVIEW' });
}
// A matching name/version is an inventory match, never proof of SQL equivalence or permission to replay.
const pending = comparison.filter(m => m.classification === 'PENDING_CANDIDATE');
const csvCell = value => {
  let s = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};
async function csv(name, headers, rows) {
  await writeFile(path.join(output, name), '\ufeff' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n');
}
const headers = ['원본종류','원본ID','문서번호','조직UUID','원본상태','구분','순번','기존표시','기존UUID','확인할UUID','확인근거','검토자','검토일','처리구분'];
const expenseRows = [];
for (const e of input.inventory.expenses) {
  expenseRows.push(['지출결의', e.id,e.number,e.organization_id,e.approval_status,'작성자','',e.author_label,'','','','','','관리자 확인 전 연결 금지']);
  for (const [index,s] of (e.approval_line ?? []).entries()) expenseRows.push(['지출결의',e.id,e.number,e.organization_id,e.approval_status,'결재자',index+1,`${s.approver} ${s.role}`,'','','','','','관리자 확인 전 연결 금지']);
}
const historyRows = [];
for (const d of input.inventory.approval_documents ?? []) {
  historyRows.push(['기안',d.id,d.number,d.organization_id,d.status,'기안자','',d.drafter_label,d.drafter_id,'','','','','기존 승인 이력 보존 · 소급 서명 금지']);
  for (const s of d.steps ?? []) historyRows.push(['기안',d.id,d.number,d.organization_id,d.status,'결재자',s.order,`${s.label} ${s.role}`,s.approver_id,'','','','','기존 승인 이력 보존 · 소급 서명 금지']);
}
await csv('expense-account-review.csv',headers,expenseRows);
await csv('approval-history-review.csv',headers,historyRows);
await csv('available-accounts.csv',['계정UUID','조직UUID','표시이름','권한','활성','Auth존재','프로필존재'],(input.inventory.members ?? []).map(m=>[m.user_id,m.organization_id,m.display_name,(m.permissions??[]).join('|'),m.active,m.auth_exists,m.profile_exists]));
await csv('migration-comparison.csv',['로컬파일','운영버전','분류','로컬SHA256'],comparison.map(m=>[m.file,m.remoteVersion,m.classification,m.sha256]));
const report = { checkedAt: input.checkedAt, latestRemoteVersion: latest, comparison, remoteOnly: input.migrations.filter(m=>!comparison.some(c=>c.name===m.name)), pending, expenseDocuments: input.inventory.expenses.length, expenseReviewRows: expenseRows.length, historicalReviewRows: historyRows.length, executionAuthorized: false };
await writeFile(path.join(output,'release-manifest.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pendingCandidates:pending.length,expenseDocuments:report.expenseDocuments,expenseReviewRows:expenseRows.length,historicalReviewRows:historyRows.length,output:path.relative(root,output),executionAuthorized:false}));
