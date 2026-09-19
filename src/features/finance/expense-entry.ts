export type ExpenseEntryStart = "advance" | "reimbursement";

export function parseExpenseEntry(params: Record<string, string | string[] | undefined>) {
  const resolutionId = typeof params.resolutionId === "string" && params.resolutionId.trim()
    ? params.resolutionId : undefined;
  const quickExpenseId = !resolutionId && typeof params.quickExpenseId === "string" && params.quickExpenseId.trim()
    ? params.quickExpenseId.trim().slice(0, 100) : undefined;
  const start: ExpenseEntryStart | undefined = !resolutionId &&
    !quickExpenseId && (params.start === "advance" || params.start === "reimbursement") ? params.start : undefined;
  return { quickExpenseId, resolutionId, start };
}

export function expenseResolutionHref(entry: { resolutionId: string } | { quickExpenseId: string } | { start: ExpenseEntryStart }) {
  return `/finance/expense-resolutions?${new URLSearchParams(entry)}`;
}
