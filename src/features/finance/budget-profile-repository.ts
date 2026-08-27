import { listApprovalBudgets } from "@/features/approval/approval-settings-repository";
import type { BudgetProfile } from "./expense-resolution-page";

export async function listExpenseBudgetProfiles(): Promise<Record<string, BudgetProfile>> {
  const budgets = await listApprovalBudgets();
  const currentYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
  const currentPeriod = new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "Asia/Seoul", year: "numeric" }).format(new Date());

  return Object.fromEntries(budgets.filter((budget) => budget.fiscalYear === currentYear).map((budget) => [budget.budgetItem, {
    budgetPeriod: currentPeriod,
    calculationBasis: budget.calculationBasis ?? "",
    currentAnnualBudgetAmount: budget.approvedAmount,
    monthlyBudgetAmount: budget.monthlyBudgetAmount ?? 0,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: budget.reservedAmount,
    previousAnnualBudgetAmount: 0,
    usedAmount: 0,
  }]));
}
