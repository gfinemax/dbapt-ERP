"use server";

import { revalidatePath } from "next/cache";
import type { ExpenseSourceKind } from "@/features/finance/expense-workspace-repository";
import { runFundWorkflow } from "@/features/finance/fund-workflow-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { reimbursementDb } from "@/features/finance/reimbursement-repository";
import type { ExpenseEvidenceAttachment } from "@/features/finance/expense-evidence";
import { requireReimbursementIdentity } from "@/features/finance/reimbursement-auth";

export async function connectExpenseOriginal(sourceKind: ExpenseSourceKind, sourceId: string, operationKey: string) {
  if (!["RESOLUTION", "QUICK", "PERSONAL"].includes(sourceKind) || !sourceId.trim()) throw new Error("연결할 지출 원본을 확인해주세요.");
  const result = await runFundWorkflow("ENROLL", { source_kind: sourceKind, source_id: sourceId }, operationKey);
  for (const path of ["/finance/expenses", "/finance/trust", "/finance/payments", "/finance"]) revalidatePath(path);
  return result;
}

async function quickExpenseCommand(command: "UPDATE_DETAILS" | "ATTACH_EVIDENCE", id: string, data: Record<string, unknown>, operationKey: string) {
  const actor = await requireExpenseActor();
  const { data: result, error } = await reimbursementDb().schema("finance").rpc("quick_expense_command", {
    p_org: actor.organization_id, p_actor: actor.user_id, p_command: command, p_id: id, p_data: data, p_key: operationKey,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/finance/expenses"); revalidatePath("/finance/quick-expenses");
  return result;
}

export async function updateQuickExpenseDetailsAction(input: { id: string; usageDescription: string; counterparty: string; budgetItem: string; expenseDetailId: string; expectedUpdatedAt: string; operationKey: string }) {
  if (!input.id || !input.expectedUpdatedAt || !input.operationKey) throw new Error("수정할 간편지출 정보를 확인해줘.");
  return quickExpenseCommand("UPDATE_DETAILS", input.id, { usage_description: input.usageDescription, counterparty: input.counterparty, budget_item: input.budgetItem, expense_detail_id: input.expenseDetailId, expected_updated_at: input.expectedUpdatedAt }, input.operationKey);
}

export async function updatePersonalReimbursementDetailsAction(input: { id: string; merchant: string; purpose: string; reason: string; expectedUpdatedAt: string }) {
  const merchant = input.merchant.trim(); const purpose = input.purpose.trim(); const reason = input.reason.trim();
  if (!input.id || !input.expectedUpdatedAt) return { ok: false as const, message: "수정할 개인 정산 정보를 확인해줘." };
  if (!merchant || merchant.length > 200) return { ok: false as const, message: "거래처는 1자 이상 200자 이하로 입력해줘." };
  if (!purpose || purpose.length > 500) return { ok: false as const, message: "사용내용은 1자 이상 500자 이하로 입력해줘." };
  if (!reason || reason.length > 500) return { ok: false as const, message: "수정 사유는 1자 이상 500자 이하로 입력해줘." };
  try {
    const actor = await requireReimbursementIdentity();
    const { error } = await reimbursementDb().schema("finance").rpc("reimbursement_detail_update", {
      p_org: actor.organization_id, p_actor: actor.user_id, p_id: input.id, p_merchant: merchant, p_purpose: purpose, p_reason: reason, p_expected_updated_at: input.expectedUpdatedAt,
    });
    if (error) throw new Error(error.message);
    for (const path of ["/finance/expenses", "/finance/reimbursements", "/finance/trust", "/finance/payments", "/finance"]) revalidatePath(path);
    return { ok: true as const, message: "거래처와 사용내용을 수정했고 변경 이력을 남겼어." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safeMessages = ["수정할 개인 정산", "거래처는", "사용내용은", "수정 사유는", "정산 업무 접근 권한", "개인 정산 원본을 찾을", "승인대기 상태", "신청자 본인 또는 관리자", "다른 사용자가 먼저 수정", "변경된 거래처 또는 사용내용", "동일한 개인 지출"];
    const known = safeMessages.find(value => message.includes(value));
    return { ok: false as const, message: known ? message : "개인 정산 원본을 수정하지 못했어. 새로고침 후 다시 시도해줘." };
  }
}

export async function attachQuickExpenseEvidenceAction(recordId: string, attachment: ExpenseEvidenceAttachment, operationKey: string) {
  if (!recordId || !attachment.ocrJobId || !operationKey) throw new Error("연결할 영수증 정보를 확인해줘.");
  return quickExpenseCommand("ATTACH_EVIDENCE", recordId, { ocr_job_id: attachment.ocrJobId }, operationKey);
}

export async function reviewQuickExpenseEvidenceAction(input: { id: string; decision: "APPROVE_EVIDENCE" | "REQUEST_EVIDENCE_SUPPLEMENT"; reason: string; operationKey: string }) {
  if (!input.id || !input.reason.trim() || !input.operationKey) throw new Error("증빙 처리 사유를 입력해줘.");
  const actor = await requireExpenseActor();
  const { data, error } = await reimbursementDb().schema("finance").rpc("quick_expense_evidence_command", { p_org: actor.organization_id, p_actor: actor.user_id, p_id: input.id, p_decision: input.decision === "APPROVE_EVIDENCE" ? "APPROVE" : "SUPPLEMENT", p_reason: input.reason.trim(), p_key: input.operationKey });
  if (error) throw new Error(error.message);
  revalidatePath("/finance/expenses"); revalidatePath("/finance/quick-expenses");
  return data;
}
