import { describe, expect, it } from "vitest";
import {
  getOrganizationApproverDisplayRole,
  getOrganizationApprovalSteps,
  getOrganizationExpenseApprovalLine,
} from "./organization-approval-line";

describe("organization approval line", () => {
  it("uses 장현제 이사 for new approval and expense documents", () => {
    expect(getOrganizationApprovalSteps()[0]).toEqual({ approverLabel: "장현제", approverRole: "이사" });
    expect(getOrganizationExpenseApprovalLine()[0]).toMatchObject({ approver: "장현제", role: "이사" });
  });

  it("presents the former unresolved role label as 이사 without changing unrelated roles", () => {
    expect(getOrganizationApproverDisplayRole("장현제", "담당자")).toBe("이사");
    expect(getOrganizationApproverDisplayRole("오학동", "사무국장")).toBe("사무국장");
  });
});
