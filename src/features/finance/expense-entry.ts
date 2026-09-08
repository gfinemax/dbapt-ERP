export type ExpenseEntryStart = "advance" | "reimbursement";

export function parseExpenseEntry(params: Record<string, string | string[] | undefined>) {
  const resolutionId = typeof params.resolutionId === "string" && params.resolutionId.trim()
    ? params.resolutionId : undefined;
  const start: ExpenseEntryStart | undefined = !resolutionId &&
    (params.start === "advance" || params.start === "reimbursement") ? params.start : undefined;
  return { resolutionId, start };
}

export function expenseResolutionHref(entry: { resolutionId: string } | { start: ExpenseEntryStart }) {
  return `/finance/expense-resolutions?${new URLSearchParams(entry)}`;
}
