import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ budgets: vi.fn() }));
vi.mock("./budget-profile-repository", () => ({ listExpenseBudgetProfiles: mocks.budgets }));

import { budgetProfilePeriodKey } from "./budget-profile-lookup";
import { expenseResolutionFixture } from "./expense-resolution-test-fixture";
import { createExpenseBudgetDecisionSnapshot, loadExpenseResolutionBudgetView } from "./expense-resolution-budget-view";

describe("expense resolution budget view", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replaces a stale zero snapshot with the official period budget", async () => {
    const resolution = expenseResolutionFixture({
      approvalStatus: "승인대기",
      budgetId: "budget-jan",
      budgetItem: "운영비 > 복리후생비(식대)",
      budgetMonth: "2026-01-01",
      id: "resolution-jan",
      totalPaymentAmount: 252_000,
    });
    resolution.budgetSnapshot = { ...resolution.budgetSnapshot, budgetPeriod: "2026-01", currentAnnualBudgetAmount: 0, monthlyBudgetAmount: 0 };
    const profile = {
      budgetId: "budget-jan",
      budgetPeriod: "2026-01",
      calculationBasis: "기존 편성예산",
      currentAnnualBudgetAmount: 7_800_000,
      monthlyBudgetAmount: 650_000,
      paymentWaitingAmount: 0,
      pendingApprovalAmount: 335_000,
      previousAnnualBudgetAmount: 0,
      reservedAmount: 0,
      usedAmount: 0,
    };
    mocks.budgets.mockResolvedValue({ 복리후생비: profile, [budgetProfilePeriodKey("복리후생비", "2026-01")]: profile });

    const result = await loadExpenseResolutionBudgetView([resolution], "org");

    expect(result.lookupStatuses).toEqual({ "resolution-jan": "LINKED" });
    expect(result.resolutions[0].budgetSnapshot).toMatchObject({
      budgetPeriod: "2026-01",
      expectedUsedAmount: 335_000,
      monthlyBudgetAmount: 650_000,
      remainingBudgetAmount: 315_000,
    });
  });

  it("distinguishes a completed lookup with no official budget from a lookup failure", async () => {
    const resolution = expenseResolutionFixture({ id: "unbudgeted" });
    mocks.budgets.mockResolvedValue({});
    const result = await loadExpenseResolutionBudgetView([resolution], "org");
    expect(result.lookupStatuses).toEqual({ unbudgeted: "UNBUDGETED" });
    expect(createExpenseBudgetDecisionSnapshot(result.resolutions[0], "UNBUDGETED")).toMatchObject({
      budgetId: undefined,
      lookupStatus: "UNBUDGETED",
      monthlyBudgetAmount: 0,
      source: "OFFICIAL_BUDGET",
    });
  });

  it("uses the approval-time official decision for an approved display without changing the stored record", async () => {
    const resolution = expenseResolutionFixture({
      approvalStatus: "승인완료",
      budgetItem: "운영비 > 복리후생비(식대)",
      id: "approved-resolution",
    });
    resolution.budgetSnapshot = { ...resolution.budgetSnapshot, budgetPeriod: "2026-01", monthlyBudgetAmount: 0 };
    resolution.history = [{
      actionAt: "2026-01-30T09:00:00.000Z",
      actionLabel: "최종 승인",
      actionType: "APPROVED",
      actorName: "안동연",
      actorTitle: "조합장",
      budgetDecision: {
        budgetCheckStatus: "정상",
        budgetId: "budget-jan",
        budgetItem: resolution.budgetItem,
        budgetPeriod: "2026-01",
        checkedAt: "2026-01-30T09:00:00.000Z",
        currentRequestAmount: 252_000,
        expectedUsedAmount: 335_000,
        lookupStatus: "LINKED",
        monthlyBudgetAmount: 650_000,
        remainingBudgetAmount: 315_000,
        source: "OFFICIAL_BUDGET",
      },
      id: "history-1",
    }];
    mocks.budgets.mockResolvedValue({ 복리후생비: {
      budgetId: "budget-jan",
      budgetPeriod: "2026-01",
      calculationBasis: "기존 편성예산",
      currentAnnualBudgetAmount: 7_800_000,
      monthlyBudgetAmount: 650_000,
      paymentWaitingAmount: 0,
      pendingApprovalAmount: 0,
      previousAnnualBudgetAmount: 0,
      reservedAmount: 0,
      usedAmount: 335_000,
    } });

    const result = await loadExpenseResolutionBudgetView([resolution], "org");

    expect(resolution.budgetSnapshot.monthlyBudgetAmount).toBe(0);
    expect(result.resolutions[0].budgetSnapshot).toMatchObject({
      budgetUsageRate: 51.5,
      expectedUsedAmount: 335_000,
      monthlyBudgetAmount: 650_000,
      remainingBudgetAmount: 315_000,
    });
  });
});
