import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import type { ReimbursementPermission } from "./reimbursement-domain";
import type { WorkflowAmounts } from "./fund-workflow-repository";
import type { EvidenceOcrData, EvidenceOcrJobStage } from "./expense-evidence";

export type ExpenseSourceKind = "RESOLUTION" | "QUICK" | "PERSONAL";
export type ExpenseWorkspaceRecord = {
  source_kind: ExpenseSourceKind; source_id: string; number: string | null; title: string; amount: number;
  created_at: string; used_at: string | null; accounting_date: string | null; budget_month: string | null;
  updated_at?: string;
  approval_status: string; payment_status: string | null; author_label: string | null; counterparty: string | null;
  transaction_id: string | null; can_connect: boolean; amounts: WorkflowAmounts | null;
  trust_items: { id: string; request_id: string; request_no: string; status: string; requested_amount: number; approved_amount: number; paid_amount: number; needs_review: boolean }[];
  vouchers: { id: string; voucher_no: string; status: string; source_kind: string | null }[];
  evidence_files?: { ocr_job_id: string; file_name: string; content_type: string; storage_path: string; evidence_type: string; status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; stage: EvidenceOcrJobStage; progress: number; result_data: EvidenceOcrData; error_message: string | null; created_at: string }[];
};
export type ExpenseWorkspace = { records: ExpenseWorkspaceRecord[]; viewer: { staff: boolean; permissions: ReimbursementPermission[] } };

export async function loadExpenseWorkspace(): Promise<ExpenseWorkspace> {
  const member = await requireReimbursementIdentity();
  if (!member.active) throw new Error("활성 조직 권한이 필요합니다.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("expense_workspace", { p_org: member.organization_id, p_actor: member.user_id });
  if (error) throw new Error(`지출 자료 조회 실패: ${error.message}`);
  if (!data || !Array.isArray(data.records)) throw new Error("지출 자료 조회 결과를 확인해주세요.");
  return { records: data.records, viewer: { staff: member.permissions.some(p => ["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"].includes(p)), permissions: [...member.permissions] } };
}
