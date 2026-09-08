import { listApprovalBudgets } from "@/features/approval/approval-settings-repository";
import type { BudgetProfile } from "./expense-resolution-page";

export async function listExpenseBudgetProfiles(organizationId?: string): Promise<Record<string, BudgetProfile>> {
  const budgets = await listApprovalBudgets(organizationId);
  const currentYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
  const currentPeriod = new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "Asia/Seoul", year: "numeric" }).format(new Date());

  return Object.fromEntries(budgets.filter((budget) => budget.fiscalYear === currentYear).map((budget) => [budget.budgetItem, {
    budgetPeriod: currentPeriod,
    calculationBasis: budget.calculationBasis ?? "",
    currentAnnualBudgetAmount: budget.approvedAmount,
    monthlyBudgetAmount: budget.monthlyBudgetAmount ?? 0,
    paymentWaitingAmount: budget.unpaidAmount ?? 0,
    pendingApprovalAmount: budget.pendingAmount ?? 0,
    previousAnnualBudgetAmount: 0,
    reservedAmount: budget.reservedAmount,
    unresolvedCount: budget.unresolvedCount ?? 0,
    usedAmount: budget.monthlyUsedAmount ?? 0,
  }]));
}
