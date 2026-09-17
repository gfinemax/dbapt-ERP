import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import { koreaDate } from "@/features/finance/reimbursement-domain";
import { loadSmallExpenseWorkspace } from "@/features/approval/small-expense-repository";
import { SmallExpenseLogin, SmallExpensePage } from "@/features/approval/small-expense-page";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const query = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month ?? "") ? query.month! : koreaDate().slice(0, 7);
  let workspace; let message;
  try {
    const member = await reimbursementIdentity();
    workspace = member ? await loadSmallExpenseWorkspace(member, month) : null;
  } catch (error) { message = error instanceof Error ? error.message : "소액지출을 불러오지 못했습니다."; }
  return <ErpShell userLabel={workspace?.member.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout} activeLabel="기안·결재" activeDetailLabel="소액결의"><main className="mx-auto max-w-7xl space-y-5">{workspace ? <SmallExpensePage key={`${month}:${workspace.rows.map(r => `${r.id}:${r.revision}`).join(",")}:${workspace.roles?.director_id}:${workspace.roles?.chair_id}`} workspace={workspace} /> : <SmallExpenseLogin error={message} />}</main></ErpShell>;
}
