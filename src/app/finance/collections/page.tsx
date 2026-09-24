import { ErpShell } from "@/components/erp-shell";
import { CollectionLedgerPage } from "@/features/finance/collection-ledger-page";
import { loadCollectionLedger } from "@/features/finance/collection-ledger-repository";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-login";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";
export default async function Page() {
  let member; let workspace; let message;
  try { member = await reimbursementIdentity(); if (member) workspace = await loadCollectionLedger(); }
  catch (error) { message = error instanceof Error ? error.message : "수납 원장을 불러오지 못했어."; }
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="분담금 수납관리">
    <div className="mx-auto max-w-7xl">{workspace ? <CollectionLedgerPage workspace={workspace} mode="collections" /> : member ? <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">분담금 수납관리</h1><p className="mt-3" role="alert">{message}</p></section> : <ReimbursementLogin error={message} title="분담금 수납관리" description="조합원 고유 ID와 실제 입금을 연결하려면 회계·자금 계정으로 로그인해줘." />}</div>
  </ErpShell>;
}
