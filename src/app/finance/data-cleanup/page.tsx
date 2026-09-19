import { ErpShell } from "@/components/erp-shell";
import { loadDataCleanupWorkspace } from "@/features/finance/data-cleanup";
import { DataCleanupPage } from "@/features/finance/data-cleanup-page";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  let member; let workspace; let message;
  try { member = await reimbursementIdentity(); if (member) workspace = await loadDataCleanupWorkspace(); }
  catch (error) { message = error instanceof Error ? error.message : "기존 자료 점검 항목을 불러오지 못했어."; }
  const content = workspace ? <DataCleanupPage workspace={workspace} />
    : member ? <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">기존 자료 정리</h1><p className="mt-3" role="alert">{message}</p></section>
      : <ReimbursementLogin error={message} title="기존 자료 정리" description="조합의 기존 원본을 점검하려면 회계·자금 계정으로 로그인해줘." />;
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="기존 자료 정리"><div className="mx-auto max-w-7xl">{content}</div></ErpShell>;
}
