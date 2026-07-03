import { describe, expect, it } from "vitest";
import {
  accountTransactionKinds,
  accountTransactionMatchStatuses,
  budgetItemFields,
  evidenceDocumentTypes,
  expenseResolutionDocumentTypes,
  expenseResolutionApprovalStatuses,
  expenseResolutionPaymentStatuses,
  expenseResolutionTypes,
  expensePaymentFlowTypes,
  financeModelExample,
  financeModelRelations,
  memberPaymentMatchStatuses,
  budgetCheckStatuses,
  settlementStatuses,
  createDefaultApprovalLines,
  formatCurrency,
  getApprovalStatusLabel,
  getNextResolutionNo,
  getNextVoucherNo,
  getPaymentStatusLabel,
  voucherStatuses,
  voucherTypes,
} from "./finance-model";

describe("finance model", () => {
  it("defines regional housing cooperative accounting enum values", () => {
    expect(accountTransactionKinds).toEqual(["입금", "출금"]);
    expect(accountTransactionMatchStatuses).toEqual(["미매칭", "자동매칭", "수동매칭", "매칭확정", "제외"]);
    expect(voucherTypes).toEqual(["INCOME", "EXPENSE", "TRANSFER", "REFUND"]);
    expect(voucherStatuses).toEqual(["DRAFT", "CONFIRMED", "CANCELLED"]);
    expect(expenseResolutionTypes).toEqual([
      "운영비",
      "용역비",
      "토지매입비",
      "업무대행비",
      "법무비",
      "세무비",
      "감정평가비",
      "환불금",
      "차입금상환",
      "총회비",
      "인쇄비",
      "우편비",
      "홍보비",
      "행사운영비",
      "비품비",
      "소모품비",
      "기타",
    ]);
    expect(expenseResolutionDocumentTypes).toEqual(["SINGLE", "BATCH"]);
    expect(expenseResolutionApprovalStatuses).toEqual(["DRAFT", "PENDING", "APPROVED", "REJECTED"]);
    expect(expenseResolutionPaymentStatuses).toEqual(["BEFORE_PAYMENT", "PAYMENT_PENDING", "PARTIAL_PAID", "PAID", "HOLD"]);
    expect(expensePaymentFlowTypes).toEqual(["PRE_APPROVAL", "ADVANCE_PAYMENT", "POST_SETTLEMENT"]);
    expect(settlementStatuses).toEqual(["NOT_REQUIRED", "SETTLEMENT_PENDING", "SETTLED", "ADDITIONAL_PAYMENT", "REFUND_REQUIRED", "HOLD"]);
    expect(budgetCheckStatuses).toEqual(["NORMAL", "WARNING", "EXCEEDED"]);
    expect(evidenceDocumentTypes).toEqual(["TAX_INVOICE", "INVOICE", "RECEIPT", "CASH_RECEIPT", "TRANSFER_CONFIRMATION", "CONTRACT", "ESTIMATE", "MEETING_RESOLUTION", "OTHER"]);
    expect(memberPaymentMatchStatuses).toEqual(["미매칭", "자동매칭", "수동매칭", "매칭확정"]);
  });

  it("provides backend-ready expense resolution utilities", () => {
    expect(formatCurrency(3300000)).toBe("3,300,000원");
    expect(getNextResolutionNo(0)).toBe("지결-2026-0001");
    expect(getNextResolutionNo(0, 2027)).toBe("지결-2027-0001");
    expect(getNextVoucherNo(0)).toBe("지출-2026-0001");
    expect(getApprovalStatusLabel("DRAFT")).toBe("작성중");
    expect(getApprovalStatusLabel("PENDING")).toBe("승인대기");
    expect(getApprovalStatusLabel("APPROVED")).toBe("승인완료");
    expect(getApprovalStatusLabel("REJECTED")).toBe("반려");
    expect(getPaymentStatusLabel("BEFORE_PAYMENT")).toBe("지급전");
    expect(getPaymentStatusLabel("PAYMENT_PENDING")).toBe("지급대기");
    expect(getPaymentStatusLabel("PARTIAL_PAID")).toBe("부분지급");
    expect(getPaymentStatusLabel("PAID")).toBe("지급완료");
    expect(getPaymentStatusLabel("HOLD")).toBe("보류");
  });

  it("creates the default regional housing cooperative approval line", () => {
    expect(createDefaultApprovalLines()).toEqual([
      {
        id: "approval-line-1",
        order: 1,
        approverName: "장현제",
        approverTitle: "부장",
        status: "WAITING",
      },
      {
        id: "approval-line-2",
        order: 2,
        approverName: "오학동",
        approverTitle: "사무장",
        status: "WAITING",
      },
      {
        id: "approval-line-3",
        order: 3,
        approverName: "안동연",
        approverTitle: "조합장",
        status: "WAITING",
      },
    ]);
  });

  it("keeps budget item accounting fields explicit", () => {
    expect(budgetItemFields).toEqual(["예산항목", "승인예산", "집행액", "잔액", "집행률"]);
  });

  it("documents entity relationships for vouchers, resolutions, evidence, bank transactions, and member payments", () => {
    expect(financeModelRelations).toEqual([
      {
        from: "AccountTransaction",
        kind: "many-to-one",
        to: "Voucher",
        via: "matchedVoucherId",
      },
      {
        from: "AccountTransaction",
        kind: "many-to-one",
        to: "MemberPayment",
        via: "matchedMemberPaymentId",
      },
      {
        from: "Voucher",
        kind: "many-to-one",
        to: "ExpenseResolution",
        via: "relatedResolutionNo",
      },
      {
        from: "ExpenseResolution",
        kind: "one-to-many",
        to: "ApprovalLine",
        via: "approvalLines",
      },
      {
        from: "ExpenseResolution",
        kind: "one-to-many",
        to: "EvidenceFile",
        via: "evidenceFiles",
      },
      {
        from: "ExpenseResolution",
        kind: "one-to-many",
        to: "ResolutionHistory",
        via: "history",
      },
      {
        from: "ExpenseResolution",
        kind: "many-to-one",
        to: "BudgetItem",
        via: "budgetItem",
      },
      {
        from: "MemberPayment",
        kind: "many-to-one",
        to: "Voucher",
        via: "voucherId",
      },
    ]);
  });

  it("provides a connected example graph for the law-fee payment workflow", () => {
    expect(financeModelExample.expenseResolution).toMatchObject({
      resolutionNo: "지결-2026-0001",
      expenseType: "법무비",
      budgetItem: "budget-legal",
      paymentStatus: "PAYMENT_PENDING",
      approvalStatus: "PENDING",
      paymentFlowType: "PRE_APPROVAL",
      budgetPeriod: "2026-07",
      calculationBasis: "기존 지출결의서 법무비 예산 연계",
      currentAnnualBudgetAmount: 51600000,
      monthlyBudgetAmount: 50000000,
      previousAnnualBudgetAmount: 51600000,
      budgetCheckStatus: "NORMAL",
    });
    expect(financeModelExample.expenseResolution.printRecords[0]).toMatchObject({
      printPurpose: "보관용",
      storageLocation: "2026년 운영비 지출결의서 / 7월 / 001",
    });
    expect(financeModelExample.voucher).toMatchObject({
      voucherNo: "지출-2026-0001",
      voucherType: "EXPENSE",
      voucherStatus: "DRAFT",
      relatedResolutionNo: financeModelExample.expenseResolution.resolutionNo,
      evidenceLinked: true,
      paymentConfirmed: false,
      evidenceConfirmed: false,
    });
    expect(financeModelExample.evidenceFile).toMatchObject({
      evidenceType: "TAX_INVOICE",
      evidenceTypeLabel: "세금계산서",
      amount: financeModelExample.expenseResolution.totalAmount,
    });
    expect(financeModelExample.accountTransaction).toMatchObject({
      transactionKind: "출금",
      matchStatus: "매칭확정",
      matchedVoucherId: financeModelExample.voucher.id,
    });
    expect(financeModelExample.memberPayment).toMatchObject({
      memberId: "member-000124",
      paymentRound: 1,
      matchStatus: "매칭확정",
    });
  });
});
