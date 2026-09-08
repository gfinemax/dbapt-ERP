import { requireApprovalActor } from "@/features/approval/approval-authorization";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { notFound } from "next/navigation";
import { ApprovalDetailPage } from "@/features/approval/approval-detail-page";
import { getApprovalDocument } from "@/features/approval/approval-repository";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
let viewer; try { viewer = await requireApprovalActor(); } catch(error) { return <ReimbursementLogin title="기안·결재" description="본인 계정으로 로그인해줘." error={error instanceof Error ? error.message : "로그인이 필요해."} />; }
 const { id } = await params; const document = await getApprovalDocument(id); if (!document) notFound(); return <ApprovalDetailPage viewer={viewer} document={document} />; }
