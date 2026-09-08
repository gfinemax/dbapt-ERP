"use server";

import { revalidatePath } from "next/cache";
import type { ExpenseSourceKind } from "@/features/finance/expense-workspace-repository";
import { runFundWorkflow } from "@/features/finance/fund-workflow-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { reimbursementDb } from "@/features/finance/reimbursement-repository";
import type { ExpenseEvidenceAttachment } from "@/features/finance/expense-evidence";

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

export async function updateQuickExpenseDetailsAction(input: { id: string; usageDescription: string; counterparty: string; expectedUpdatedAt: string; operationKey: string }) {
  if (!input.id || !input.expectedUpdatedAt || !input.operationKey) throw new Error("수정할 간편지출 정보를 확인해줘.");
  return quickExpenseCommand("UPDATE_DETAILS", input.id, { usage_description: input.usageDescription, counterparty: input.counterparty, expected_updated_at: input.expectedUpdatedAt }, input.operationKey);
}

export async function attachQuickExpenseEvidenceAction(recordId: string, attachment: ExpenseEvidenceAttachment, operationKey: string) {
  if (!recordId || !attachment.ocrJobId || !operationKey) throw new Error("연결할 영수증 정보를 확인해줘.");
  return quickExpenseCommand("ATTACH_EVIDENCE", recordId, { ocr_job_id: attachment.ocrJobId }, operationKey);
}
