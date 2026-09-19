import { ErpShell } from "@/components/erp-shell";
import { CollectionLedgerPage } from "@/features/finance/collection-ledger-page";
import { loadCollectionLedger } from "@/features/finance/collection-ledger-repository";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";
export default async function Page() {
  let member; let workspace; let message;
  try { member = await reimbursementIdentity(); if (member) workspace = await loadCollectionLedger(); }
  catch (error) { message = error instanceof Error ? error.message : "환급 원장을 불러오지 못했어."; }
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="환급관리">
    <div className="mx-auto max-w-7xl">{workspace ? <CollectionLedgerPage workspace={workspace} mode="refunds" /> : member ? <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">환급관리</h1><p className="mt-3" role="alert">{message}</p></section> : <ReimbursementLogin error={message} title="환급관리" description="원수납과 실제 환급 출금을 확인하려면 회계·자금 계정으로 로그인해줘." />}</div>
  </ErpShell>;
}
