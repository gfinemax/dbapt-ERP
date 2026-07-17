import { describe, expect, it } from "vitest";
import { ApprovalWorkflowError, transitionExpenseApproval } from "./expense-approval-workflow";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

function createResolution(overrides: Partial<ManagedExpenseResolution> = {}) {
  return {
    id: "resolution-1",
    author: "오학동 사무장",
    approvalLine: [
      { approver: "장현제", order: 1, role: "부장", status: "대기" },
      { approver: "오학동", order: 2, role: "사무장", status: "대기" },
      { approver: "안동연", order: 3, role: "조합장", status: "대기" },
    ],
    approvalStatus: "작성중",
    currentApprover: undefined,
    expenseItems: [],
    history: [],
    paymentStatus: "지급전",
    paymentFlowType: "사전결의",
    resolutionType: "SINGLE",
    settlementStatus: "정산없음",
    ...overrides,
  } as ManagedExpenseResolution;
}

describe("expense approval workflow", () => {
  it("requests approval and advances only the current approver in order", () => {
    const requested = transitionExpenseApproval({ actorLabel: "오학동 사무장", command: "REQUEST", resolution: createResolution(), transitionedAt: "2026-07-12 10:00" });
    expect(requested).toMatchObject({ approvalStatus: "승인대기", currentApprover: "장현제 부장" });
    expect(requested.approvalLine.map((step) => step.status)).toEqual(["결재대기", "대기", "대기"]);

    const firstApproved = transitionExpenseApproval({ actorLabel: "장현제 부장", command: "APPROVE", resolution: requested, transitionedAt: "2026-07-12 10:10" });
    expect(firstApproved.currentApprover).toBe("오학동 사무장");
    expect(firstApproved.approvalLine.map((step) => step.status)).toEqual(["승인완료", "결재대기", "대기"]);
  });

  it("rejects unauthorized or duplicate approval attempts", () => {
    const requested = transitionExpenseApproval({ actorLabel: "오학동 사무장", command: "REQUEST", resolution: createResolution() });
    expect(() => transitionExpenseApproval({ actorLabel: "안동연 조합장", command: "APPROVE", resolution: requested })).toThrow(ApprovalWorkflowError);
  });

  it("requires a reason for rejection and supports a clean resubmission", () => {
    const requested = transitionExpenseApproval({ actorLabel: "오학동 사무장", command: "REQUEST", resolution: createResolution() });
    expect(() => transitionExpenseApproval({ actorLabel: "장현제 부장", command: "REJECT", reason: " ", resolution: requested })).toThrow("반려사유");
    const rejected = transitionExpenseApproval({ actorLabel: "장현제 부장", command: "REJECT", reason: "계좌정보 보완", resolution: requested, transitionedAt: "2026-07-12 11:00" });
    expect(rejected).toMatchObject({ approvalStatus: "반려", currentApprover: undefined, rejectionReason: "계좌정보 보완" });

    const resubmitted = transitionExpenseApproval({ actorLabel: "오학동 사무장", command: "REQUEST", resolution: rejected, transitionedAt: "2026-07-12 11:30" });
    expect(resubmitted).toMatchObject({ approvalStatus: "승인대기", currentApprover: "장현제 부장", rejectionReason: undefined });
    expect(resubmitted.approvalLine.map((step) => step.status)).toEqual(["결재대기", "대기", "대기"]);
    expect(resubmitted.history.at(-1)?.actionLabel).toBe("재상신");
  });

  it("moves to payment waiting only after final approval without creating a voucher", () => {
    let resolution = transitionExpenseApproval({ actorLabel: "오학동 사무장", command: "REQUEST", resolution: createResolution() });
    for (const actorLabel of ["장현제 부장", "오학동 사무장", "안동연 조합장"]) {
      resolution = transitionExpenseApproval({ actorLabel, command: "APPROVE", resolution, transitionedAt: "2026-07-12 12:00" });
    }
    expect(resolution).toMatchObject({ approvalStatus: "승인완료", currentApprover: undefined, paymentStatus: "지급대기" });
    expect(resolution.voucherNo).toBeUndefined();
  });

  it("completes a bank post-approval without scheduling a duplicate payment", () => {
    let resolution = transitionExpenseApproval({ actorLabel: "오학동 사무장", command: "REQUEST", resolution: createResolution({ actualExpenseDate: "2026-03-15", bankTransactionId: "00000000-0000-0000-0000-000000000001", evidenceKind: "BANK_TRANSFER", evidenceStatus: "GENERAL", expenseKind: "BANK_POST_APPROVAL", postApprovalReason: "과거 미작성 결의 현행화" }) });
    for (const actorLabel of ["장현제 부장", "오학동 사무장", "안동연 조합장"]) resolution = transitionExpenseApproval({ actorLabel, command: "APPROVE", resolution });
    expect(resolution).toMatchObject({ approvalStatus: "승인완료", paymentStatus: "지급완료" });
  });

  it("requires an audited cancellation path before editing an approved unpaid document", () => {
    const approved = createResolution({ approvalStatus: "승인완료", paymentStatus: "지급대기" });
    expect(() => transitionExpenseApproval({ actorLabel: "안동연 조합장", command: "CANCEL", resolution: approved })).toThrow("승인취소 사유");
    expect(transitionExpenseApproval({ actorLabel: "안동연 조합장", command: "CANCEL", reason: "금액 정정", resolution: approved })).toMatchObject({ approvalStatus: "작성중", paymentStatus: "지급전" });
    expect(() => transitionExpenseApproval({ actorLabel: "안동연 조합장", command: "CANCEL", reason: "정정", resolution: createResolution({ approvalStatus: "승인완료", paymentStatus: "지급완료" }) })).toThrow("정정결의");
  });
});
