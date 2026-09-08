import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { loadFundTrust } from "@/features/finance/fund-trust-repository";
import { FundTrustSettingsPage } from "@/features/finance/fund-trust-settings-page";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  let member; let workspace; let message;
  try { member = await reimbursementIdentity(); if (member) workspace = await loadFundTrust(); }
  catch (error) { message = error instanceof Error ? error.message : "설정 자료를 불러오지 못했어."; }
  const content = workspace ? <FundTrustSettingsPage workspace={workspace} />
    : member ? <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">지출·신탁 설정</h1><p className="mt-3" role="alert">{message}</p></section>
      : <ReimbursementLogin error={message} title="지출·신탁 설정" description="조합의 지출 기준과 신탁 계약을 확인하려면 본인 계정으로 로그인해줘." />;
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="지출·신탁 설정"><div className="mx-auto max-w-7xl">{content}</div></ErpShell>;
}
