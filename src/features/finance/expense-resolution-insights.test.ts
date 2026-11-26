import { describe, expect, it } from "vitest";
import { buildExpenseResolutionAlerts, filterExpenseResolutions, getExpenseResolutionDashboard, isActionableExpenseResolution } from "./expense-resolution-insights";
import type { ManagedExpenseResolution } from "./expense-resolution-page";
import type { ReimbursementMember } from "./reimbursement-domain";

function item(overrides: Partial<ManagedExpenseResolution> = {}) {
  return { id: "r1", resolutionNo: "지결-001", createdAt: "2026-07-01", subject: "사무용품", representativeVendorName: "다이소", approvalStatus: "승인완료", approvalLine: [], paymentStatus: "지급대기", settlementStatus: "정산없음", expenseItems: [], history: [], resolutionType: "SINGLE", totalPaymentAmount: 30000, ...overrides } as ManagedExpenseResolution;
}

describe("expense resolution insights", () => {
  it("shows only work assigned to the viewer or payable with their permission", () => {
    const viewer: ReimbursementMember = { user_id: "viewer", organization_id: "organization", display_name: "담당자", permissions: [], active: true };
    const ownDraft = item({ author: "작성자 별칭", approvalStatus: "작성중", authorization: { author_user_id: viewer.user_id, steps: [], version: 1 } });
    const assignedApproval = item({
      ...ownDraft,
      approvalStatus: "승인대기",
      approvalLine: [{ approver: "결재자 별칭", order: 1, role: "담당자", status: "결재대기" }],
      authorization: { author_user_id: "author", steps: [{ approver_user_id: viewer.user_id, legacy_step: { approver: "결재자 별칭", order: 1, role: "담당자" }, order: 1 }], version: 1 },
    });
    const payer: ReimbursementMember = { ...viewer, permissions: ["PAY"] };

    expect(isActionableExpenseResolution(ownDraft, viewer)).toBe(true);
    expect(isActionableExpenseResolution(assignedApproval, viewer)).toBe(true);
    expect(isActionableExpenseResolution(assignedApproval, { ...viewer, user_id: "another-user" })).toBe(false);
    expect(isActionableExpenseResolution(item(), viewer)).toBe(false);
    expect(isActionableExpenseResolution(item(), payer)).toBe(true);
    expect(isActionableExpenseResolution(item({ workflowTransactionId: "payment-workflow" }), payer)).toBe(false);
    expect(isActionableExpenseResolution(item({ expenseKind: "PETTY_CASH_BATCH" }), payer)).toBe(false);
  });

  it("filters by search, lifecycle and date", () => {
    const resolutions = [item(), item({ id: "r2", approvalStatus: "작성중", createdAt: "2026-06-01", representativeVendorName: "문구점" })];
    expect(filterExpenseResolutions(resolutions, { query: "다이소", approvalStatus: "승인완료", dateFrom: "2026-07-01" }).map((value) => value.id)).toEqual(["r1"]);
  });

  it("filters the compliance-specific list fields", () => {
    const resolution = item({ accountAllocations: [{ accountTitle: "사무용품비", amount: "10000", budgetItem: "운영비", description: "", id: "a1" }], actualExpenseDate: "2026-03-15", advancePayer: "오학동", bankTransactionId: "bank-1", evidenceStatus: "DEFICIENT", expenseKind: "PERSONAL_REIMBURSEMENT", vendorName: "문구점" });
    expect(filterExpenseResolutions([resolution], { accountTitle: "사무용품", bankLinked: "YES", dateFrom: "2026-03-01", evidenceStatus: "DEFICIENT", expenseKind: "PERSONAL_REIMBURSEMENT", spender: "오학", vendor: "문구" })).toHaveLength(1);
  });

  it("keeps both historical small-expense shapes behind the archive filter", () => {
    const legacyKind = item({ id: "legacy-kind", expenseKind: "PETTY_CASH_BATCH" });
    const legacySource = item({ id: "legacy-source", creationSource: "SMALL_EXPENSE" });
    const current = item({ id: "current", expenseKind: "GENERAL", creationSource: "DIRECT" });
    expect(filterExpenseResolutions([legacyKind, legacySource, current], { pettyCashBatch: "YES" }).map((value) => value.id)).toEqual(["legacy-kind", "legacy-source"]);
  });

  it("builds overdue payment, settlement and receipt alerts", () => {
    const alerts = buildExpenseResolutionAlerts([
      item({ plannedPaymentDate: "2026-07-01" }),
      item({ id: "r2", paymentStatus: "지급완료", settlementDueDate: "2026-07-05", settlementStatus: "정산대기" }),
    ], "2026-07-12");
    expect(alerts.map((alert) => alert.id)).toEqual(["r1-payment", "r2-settlement", "r2-receipt"]);
    expect(getExpenseResolutionDashboard([item({ actualPaidAmount: 30000, paymentStatus: "지급완료" })], "2026-07-12")).toMatchObject({ paidAmount: 30000, voucherWaitingCount: 1 });
  });
});
