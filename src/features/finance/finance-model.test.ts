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

});
