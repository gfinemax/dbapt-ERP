import { describe, expect, it } from "vitest";
import { buildExpenseResolutionAlerts, filterExpenseResolutions, getExpenseResolutionDashboard } from "./expense-resolution-insights";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

function item(overrides: Partial<ManagedExpenseResolution> = {}) {
  return { id: "r1", resolutionNo: "지결-001", createdAt: "2026-07-01", subject: "사무용품", representativeVendorName: "다이소", approvalStatus: "승인완료", paymentStatus: "지급대기", settlementStatus: "정산없음", expenseItems: [], history: [], resolutionType: "SINGLE", totalPaymentAmount: 30000, ...overrides } as ManagedExpenseResolution;
}

describe("expense resolution insights", () => {
  it("filters by search, lifecycle and date", () => {
    const resolutions = [item(), item({ id: "r2", approvalStatus: "작성중", createdAt: "2026-06-01", representativeVendorName: "문구점" })];
    expect(filterExpenseResolutions(resolutions, { query: "다이소", approvalStatus: "승인완료", dateFrom: "2026-07-01" }).map((value) => value.id)).toEqual(["r1"]);
  });

  it("filters the compliance-specific list fields", () => {
    const resolution = item({ accountAllocations: [{ accountTitle: "사무용품비", amount: "10000", budgetItem: "운영비", description: "", id: "a1" }], actualExpenseDate: "2026-03-15", advancePayer: "오학동", bankTransactionId: "bank-1", evidenceStatus: "DEFICIENT", expenseKind: "PERSONAL_REIMBURSEMENT", vendorName: "문구점" });
    expect(filterExpenseResolutions([resolution], { accountTitle: "사무용품", bankLinked: "YES", dateFrom: "2026-03-01", evidenceStatus: "DEFICIENT", expenseKind: "PERSONAL_REIMBURSEMENT", spender: "오학", vendor: "문구" })).toHaveLength(1);
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
