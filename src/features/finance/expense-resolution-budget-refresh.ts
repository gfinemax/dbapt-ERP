import type { BudgetProfile, ManagedExpenseResolution } from "./expense-resolution-page";
import { resolveBudgetProfile } from "./budget-profile-lookup";

export function refreshOpenExpenseResolutionBudgetSnapshots(
  resolutions: ManagedExpenseResolution[],
  budgetProfiles: Record<string, BudgetProfile>,
): ManagedExpenseResolution[] {
  return resolutions.map((resolution): ManagedExpenseResolution => {
    const stored = resolution.budgetSnapshot;
    if (resolution.approvalStatus === "승인완료" || stored.monthlyBudgetAmount > 0 || stored.currentAnnualBudgetAmount > 0) return resolution;
    const profile = resolveBudgetProfile(resolution.budgetItem, stored.budgetPeriod, budgetProfiles);
    if (!profile || (profile.monthlyBudgetAmount <= 0 && profile.currentAnnualBudgetAmount <= 0)) return resolution;
    const expectedUsedAmount = profile.usedAmount
      + (profile.reservedAmount ?? (profile.pendingApprovalAmount + profile.paymentWaitingAmount))
      + resolution.totalPaymentAmount;
    const remainingBudgetAmount = profile.monthlyBudgetAmount - expectedUsedAmount;
    const budgetUsageRate = profile.monthlyBudgetAmount > 0
      ? Number(((expectedUsedAmount / profile.monthlyBudgetAmount) * 100).toFixed(1))
      : 0;
    return {
      ...resolution,
      budgetSnapshot: {
        ...profile,
        budgetCheckStatus: remainingBudgetAmount < 0 || budgetUsageRate >= 100 ? "예산초과" : budgetUsageRate >= 80 ? "주의" : "정상",
        budgetPeriod: stored.budgetPeriod,
        budgetUsageRate,
        currentRequestAmount: resolution.totalPaymentAmount,
        expectedUsedAmount,
        remainingBudgetAmount,
      },
    };
  });
}
