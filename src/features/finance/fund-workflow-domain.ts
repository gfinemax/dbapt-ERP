/** DTOs for normalized finance records. Amounts never imply an accounting account. */
export type FundSourceKind = "RESOLUTION" | "QUICK" | "PERSONAL" | "COLLECTION" | "REFUND" | "ADVANCE" | "TRANSFER";
export type FundSource = {
  id: string; sourceKind: FundSourceKind; sourceId: string; amount: number;
  legacyPaidAmount: number | null; legacyPaymentComplete: boolean; paymentReviewRequired: boolean;
};
export type FundItemStatus = "PENDING" | "REVIEWING" | "SUPPLEMENT" | "APPROVED" | "PARTIAL" | "REJECTED" | "WITHDRAWAL_PENDING" | "WITHDRAWN";
export type FundRequestStatus = "DRAFT" | "SUBMITTED" | "REVIEWING" | "SUPPLEMENT" | "PARTIAL" | "APPROVED" | "REJECTED" | "WITHDRAWAL_PENDING" | "WITHDRAWN";
export type FundWithdrawalFromStatus = Exclude<FundItemStatus, "REJECTED" | "WITHDRAWAL_PENDING" | "WITHDRAWN">;
export type FundRequestItem = {
  id: string; requestId: string; transactionId: string; requestedAmount: number; approvedAmount: number;
  status: FundItemStatus; withdrawalFromStatus?: FundWithdrawalFromStatus | null;
};
export type FundRequest = { id: string; status: FundRequestStatus; revision: number };
export type FundContractVersion = {
  id: string; contractId: string; revision: number; verificationStatus: "NEEDS_CONFIGURATION" | "VERIFIED";
  trusteeId: string | null; managementAccountId: string | null;
};
export type FundAttachmentVersion = Readonly<{ id: string; version: number; storagePath: string; sha256: string }>;
/** These are copies of submitted values and immutable file versions, never live row references. */
export type FundSubmissionSnapshot = Readonly<{
  requestId: string; version: number; submittedAt: string; submittedBy: string; contractVersionId: string;
  items: readonly Readonly<FundRequestItem>[]; attachments: readonly FundAttachmentVersion[];
}>;
export type FundPayment = { id: string; flow: "OUT" | "IN"; amount: number; paidAt: string };
export type FundPaymentAllocation = {
  id: string; paymentId: string; transactionId: string; trustItemId?: string | null;
  amount: number; purpose: "DISBURSEMENT" | "RETURN"; originalAllocationId?: string | null;
};
/** A correction cancels an allocation, not the bank record or its actual cash flow. */
export type FundAllocationReversal = { id: string; allocationId: string; reason: string; createdAt: string };
export type FundWorkspace = {
  sources: FundSource[]; requests: FundRequest[]; items: FundRequestItem[];
  payments: FundPayment[]; allocations: FundPaymentAllocation[]; reversals: FundAllocationReversal[];
};
export const emptyFundWorkspace = (): FundWorkspace => ({ sources: [], requests: [], items: [], payments: [], allocations: [], reversals: [] });
export const requestStatusLabel: Record<FundRequestStatus, string> = {
  DRAFT: "요청 준비", SUBMITTED: "제출", REVIEWING: "심사 중", SUPPLEMENT: "보완 요청", PARTIAL: "일부 승인",
  APPROVED: "승인", REJECTED: "반려", WITHDRAWAL_PENDING: "철회 요청 중", WITHDRAWN: "철회",
};
export const itemStatusLabel: Record<FundItemStatus, string> = {
  PENDING: "대기", REVIEWING: "심사 중", SUPPLEMENT: "보완 요청", PARTIAL: "일부 승인",
  APPROVED: "승인", REJECTED: "반려", WITHDRAWAL_PENDING: "철회 요청 중", WITHDRAWN: "철회",
};

