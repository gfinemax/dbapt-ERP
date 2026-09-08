import type { PaymentWorkspace } from "./fund-payment-repository";

export const paymentTabs = { ALL: "전체", READY: "지급가능", UNPAID: "지급대기", PARTIAL: "부분지급", PAID: "지급완료", REVIEW: "확인 필요", OVERPAID: "과지급" } as const;
export type PaymentTab = keyof typeof paymentTabs;
export function paymentRows(workspace: PaymentWorkspace, tab: PaymentTab, search: string) {
  return workspace.transactions.filter(t => {
    if (search && !`${t.title} ${String(t.source_snapshot.number ?? "")}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) return false;
    const a = t.amounts;
    switch (tab) {
      case "READY": return workspace.eligibility.some(e => e.transaction_id === t.id && e.available > 0);
      case "REVIEW": return a.payment_review_required || (a.paid === null && !t.legacy_payment_complete);
      case "PAID": return t.legacy_payment_complete || (!a.payment_review_required && a.remaining === 0 && !a.overpaid);
      case "PARTIAL": return !t.legacy_payment_complete && !a.payment_review_required && Number(a.paid) > 0 && Number(a.remaining) > 0;
      case "UNPAID": return !t.legacy_payment_complete && !a.payment_review_required && a.paid === 0 && Number(a.remaining) > 0;
      case "OVERPAID": return Number(a.overpaid) > 0;
      default: return true;
    }
  });
}
export function paymentUnallocated(workspace: PaymentWorkspace, id: string) {
  const payment = workspace.payments.find(p => p.id === id);
  return payment ? Number(payment.amount) - workspace.allocations.filter(a => a.payment_id === id && !a.reversed).reduce((sum, a) => sum + Number(a.amount), 0) : 0;
}
