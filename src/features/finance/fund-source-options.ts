import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";

export type FundSourceOption = { source_kind: "RESOLUTION" | "QUICK" | "PERSONAL"; source_id: string; number: string; title: string; amount: number; status: string };

/** Existing records are selected by ID. No counterparty-name merging or original writes. */
export async function loadFundSourceOptions(): Promise<FundSourceOption[]> {
  const member = await requireReimbursementIdentity();
  if (!member.active || !member.permissions.some(permission => ["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"].includes(permission))) throw new Error("지출 원본 조회 권한이 필요합니다.");
  const db = reimbursementDb().schema("finance");
  const results = await Promise.all([
    db.from("expense_resolutions").select("id,resolution_no,subject,total_payment_amount,approval_status,payment_status").eq("organization_id", member.organization_id).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
    db.from("quick_expense_records").select("id,usage_description,amount,record_status").eq("organization_id", member.organization_id).order("created_at", { ascending: false }).limit(100),
    db.from("personal_reimbursements").select("id,merchant,purpose,amount,status").eq("organization_id", member.organization_id).order("submitted_at", { ascending: false }).limit(100),
  ]);
  for (const result of results) if (result.error) throw new Error(`지출 원본 조회 실패: ${result.error.message}`);
  return [
    ...(results[0].data ?? []).map(row => ({ source_kind: "RESOLUTION" as const, source_id: row.id, number: row.resolution_no, title: row.subject || row.resolution_no, amount: Number(row.total_payment_amount), status: `${row.approval_status} · ${row.payment_status}` })),
    ...(results[1].data ?? []).map(row => ({ source_kind: "QUICK" as const, source_id: row.id, number: "간편지출", title: row.usage_description, amount: Number(row.amount), status: row.record_status })),
    ...(results[2].data ?? []).map(row => ({ source_kind: "PERSONAL" as const, source_id: row.id, number: "개인 대납 정산", title: `${row.merchant} · ${row.purpose}`, amount: Number(row.amount), status: row.status })),
  ];
}
