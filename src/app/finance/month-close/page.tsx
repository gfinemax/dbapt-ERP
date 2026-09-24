import { ErpShell } from "@/components/erp-shell";
import { MonthClosePage } from "@/features/finance/month-close-page";
import { loadMonthClose } from "@/features/finance/month-close-repository";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-login";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string; page?: string; scope?: string }> }) {
  const query = await searchParams; let member; let workspace; let message;
  try { member = await reimbursementIdentity(); if (member) workspace = await loadMonthClose(query.month); }
  catch (error) { message = error instanceof Error ? error.message : "월 마감 점검을 불러오지 못했어."; }
  return <ErpShell userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="월 마감">
    <div className="mx-auto max-w-7xl">{workspace ? <MonthClosePage workspace={workspace} /> : member ? <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">월 마감</h1><p className="mt-3" role="alert">{message}</p></section> : <ReimbursementLogin error={message} title="월 마감" description="조직 전체 원장의 마감 준비 상태를 확인하려면 회계·자금 계정으로 로그인해줘." />}</div>
  </ErpShell>;
}
