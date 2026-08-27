import { evaluateDirectExpensePolicy, type DirectExpenseDecision } from "./direct-expense-policy";
import { defaultExpenseComplianceSettings, type ExpenseComplianceSettings } from "./expense-compliance";

export type QuickExpensePaymentMethod = "CORPORATE_CARD" | "BANK_TRANSFER" | "AUTO_DEBIT" | "CASH" | "PERSONAL_PREPAID";
export type QuickExpenseSourceType = "BANK_TRANSACTION" | "CORPORATE_CARD" | "MANUAL";

export type QuickExpenseRecordInput = {
  amount: number;
  approvalSkipReason: string;
  bankTransactionId?: string;
  budgetItem: string;
  corporateCardTransactionId?: string;
  counterparty: string;
  evidenceStatus: "QUALIFIED" | "GENERAL" | "ALTERNATIVE" | "NONE";
  occurredAt: string;
  paymentMethod: QuickExpensePaymentMethod;
  recordedByLabel: string;
  sourceType: QuickExpenseSourceType;
  usageDescription: string;
};

export type QuickExpenseRecord = QuickExpenseRecordInput & {
  createdAt: string;
  directExpenseDecision: DirectExpenseDecision;
  directExpenseReasons: string[];
  id: string;
  recordStatus: "RECORDED" | "SOURCE_PENDING" | "NEEDS_RESOLUTION" | "CONVERTED";
};

export function validateQuickExpenseRecord(input: QuickExpenseRecordInput, settings: ExpenseComplianceSettings = defaultExpenseComplianceSettings) {
  const errors: string[] = [];
  if (!(input.amount > 0)) errors.push("지출금액이 필요합니다.");
  if (!input.usageDescription.trim()) errors.push("사용내용이 필요합니다.");
  if (!input.budgetItem.trim()) errors.push("예산항목이 필요합니다.");
  if (!input.approvalSkipReason.trim()) errors.push("기안 생략 사유가 필요합니다.");
  if (input.sourceType === "BANK_TRANSACTION" && !input.bankTransactionId) errors.push("통장 출금거래 연결이 필요합니다.");
  if (input.sourceType === "CORPORATE_CARD" && !input.corporateCardTransactionId) errors.push("법인카드 승인내역 연결이 필요합니다.");
  const policy = evaluateDirectExpensePolicy({ amount: input.amount, budgetItem: input.budgetItem, memo: input.usageDescription, source: "DIRECT" }, settings);
  return { errors, policy, recordStatus: policy.decision === "ALLOWED" ? "RECORDED" as const : "NEEDS_RESOLUTION" as const };
}
