import { describe, expect, it } from "vitest";
import { canExecute, meetingStatusForAmount, validateApprovalDraft } from "./approval-domain";

const draft = {
  amount: 10_000,
  approvalSteps: [{ approverLabel: "김 결재", approverRole: "팀장" }],
  body: "본문",
  departmentLabel: "사업팀",
  documentType: "EXPENSE" as const,
  drafterLabel: "이 기안",
  purpose: "업무 집행",
  title: "테스트 기안",
};

describe("approval domain", () => {
  it("requires an approval line", () => {
    expect(() => validateApprovalDraft({ ...draft, approvalSteps: [] })).toThrow("결재자");
  });

  it("separates meeting rules from approval status", () => {
    expect(meetingStatusForAmount(100_000_000)).toBe("REQUIRED");
    expect(canExecute({ approvalStatus: "APPROVED", meetingStatus: "REQUIRED" })).toBe(false);
    expect(canExecute({ approvalStatus: "APPROVED", meetingStatus: "APPROVED" })).toBe(true);
  });
  it("validates line totals with integer amounts", () => { expect(() => validateApprovalDraft({ ...draft, lines: [{ accountSubjectName: "광고비", description: "", partnerName: "거래처", supplyAmount: 8_000, vatAmount: 1_000 }] })).toThrow("합계"); });
});
