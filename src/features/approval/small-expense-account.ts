import { recommendExpenseBudget } from "@/features/finance/expense-budget-recommendation";

export function recommendSmallExpenseAccount(description: string): string {
  if (/페인트|도색|도장용품/.test(description.replace(/\s/g, ""))) return "수선비";
  const recommendation = recommendExpenseBudget({ itemName: description });
  return recommendation?.budgetItem.split(">").at(-1)?.trim() ?? "";
}
