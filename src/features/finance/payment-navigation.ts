import type { ExpenseWorkspaceRecord } from "./expense-workspace-repository";
import type { PaymentTab } from "./fund-payment-domain";
export function legacyPaymentDestination(tab: "UNPAID" | "PAID", query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "tab" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  params.set("tab", tab);
  return `/finance/payments?${params}`;
}
export function unconnectedPaymentRows(records: ExpenseWorkspaceRecord[], tab: PaymentTab, search: string) {
  return records.filter(row => {
    if (row.transaction_id || !`${row.title} ${row.number ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) return false;
    if (tab === "ALL" || tab === "REVIEW") return true;
    if (tab === "PAID") return row.payment_status === "지급완료" || row.approval_status === "PAID";
    if (tab === "PARTIAL") return row.payment_status === "부분지급";
    if (tab === "UNPAID") return row.payment_status === "지급대기" || (row.source_kind === "PERSONAL" && row.approval_status === "APPROVED");
    return false;
  });
}
