export const expenseResolutionListPageSize = 50;

export type ExpenseResolutionListRequest = {
  page: number;
  pageSize: number;
  query: string;
};

export type ExpenseResolutionListPage = ExpenseResolutionListRequest & {
  total: number;
  totalPages: number;
};

function firstString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export function parseExpenseResolutionListRequest(params: Record<string, string | string[] | undefined>): ExpenseResolutionListRequest {
  const rawPage = Number(firstString(params.page));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10_000) : 1;
  const query = (firstString(params.q) ?? "").trim().slice(0, 100);
  return { page, pageSize: expenseResolutionListPageSize, query };
}

export function getExpenseResolutionSearchPattern(query: string) {
  const tokens = query.normalize("NFKC").match(/[\p{L}\p{N}-]+/gu)?.slice(0, 8) ?? [];
  return tokens.join("%");
}

export function expenseResolutionListHref(page: number, query: string) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (query.trim()) params.set("q", query.trim().slice(0, 100));
  const serialized = params.toString();
  return `/finance/expense-resolutions${serialized ? `?${serialized}` : ""}`;
}
