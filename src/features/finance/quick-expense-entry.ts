import type { QuickExpensePaymentMethod } from "./quick-expense-record";

const methods: Record<string, QuickExpensePaymentMethod> = {
  "corporate-card": "CORPORATE_CARD", "personal": "PERSONAL_PREPAID", "cash": "CASH",
  "bank-transfer": "BANK_TRANSFER", "auto-debit": "AUTO_DEBIT",
};
export function parseQuickExpenseEntry(params: Record<string, string | string[] | undefined>) {
  const method = typeof params.method === "string" && Object.hasOwn(methods, params.method) ? methods[params.method] : "BANK_TRANSFER";
  const sourceId = typeof params.sourceId === "string" && params.sourceId.length <= 100 ? params.sourceId.trim() : "";
  return { method, sourceId };
}
export function quickExpenseEntryHref(method: QuickExpensePaymentMethod, sourceId?: string) {
  const key = Object.entries(methods).find(([, value]) => value === method)?.[0];
  if (!key) throw new Error("지원하지 않는 결제수단이야.");
  const params = new URLSearchParams({ method: key });
  if (sourceId) params.set("sourceId", sourceId);
  return `/finance/quick-expenses?${params}`;
}
