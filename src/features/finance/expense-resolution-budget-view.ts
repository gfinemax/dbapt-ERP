import { listExpenseBudgetProfiles } from "./budget-profile-repository";
import { resolveBudgetProfile } from "./budget-profile-lookup";
import { refreshOpenExpenseResolutionBudgetSnapshots } from "./expense-resolution-budget-refresh";
import type { BudgetProfile, ManagedExpenseResolution } from "./expense-resolution-page";

export type ExpenseBudgetLookupStatus = "LINKED" | "UNBUDGETED";

export type ExpenseBudgetDecisionSnapshot = {
  budgetCheckStatus: string;
  budgetId?: string;
  budgetItem: string;
  budgetPeriod: string;
  checkedAt: string;
  currentRequestAmount: number;
  expectedUsedAmount: number;
  lookupStatus: ExpenseBudgetLookupStatus;
  monthlyBudgetAmount: number;
  remainingBudgetAmount: number;
  source: "OFFICIAL_BUDGET";
};

export type ExpenseResolutionBudgetView = {
  budgetProfiles: Record<string, BudgetProfile>;
  lookupStatuses: Record<string, ExpenseBudgetLookupStatus>;
  resolutions: ManagedExpenseResolution[];
};

function applyApprovedBudgetDecision(resolution: ManagedExpenseResolution): ManagedExpenseResolution {
  if (resolution.approvalStatus !== "승인완료") return resolution;
  const decision = [...resolution.history]
    .reverse()
    .find((item) => item.budgetDecision?.source === "OFFICIAL_BUDGET")
    ?.budgetDecision;
  if (!decision || decision.lookupStatus !== "LINKED") return resolution;
  const budgetUsageRate = decision.monthlyBudgetAmount > 0
    ? Number(((decision.expectedUsedAmount / decision.monthlyBudgetAmount) * 100).toFixed(1))
    : 0;
  return {
    ...resolution,
    budgetSnapshot: {
      ...resolution.budgetSnapshot,
      budgetCheckStatus: decision.budgetCheckStatus as ManagedExpenseResolution["budgetSnapshot"]["budgetCheckStatus"],
      budgetId: decision.budgetId,
      budgetPeriod: decision.budgetPeriod,
      budgetUsageRate,
      currentRequestAmount: decision.currentRequestAmount,
      expectedUsedAmount: decision.expectedUsedAmount,
      monthlyBudgetAmount: decision.monthlyBudgetAmount,
      remainingBudgetAmount: decision.remainingBudgetAmount,
    },
  };
}

export async function loadExpenseResolutionBudgetView(
  resolutions: ManagedExpenseResolution[],
  organizationId: string,
): Promise<ExpenseResolutionBudgetView> {
  if (!resolutions.length) return { budgetProfiles: {}, lookupStatuses: {}, resolutions: [] };
  const periods = Array.from(new Set(
    resolutions
      .map((resolution) => resolution.budgetSnapshot?.budgetPeriod)
      .filter((period): period is string => Boolean(period)),
  ));
  const budgetProfiles = await listExpenseBudgetProfiles(organizationId, periods);
  const refreshed = refreshOpenExpenseResolutionBudgetSnapshots(resolutions, budgetProfiles)
    .map(applyApprovedBudgetDecision);
  const lookupStatuses = Object.fromEntries(refreshed.map((resolution) => {
    const profile = resolveBudgetProfile(
      resolution.budgetItem,
      resolution.budgetSnapshot?.budgetPeriod,
      budgetProfiles,
    );
    const linked = Boolean(profile && (profile.monthlyBudgetAmount > 0 || profile.currentAnnualBudgetAmount > 0));
    return [resolution.id, linked ? "LINKED" : "UNBUDGETED"];
  })) as Record<string, ExpenseBudgetLookupStatus>;

  return { budgetProfiles, lookupStatuses, resolutions: refreshed };
}

export function createExpenseBudgetDecisionSnapshot(
  resolution: ManagedExpenseResolution,
  lookupStatus: ExpenseBudgetLookupStatus,
  checkedAt = new Date().toISOString(),
): ExpenseBudgetDecisionSnapshot {
  const budget = resolution.budgetSnapshot;
  const linked = lookupStatus === "LINKED";
  return {
    budgetCheckStatus: linked ? budget.budgetCheckStatus : "예산항목 선택 필요",
    budgetId: linked ? budget.budgetId ?? resolution.budgetId : undefined,
    budgetItem: resolution.budgetItem,
    budgetPeriod: budget.budgetPeriod,
    checkedAt,
    currentRequestAmount: budget.currentRequestAmount,
    expectedUsedAmount: linked ? budget.expectedUsedAmount : resolution.totalPaymentAmount,
    lookupStatus,
    monthlyBudgetAmount: linked ? budget.monthlyBudgetAmount : 0,
    remainingBudgetAmount: linked ? budget.remainingBudgetAmount : 0,
    source: "OFFICIAL_BUDGET",
  };
}
