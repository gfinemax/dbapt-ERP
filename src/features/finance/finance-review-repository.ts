import { reimbursementDb } from "./reimbursement-repository";
import type { ReimbursementMember } from "./reimbursement-domain";

export type ReviewKind = "evidence" | "tax-documents" | "month-close" | "collections" | "refunds";
export type EvidenceSource = "RESOLUTION" | "PERSONAL" | "TRUST";
export type ReviewRow = { id: string; title: string; date: string; status: string; href?: string; sourceHref?: string; amount?: number; deposit?: number; withdrawal?: number };
export type ReviewResult = { rows: ReviewRow[]; count: number | null; page: number; connection?: "NOT_CONFIGURED" | "READY" };
export function reviewEvidenceSource(value?: string): EvidenceSource { return value === "PERSONAL" || value === "TRUST" ? value : "RESOLUTION"; }
export const reviewPageSize = 50;
export function requireFinanceReviewAdmin(member: ReimbursementMember) {
  if (!member.active || !member.permissions.includes("ADMIN")) throw new Error("조직 전체 자료 조회는 관리자 권한이 필요합니다.");
}
export function reviewMonth(value: string | undefined, today: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") ? value! : today.slice(0, 7);
}
export function reviewPage(value?: string) {
  const page = Number(value ?? 1);
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1;
}
export async function loadFinanceReview(member: ReimbursementMember, kind: ReviewKind, month: string, page = 1, source: EvidenceSource = "RESOLUTION", missingDate = false): Promise<ReviewResult> {
  requireFinanceReviewAdmin(member);
  page = reviewPage(String(page));
  if (kind === "collections") return { rows: [], count: null, page, connection: "NOT_CONFIGURED" };
  const finance = reimbursementDb().schema("finance");
  const start = (page - 1) * reviewPageSize;
  if (kind === "evidence" && source === "PERSONAL") {
    const result = await finance.from("personal_reimbursements").select("id,merchant,purpose,submitted_at,status", { count: "exact" })
      .eq("organization_id", member.organization_id).order("submitted_at", { ascending: false }).order("id").range(start, start + reviewPageSize - 1);
    if (result.error) throw new Error("증빙 목록을 불러오지 못했습니다. 저장소 연결과 조회 권한을 확인해주세요.");
    return { rows: (result.data ?? []).map(row => ({ id: row.id, title: `${row.merchant} · ${row.purpose}`, date: row.submitted_at, status: "개인 대납 증빙",
      href: `/finance/evidence/${encodeURIComponent(row.id)}/download?source=PERSONAL`, sourceHref: `/finance/expenses?source_kind=PERSONAL&source_id=${encodeURIComponent(row.id)}` })), count: result.count, page };
  }
  if (kind === "evidence" && source === "TRUST") {
    const result = await finance.from("workflow_files").select("id,file_name,document_type,purpose,uploaded_at,request_id,contract_version_id", { count: "exact" })
      .eq("organization_id", member.organization_id).order("uploaded_at", { ascending: false }).order("id").range(start, start + reviewPageSize - 1);
    if (result.error) throw new Error("증빙 목록을 불러오지 못했습니다. 저장소 연결과 조회 권한을 확인해주세요.");
    return { rows: (result.data ?? []).map(row => ({ id: row.id, title: row.file_name, date: row.uploaded_at,
      status: `신탁·지급 증빙 · ${row.document_type || row.purpose}`, href: `/finance/evidence/${encodeURIComponent(row.id)}/download?source=TRUST`,
      sourceHref: row.request_id ? `/finance/trust?request=${encodeURIComponent(row.request_id)}` : row.contract_version_id ? "/finance/workflow-settings" : undefined })), count: result.count, page };
  }
  if (kind === "evidence" || kind === "tax-documents") {
    let query = finance.from("expense_resolution_evidence")
      .select("id,resolution_id,original_filename,evidence_type,uploaded_at,expense_resolutions!inner(organization_id,deleted_at)", { count: "exact" })
      .eq("expense_resolutions.organization_id", member.organization_id).is("expense_resolutions.deleted_at", null);
    if (kind === "tax-documents") query = query.in("evidence_type", ["세금계산서", "계산서", "전자세금계산서", "전자계산서"]);
    const result = await query.order("uploaded_at", { ascending: false }).order("id").range(start, start + reviewPageSize - 1);
    if (result.error) throw new Error("증빙 목록을 불러오지 못했습니다. 저장소 연결과 조회 권한을 확인해주세요.");
    return { rows: (result.data ?? []).map((row) => ({ id: row.id, title: row.original_filename, date: row.uploaded_at, status: row.evidence_type, href: `/finance/evidence/${encodeURIComponent(row.id)}/download`, sourceHref: `/finance/expenses?source_kind=RESOLUTION&source_id=${encodeURIComponent(row.resolution_id)}` })), count: result.count, page };
  }
  if (kind === "refunds") {
    const result = await finance.from("bank_transactions").select("id,transacted_at,counterparty,description,deposit_amount,withdrawal_amount", { count: "exact" })
      .eq("organization_id", member.organization_id).is("deleted_at", null).eq("resolution_status", "REFUND_TARGET")
      .order("transacted_at", { ascending: false }).order("id").range(start, start + reviewPageSize - 1);
    if (result.error) throw new Error("환급 검토 대상 거래를 불러오지 못했습니다.");
    return { rows: (result.data ?? []).map((row) => ({ id: row.id, title: row.counterparty || row.description || "계좌 거래", date: row.transacted_at, status: "환급 검토 대상 · 처리 미확정", withdrawal: Number(row.withdrawal_amount), deposit: Number(row.deposit_amount) })), count: result.count, page, connection: "NOT_CONFIGURED" };
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const next = monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
  // This is an accounting-date review, not a period lock or a complete general-ledger close.
  let query = finance.from("expense_resolutions")
    .select("id,resolution_no,subject,accounting_date,voucher_status,evidence_status,approval_status,payment_status,total_payment_amount", { count: "exact" })
    .eq("organization_id", member.organization_id).is("deleted_at", null);
  query = missingDate ? query.is("accounting_date", null) : query.gte("accounting_date", `${month}-01`).lt("accounting_date", next).or("voucher_status.is.null,voucher_status.neq.전표확정,evidence_status.in.(NONE,DEFICIENT)");
  const result = await query.order("accounting_date", { ascending: false }).order("id").range(start, start + reviewPageSize - 1);
  if (result.error) throw new Error("월 마감 점검 자료를 불러오지 못했습니다.");
  return { rows: (result.data ?? []).map((row) => ({ id: row.id, title: `${row.resolution_no} · ${row.subject ?? ""}`, date: row.accounting_date, status: `${row.voucher_status ?? "전표 미처리"} · ${row.evidence_status === "NONE" || row.evidence_status === "DEFICIENT" ? "증빙 보완 필요" : "증빙 등록"}`, amount: Number(row.total_payment_amount), href: `/finance/expenses?source_kind=RESOLUTION&source_id=${encodeURIComponent(row.id)}` })), count: result.count, page };
}

export async function financeEvidenceDownload(member: ReimbursementMember, id: string, source: EvidenceSource = "RESOLUTION") {
  requireFinanceReviewAdmin(member);
  const db = reimbursementDb();
  if (source !== "RESOLUTION") {
    const personal = source === "PERSONAL";
    let bucket: string | undefined; let path: string | undefined;
    if (personal) {
      const { data, error } = await db.schema("finance").from("personal_reimbursements").select("evidence_path").eq("organization_id", member.organization_id).eq("id", id).maybeSingle();
      if (error || !data) throw new Error("조회 가능한 증빙을 찾을 수 없습니다.");
      bucket = "personal-reimbursements"; path = data.evidence_path;
    } else {
      const { data, error } = await db.schema("finance").from("workflow_files").select("bucket,path").eq("organization_id", member.organization_id).eq("id", id).maybeSingle();
      if (error || !data) throw new Error("조회 가능한 증빙을 찾을 수 없습니다.");
      bucket = data.bucket; path = data.path;
    }
    if (!bucket || !path || (!personal && bucket !== "finance-workflow") || !path.startsWith(`${member.organization_id}/`)) throw new Error("조회 가능한 증빙을 찾을 수 없습니다.");
    const signed = await db.storage.from(bucket).createSignedUrl(path, 60, { download: true });
    if (signed.error || !signed.data?.signedUrl) throw new Error("증빙을 열지 못했습니다.");
    return signed.data.signedUrl;
  }
  const { data, error } = await db.schema("finance").from("expense_resolution_evidence")
    .select("storage_bucket,storage_path,expense_resolutions!inner(organization_id,deleted_at)")
    .eq("id", id).eq("expense_resolutions.organization_id", member.organization_id).is("expense_resolutions.deleted_at", null).maybeSingle();
  if (error || !data) throw new Error("조회 가능한 증빙을 찾을 수 없습니다.");
  if (data.storage_bucket !== "expense-evidence" || !data.storage_path) throw new Error("증빙 저장 위치를 확인해주세요.");
  const signed = await db.storage.from(data.storage_bucket).createSignedUrl(data.storage_path, 60, { download: true });
  if (signed.error || !signed.data?.signedUrl) throw new Error("증빙을 열지 못했습니다.");
  return signed.data.signedUrl;
}
