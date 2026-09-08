import type { PaymentWorkspace } from "./fund-payment-repository";
import type { TrustReadResult } from "./fund-trust-repository";
import type { WorkflowTransactionRow } from "./fund-workflow-repository";

export function paymentTransaction(id: string, title: string): WorkflowTransactionRow {
  return { id, title, source_id: `source-${id}`, source_kind: "RESOLUTION", amount: 1000, owner_id: null, created_by: "admin", legacy_paid_amount: 0, legacy_payment_complete: false, payment_review_required: false,
    route: "OPERATING", contract_version_id: "contract", source_snapshot: { number: `지결-${id}` }, source_signature: "signature", revision: 1,
    amounts: { amount: 1000, paid: 0, known_new_paid: 0, remaining: 1000, balance: 1000, overpaid: 0, requestable: 1000, pending: 0, approved: 0, approved_unpaid: 0, payment_review_required: false, legacy_payment_complete: false } };
}
export function paymentFixtures(): { workspace: PaymentWorkspace; trust: TrustReadResult } {
  const workspace: PaymentWorkspace = {
    transactions: [paymentTransaction("a", "사무용품 지급"), paymentTransaction("b", "용역비 지급")],
    payments: [{ id: "out", method: "BANK", flow: "OUT", amount: 700, paid_at: "2026-09-07T03:00:00Z", counterparty: "거래처 합산", bank_transaction_id: "bank-out" },
      { id: "in", method: "BANK", flow: "IN", amount: 200, paid_at: "2026-09-08T03:00:00Z", counterparty: "반납자", bank_transaction_id: "bank-in" }],
    allocations: [], eligibility: [{ transaction_id: "a", available: 1000, reason: "지급 가능" }, { transaction_id: "b", available: 1000, reason: "지급 가능" }],
    banks: [{ id: "bank-new", transacted_at: "2026-09-08T04:00:00Z", description: "확인된 출금", counterparty: "은행 거래처", withdrawal_amount: 400, deposit_amount: 0, account_label: "운영계좌 ***1234" },
      { id: "bank-deposit", transacted_at: "2026-09-08T04:00:00Z", description: "확인된 입금", counterparty: "입금자", withdrawal_amount: 0, deposit_amount: 400, account_label: "관리계좌 ***5678" }],
    transfers: [], reversals: [], viewer: { permissions: ["PAY"] },
  };
  const trust: TrustReadResult = { contracts: [], requests: [], items: [], files: [], submissions: [], events: [], accounts: [], viewer: { user_id: "pay-user", permissions: ["PAY"] } };
  return { workspace, trust };
}
