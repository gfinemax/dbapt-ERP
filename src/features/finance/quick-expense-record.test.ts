import { describe, expect, it } from "vitest";
import { validateQuickExpenseRecord, type QuickExpenseRecordInput } from "./quick-expense-record";

const validInput: QuickExpenseRecordInput = {
  amount: 55000,
  approvalSkipReason: "승인 예산 내 정기 지출",
  bankTransactionId: "bank-1",
  budgetItem: "운영비 > 통신비",
  counterparty: "KT",
  evidenceStatus: "GENERAL",
  occurredAt: "2026-08-27T09:00:00+09:00",
  paymentMethod: "AUTO_DEBIT",
  recordedByLabel: "오학동 사무장",
  sourceType: "BANK_TRANSACTION",
  usageDescription: "조합 사무실 인터넷 요금",
};

describe("validateQuickExpenseRecord", () => {
  it("records an in-budget transaction without creating an expense resolution", () => {
    expect(validateQuickExpenseRecord(validInput)).toMatchObject({ errors: [], policy: { decision: "ALLOWED" }, recordStatus: "RECORDED" });
  });

  it("routes a high-value transaction to a formal resolution", () => {
    expect(validateQuickExpenseRecord({ ...validInput, amount: 6000000 })).toMatchObject({ policy: { decision: "REQUIRED" }, recordStatus: "NEEDS_RESOLUTION" });
  });

  it("requires usage, budget, and the selected source transaction", () => {
    expect(validateQuickExpenseRecord({ ...validInput, bankTransactionId: "", budgetItem: "", usageDescription: "" }).errors).toEqual([
      "사용내용이 필요합니다.",
      "예산항목이 필요합니다.",
      "통장 출금거래 연결이 필요합니다.",
    ]);
  });

  it("allows a manual corporate-card record to wait for source matching", () => {
    expect(validateQuickExpenseRecord({ ...validInput, bankTransactionId: undefined, paymentMethod: "CORPORATE_CARD", sourceType: "MANUAL" }).errors).toEqual([]);
  });
});
