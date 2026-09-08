import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { loadExpenseWorkspace } from "@/features/finance/expense-workspace-repository";
import { ExpenseWorkspacePage } from "@/features/finance/expense-workspace-page";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string; connection?: string; q?: string; source_kind?: string; source_id?: string }> }) {
  const query = await searchParams; let member; let workspace; let message;
  try { member = await reimbursementIdentity(); if (member) workspace = await loadExpenseWorkspace(); } catch (error) { message = error instanceof Error ? error.message : "지출 원본을 불러오지 못했어."; }
  const content = workspace ? <ExpenseWorkspacePage key={JSON.stringify(query)} workspace={workspace} initialKind={query.kind} initialConnection={query.connection} initialSearch={query.q} initialSourceKind={query.source_kind} initialSourceId={query.source_id} />
    : member ? <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">지출관리</h1><p className="mt-3" role="alert">{message}</p></section>
      : <ReimbursementLogin error={message} title="지출관리" description="원본 조회와 연결 권한을 확인하기 위해 본인 계정으로 로그인해줘." />;
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="지출관리"><div className="mx-auto max-w-7xl">{content}</div></ErpShell>;
}
