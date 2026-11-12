import { describe, expect, it } from "vitest";

import { budgetProfilePeriodKey } from "./budget-profile-lookup";
import { refreshOpenExpenseResolutionBudgetSnapshots } from "./expense-resolution-budget-refresh";
import { expenseResolutionFixture } from "./expense-resolution-test-fixture";

describe("refreshOpenExpenseResolutionBudgetSnapshots", () => {
  it("refreshes an unresolved zero snapshot from the matching live monthly budget", () => {
    const resolution = expenseResolutionFixture({
      approvalStatus: "작성중",
      budgetId: "00000000-0000-4000-8000-000000000001",
      budgetItem: "운영비 > 복리후생비(식대)",
      budgetMonth: "2026-01-01",
      budgetSnapshot: { budgetCheckStatus: "주의", budgetPeriod: "2026-01", budgetUsageRate: 0, calculationBasis: "2026년도 총회 승인 운영비 예산안", currentAnnualBudgetAmount: 0, currentRequestAmount: 252_000, expectedUsedAmount: 252_000, monthlyBudgetAmount: 0, paymentWaitingAmount: 0, pendingApprovalAmount: 0, previousAnnualBudgetAmount: 0, remainingBudgetAmount: 0, usedAmount: 0 },
      totalPaymentAmount: 252_000,
    });
    const refreshed = refreshOpenExpenseResolutionBudgetSnapshots([resolution], {
      복리후생비: { budgetId: "00000000-0000-4000-8000-000000000001", budgetPeriod: "2026-11", calculationBasis: "식비 등", currentAnnualBudgetAmount: 7_800_000, monthlyBudgetAmount: 650_000, paymentWaitingAmount: 0, pendingApprovalAmount: 335_000, previousAnnualBudgetAmount: 0, reservedAmount: 0, usedAmount: 0 },
      [budgetProfilePeriodKey("복리후생비", "2026-01")]: { budgetId: "00000000-0000-4000-8000-000000000001", budgetPeriod: "2026-01", calculationBasis: "식비 등", currentAnnualBudgetAmount: 7_800_000, monthlyBudgetAmount: 650_000, paymentWaitingAmount: 0, pendingApprovalAmount: 335_000, previousAnnualBudgetAmount: 0, reservedAmount: 0, usedAmount: 0 },
    })[0];

    expect(refreshed.budgetSnapshot).toMatchObject({ budgetCheckStatus: "정상", budgetUsageRate: 51.5, currentAnnualBudgetAmount: 7_800_000, currentRequestAmount: 252_000, expectedUsedAmount: 335_000, monthlyBudgetAmount: 650_000, remainingBudgetAmount: 315_000 });
  });

  it("preserves approved historical snapshots", () => {
    const approved = expenseResolutionFixture({ approvalStatus: "승인완료" });
    expect(refreshOpenExpenseResolutionBudgetSnapshots([approved], {})[0]).toBe(approved);
  });
});
