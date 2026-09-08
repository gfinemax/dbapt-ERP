import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { loadFundTrust } from "@/features/finance/fund-trust-repository";
import { loadFundWorkflow } from "@/features/finance/fund-workflow-repository";
import { loadFundSourceOptions } from "@/features/finance/fund-source-options";
import { FundTrustPage } from "@/features/finance/fund-trust-page";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; request?: string }> }) {
  const query = await searchParams;
  let member; let workspace; let workflow; let sources; let message;
  try {
    member = await reimbursementIdentity();
    if (member) [workspace, workflow, sources] = await Promise.all([loadFundTrust(), loadFundWorkflow(), loadFundSourceOptions()]);
  } catch (error) { message = error instanceof Error ? error.message : "신탁 자료를 불러오지 못했어."; }
  const content = workspace && workflow && sources ? <FundTrustPage key={`${query.status ?? "ALL"}:${query.request ?? ""}`} workspace={workspace} workflow={workflow} sources={sources} initialStatus={query.status} initialRequestId={query.request} />
    : member ? <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">신탁 집행관리</h1><p className="mt-3" role="alert">{message}</p></section>
      : <ReimbursementLogin error={message} title="신탁 집행관리" description="신탁 요청·회신의 담당자와 권한을 확인하기 위해 본인 계정으로 로그인해줘." />;
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="신탁 집행관리"><div className="mx-auto max-w-7xl">{content}</div></ErpShell>;
}
