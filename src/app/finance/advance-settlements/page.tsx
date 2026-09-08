import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { loadAdvanceSettlements } from "@/features/finance/advance-settlement-repository";
import { AdvanceSettlementPage } from "@/features/finance/advance-settlement-page";
import { reimbursementLogout } from "../reimbursements/actions";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const query = await searchParams; let member; let workspace; let message;
  try { member = await reimbursementIdentity(); if (member) workspace = await loadAdvanceSettlements(); } catch (error) { message = error instanceof Error ? error.message : "선지급 정산 자료를 불러오지 못했어."; }
  const content = workspace ? <AdvanceSettlementPage key={query.draft ?? ""} workspace={workspace} initialDraftId={query.draft} /> : member ? <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">담당자 선지급 정산</h1><p role="alert" className="mt-3">{message}</p></section> : <ReimbursementLogin title="담당자 선지급 정산" description="담당자 권한을 확인하기 위해 본인 계정으로 로그인해줘." error={message} />;
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="대납·선지급 정산"><div className="mx-auto max-w-7xl">{content}</div></ErpShell>;
}
