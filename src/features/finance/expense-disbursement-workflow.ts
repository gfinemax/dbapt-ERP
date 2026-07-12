import type { ExpenseResolutionHistoryItem, ManagedExpenseResolution, PaymentMethod, PaymentStatus } from "./expense-resolution-page";

export type DisbursementTransitionRequest = Omit<DisbursementTransitionInput, "resolution" | "voucherNo"> & {
  expectedPaymentStatus: PaymentStatus;
  expectedVoucherStatus?: ManagedExpenseResolution["voucherStatus"];
  idempotencyKey: string;
  resolutionId: string;
};

export type DisbursementCommand = "PAYMENT_COMPLETE" | "ITEM_PAYMENT_COMPLETE" | "PAYMENT_HOLD" | "VOUCHER_CREATE" | "VOUCHER_CONFIRM";

export type DisbursementTransitionInput = {
  actorLabel: string;
  actualPaidAmount?: number;
  command: DisbursementCommand;
  itemNo?: number;
  paidAt?: string;
  paymentAccountNo?: string;
  paymentBank?: string;
  paymentMemo?: string;
  paymentMethod?: PaymentMethod;
  reason?: string;
  resolution: ManagedExpenseResolution;
  transitionedAt?: string;
  voucherNo?: string;
};

export class DisbursementWorkflowError extends Error {}

export function transitionExpenseDisbursement(input: DisbursementTransitionInput): ManagedExpenseResolution {
  if (!input.actorLabel.trim()) throw new DisbursementWorkflowError("처리자를 확인할 수 없습니다.");
  if (input.command === "PAYMENT_COMPLETE") return completePayment(input);
  if (input.command === "ITEM_PAYMENT_COMPLETE") return completeItemPayment(input);
  if (input.command === "PAYMENT_HOLD") return holdPayment(input);
  if (input.command === "VOUCHER_CREATE") return createVoucher(input);
  return confirmVoucher(input);
}

function completePayment(input: DisbursementTransitionInput) {
  const { resolution } = input;
  assertPayable(resolution);
  const amount = input.actualPaidAmount ?? resolution.totalPaymentAmount;
  if (amount !== resolution.totalPaymentAmount) throw new DisbursementWorkflowError("일괄 지급액은 총 결의금액과 일치해야 합니다.");
  if (!input.paidAt || !input.paymentAccountNo || !input.paymentMethod) throw new DisbursementWorkflowError("지급일·출금계좌·지급방법을 확인해주세요.");
  return {
    ...resolution,
    actualPaidAmount: amount,
    accountHolder: resolution.accountHolder,
    expenseItems: resolution.resolutionType === "BATCH" ? resolution.expenseItems.map((item) => ({ ...item, actualPaidAmount: item.totalAmount, paidAt: input.paidAt, paymentMethod: input.paymentMethod!, paymentStatus: "지급완료" as const })) : resolution.expenseItems,
    history: [...resolution.history, history(input, "지급완료", "PAYMENT_COMPLETED", input.paymentMemo || `${input.paymentMethod} 지급완료`)],
    paidAt: input.paidAt,
    paymentAccountNo: input.paymentAccountNo,
    paymentBank: input.paymentBank ?? resolution.paymentBank,
    paymentMemo: input.paymentMemo,
    paymentMethod: input.paymentMethod,
    paymentStatus: "지급완료" as const,
    settlementStatus: resolution.settlementStatus === "추가지급" ? "정산완료" as const : resolution.settlementStatus,
    transferReceiptStatus: "이체확인증 첨부 대기",
  };
}

function completeItemPayment(input: DisbursementTransitionInput) {
  const { resolution } = input;
  assertPayable(resolution);
  if (resolution.resolutionType !== "BATCH" || resolution.batchPaymentMode !== "ITEM") throw new DisbursementWorkflowError("항목별 지급 대상이 아닙니다.");
  if (!input.itemNo || !input.paidAt || !input.paymentMethod || !input.paymentAccountNo) throw new DisbursementWorkflowError("지급할 항목과 지급정보를 확인해주세요.");
  const target = resolution.expenseItems.find((item) => item.itemNo === input.itemNo);
  if (!target) throw new DisbursementWorkflowError("지급할 항목을 찾을 수 없습니다.");
  if (target.paymentStatus === "지급완료") return resolution;
  const expenseItems = resolution.expenseItems.map((item) => item.itemNo === input.itemNo
    ? { ...item, actualPaidAmount: item.totalAmount, paidAt: input.paidAt, paymentMethod: input.paymentMethod!, paymentStatus: "지급완료" as const }
    : item);
  const allPaid = expenseItems.every((item) => item.paymentStatus === "지급완료");
  const actualPaidAmount = expenseItems.filter((item) => item.paymentStatus === "지급완료").reduce((sum, item) => sum + (item.actualPaidAmount ?? item.totalAmount), 0);
  return {
    ...resolution,
    actualPaidAmount,
    expenseItems,
    history: [...resolution.history, history(input, allPaid ? "지급완료" : "부분지급", "PAYMENT_COMPLETED", `${input.itemNo}행 ${input.paymentMethod} 지급완료${input.paymentMemo ? ` · ${input.paymentMemo}` : ""}`)],
    paidAt: allPaid ? input.paidAt : resolution.paidAt,
    paymentAccountNo: input.paymentAccountNo,
    paymentBank: input.paymentBank ?? resolution.paymentBank,
    paymentMemo: input.paymentMemo,
    paymentMethod: input.paymentMethod,
    paymentStatus: allPaid ? "지급완료" as const : "부분지급" as const,
    transferReceiptStatus: "이체확인증 첨부 대기",
  };
}

