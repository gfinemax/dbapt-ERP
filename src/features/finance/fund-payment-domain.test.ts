import { describe, expect, it } from "vitest";
import { paymentRows, paymentUnallocated } from "./fund-payment-domain";
import { paymentFixtures, paymentTransaction } from "./fund-payment-test-fixtures";

describe("payment state and balance projections", () => {
  it("preserves legacy completion with unknown paid amount and never presents it as unpaid", () => {
    const { workspace } = paymentFixtures();
    const old = paymentTransaction("old", "과거 지급완료");
    old.legacy_payment_complete = true;
    old.amounts = { ...old.amounts, paid: null, remaining: null, balance: null, payment_review_required: true, legacy_payment_complete: true };
    workspace.transactions = [old]; workspace.eligibility = [];
    expect(paymentRows(workspace, "PAID", "")).toEqual([old]);
    expect(paymentRows(workspace, "UNPAID", "")).toEqual([]);
    expect(paymentRows(workspace, "PARTIAL", "")).toEqual([]);
    expect(paymentRows(workspace, "REVIEW", "")).toEqual([old]);
  });
  it("ready uses authoritative available money rather than unpaid or pending approval totals", () => {
    const { workspace } = paymentFixtures();
    workspace.eligibility[1].available = 0;
    workspace.transactions[1].amounts.pending = 1000;
    expect(paymentRows(workspace, "READY", "").map(t => t.id)).toEqual(["a"]);
    expect(paymentRows(workspace, "UNPAID", "")).toHaveLength(2);
  });
  it("distinguishes partial, completed and overpaid while searching title and original number", () => {
    const { workspace } = paymentFixtures();
    workspace.transactions[0].amounts = { ...workspace.transactions[0].amounts, paid: 400, remaining: 600 };
    workspace.transactions[1].amounts = { ...workspace.transactions[1].amounts, paid: 1100, remaining: 0, overpaid: 100 };
    expect(paymentRows(workspace, "PARTIAL", "지결-A").map(t => t.id)).toEqual(["a"]);
    expect(paymentRows(workspace, "OVERPAID", "용역").map(t => t.id)).toEqual(["b"]);
    expect(paymentRows(workspace, "PAID", "")).toEqual([]);
    expect(paymentRows(workspace, "ALL", "없는 번호")).toEqual([]);
  });
  it("calculates remaining payment capacity without reversed allocations or unrelated incoming returns", () => {
    const { workspace } = paymentFixtures();
    workspace.allocations = [
      { id: "one", payment_id: "out", transaction_id: "a", trust_item_id: null, purpose: "DISBURSEMENT", amount: 250, reversed: false },
      { id: "reversed", payment_id: "out", transaction_id: "b", trust_item_id: null, purpose: "DISBURSEMENT", amount: 100, reversed: true },
      { id: "return", payment_id: "in", transaction_id: "a", trust_item_id: null, purpose: "RETURN", amount: 150, reversed: false },
    ];
    expect(paymentUnallocated(workspace, "out")).toBe(450);
    expect(paymentUnallocated(workspace, "in")).toBe(50);
    expect(paymentUnallocated(workspace, "missing")).toBe(0);
  });
});
