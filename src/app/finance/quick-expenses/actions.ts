"use server";

import { getExpenseComplianceSettings, getDefaultOrganizationId } from "@/features/finance/expense-compliance-repository";
import { getQuickExpenseBudgetAvailability, getQuickExpenseRecord, saveQuickExpenseRecord } from "@/features/finance/quick-expense-record-repository";
import { validateQuickExpenseRecord, type QuickExpenseRecordInput } from "@/features/finance/quick-expense-record";
import { importCorporateCardTransactions, linkQuickExpenseCard } from "@/features/finance/corporate-card-transaction-repository";
import type { CorporateCardTransactionImportRow } from "@/features/finance/corporate-card-transaction-import";
import { revalidatePath } from "next/cache";

export async function saveQuickExpenseRecordAction(input: QuickExpenseRecordInput) {
  const organizationId = await getDefaultOrganizationId();
  const settings = organizationId ? await getExpenseComplianceSettings(organizationId) : null;
  const validation = validateQuickExpenseRecord(input, settings ?? undefined);
  if (validation.errors.length) throw new Error(validation.errors.join(" "));
  const sourcePending = input.paymentMethod === "CORPORATE_CARD" && input.sourceType === "MANUAL";
  const evidencePending = input.evidenceStatus !== "QUALIFIED";
  const budget = organizationId ? await getQuickExpenseBudgetAvailability(organizationId, input.budgetItem, input.occurredAt) : null;
  const withinApprovedBudget = budget && !budget.unresolvedCount && budget.remainingAmount >= input.amount && budget.annualRemainingAmount >= input.amount;
  const recordStatus = sourcePending ? "SOURCE_PENDING" : validation.recordStatus === "NEEDS_RESOLUTION" || !withinApprovedBudget ? "NEEDS_RESOLUTION" : evidencePending ? "EVIDENCE_PENDING" : "RECORDED";
  const budgetReason = !budget ? "승인된 예산항목을 찾을 수 없습니다." : budget.unresolvedCount ? "이 예산항목·귀속월의 미정리 원본을 먼저 확인해주세요." : budget.annualRemainingAmount < input.amount ? "연간 승인예산 잔액을 초과했습니다." : budget.remainingAmount < input.amount ? `이번 달 승인예산 잔액 ${budget.remainingAmount.toLocaleString("ko-KR")}원을 초과했습니다.` : null;
  const directExpenseReasons = sourcePending ? ["법인카드 승인내역 동기화 후 실제 거래 연결이 필요합니다."] : budgetReason ? [...validation.policy.reasons, budgetReason] : evidencePending ? [...validation.policy.reasons, "영수증 또는 대체증빙 검토가 필요합니다."] : validation.policy.reasons;
  return saveQuickExpenseRecord({ ...input, directExpenseDecision: recordStatus === "NEEDS_RESOLUTION" ? "REQUIRED" : validation.policy.decision, directExpenseReasons, recordStatus });
}

export async function importCorporateCardTransactionsAction(rows: CorporateCardTransactionImportRow[]) {
  const result = await importCorporateCardTransactions(rows);
  revalidatePath("/finance/quick-expenses");
  return result;
}

export async function linkQuickExpenseCardAction(input: { recordId: string; cardTransactionId: string }) {
  const [organizationId, record] = await Promise.all([getDefaultOrganizationId(), getQuickExpenseRecord(input.recordId)]);
  if (!organizationId || !record) throw new Error("연결할 간편지출 기록을 찾을 수 없어.");
  const budget = await getQuickExpenseBudgetAvailability(organizationId, record.budgetItem, record.occurredAt);
  const recordStatus = budget && !budget.unresolvedCount && budget.remainingAmount >= record.amount && budget.annualRemainingAmount >= record.amount
    ? record.evidenceReviewStatus === "APPROVED" || record.evidenceReviewStatus === "READY" ? "RECORDED" as const : "EVIDENCE_PENDING" as const
    : "NEEDS_RESOLUTION" as const;
  await linkQuickExpenseCard(input.recordId, input.cardTransactionId, recordStatus);
  revalidatePath("/finance/quick-expenses");
  return { recordStatus };
}
