import { describe, expect, it } from "vitest";
import { deriveTrustRequestStatus, emptyFundWorkspace, fundAmounts, paymentAllocationBalance, settlementAmounts, trustItemAmounts, type FundPaymentAllocation, type FundRequestItem, type FundSource, type FundWorkspace } from "./fund-workflow-domain";

const source: FundSource = { id: "tx", sourceKind: "RESOLUTION", sourceId: "legacy-resolution", amount: 1000, legacyPaidAmount: 0, legacyPaymentComplete: false, paymentReviewRequired: false };
const item = (overrides: Partial<FundRequestItem> = {}): FundRequestItem => ({ id: "item", requestId: "request", transactionId: source.id, requestedAmount: 600, approvedAmount: 0, status: "PENDING", ...overrides });
const workspace = (items: FundRequestItem[] = [item()]): FundWorkspace => ({ ...emptyFundWorkspace(), sources: [source], requests: [{ id: "request", status: "SUBMITTED", revision: 1 }], items });
function pay(state: FundWorkspace, amount: number, overrides: Partial<FundPaymentAllocation> = {}) {
  const id = `payment-${state.payments.length}`;
  state.payments.push({ id, amount, flow: overrides.purpose === "RETURN" ? "IN" : "OUT", paidAt: "2026-09-08" });
  state.allocations.push({ id: `allocation-${state.allocations.length}`, paymentId: id, transactionId: source.id, trustItemId: "item", amount, purpose: "DISBURSEMENT", ...overrides });
}

describe("disjoint trust and payment amounts", () => {
  it("keeps paid 200, approved unpaid 400 and pending 200 separate", () => {
    const state = workspace([item({ approvedAmount: 600, status: "APPROVED" }), item({ id: "pending", requestedAmount: 200 })]);
    pay(state, 200);
    expect(fundAmounts(source, state)).toMatchObject({ paid: 200, remaining: 800, approved: 600, approvedRemaining: 400, pending: 200, requestable: 200, paymentState: "PARTIAL" });
  });
  it("releases only the rejected remainder of a partial approval", () => {
    const state = workspace([item({ approvedAmount: 400, status: "PARTIAL" })]);
    pay(state, 250);
    expect(fundAmounts(source, state)).toMatchObject({ paid: 250, remaining: 750, approvedRemaining: 150, pending: 0, requestable: 600 });
  });
  it("preserves approved siblings while only the supplement item is resubmitted", () => {
    const supplement = item({ id: "supplement", requestedAmount: 200, status: "SUPPLEMENT" });
    const state = workspace([item({ requestedAmount: 400, approvedAmount: 400, status: "APPROVED" }), supplement]);
    expect(deriveTrustRequestStatus(state.items)).toBe("SUPPLEMENT");
    expect(fundAmounts(source, state)).toMatchObject({ approved: 400, pending: 200, requestable: 400 });
    state.items[1] = { ...supplement, status: "REVIEWING" };
    state.requests[0].revision = 2;
    expect(deriveTrustRequestStatus(state.items)).toBe("PARTIAL");
    expect(fundAmounts(source, state)).toMatchObject({ approved: 400, pending: 200, requestable: 400 });
  });
  it("retains reservations until withdrawal confirmation, including partial approvals", () => {
    expect(trustItemAmounts(item({ status: "WITHDRAWAL_PENDING", withdrawalFromStatus: "SUPPLEMENT" }))).toEqual({ pending: 600, approved: 0 });
    expect(trustItemAmounts(item({ status: "WITHDRAWAL_PENDING", withdrawalFromStatus: "PARTIAL", approvedAmount: 400 }))).toEqual({ pending: 0, approved: 400 });
    const state = workspace([item({ status: "WITHDRAWN" })]);
    expect(fundAmounts(source, state).requestable).toBe(1000);
    state.requests.push({ id: "new-request", status: "SUBMITTED", revision: 1 });
    state.items.push(item({ id: "new-item", requestId: "new-request" }));
    expect(fundAmounts(source, state)).toMatchObject({ pending: 600, requestable: 400 });
  });
  it("does not reserve drafts or rejected history when released money is requested again", () => {
    const state = workspace([item({ status: "REJECTED" })]);
    state.requests.push({ id: "draft", status: "DRAFT", revision: 0 }, { id: "retry", status: "SUBMITTED", revision: 1 });
    state.items.push(item({ id: "draft-item", requestId: "draft" }), item({ id: "retry-item", requestId: "retry" }));
    expect(fundAmounts(source, state)).toMatchObject({ pending: 600, requestable: 400, approved: 0 });
  });
  it("exposes overpayment and preserves a later actual recovery", () => {
    const state = workspace([]);
    pay(state, 1100, { trustItemId: null });
    expect(fundAmounts(source, state)).toMatchObject({ paid: 1100, balance: -100, remaining: 0, overpaid: 100, requestable: 0, paymentState: "OVERPAID" });
    pay(state, 100, { trustItemId: null, purpose: "RETURN" });
    expect(fundAmounts(source, state)).toMatchObject({ paid: 1000, overpaid: 0, paymentState: "PAID" });
  });
  it("reserves only the unpaid portion when a paid approval is reopened for review", () => {
    const state = workspace([item({ requestedAmount: 400, status: "SUPPLEMENT" }), item({ id: "another", requestedAmount: 300, status: "REVIEWING" })]);
    pay(state, 250);
    expect(fundAmounts({ ...source, amount: 700 }, state)).toMatchObject({ paid: 250, pending: 450, approved: 0, requestable: 0 });
    state.items[0] = { ...state.items[0], status: "APPROVED", approvedAmount: 400 };
    expect(fundAmounts({ ...source, amount: 700 }, state)).toMatchObject({ paid: 250, pending: 300, approvedRemaining: 150, requestable: 0 });
  });
  it("summarizes approved items after sibling withdrawal consistently with SQL", () => {
    expect(deriveTrustRequestStatus([item({ status: "APPROVED", approvedAmount: 600 }), item({ id: "withdrawn", status: "WITHDRAWN" })])).toBe("APPROVED");
  });
});

