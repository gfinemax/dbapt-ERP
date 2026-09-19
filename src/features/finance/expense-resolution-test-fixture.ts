import type { ManagedExpenseResolution } from "./expense-resolution-page";

/** Synthetic test-only record. Never use these placeholders for operational data. */
export function expenseResolutionFixture(overrides: Partial<ManagedExpenseResolution> = {}): ManagedExpenseResolution {
  return {
    id: "fixture-resolution", resolutionNo: "TEST-0001", author: "Test author", createdAt: "2026-07-01",
    accountHolder: "", approvalLine: [], approvalStatus: "작성중", budgetItem: "", evidenceAttached: false,
    evidenceMaterials: [], expenseItems: [], expenseType: "운영비", memo: "", operationExpenseDetail: "",
    paymentFlowType: "사전결의", paymentAccountNo: "", paymentBank: "", paymentStatus: "지급전", settlementStatus: "정산없음",
    budgetSnapshot: { budgetCheckStatus: "예산항목 선택 필요", budgetPeriod: "2026-07", budgetUsageRate: 0, calculationBasis: "Test fixture", currentAnnualBudgetAmount: 0, currentRequestAmount: 0, expectedUsedAmount: 0, monthlyBudgetAmount: 0, paymentWaitingAmount: 0, pendingApprovalAmount: 0, previousAnnualBudgetAmount: 0, remainingBudgetAmount: 0, usedAmount: 0 },
    budgetOverReason: "", batchPaymentMode: "ITEM", itemCount: 0, overBudgetItemCount: 0, plannedPaymentDate: "",
    projectName: "", printRecords: [], reason: "", representativeAccountTitle: "", representativeVendorName: "",
    history: [], relatedContract: "", relatedMeeting: "", subject: "Test expense", supplyAmount: 0,
    totalPaymentAmount: 0, totalOverBudgetAmount: 0, resolutionType: "SINGLE", voucherCreationMode: "ITEM_VOUCHER", vat: 0, vendorName: "",
    ...overrides,
  };
}
