import { ErpShell } from "@/components/erp-shell";
import { approvalDb, requireApprovalActor } from "@/features/approval/approval-authorization";
import { ApprovalAuthorizationPage } from "@/features/approval/approval-authorization-page";
import { listApprovalDocuments } from "@/features/approval/approval-repository";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";

export const dynamic = "force-dynamic";
export default async function Page() {
  let actor;
  try { actor = await requireApprovalActor("ADMIN"); }
  catch (error) { return <ReimbursementLogin title="기안 계정 연결" description="관리자 계정으로 로그인해줘." error={error instanceof Error ? error.message : "권한 확인이 필요합니다."} />; }
  let records: Awaited<ReturnType<typeof listApprovalDocuments>> = [];
  let members: { user_id: string; display_name: string; permissions: string[] }[] = [];
  let message = "";
  try {
    records = await listApprovalDocuments(actor.organization_id);
    const { data, error } = await approvalDb().schema("finance").from("reimbursement_members").select("user_id,display_name,permissions").eq("organization_id", actor.organization_id).eq("active", true).order("display_name");
    if (error) throw new Error("같은 조합의 계정을 불러오지 못했습니다.");
    members = data ?? [];
  } catch (error) { message = error instanceof Error ? error.message : "자료를 불러오지 못했습니다."; }
  return <ErpShell activeLabel="기안·결재" userLabel={actor.display_name}><div className="mx-auto max-w-5xl p-5">{message ? <p role="alert">{message}</p> : <ApprovalAuthorizationPage records={records} members={members} />}</div></ErpShell>;
}
