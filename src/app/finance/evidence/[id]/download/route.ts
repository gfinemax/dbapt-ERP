import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { financeEvidenceDownload, reviewEvidenceSource } from "@/features/finance/finance-review-repository";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const member = await reimbursementIdentity();
    if (!member) return new Response("로그인이 필요합니다.", { status: 401, headers });
    if (!member.active || !member.permissions.includes("ADMIN")) return new Response("조회 권한이 없습니다.", { status: 403, headers });
    const { id } = await params;
    const url = await financeEvidenceDownload(member, id, reviewEvidenceSource(new URL(_request.url).searchParams.get("source") ?? undefined));
    return new Response(null, { status: 303, headers: { ...headers, Location: url } });
  } catch { return new Response("증빙을 열지 못했습니다. 접근 권한 또는 원본 파일을 확인해주세요.", { status: 404, headers }); }
}
