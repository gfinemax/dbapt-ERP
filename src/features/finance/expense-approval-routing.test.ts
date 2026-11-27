import { describe, expect, it } from "vitest";
import { buildExpenseApprovalRoute, getDraftExpenseApprovalRoute, hasExpenseApprovalRouteDrift, inferExpenseApprovalRoute } from "./expense-approval-routing";

describe("expense approval routing", () => {
  it("requires accounting review before final approval when the secretary authors", () => {
    const route = buildExpenseApprovalRoute("SECRETARY_CHAIR");
    expect(route.participants).toEqual([
      expect.objectContaining({ name: "장현제", title: "이사", action: "회계검토", approvalOrder: 1 }),
      expect.objectContaining({ name: "오학동", title: "사무국장", action: "작성", approvalOrder: undefined }),
      expect.objectContaining({ name: "안동연", title: "조합장", action: "최종결재", approvalOrder: 2 }),
    ]);
    expect(route.approvalLine).toEqual([
      { approver: "장현제", order: 1, role: "회계검토", status: "대기" },
      { approver: "안동연", order: 2, role: "최종결재", status: "대기" },
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

  it("detects a secretary draft that still carries the retired director-skip route", () => {
    expect(hasExpenseApprovalRouteDrift({
      approvalLine: [{ approver: "안동연", order: 1, role: "최종결재" }],
      approvalParticipants: [
        { name: "장현제", title: "이사", action: "규정상 생략" },
        { name: "오학동", title: "사무국장", action: "작성" },
        { name: "안동연", title: "조합장", action: "최종결재", approvalOrder: 1 },
      ],
      approvalPolicy: { kind: "CURRENT", referenceDate: "2026-11-26" },
      approvalRoute: "SECRETARY_CHAIR",
    }, "2026-11-26")).toBe(true);
    const current = buildExpenseApprovalRoute("SECRETARY_CHAIR", "2026-11-26");
    expect(hasExpenseApprovalRouteDrift({
      approvalLine: current.approvalLine,
      approvalParticipants: current.participants,
      approvalPolicy: { kind: "CURRENT", referenceDate: "2026-11-26" },
      approvalRoute: "SECRETARY_CHAIR",
    }, "2026-11-26")).toBe(false);
  });

  it("previews a legacy secretary draft using the new submission date and keeps the confirmed original date for historical drafts", () => {
    const savedLine = buildExpenseApprovalRoute("SECRETARY_CHAIR", "2026-06-30");
    const draft = {
      author: "오학동 사무국장",
      approvalLine: savedLine.approvalLine,
      approvalParticipants: savedLine.participants,
      approvalPolicy: { kind: "CURRENT" as const, referenceDate: "2026-06-30" },
      approvalStatus: "작성중",
    };
    expect(getDraftExpenseApprovalRoute(draft, "2026-06-30")?.approvalLine.map(step => step.approver)).toEqual(["안동연"]);
    expect(getDraftExpenseApprovalRoute(draft, "2026-07-01")?.approvalLine.map(step => step.approver)).toEqual(["장현제", "안동연"]);
    expect(hasExpenseApprovalRouteDrift(draft, "2026-07-01")).toBe(true);

    const historicalDraft = { ...draft, approvalPolicy: { kind: "HISTORICAL" as const, referenceDate: "2026-06-30" } };
    expect(getDraftExpenseApprovalRoute(historicalDraft, "2026-07-01")?.participants.map(person => [person.name, person.approvalOrder])).toEqual([["오학동", undefined], ["안동연", 1]]);
    expect(getDraftExpenseApprovalRoute({ ...draft, approvalStatus: "승인대기" }, "2026-07-01")).toBeUndefined();
    expect(hasExpenseApprovalRouteDrift(historicalDraft, "2026-07-01")).toBe(false);
  });
});
