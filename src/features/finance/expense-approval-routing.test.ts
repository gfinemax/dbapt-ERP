import { describe, expect, it } from "vitest";
import { buildExpenseApprovalRoute, inferExpenseApprovalRoute } from "./expense-approval-routing";

describe("expense approval routing", () => {
  it("shows all three people but requires only the chair for the current secretary route", () => {
    const route = buildExpenseApprovalRoute("SECRETARY_CHAIR");
    expect(route.participants).toEqual([
      expect.objectContaining({ name: "장현제", title: "이사", action: "규정상 생략", approvalOrder: undefined }),
      expect.objectContaining({ name: "오학동", title: "사무국장", action: "작성", approvalOrder: undefined }),
      expect.objectContaining({ name: "안동연", title: "조합장", action: "최종결재", approvalOrder: 1 }),
    ]);
    expect(route.approvalLine).toEqual([
      { approver: "안동연", order: 1, role: "최종결재", status: "대기" },
    ]);
  });

  it("supports one-click delegated approval with non-blocking chair reporting", () => {
    const route = buildExpenseApprovalRoute("DIRECTOR_DELEGATED");
    expect(route.participants.map((participant) => [participant.name, participant.action, participant.approvalOrder])).toEqual([
      ["장현제", "작성", undefined],
      ["오학동", "전결", 1],
      ["안동연", "후열·보고", undefined],
    ]);
    expect(route.approvalLine.map((step) => step.approver)).toEqual(["오학동"]);
  });

  it("keeps the full director route sequential without adding the author as an approver", () => {
    const route = buildExpenseApprovalRoute("DIRECTOR_FULL");
    expect(route.approvalLine.map((step) => [step.approver, step.role])).toEqual([
      ["오학동", "검토"],
      ["안동연", "최종결재"],
    ]);
    expect(inferExpenseApprovalRoute(route.approvalLine)).toBe("DIRECTOR_FULL");
  });
});