describe("actual allocations and immutable correction events", () => {
  it("splits one bank payment across different transactions without consuming its unallocated amount", () => {
    const state = workspace([]);
    state.payments.push({ id: "bank", flow: "OUT", amount: 700, paidAt: "2026-09-08" });
    state.allocations.push({ id: "a", paymentId: "bank", transactionId: "tx", amount: 250, purpose: "DISBURSEMENT" }, { id: "b", paymentId: "bank", transactionId: "other", amount: 150, purpose: "DISBURSEMENT" });
    expect(paymentAllocationBalance(state.payments[0], state.allocations, state.reversals)).toEqual({ actualAmount: 700, allocated: 400, unallocated: 300 });
    expect(fundAmounts(source, state).paid).toBe(250);
  });
  it("retains original payment through cancellation, replacement allocation and real return", () => {
    const state = workspace([item({ approvedAmount: 600, status: "APPROVED" })]);
    pay(state, 200);
    state.reversals.push({ id: "reverse", allocationId: "allocation-0", reason: "배분 정정", createdAt: "2026-09-08" });
    state.allocations.push({ ...state.allocations[0], id: "replacement", amount: 150 });
    expect(fundAmounts(source, state)).toMatchObject({ paid: 150, approvedRemaining: 450, requestable: 400 });
    expect(state.payments[0].amount).toBe(200);
    expect(paymentAllocationBalance(state.payments[0], state.allocations, state.reversals).unallocated).toBe(50);
    state.allocations.push({ ...state.allocations[0], id: "reallocated", amount: 50 });
    pay(state, 40, { purpose: "RETURN" });
    expect(fundAmounts(source, state)).toMatchObject({ paid: 160, approvedRemaining: 440, requestable: 400 });
    expect(state.allocations[0].amount).toBe(200);
  });
  it("rejects over-allocation, repeated reversal and duplicate rows", () => {
    const state = workspace([]);
    pay(state, 200, { trustItemId: null });
    state.allocations.push({ ...state.allocations[0], id: "another", amount: 1 });
    expect(() => paymentAllocationBalance(state.payments[0], state.allocations, [])).toThrow("exceed");
    state.allocations.pop();
    state.reversals.push({ id: "r", allocationId: "allocation-0", reason: "정정", createdAt: "2026-09-08" }, { id: "r2", allocationId: "allocation-0", reason: "중복 정정", createdAt: "2026-09-08" });
    expect(() => fundAmounts(source, state)).toThrow("reversed once");
    state.reversals = [];
    state.allocations.push(state.allocations[0]);
    expect(() => fundAmounts(source, state)).toThrow("Duplicate");
  });
  it("rejects another transaction's approval attribution and missing actual payment", () => {
    const state = workspace();
    pay(state, 100, { trustItemId: "foreign-item" });
    expect(() => fundAmounts(source, state)).toThrow("another transaction");
    state.allocations[0].trustItemId = "item";
    state.payments = [];
    expect(() => fundAmounts(source, state)).toThrow("no actual payment");
  });
});

