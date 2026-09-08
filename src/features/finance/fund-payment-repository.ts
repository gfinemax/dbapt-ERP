import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import type { WorkflowReadResult } from "./fund-workflow-repository";
import type { ReimbursementPermission } from "./reimbursement-domain";

export type PaymentWorkspace = WorkflowReadResult & {
  eligibility: { transaction_id: string; available: number; reason: string }[];
  banks: { id: string; transacted_at: string; description: string; counterparty: string | null; withdrawal_amount: number; deposit_amount: number; account_label: string }[];
  transfers: { id: string; amount: number; paid_at: string; reason: string; created_at: string }[];
  reversals: { allocation_id: string; reason: string; created_at: string }[];
  viewer: { permissions: ReimbursementPermission[] };
};
export async function loadPaymentWorkspace(): Promise<PaymentWorkspace> {
  const member = await requireReimbursementIdentity();
  if (!member.active || !member.permissions.some(p => ["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"].includes(p))) throw new Error("지급 업무 조회 권한이 필요합니다.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("payment_workspace", { p_org: member.organization_id, p_actor: member.user_id });
  if (error) throw new Error(`지급 자료 조회 실패: ${error.message}`);
  if (!data || ["transactions", "payments", "allocations", "eligibility", "banks", "transfers", "reversals"].some(key => !Array.isArray(data[key]))) throw new Error("지급 자료 조회 결과를 확인해주세요.");
  return { transactions: data.transactions, payments: data.payments, allocations: data.allocations, eligibility: data.eligibility, banks: data.banks, transfers: data.transfers, reversals: data.reversals, viewer: { permissions: [...member.permissions] } };
}
