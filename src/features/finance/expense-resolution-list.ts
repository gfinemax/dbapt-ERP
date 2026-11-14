export const expenseResolutionListPageSize = 25;
const financeMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export function normalizeFinanceMonth(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return financeMonthPattern.test(normalized) ? normalized : "";
}

export function formatFinanceMonth(value: string) {
  const normalized = normalizeFinanceMonth(value);
  if (!normalized) return "전체 기간";
  const [year, month] = normalized.split("-");
  return `${year}년 ${Number(month)}월`;
}

export function nextFinanceMonth(value: string) {
  const normalized = normalizeFinanceMonth(value);
  if (!normalized) return "";
  const [year, month] = normalized.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type ExpenseResolutionListRequest = {
  month: string;
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
  const month = normalizeFinanceMonth(firstString(params.month));
  return { month, page, pageSize: expenseResolutionListPageSize, query };
}

export function getExpenseResolutionSearchPattern(query: string) {
  const tokens = query.normalize("NFKC").match(/[\p{L}\p{N}-]+/gu)?.slice(0, 8) ?? [];
  return tokens.join("%");
}

export function expenseResolutionListHref(page: number, query: string, month = "") {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (query.trim()) params.set("q", query.trim().slice(0, 100));
  if (normalizeFinanceMonth(month)) params.set("month", month);
  const serialized = params.toString();
  return `/finance/expense-resolutions${serialized ? `?${serialized}` : ""}`;
}
