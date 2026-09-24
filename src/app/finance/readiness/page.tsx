import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { FinanceReadinessPage } from "@/features/finance/finance-readiness-page";
import { loadFinanceReadiness } from "@/features/finance/finance-readiness";
import { ReimbursementLogin } from "@/features/finance/reimbursement-login";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  let member; let readiness; let message;
  try { member = await reimbursementIdentity(); if (member) readiness = await loadFinanceReadiness(); }
  catch (error) { message = error instanceof Error ? error.message : "운영 준비 상태를 불러오지 못했어."; }
  const content = readiness ? <FinanceReadinessPage readiness={readiness} />
    : member ? <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">운영 준비 점검</h1><p className="mt-3" role="alert">{message}</p></section>
      : <ReimbursementLogin error={message} title="운영 준비 점검" description="조합의 설정과 처리 대기를 확인하려면 본인 계정으로 로그인해줘." />;
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="운영 준비 점검"><div className="mx-auto max-w-7xl">{content}</div></ErpShell>;
}
