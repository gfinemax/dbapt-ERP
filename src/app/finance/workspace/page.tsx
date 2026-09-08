import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { loadFinanceTaskWorkspace } from "@/features/finance/finance-workspace-repository";
import { FinanceWorkspacePage } from "@/features/finance/finance-workspace-page";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const query = await searchParams; let member; let workspace; let message;
  try { member = await reimbursementIdentity(); if (member) workspace = await loadFinanceTaskWorkspace(); } catch (error) { message = error instanceof Error ? error.message : "업무 자료를 불러오지 못했어."; }
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="업무현황"><div className="mx-auto max-w-7xl">{workspace ? <FinanceWorkspacePage key={query.task} workspace={workspace} initialTask={query.task} /> : member ? <p role="alert">{message}</p> : <ReimbursementLogin error={message} title="업무현황" description="본인 계정으로 로그인해줘." />}</div></ErpShell>;
}
