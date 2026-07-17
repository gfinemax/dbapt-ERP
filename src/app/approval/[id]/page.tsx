import { notFound } from "next/navigation";
import { ApprovalDetailPage } from "@/features/approval/approval-detail-page";
import { getApprovalDocument } from "@/features/approval/approval-repository";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const document = await getApprovalDocument(id); if (!document) notFound(); return <ApprovalDetailPage document={document} />; }