describe("unknown history and source semantics", () => {
  it("keeps historical completion visible without guessing paid money or allowing another request", () => {
    const legacy = { ...source, legacyPaidAmount: null, legacyPaymentComplete: true };
    expect(fundAmounts(legacy, workspace([]))).toMatchObject({ paid: null, remaining: null, requestable: null, reviewRequired: true, historicalCompleted: true, paymentState: "REVIEW_REQUIRED" });
    expect(fundAmounts({ ...legacy, legacyPaidAmount: 1000 }, workspace([]))).toMatchObject({ paid: 1000, remaining: 0, paymentState: "PAID", historicalCompleted: true });
  });
  it.each<FundSource["sourceKind"]>(["RESOLUTION", "QUICK", "PERSONAL", "COLLECTION", "REFUND", "ADVANCE", "TRANSFER"])("does not invent a paid baseline from %s source kind", (sourceKind) => {
    expect(fundAmounts({ ...source, sourceKind }, workspace([]))).toMatchObject({ paid: 0, knownNewPaid: 0, remaining: 1000 });
  });
  it("retains explicit legacy payment and blocks review independently of trust approval", () => {
    const state = workspace([item({ approvedAmount: 600, status: "APPROVED" })]);
    expect(fundAmounts({ ...source, legacyPaidAmount: 300 }, state)).toMatchObject({ paid: 300, requestable: 100 });
    expect(fundAmounts({ ...source, legacyPaidAmount: 300, paymentReviewRequired: true }, state)).toMatchObject({ paid: null, requestable: null, approved: 600 });
  });
});

describe("advance reconciliation", () => {
  it("requires actual return of 200 for use of 800 from an advance of 1000", () => {
    expect(settlementAmounts({ advanced: 1000, used: 800, returned: 0, additionallyPaid: 0 })).toMatchObject({ returnDue: 200, balanced: false });
    expect(settlementAmounts({ advanced: 1000, used: 800, returned: 200, additionallyPaid: 0 })).toMatchObject({ returnDue: 0, balanced: true });
  });
  it("requires top-up 200, or 400 if 200 was already returned", () => {
    expect(settlementAmounts({ advanced: 1000, used: 1200, returned: 0, additionallyPaid: 0 }).additionalPaymentDue).toBe(200);
    expect(settlementAmounts({ advanced: 1000, used: 1200, returned: 200, additionallyPaid: 0 }).additionalPaymentDue).toBe(400);
    expect(settlementAmounts({ advanced: 1000, used: 1200, returned: 200, additionallyPaid: 400 }).balanced).toBe(true);
  });
});

describe("trust state validation", () => {
  it("derives independent header outcomes without calling submitted items approved", () => {
    expect(deriveTrustRequestStatus([item()])).toBe("SUBMITTED");
    expect(deriveTrustRequestStatus([item({ status: "REVIEWING" })])).toBe("REVIEWING");
    expect(deriveTrustRequestStatus([item({ status: "APPROVED", approvedAmount: 600 })])).toBe("APPROVED");
    expect(deriveTrustRequestStatus([item({ status: "REJECTED" })])).toBe("REJECTED");
    expect(deriveTrustRequestStatus([item({ status: "WITHDRAWN" })])).toBe("WITHDRAWN");
    expect(deriveTrustRequestStatus([item({ status: "WITHDRAWAL_PENDING", withdrawalFromStatus: "PENDING" })])).toBe("WITHDRAWAL_PENDING");
  });
  it("rejects ambiguous withdrawal and inconsistent approval money", () => {
    expect(() => trustItemAmounts(item({ status: "WITHDRAWAL_PENDING" }))).toThrow("previous item status");
    expect(() => trustItemAmounts(item({ status: "APPROVED", approvedAmount: 100 }))).toThrow("Full approval");
    expect(() => trustItemAmounts(item({ status: "PARTIAL", approvedAmount: 600 }))).toThrow("Partial approval");
    expect(() => trustItemAmounts(item({ status: "SUPPLEMENT", approvedAmount: 100 }))).toThrow("effective approval");
    expect(() => fundAmounts({ ...source, amount: Number.NaN }, workspace())).toThrow("finite");
    expect(() => fundAmounts({ ...source, amount: 100.5 }, workspace())).toThrow("whole-won");
    expect(() => settlementAmounts({ advanced: Number.MAX_SAFE_INTEGER, used: 0, returned: 0, additionallyPaid: 1 })).toThrow("safe integer");
  });
});
