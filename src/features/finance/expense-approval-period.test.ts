import { describe, expect, it } from "vitest";
import { createExpenseApprovalPolicy, directorAppointment, seoulToday } from "@/features/approval/approval-effective-policy";
import { getOrganizationExpenseApprovalLine } from "@/features/approval/organization-approval-line";
import { buildExpenseApprovalRoute } from "./expense-approval-routing";
import { assertExpenseActorPeriod, assertExpenseApprovalPeriod, getLegacyPendingExpenseApprovalRoute, prepareExpenseApprovalDraft, previewExpenseApprovalRepair } from "./expense-approval-period";
import { expenseResolutionFixture, legacyPendingSecretaryExpenseFixture } from "./expense-resolution-test-fixture";

const originalReference = "원문 지결-2026-0001의 서명일 대조";
function legacy() {
  const approvalLine = getOrganizationExpenseApprovalLine("2026-07-01");
  return expenseResolutionFixture({
    author: "오학동 사무국장", approvalLine,
    approvalParticipants: [
      { name: "장현제", title: "이사", action: "검토", approvalOrder: 1 },
      { name: "오학동", title: "사무국장", action: "검토", approvalOrder: 2 },
      { name: "안동연", title: "조합장", action: "최종결재", approvalOrder: 3 },
    ],
    authorization: { author_user_id: "secretary", version: 3, steps: approvalLine.map((step, index) => ({ order: step.order, approver_user_id: ["director", "secretary", "chair"][index], legacy_step: { approver: step.approver, role: step.role, order: step.order } })) },
  });
}
describe("effective expense approval dates", () => {
  it("previews an unsigned legacy pending route only with a qualifying recorded submission date", () => {
    const record = legacyPendingSecretaryExpenseFixture();
    expect(getLegacyPendingExpenseApprovalRoute(record, "2026-11-27")).toMatchObject({
      referenceDate: "2026-11-14",
      approvalLine: [{ approver: "장현제", role: "회계검토", status: "대기" }, { approver: "안동연", role: "최종결재", status: "대기" }],
    });
    for (const date of ["", "2026-06-30 23:59", "2026-11-28 00:00"]) {
      expect(getLegacyPendingExpenseApprovalRoute({ ...record, history: [{ ...record.history[0], actionAt: date }] }, "2026-11-27")).toBeUndefined();
    }
    expect(getLegacyPendingExpenseApprovalRoute({ ...record, history: [] }, "2026-11-27")).toBeUndefined();
    expect(getLegacyPendingExpenseApprovalRoute({ ...record, approvalStatus: "승인완료" }, "2026-11-27")).toBeUndefined();
    expect(getLegacyPendingExpenseApprovalRoute({ ...record, history: [...record.history, { ...record.history[0], id: "signed", actionType: "APPROVED", actionLabel: "결재승인" }] }, "2026-11-27")).toBeUndefined();
    expect(record.approvalParticipants?.[0].action).toBe("규정상 생략");
  });

  it.each(["2026-06-21", "2026-06-22", "2026-06-30"])("excludes the director from actual approval on %s", day => {
    expect(getOrganizationExpenseApprovalLine(day).map(step => step.approver)).toEqual(["오학동", "안동연"]);
    expect(buildExpenseApprovalRoute("SECRETARY_CHAIR", day).participants.some(person => person.name === "장현제")).toBe(false);
  });
  it("allows director authority beginning July 1", () => {
    expect(getOrganizationExpenseApprovalLine("2026-07-01")[0].approver).toBe("장현제");
    expect(buildExpenseApprovalRoute("SECRETARY_CHAIR", "2026-07-01").participants[0]).toMatchObject({ action: "회계검토", approvalOrder: 1 });
  });
  it("allows authorship starting June 22 independently of authority", () => {
    expect(buildExpenseApprovalRoute("DIRECTOR_FULL", "2026-06-21").error).toContain("입사일");
    const routed = buildExpenseApprovalRoute("DIRECTOR_FULL", "2026-06-22");
    expect(routed.error).toBe("");
    expect(routed.participants.find(person => person.name === "장현제")?.action).toBe("작성");
    expect(routed.approvalLine.some(step => step.approver === "장현제")).toBe(false);
  });
  it("does not substitute an old expense date for the current submission date", () => {
    expect(createExpenseApprovalPolicy("CURRENT", "2026-01-01", "2026-11-15").referenceDate).toBe("2026-11-15");
    expect(createExpenseApprovalPolicy("HISTORICAL", "2026-01-31", "2026-11-15", originalReference).referenceDate).toBe("2026-01-31");
    expect(directorAppointment).toMatchObject({ hiredOn: "2026-06-22", approvalFrom: "2026-07-01" });
  });
  it.each(["", "2026-02-30", "2026-13-01", "2027-01-01"])("rejects an unconfirmed or invalid original date %s", day => {
    expect(() => createExpenseApprovalPolicy("HISTORICAL", day, "2026-11-15", originalReference)).toThrow();
  });
  it("requires source evidence and administrator confirmation for historical registration", () => {
    expect(() => createExpenseApprovalPolicy("HISTORICAL", "2026-01-01")).toThrow("근거");
    const record = { ...legacy(), approvalPolicy: createExpenseApprovalPolicy("HISTORICAL", "2026-06-30", undefined, originalReference) };
    expect(() => prepareExpenseApprovalDraft(record, null, false)).toThrow("관리자");
    const prepared = prepareExpenseApprovalDraft(record, null, true);
    expect(prepared.approvalParticipants?.some(person => person.name === "장현제")).toBe(false);
    expect(() => prepareExpenseApprovalDraft(prepared, prepared, false)).not.toThrow();
  });
  it("does not allow the author to change a previously confirmed historical basis", () => {
    const record = { ...legacy(), approvalPolicy: createExpenseApprovalPolicy("HISTORICAL", "2026-06-30", undefined, originalReference) };
    expect(() => prepareExpenseApprovalDraft({ ...record, approvalPolicy: createExpenseApprovalPolicy("CURRENT") }, record, false)).toThrow("관리자");
  });
  it("requires resaving an old current draft when its submission day changes", () => {
    const record = expenseResolutionFixture({ approvalPolicy: createExpenseApprovalPolicy("CURRENT", "", "2026-06-30") });
    expect(() => assertExpenseApprovalPeriod(record, true, "2026-07-01")).toThrow("상신일");
    expect(() => assertExpenseApprovalPeriod(record, false, "2026-07-01")).not.toThrow();
  });
  it("blocks both actual approval and a skipped director display before July", () => {
    const record = { ...legacy(), approvalPolicy: createExpenseApprovalPolicy("HISTORICAL", "2026-06-30", undefined, originalReference) };
    expect(() => assertExpenseApprovalPeriod(record)).toThrow("실제 결재선");
    record.approvalLine = record.approvalLine.slice(1);
    expect(() => assertExpenseApprovalPeriod(record)).toThrow("참여자");
    expect(() => assertExpenseApprovalPeriod(legacy())).toThrow("기준일");
  });
  it("rejects forged rule versions and employment dates", () => {
    const record = expenseResolutionFixture({ approvalPolicy: { ...createExpenseApprovalPolicy("CURRENT"), directorApprovalFrom: "2026-06-22" } });
    expect(() => assertExpenseApprovalPeriod(record)).toThrow("규칙 버전");
  });
});
describe("safe historical approval repair", () => {
  it("previews removal and reindexing without mutating the document or assigning new accounts", () => {
    const record = legacy();
    const original = structuredClone(record);
    const preview = previewExpenseApprovalRepair(record, "2026-06-30", originalReference);
    expect(preview.canApply).toBe(true);
    expect(preview.after.approvalLine.map(step => [step.approver, step.order])).toEqual([["오학동", 1], ["안동연", 2]]);
    expect(preview.bindingSteps.map(step => [step.approver_user_id, step.order])).toEqual([["secretary", 1], ["chair", 2]]);
    expect(preview.after.approvalParticipants?.some(person => person.name === "장현제")).toBe(false);
    expect(record).toEqual(original);
    expect(preview.after.totalPaymentAmount).toBe(record.totalPaymentAmount);
  });
  it("recalls pending documents with no approval decisions while preserving their history", () => {
    const record = { ...legacy(), approvalStatus: "승인대기" as const, currentApprover: "장현제 이사" };
    const preview = previewExpenseApprovalRepair(record, "2026-01-31", originalReference);
    expect(preview.canApply).toBe(true);
    expect(preview.after.approvalStatus).toBe("작성중");
    expect(preview.after.currentApprover).toBeUndefined();
    expect(preview.after.history).toBe(record.history);
  });
  it("keeps completed approval, payment and voucher records immutable", () => {
    for (const overrides of [{ approvalStatus: "승인완료" as const }, { paymentStatus: "지급완료" as const }, { voucherNo: "전표-1" }, { actualPaidAmount: 1 }]) {
      const preview = previewExpenseApprovalRepair({ ...legacy(), ...overrides }, "2026-06-30", originalReference);
      expect(preview.canApply).toBe(false);
    }
    const partial = legacy(); partial.approvalLine[0].status = "승인완료";
    expect(previewExpenseApprovalRepair(partial, "2026-06-30", originalReference).canApply).toBe(false);
  });
  it("does not erase pre-employment authorship or create a zero-approver route", () => {
    const author = { ...legacy(), author: "장현제 이사" };
    expect(previewExpenseApprovalRepair(author, "2026-06-21", originalReference).canApply).toBe(false);
    const onlyDirector = legacy(); onlyDirector.approvalLine = [onlyDirector.approvalLine[0]];
    expect(previewExpenseApprovalRepair(onlyDirector, "2026-06-30", originalReference).issues.join(" ")).toContain("한 명");
  });
  it("keeps July authority and uses a frozen policy snapshot", () => {
    const preview = previewExpenseApprovalRepair(legacy(), "2026-07-01", originalReference);
    expect(preview.after.approvalLine).toHaveLength(3);
    expect(preview.policy).toMatchObject({ referenceDate: "2026-07-01", kind: "HISTORICAL", directorHiredOn: "2026-06-22", directorApprovalFrom: "2026-07-01" });
    expect(preview.policy.referenceDate <= seoulToday()).toBe(true);
  });
});

it("checks the real account even if its displayed step belongs to another person", () => {
 const policy = createExpenseApprovalPolicy("HISTORICAL", "2026-06-30", undefined, "원문 확인");
 expect(() => assertExpenseActorPeriod("장현제", policy, "APPROVE")).toThrow("2026-07-01");
 expect(() => assertExpenseActorPeriod("장현제", policy, "REJECT")).toThrow("2026-07-01");
 expect(() => assertExpenseActorPeriod("장현제", policy, "REQUEST")).not.toThrow();
 expect(() => assertExpenseActorPeriod("장현제", undefined, "APPROVE")).toThrow("기준일");
});
