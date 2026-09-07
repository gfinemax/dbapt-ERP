import { loadFundTrust } from "@/features/finance/fund-trust-repository";
import { renderTrustRequestPrint, type TrustPrintSnapshot } from "@/features/finance/fund-trust-print";
import { loadFundWorkflow } from "@/features/finance/fund-workflow-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const revisionText = new URL(request.url).searchParams.get("revision");
  const revision = Number(revisionText);
  if (revisionText === null || !/^(0|[1-9]\d*)$/.test(revisionText) || !Number.isSafeInteger(revision)) return new Response("출력할 버전을 선택해주세요.", { status: 400 });
  try {
    const workspace = await loadFundTrust();
    let snapshot: TrustPrintSnapshot;
    if (revision === 0) {
      const draft = workspace.requests.find(row => row.id === id && row.revision === 0 && row.status === "DRAFT");
      if (!draft) return new Response("요청 초안을 찾지 못했습니다.", { status: 404 });
      const sources = await loadFundWorkflow();
      const contract = workspace.contracts.find(row => row.id === draft.contract_version_id);
      snapshot = {
        requestNo: draft.request_no, title: draft.title, requestDate: draft.request_date, revision: 0, submittedAt: "",
        trustee: contract?.trustee ?? "", contractName: contract?.name ?? "", contractReference: contract?.reference ?? "",
        managementAccountLabel: workspace.accounts.find(row => row.id === contract?.management_account_id)?.label ?? "", receiptReference: draft.receipt_reference,
        items: workspace.items.filter(row => row.request_id === draft.id && row.status === "PENDING").map(item => {
          const source = sources.transactions.find(row => row.id === item.transaction_id);
          if (!source) throw new Error("요청 원본을 확인하지 못했습니다.");
          return { id: item.id, sourceNo: String(source.source_snapshot.number ?? source.source_id), title: source.title,
            recipient: String(source.source_snapshot.recipient ?? ""), accountMasked: String(source.source_snapshot.accountMasked ?? ""), requestedAmount: item.requested_amount };
        }),
        files: workspace.files.filter(row => row.request_id === draft.id && row.purpose !== "REPLY").map(row => ({ name: row.file_name, sha256: row.content_hash })),
      };
    } else {
      const submitted = workspace.submissions.find(row => row.request_id === id && row.revision === revision);
      if (!submitted) return new Response("제출본을 찾지 못했습니다.", { status: 404 });
      snapshot = submitted.snapshot as TrustPrintSnapshot;
    }
    const html = renderTrustRequestPrint(snapshot);
    return new Response(html, { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response("제출본 조회 권한과 저장소 연결을 확인해주세요.", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
}
