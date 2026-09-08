import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { loadAccountingWorkspace } from "@/features/finance/accounting-workspace-repository";
import { AccountingWorkspacePage } from "@/features/finance/accounting-workspace-page";
import { reimbursementLogout } from "./reimbursements/actions";

export const dynamic = "force-dynamic";
export default async function FinanceRoute({ searchParams }: { searchParams: Promise<{ voucherId?: string }> }) {
  const query = await searchParams;
  let member; let workspace; let message;
  try {
    member = await reimbursementIdentity();
    if (member) workspace = await loadAccountingWorkspace();
  } catch (error) { message = error instanceof Error ? error.message : "전표 자료를 불러오지 못했어."; }
  const content = workspace ? <AccountingWorkspacePage key={query.voucherId ?? ""} workspace={workspace} initialVoucherId={query.voucherId} />
    : member ? <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">수입·지출 전표관리</h1><p role="alert" className="mt-3">{message}</p></section>
      : <ReimbursementLogin error={message} title="수입·지출 전표관리" description="조합의 전표와 회계 담당 권한을 확인하기 위해 본인 계정으로 로그인해줘." />;
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="수입·지출 전표관리"><div className="mx-auto max-w-7xl">{content}</div></ErpShell>;
}
