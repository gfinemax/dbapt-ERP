import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import { hasReimbursementPermission, type ReimbursementPermission } from "./reimbursement-domain";

export const workflowCommands = ["ENROLL", "REFRESH", "PAYMENT_RECORD", "PAYMENT_ALLOCATE", "ALLOCATION_REVERSE", "TRANSFER"] as const;
export type WorkflowCommand = typeof workflowCommands[number];
export type WorkflowAmounts = {
  amount: number; paid: number | null; known_new_paid: number; remaining: number | null;
  balance: number | null; overpaid: number | null; requestable: number | null;
  pending: number; approved: number; approved_unpaid: number;
  payment_review_required: boolean; legacy_payment_complete: boolean;
};
export type WorkflowTransactionRow = {
  id: string; source_kind: string; source_id: string; title: string; amount: number;
  owner_id: string | null; created_by: string; legacy_paid_amount: number | null;
  legacy_payment_complete: boolean; payment_review_required: boolean;
  route: "UNKNOWN" | "TRUST_DIRECT" | "OPERATING"; contract_version_id: string | null;
  source_snapshot: Record<string, unknown>; source_signature: string; revision: number;
  amounts: WorkflowAmounts;
};
export type WorkflowReadResult = {
  transactions: WorkflowTransactionRow[];
  payments: { id: string; method: "BANK" | "CASH"; flow: "OUT" | "IN"; amount: number; paid_at: string; counterparty: string; bank_transaction_id: string | null }[];
  allocations: { id: string; payment_id: string; transaction_id: string; trust_item_id: string | null; purpose: "DISBURSEMENT" | "RETURN"; amount: number; reversed: boolean }[];
};

const commandPermissions: Partial<Record<WorkflowCommand, ReimbursementPermission>> = {
  REFRESH: "APPROVE", PAYMENT_RECORD: "PAY", PAYMENT_ALLOCATE: "PAY", ALLOCATION_REVERSE: "PAY", TRANSFER: "PAY",
};
export async function loadFundWorkflow(): Promise<WorkflowReadResult> {
  const member = await requireReimbursementIdentity();
  if (!member.active) throw new Error("활성 조직 권한이 필요합니다.");
  const result = await reimbursementDb().schema("finance").rpc("workflow_read", { p_org: member.organization_id, p_actor: member.user_id });
  if (result.error) throw new Error(`통합 업무 조회 실패: ${result.error.message}`);
  if (!result.data || !Array.isArray(result.data.transactions)) throw new Error("통합 업무 조회 결과를 확인해주세요.");
  return result.data as WorkflowReadResult;
}

/** Caller supplies business input only. Actor, organization and permissions come from verified Auth. */
export async function runFundWorkflow(command: WorkflowCommand, input: Record<string, unknown>, operationKey: string): Promise<{ id: string }> {
  const member = await requireReimbursementIdentity();
  if (!member.active) throw new Error("활성 조직 권한이 필요합니다.");
  if (!workflowCommands.includes(command)) throw new Error("지원하지 않는 업무입니다.");
  const permission = commandPermissions[command];
  if (permission && !hasReimbursementPermission(member, permission)) throw new Error("이 업무를 처리할 권한이 없습니다.");
  if (!operationKey.trim() || operationKey.length > 200) throw new Error("처리키를 확인해주세요.");
  const result = await reimbursementDb().schema("finance").rpc("workflow_command", {
    p_org: member.organization_id, p_actor: member.user_id, p_command: command, p_data: input, p_key: operationKey,
  });
  if (result.error) throw new Error(result.error.code === "23505" ? "이미 연결된 기록입니다. 현재 내역을 확인해주세요." : result.error.message);
  if (!result.data?.id) throw new Error("처리 결과를 확인하지 못했습니다. 같은 처리키로 다시 확인해주세요.");
  return { id: result.data.id };
}
