import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { loadPaymentWorkspace } from "@/features/finance/fund-payment-repository";
import { loadFundTrust } from "@/features/finance/fund-trust-repository";
import { loadExpenseWorkspace } from "@/features/finance/expense-workspace-repository";
import { FundPaymentPage } from "@/features/finance/fund-payment-page";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const query = await searchParams;
  let member; let workspace; let trust; let message; let legacyRecords; let legacyError;
  try {
    member = await reimbursementIdentity();
    if (member) [workspace, trust] = await Promise.all([loadPaymentWorkspace(), loadFundTrust()]);
    if (workspace) { try { legacyRecords = (await loadExpenseWorkspace()).records; } catch { legacyError = "기존 원본 목록을 불러오지 못했어. 새로고침해서 다시 확인해줘."; } }
  } catch (error) { message = error instanceof Error ? error.message : "지급 자료를 불러오지 못했어."; }
  const content = workspace && trust ? <FundPaymentPage key={`${query.tab ?? "ALL"}:${query.q ?? ""}`} workspace={workspace} trust={trust} initialTab={query.tab} initialSearch={query.q} legacyRecords={legacyRecords} legacyError={legacyError} />
    : member ? <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">지급관리</h1><p role="alert" className="mt-3">{message}</p></section>
      : <ReimbursementLogin error={message} title="지급관리" description="지급 담당자와 조회 권한을 확인하기 위해 본인 계정으로 로그인해줘." />;
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="지급관리"><div className="mx-auto max-w-7xl">{content}</div></ErpShell>;
}
