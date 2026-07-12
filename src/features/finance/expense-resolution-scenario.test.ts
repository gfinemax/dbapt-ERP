import { describe, expect, it } from "vitest";
import { transitionExpenseApproval } from "./expense-approval-workflow";
import { transitionExpenseDisbursement } from "./expense-disbursement-workflow";
import { buildExpenseResolutionAlerts, filterExpenseResolutions } from "./expense-resolution-insights";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

function draft() {
  return {
    id: "scenario-1",
    resolutionNo: "지결-2026-9999",
    author: "오학동 사무장",
    approvalLine: [
      { approver: "장현제", order: 1, role: "부장", status: "대기" },
      { approver: "오학동", order: 2, role: "사무장", status: "대기" },
      { approver: "안동연", order: 3, role: "조합장", status: "대기" },
    ],
    approvalStatus: "작성중",
    createdAt: "2026-07-12",
    expenseItems: [],
    history: [],
    paymentStatus: "지급전",
    resolutionType: "SINGLE",
    settlementStatus: "정산없음",
    subject: "통합 시나리오 검증",
    totalPaymentAmount: 30000,
  } as ManagedExpenseResolution;
}

describe("expense resolution full workflow scenario", () => {
  it("runs request, sequential approval, payment, voucher and confirmation", () => {
    let resolution = transitionExpenseApproval({ actorLabel: "오학동 사무장", command: "REQUEST", resolution: draft(), transitionedAt: "2026-07-12 09:00" });
    for (const actorLabel of ["장현제 부장", "오학동 사무장", "안동연 조합장"]) {
      resolution = transitionExpenseApproval({ actorLabel, command: "APPROVE", resolution, transitionedAt: "2026-07-12 10:00" });
    }
    resolution = transitionExpenseDisbursement({ actorLabel: "사무국 관리자", command: "PAYMENT_COMPLETE", paidAt: "2026-07-12", paymentAccountNo: "100-200", paymentMethod: "계좌이체", resolution, transitionedAt: "2026-07-12 11:00" });
    resolution = transitionExpenseDisbursement({ actorLabel: "사무국 관리자", command: "VOUCHER_CREATE", resolution, voucherNo: "지출-2026-9999", transitionedAt: "2026-07-12 11:10" });
    resolution = transitionExpenseDisbursement({ actorLabel: "사무국 관리자", command: "VOUCHER_CONFIRM", resolution, transitionedAt: "2026-07-12 11:20" });

    expect(resolution).toMatchObject({ approvalStatus: "승인완료", paymentStatus: "지급완료", voucherStatus: "전표확정" });
    expect(resolution.history.map((item) => item.actionType)).toEqual(["REQUESTED_APPROVAL", "APPROVED", "APPROVED", "APPROVED", "PAYMENT_PENDING", "PAYMENT_COMPLETED", "VOUCHER_CREATED", "VOUCHER_CREATED"]);
    expect(filterExpenseResolutions([resolution], { query: "9999", paymentStatus: "지급완료" })).toHaveLength(1);
    expect(buildExpenseResolutionAlerts([resolution], "2026-07-12").map((alert) => alert.label)).toContain("이체확인증 첨부 필요");
  });
});
