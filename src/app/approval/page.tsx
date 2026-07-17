import { ApprovalListPage } from "@/features/approval/approval-list-page";
import { listApprovalDocuments } from "@/features/approval/approval-repository";
export const dynamic = "force-dynamic";
export default async function Page() {
  const result = await listApprovalDocuments()
    .then((documents) => ({ documents, error: undefined }))
    .catch((error: unknown) => ({ documents: [], error: error instanceof Error ? error.message : "기안 목록을 불러오지 못했어." }));
  return <ApprovalListPage documents={result.documents} error={result.error} />;
}
