import { describe, expect, it } from "vitest";
import { createDefaultApprovalLines, type ExpenseResolution } from "./finance-model";
import { toManagedExpenseResolutionDraft } from "./expense-resolution-draft-adapter";

describe("toManagedExpenseResolutionDraft", () => {
  it("converts a server-created expense draft without a client module call", () => {
    const source: ExpenseResolution = {
      accountHolder: "대방개발",
      accountNumber: "",
      approvalLines: createDefaultApprovalLines(),
      approvalStatus: "DRAFT",
      bankName: "미지정",
      budgetItem: "용역비",
      createdAt: "2026-07-17",
      createdBy: "오학동",
      createdByTitle: "사무국장",
      evidenceFiles: [],
      expenseType: "용역비",
      history: [],
      id: "approval-expense-1",
      paymentStatus: "BEFORE_PAYMENT",
      plannedPaymentDate: "2026-07-17",
      reason: "계약 검토",
      resolutionNo: "생성중",
      settlementStatus: "NOT_REQUIRED",
      subject: "부동산 매입 계약",
      supplyAmount: 100_000,
      totalAmount: 100_000,
      vatAmount: 0,
      vendorName: "대방개발",
    };

    expect(toManagedExpenseResolutionDraft(source)).toMatchObject({
      approvalStatus: "작성중",
      author: "오학동 사무국장",
      paymentStatus: "지급전",
      settlementStatus: "정산없음",
      totalPaymentAmount: 100_000,
      vendorName: "대방개발",
    });
  });
});
