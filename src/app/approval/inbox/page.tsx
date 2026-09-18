import Link from "next/link";
import { ErpShell } from "@/components/erp-shell";
import { requireReimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { koreaDate } from "@/features/finance/reimbursement-domain";
import { listApprovalDocuments } from "@/features/approval/approval-repository";
import { listExpenseResolutionsFromSupabase } from "@/features/finance/expense-resolution-repository";
import { loadSmallExpenseWorkspace } from "@/features/approval/small-expense-repository";
import { SmallExpensePage } from "@/features/approval/small-expense-page";
import { ExpenseApprovalInboxPage } from "@/features/finance/expense-approval-inbox-page";
import { transitionExpenseApprovalAction } from "@/app/finance/expense-resolutions/actions";
import { documentInboxTasks } from "@/features/approval/unified-inbox-model";
import { loadSmallExpenseInbox } from "@/features/approval/small-expense-inbox";

export const dynamic = "force-dynamic";
const tabs = [["all", "전체 확인대기"], ["general", "기안"], ["expense", "지출결의"], ["small", "소액지출 확인"]];
const box = "rounded-2xl border border-slate-200 bg-white p-5";

export default async function Page({ searchParams }: { searchParams: Promise<{ type?: string; month?: string; id?: string }> }) {
  const query = await searchParams;
  const type = tabs.some(([key]) => key === query.type) ? query.type! : "all";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month ?? "") ? query.month! : koreaDate().slice(0, 7);
  let viewer;
  try { viewer = await requireReimbursementIdentity(); }
  catch (error) { return <ReimbursementLogin title="통합 결재함" description="본인 계정으로 로그인해줘." error={error instanceof Error ? error.message : "로그인이 필요해."} />; }
  const canReadDocuments = viewer.permissions.some(p => ["ADMIN", "APPROVE", "PAY"].includes(p));
  const results = await Promise.allSettled([
    canReadDocuments && ["all", "general"].includes(type) ? listApprovalDocuments(viewer.organization_id) : Promise.resolve([]),
    canReadDocuments && ["all", "expense"].includes(type) ? listExpenseResolutionsFromSupabase().then(rows => { if (!rows) throw new Error("지출결의 저장소 연결이 필요해."); return rows; }) : Promise.resolve([]),
    type === "all" ? loadSmallExpenseInbox(viewer) : Promise.resolve([]),
    type === "small" ? loadSmallExpenseWorkspace(viewer, month) : Promise.resolve(null),
  ]);
  const labels = ["기안", "지출결의", "소액지출 확인대기", "소액지출"];
  const errors = results.flatMap((r, i) => r.status === "rejected" ? [`${labels[i]}: ${r.reason instanceof Error ? r.reason.message : "조회하지 못했어."}`] : []);
  const documents = results[0].status === "fulfilled" ? results[0].value : [];
  const resolutions = results[1].status === "fulfilled" ? results[1].value : [];
  const smallTasks = results[2].status === "fulfilled" ? results[2].value : [];
  const smallWorkspace = results[3].status === "fulfilled" ? results[3].value : null;
  const tasks = [...documentInboxTasks(viewer, documents, resolutions), ...smallTasks];
  return <ErpShell userLabel={viewer.display_name} activeLabel="기안·결재" activeDetailLabel="통합 결재함"><main className="mx-auto max-w-[1480px] space-y-5">
    <header className={box}><h1 className="text-3xl font-bold">통합 결재함</h1><p className="mt-2 text-sm text-slate-600">내가 확인할 기안·지출결의·소액지출을 모았어. 지출 등록과 보완은 지출관리에서 진행해줘.</p><div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-blue-700"><Link href="/approval">기안 목록·이력</Link><Link href="/finance/expenses">지출관리</Link><Link href="/finance/expenses/small">소액지출 등록·보완</Link></div></header>
    <nav aria-label="결재 유형" className="flex flex-wrap gap-2">{tabs.map(([key, label]) => <Link aria-current={type === key ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold ${type === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} key={key} href={`/approval/inbox?${new URLSearchParams({ type: key, ...(key === "small" ? { month } : {}) })}`}>{label}</Link>)}</nav>
    {errors.map(error => <p key={error} role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">{error}</p>)}
    {!canReadDocuments && ["general", "expense"].includes(type) ? <p className={box}>기안·지출결의 조회 권한이 필요해. 소액지출은 지정된 담당자 권한으로 확인할 수 있어.</p> : null}
    {["all", "general"].includes(type) && <section className={box}><h2 className="text-lg font-bold">내 확인대기 {errors.length ? "· 조회된 내역" : `· ${tasks.length}건`}</h2>{tasks.length ? <ul className="mt-3 divide-y divide-slate-100">{tasks.map(task => <li key={task.key}><Link className="flex flex-wrap items-center justify-between gap-3 rounded-lg py-4 hover:bg-slate-50" href={task.href}><div><p className="text-xs text-slate-500">{task.label}</p><p className="mt-1 font-semibold">{task.title}</p></div><span className="text-sm tabular-nums">{task.amount.toLocaleString("ko-KR")}원 →</span></Link></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">{errors.length ? "일부 내역을 조회하지 못했어. 위 안내를 확인해줘." : "현재 내 계정에 배정된 확인대기가 없어."}</p>}</section>}
    {type === "expense" && canReadDocuments && results[1].status === "fulfilled" && <ExpenseApprovalInboxPage key={resolutions.map(r => `${r.id}:${r.authorization?.version}:${r.approvalStatus}`).join(",") + query.id} embedded viewer={viewer} initialResolutions={resolutions} initialDetailId={query.id} transitionApproval={transitionExpenseApprovalAction} />}
    {type === "small" && smallWorkspace && <SmallExpensePage key={`${month}:${smallWorkspace.rows.map(r => `${r.id}:${r.revision}`).join(",")}`} workspace={smallWorkspace} mode="review" />}
  </main></ErpShell>;
}