function holdPayment(input: DisbursementTransitionInput) {
  assertPayable(input.resolution);
  const reason = input.reason?.trim();
  if (!reason) throw new DisbursementWorkflowError("지급보류 사유를 입력해주세요.");
  return { ...input.resolution, holdReason: reason, history: [...input.resolution.history, history(input, "지급보류", "PAYMENT_HOLD", reason)], paymentStatus: "보류" as PaymentStatus };
}

function createVoucher(input: DisbursementTransitionInput) {
  const { resolution, voucherNo } = input;
  if (resolution.paymentStatus !== "지급완료") throw new DisbursementWorkflowError("지급완료 문서만 전표를 생성할 수 있습니다.");
  if (resolution.voucherNo) return resolution;
  if (!voucherNo) throw new DisbursementWorkflowError("전표번호가 필요합니다.");
  if (resolution.resolutionType === "BATCH" && resolution.voucherCreationMode === "ITEM_VOUCHER") {
    const expenseItems = resolution.expenseItems.map((item) => ({ ...item, voucherNo: `${voucherNo}-${String(item.itemNo).padStart(2, "0")}`, voucherStatus: "전표초안" as const }));
    return { ...resolution, expenseItems, history: [...resolution.history, history(input, "지출전표 초안 생성", "VOUCHER_CREATED", `항목별 전표초안 ${expenseItems.map((item) => item.voucherNo).join(", ")} 생성`)], voucherGenerated: true, voucherNo: expenseItems[0]?.voucherNo, voucherStatus: "전표초안" as const };
  }
  return { ...resolution, history: [...resolution.history, history(input, "지출전표 초안 생성", "VOUCHER_CREATED", `전표번호 ${voucherNo} 초안 생성`)], voucherGenerated: true, voucherNo, voucherStatus: "전표초안" as const };
}

function confirmVoucher(input: DisbursementTransitionInput) {
  const { resolution } = input;
  if (!resolution.voucherNo || resolution.voucherStatus !== "전표초안") throw new DisbursementWorkflowError("확정할 전표초안이 없습니다.");
  const transitionedAt = input.transitionedAt ?? currentDateTime();
  return {
    ...resolution,
    expenseItems: resolution.expenseItems.map((item) => item.voucherNo ? { ...item, voucherStatus: "전표확정" as const } : item),
    history: [...resolution.history, history({ ...input, transitionedAt }, "지출전표 확정", "VOUCHER_CREATED", `전표번호 ${resolution.voucherNo} 확정`)],
    voucherConfirmedAt: transitionedAt,
    voucherConfirmedBy: input.actorLabel,
    voucherGenerated: true,
    voucherStatus: "전표확정" as const,
  };
}

function assertPayable(resolution: ManagedExpenseResolution) {
  if (resolution.approvalStatus !== "승인완료" || !["지급대기", "부분지급"].includes(resolution.paymentStatus)) throw new DisbursementWorkflowError("최종 승인된 지급대기 문서만 지급처리할 수 있습니다.");
}

function history(input: DisbursementTransitionInput, actionLabel: string, actionType: ExpenseResolutionHistoryItem["actionType"], comment?: string): ExpenseResolutionHistoryItem {
  const actionAt = input.transitionedAt ?? currentDateTime();
  const parts = input.actorLabel.trim().split(/\s+/);
  const actorTitle = parts.length > 1 ? parts.pop()! : "";
  const actorName = parts.join(" ") || input.actorLabel;
  return { actionAt, actionLabel, actionType, actorName, actorTitle, comment, id: `${actionType}-${actionAt}-${input.actorLabel}-${comment ?? ""}`.replace(/[^\dA-Za-z가-힣-]/g, "") };
}

function currentDateTime() {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeStyle: "short", hour12: false, timeZone: "Asia/Seoul" }).format(new Date()).replace(",", "");
}
