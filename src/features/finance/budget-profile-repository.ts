import { listApprovalBudgets } from "@/features/approval/approval-settings-repository";
import type { BudgetProfile } from "./expense-resolution-page";
import { budgetProfilePeriodKey } from "./budget-profile-lookup";

function toBudgetProfile(budget: Awaited<ReturnType<typeof listApprovalBudgets>>[number], budgetPeriod: string): BudgetProfile {
  return {
    budgetPeriod,
    calculationBasis: budget.calculationBasis ?? "",
    currentAnnualBudgetAmount: budget.approvedAmount,
    monthlyBudgetAmount: budget.monthlyBudgetAmount ?? 0,
    paymentWaitingAmount: budget.unpaidAmount ?? 0,
    pendingApprovalAmount: budget.pendingAmount ?? 0,
    previousAnnualBudgetAmount: 0,
    reservedAmount: budget.reservedAmount,
    unresolvedCount: budget.unresolvedCount ?? 0,
    usedAmount: budget.monthlyUsedAmount ?? 0,
  };
}

export async function listExpenseBudgetProfiles(organizationId?: string, requestedPeriods: string[] = []): Promise<Record<string, BudgetProfile>> {
  const currentPeriod = new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "Asia/Seoul", year: "numeric" }).format(new Date());
  const periods = Array.from(new Set([currentPeriod, ...requestedPeriods.filter((period) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period))]));
  const budgetSets = await Promise.all(periods.map(async (period) => ({ budgets: await listApprovalBudgets(organizationId, period), period })));
  const profiles: Record<string, BudgetProfile> = {};

  for (const { budgets, period } of budgetSets) {
    const fiscalYear = Number(period.slice(0, 4));
    for (const budget of budgets.filter((item) => item.fiscalYear === fiscalYear)) {
      const profile = toBudgetProfile(budget, period);
      profiles[budgetProfilePeriodKey(budget.budgetItem, period)] = profile;
      if (period === currentPeriod) profiles[budget.budgetItem] = profile;
    }
  }
  return profiles;
}
