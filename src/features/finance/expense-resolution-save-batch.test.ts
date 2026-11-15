import { describe, expect, it } from "vitest";
import type { ManagedExpenseResolution } from "./expense-resolution-page";
import { validateExpenseSaveBatchInput, type ExpenseBankDraftReviewContract } from "./expense-resolution-repository";

const reviewContract: ExpenseBankDraftReviewContract = {
  accountSubjectId: "subject",
  approvalBasisKey: "approved-policy",
  budgetId: "budget",
  evidencePolicyKey: "receipt",
  expenseDetailId: "detail",
  purposeKey: "post-office-telecom",
  taxPolicyKey: "no-vat",
};

function resolution(overrides: Partial<ManagedExpenseResolution> = {}) {
  return {
    actualExpenseDate: "2026-08-20",
    approvalStatus: "작성중",
    bankTransactions: [
      { amount: 10_000, description: "우체국 통신비", id: "bank-1", itemId: "item-1", transactionDate: "2026-08-10" },
      { amount: 20_000, description: "우체국 통신비", id: "bank-2", itemId: "item-2", transactionDate: "2026-08-20" },
    ],
    budgetMonth: "2026-08-01",
    createdAt: "2026-11-16",
    expenseKind: "BANK_POST_APPROVAL",
    isPostApproval: true,
    paymentStatus: "지급전",
    resolutionNo: "지결-2026-TEST",
    ...overrides,
  } as ManagedExpenseResolution;
}

describe("monthly bank expense draft batch validation", () => {
  it("accepts a current draft that preserves every source date in one month", () => {
    expect(() => validateExpenseSaveBatchInput([{ resolution: resolution(), reviewContract }], "2026-08-01", "2026-11-16")).not.toThrow();
  });

  it("rejects backdated creation and mixed source months", () => {
    expect(() => validateExpenseSaveBatchInput([{ resolution: resolution({ createdAt: "2026-10-31" }), reviewContract }], "2026-08-01", "2026-11-16")).toThrow("실제 저장일");
    expect(() => validateExpenseSaveBatchInput([{ resolution: resolution({ bankTransactions: [{ amount: 10_000, description: "우체국", id: "bank-1", itemId: "item-1", transactionDate: "2026-09-01" }] }), reviewContract }], "2026-08-01", "2026-11-16")).toThrow("한 회계월");
  });

  it("rejects approval, payment and voucher outcomes", () => {
    expect(() => validateExpenseSaveBatchInput([{ resolution: resolution({ voucherGenerated: true }), reviewContract }], "2026-08-01", "2026-11-16")).toThrow("승인·지급·전표");
  });
});
