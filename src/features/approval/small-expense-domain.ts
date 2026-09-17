export type SmallExpenseStatus = "PENDING" | "RETURNED" | "CONFIRMED" | "CANCELLED" | "LEGACY_BATCH";
export type SmallExpense = {
  id: string; expenseDate: string; partnerName: string; description: string; projectName: string;
  accountSubjectName: string; amount: number; payerLabel: string; memo: string; batchResolutionId?: string;
  reviewStatus: SmallExpenseStatus; registeredBy: string | null; spenderId: string | null;
  confirmedLabel: string | null; confirmedAt: string | null; reviewReason: string; revision: number;
  budgetId: string | null; paymentMethod: string | null; bankTransactionId: string | null; cardTransactionId: string | null;
  hasEvidence: boolean;
};
export type SmallExpenseRoles = { director_id: string; chair_id: string };
export type SmallExpenseMember = { user_id: string; display_name: string };
export type SmallExpenseBudget = { id: string; budget_item: string; fiscal_year: number };
export type SmallExpenseSource = { id: string; date: string; amount: number; label: string; method: "BANK_TRANSFER" | "CORPORATE_CARD" };
export const smallExpenseStatusLabels: Record<SmallExpenseStatus, string> = {
  PENDING: "조합장 확인대기", RETURNED: "보완 필요", CONFIRMED: "확정", CANCELLED: "등록 취소", LEGACY_BATCH: "기존 일괄결의 연결",
};
export function canConfirmSmallExpense(row: SmallExpense, userId: string, roles: SmallExpenseRoles | null) {
  return roles?.chair_id === userId && row.reviewStatus === "PENDING" && !!row.registeredBy && !!row.spenderId &&
    row.registeredBy !== userId && row.spenderId !== userId && !row.batchResolutionId;
}
export function summarizeSmallExpenses(rows: SmallExpense[]) {
  const accounts = new Map<string, { count: number; amount: number }>();
  let pendingCount = 0; let confirmedCount = 0; let confirmedAmount = 0;
  for (const row of rows) {
    if (row.reviewStatus === "PENDING" || row.reviewStatus === "RETURNED") pendingCount++;
    if (row.reviewStatus !== "CONFIRMED") continue;
    confirmedCount++; confirmedAmount += row.amount;
    const value = accounts.get(row.accountSubjectName) ?? { count: 0, amount: 0 };
    accounts.set(row.accountSubjectName, { count: value.count + 1, amount: value.amount + row.amount });
  }
  return { pendingCount, confirmedCount, confirmedAmount, accounts: [...accounts].map(([name, value]) => ({ name, ...value })) };
}
