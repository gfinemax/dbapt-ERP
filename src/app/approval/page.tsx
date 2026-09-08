import { requireApprovalActor } from "@/features/approval/approval-authorization";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { ApprovalListPage } from "@/features/approval/approval-list-page";
import { listApprovalDocuments } from "@/features/approval/approval-repository";
export const dynamic = "force-dynamic";
export default async function Page() {
let viewer; try { viewer = await requireApprovalActor(); } catch(error) { return <ReimbursementLogin title="기안·결재" description="본인 계정으로 로그인해줘." error={error instanceof Error ? error.message : "로그인이 필요해."} />; }

  const result = await listApprovalDocuments(viewer.organization_id)
    .then((documents) => ({ documents, error: undefined }))
    .catch((error: unknown) => ({ documents: [], error: error instanceof Error ? error.message : "기안 목록을 불러오지 못했어." }));
  return <ApprovalListPage viewer={viewer} documents={result.documents} error={result.error} />;
}
