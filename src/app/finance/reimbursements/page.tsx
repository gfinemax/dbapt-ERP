import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { koreaDate } from "@/features/finance/reimbursement-domain";
import { loadReimbursementWorkspace } from "@/features/finance/reimbursement-repository";
import { ReimbursementLogin, ReimbursementPage } from "@/features/finance/reimbursement-page";
import { reimbursementLogout } from "./actions";

export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{month?:string;tab?:string}>}) {
  const query=await searchParams;
  const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month ?? "") ? `${query.month}-01` : `${koreaDate().slice(0,7)}-01`;
  let workspace;
  let message;
  try {
    const member=await reimbursementIdentity();
    workspace=member ? await loadReimbursementWorkspace(member,month) : null;
  } catch(error) {
    message=error instanceof Error ? error.message : "정산 자료를 불러오지 못했습니다.";
  }
  return <ErpShell userLabel={workspace?.member.display_name??"로그인 필요"} logoutAction={reimbursementLogout} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="개인 지출 정산·월 마감"><div className="mx-auto max-w-7xl space-y-5">{workspace?<ReimbursementPage key={`${month}:${query.tab??"requests"}`} workspace={workspace} initialTab={query.tab==="budgets"||query.tab==="settings"?query.tab:"requests"}/>:<ReimbursementLogin error={message}/>}</div></ErpShell>;
}