function money(value: number, field: string) {
  // The normalized SQL columns are numeric(16,0). Reject rounding and unsafe JS integers.
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a finite, nonnegative whole-won amount within the safe integer range.`);
  return value;
}
function add(left: number, right: number) {
  const total = left + right;
  if (!Number.isSafeInteger(total)) throw new Error("Amount total exceeds the safe integer range.");
  return total;
}
function uniqueIds(rows: readonly { id: string }[], field: string) {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error(`Duplicate ${field} IDs would double count money.`);
}

/** Pending and approved reservations are disjoint while withdrawal awaits confirmation. */
export function trustItemAmounts(item: FundRequestItem) {
  money(item.requestedAmount, "Requested amount");
  money(item.approvedAmount, "Approved amount");
  if (item.requestedAmount <= 0 || item.approvedAmount > item.requestedAmount) throw new Error("Invalid trust item amounts.");
  const state = item.status === "WITHDRAWAL_PENDING" ? item.withdrawalFromStatus : item.status;
  if (!state) throw new Error("Withdrawal needs the previous item status to preserve its reservation.");
  if (state === "APPROVED" && item.approvedAmount !== item.requestedAmount) throw new Error("Full approval must equal the requested amount.");
  if (state === "PARTIAL" && (item.approvedAmount <= 0 || item.approvedAmount >= item.requestedAmount)) throw new Error("Partial approval must be below the requested amount and above zero.");
  const unresolved = state === "PENDING" || state === "REVIEWING" || state === "SUPPLEMENT";
  if ((unresolved || state === "REJECTED" || state === "WITHDRAWN") && item.approvedAmount !== 0) throw new Error("An unresolved or closed item cannot carry an effective approval.");
  return { pending: unresolved ? item.requestedAmount : 0, approved: state === "APPROVED" || state === "PARTIAL" ? item.approvedAmount : 0 };
}

/** Header state summarizes current items; a sibling's resubmission retains existing approvals. */
export function deriveTrustRequestStatus(items: readonly FundRequestItem[], phase: "DRAFT" | "SUBMITTED" | "REVIEWING" = "SUBMITTED"): FundRequestStatus {
  uniqueIds(items, "trust item");
  for (const item of items) trustItemAmounts(item);
  if (phase === "DRAFT") return "DRAFT";
  if (!items.length) throw new Error("A submitted request needs at least one item.");
  if (items.every((item) => item.status === "WITHDRAWN")) return "WITHDRAWN";
  if (items.some((item) => item.status === "WITHDRAWAL_PENDING")) return "WITHDRAWAL_PENDING";
  if (items.some((item) => item.status === "SUPPLEMENT")) return "SUPPLEMENT";
  if (items.every((item) => item.status === "APPROVED" || item.status === "WITHDRAWN")) return "APPROVED";
  if (items.some((item) => item.status === "APPROVED" || item.status === "PARTIAL")) return "PARTIAL";
  if (items.every((item) => item.status === "REJECTED" || item.status === "WITHDRAWN")) return "REJECTED";
  return items.some((item) => item.status === "REVIEWING") ? "REVIEWING" : phase;
}

export function effectiveAllocationAmount(allocation: FundPaymentAllocation, reversals: readonly FundAllocationReversal[]) {
  money(allocation.amount, "Allocation amount");
  const matching = reversals.filter((row) => row.allocationId === allocation.id);
  uniqueIds(matching, "allocation reversal");
  if (matching.length > 1) throw new Error("An allocation can only be reversed once.");
  return matching.length ? 0 : allocation.amount;
}
export function paymentAllocationBalance(payment: FundPayment, allocations: readonly FundPaymentAllocation[], reversals: readonly FundAllocationReversal[]) {
  money(payment.amount, "Payment amount");
  const matching = allocations.filter((allocation) => allocation.paymentId === payment.id);
  uniqueIds(matching, "payment allocation");
  const allocated = matching.reduce((sum, allocation) => add(sum, effectiveAllocationAmount(allocation, reversals)), 0);
  if (allocated > payment.amount) throw new Error("Allocations exceed the actual payment amount.");
  return { actualAmount: payment.amount, allocated, unallocated: payment.amount - allocated };
}

export type FundPaymentState = "REVIEW_REQUIRED" | "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";
export function fundAmounts(source: FundSource, workspace: FundWorkspace) {
  money(source.amount, "Confirmed amount");
  if (source.legacyPaidAmount !== null) money(source.legacyPaidAmount, "Legacy paid amount");
  uniqueIds(workspace.requests, "request");
  uniqueIds(workspace.items, "trust item");
  uniqueIds(workspace.payments, "payment");
  uniqueIds(workspace.allocations, "payment allocation");
  uniqueIds(workspace.reversals, "allocation reversal");
  const requests = new Map(workspace.requests.map((request) => [request.id, request]));
  const sourceItems = workspace.items.filter((item) => item.transactionId === source.id);
  const items = sourceItems.filter((item) => {
    const request = requests.get(item.requestId);
    if (!request) throw new Error("Trust item has no parent request.");
    return request.status !== "DRAFT";
  });
  const sourceAllocations = workspace.allocations.filter((allocation) => allocation.transactionId === source.id);
  const sourceItemIds = new Set(sourceItems.map((item) => item.id));
  const paymentIds = new Set(workspace.payments.map((payment) => payment.id));
  let knownNewPaid = 0;
  const paidByItem = new Map<string, number>();
  for (const allocation of sourceAllocations) {
    if (!paymentIds.has(allocation.paymentId)) throw new Error("Allocation has no actual payment record.");
    if (allocation.trustItemId && !sourceItemIds.has(allocation.trustItemId)) throw new Error("Allocation references another transaction's trust item.");
    const effective = effectiveAllocationAmount(allocation, workspace.reversals);
    const signed = allocation.purpose === "RETURN" ? -effective : effective;
    knownNewPaid = add(knownNewPaid, signed);
    if (allocation.trustItemId) paidByItem.set(allocation.trustItemId, add(paidByItem.get(allocation.trustItemId) ?? 0, signed));
  }
  let pending = 0;
  let approved = 0;
  let approvedRemaining = 0;
  for (const item of items) {
    const amounts = trustItemAmounts(item);
    pending = add(pending, amounts.pending > 0 ? Math.max(0, amounts.pending - (paidByItem.get(item.id) ?? 0)) : 0);
    approved = add(approved, amounts.approved);
    if (amounts.approved > 0) approvedRemaining = add(approvedRemaining, Math.max(0, add(amounts.approved, -(paidByItem.get(item.id) ?? 0))));
  }
  const reviewRequired = source.paymentReviewRequired || (source.legacyPaymentComplete && source.legacyPaidAmount === null);
  const paid = reviewRequired ? null : add(source.legacyPaidAmount ?? 0, knownNewPaid);
  if (paid !== null && paid < 0) throw new Error("Returns exceed the known payments for this transaction.");
  const balance = paid === null ? null : source.amount - paid;
  const remaining = balance === null ? null : Math.max(0, balance);
  const overpaid = balance === null ? null : Math.max(0, -balance);
  // Paid approvals are already in paid: subtract only approved unpaid and unresolved requests.
  const requestable = paid === null ? null : Math.max(0, add(add(add(source.amount, -paid), -approvedRemaining), -pending));
  const paymentState: FundPaymentState = reviewRequired ? "REVIEW_REQUIRED" : overpaid! > 0 ? "OVERPAID" : remaining === 0 ? "PAID" : paid! > 0 ? "PARTIAL" : "UNPAID";
  return { confirmed: source.amount, knownNewPaid, paid, balance, remaining, overpaid, approved, pending, approvedRemaining, requestable, paymentState, reviewRequired, historicalCompleted: source.legacyPaymentComplete };
}

/** A return or top-up contributes only when its actual transaction is linked. */
export function settlementAmounts(input: { advanced: number; used: number; returned: number; additionallyPaid: number }) {
  for (const [field, amount] of Object.entries(input)) money(amount, field);
  const funded = add(add(input.advanced, input.additionallyPaid), -input.returned);
  const balance = add(funded, -input.used);
  return { funded, used: input.used, balance, returnDue: Math.max(0, balance), additionalPaymentDue: Math.max(0, -balance), balanced: balance === 0 };
}
