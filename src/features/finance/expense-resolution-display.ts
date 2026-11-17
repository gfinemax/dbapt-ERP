import type { ManagedExpenseResolution } from "./expense-resolution-page";

export function getBudgetOverageAmount(remainingBudgetAmount: number) {
  return Math.max(0, -remainingBudgetAmount);
}

export function getResolutionOverBudgetAmount(resolution: {
  budgetSnapshot?: { remainingBudgetAmount?: number };
  resolutionType?: string;
  totalOverBudgetAmount?: number;
}) {
  if (resolution.resolutionType === "BATCH") {
    return Math.max(0, resolution.totalOverBudgetAmount ?? 0);
  }

  return getBudgetOverageAmount(resolution.budgetSnapshot?.remainingBudgetAmount ?? 0);
}

export function getResolutionAccountTitle(resolution: ManagedExpenseResolution) {
  const selectedDetailTitle = resolution.resolutionType !== "BATCH"
    ? resolution.operationExpenseDetail?.trim()
    : "";
  if (selectedDetailTitle) return selectedDetailTitle;

  const titles = [...new Set((resolution.resolutionType === "BATCH"
    ? resolution.expenseItems.map((item) => item.accountTitle)
    : (resolution.accountAllocations ?? []).map((item) => item.accountTitle))
    .map((title) => title?.trim()).filter(Boolean))];
  return titles.length > 1 ? "복합계정" : titles[0] || resolution.representativeAccountTitle || "미지정";
}
