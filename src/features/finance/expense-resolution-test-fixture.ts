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

export function legacyPendingSecretaryExpenseFixture(overrides: Partial<ManagedExpenseResolution> = {}) {
  return expenseResolutionFixture({
    actualExpenseDate: "2026-01-26",
    author: "오학동",
    createdAt: "2026-11-12",
    draftedAt: "2026-11-12T09:25:00+09:00",
    approvalRoute: "SECRETARY_CHAIR",
    approvalStatus: "승인대기",
    currentApprover: "안동연 최종결재",
    approvalLine: [{ approver: "안동연", role: "최종결재", order: 1, status: "결재대기" }],
    approvalParticipants: [
      { name: "장현제", title: "이사", action: "규정상 생략" },
      { name: "오학동", title: "사무국장", action: "작성" },
      { name: "안동연", title: "조합장", action: "최종결재", approvalOrder: 1 },
    ],
    history: [{ id: "requested", actionAt: "2026-11-14 21:52", actionType: "REQUESTED_APPROVAL", actionLabel: "승인요청", actorName: "오학동", actorTitle: "사무국장" }],
    ...overrides,
  });
}
