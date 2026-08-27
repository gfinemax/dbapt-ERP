"use server";

import { getExpenseComplianceSettings, getDefaultOrganizationId } from "@/features/finance/expense-compliance-repository";
import { getQuickExpenseBudgetAvailability, saveQuickExpenseRecord } from "@/features/finance/quick-expense-record-repository";
import { validateQuickExpenseRecord, type QuickExpenseRecordInput } from "@/features/finance/quick-expense-record";

export async function saveQuickExpenseRecordAction(input: QuickExpenseRecordInput) {
  const organizationId = await getDefaultOrganizationId();
  const settings = organizationId ? await getExpenseComplianceSettings(organizationId) : null;
  const validation = validateQuickExpenseRecord(input, settings ?? undefined);
  if (validation.errors.length) throw new Error(validation.errors.join(" "));
  const budget = organizationId ? await getQuickExpenseBudgetAvailability(organizationId, input.budgetItem, input.occurredAt) : null;
  const withinApprovedBudget = budget && budget.remainingAmount >= input.amount;
  const recordStatus = validation.recordStatus === "RECORDED" && withinApprovedBudget ? "RECORDED" : "NEEDS_RESOLUTION";
  const budgetReason = !budget ? "승인된 예산항목을 찾을 수 없습니다." : budget.remainingAmount < input.amount ? `승인예산 잔액 ${budget.remainingAmount.toLocaleString("ko-KR")}원을 초과했습니다.` : null;
  return saveQuickExpenseRecord({ ...input, directExpenseDecision: recordStatus === "RECORDED" ? validation.policy.decision : "REQUIRED", directExpenseReasons: budgetReason ? [...validation.policy.reasons, budgetReason] : validation.policy.reasons, recordStatus });
}
