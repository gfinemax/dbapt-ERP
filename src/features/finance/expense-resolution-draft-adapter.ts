import type { ExpenseResolution } from "./expense-resolution-data";
import type {
  ApprovalStatus,
  ApprovalStepStatus,
  ManagedExpenseResolution,
  PaymentStatus,
  SettlementStatus,
} from "./expense-resolution-page";

const approvalStatuses: Record<ExpenseResolution["approvalStatus"], ApprovalStatus> = {
  APPROVED: "승인완료",
  DRAFT: "작성중",
  PENDING: "승인대기",
  REJECTED: "반려",
};

const paymentStatuses: Record<ExpenseResolution["paymentStatus"], PaymentStatus> = {
  BEFORE_PAYMENT: "지급전",
  HOLD: "보류",
  PARTIAL_PAID: "부분지급",
  PAID: "지급완료",
  PAYMENT_PENDING: "지급대기",
};

const settlementStatuses: Record<
  NonNullable<ExpenseResolution["settlementStatus"]>,
  SettlementStatus
> = {
  ADDITIONAL_PAYMENT: "추가지급",
  HOLD: "보류",
  NOT_REQUIRED: "정산없음",
  REFUND_REQUIRED: "환급필요",
  SETTLED: "정산완료",
  SETTLEMENT_PENDING: "정산대기",
};

const approvalStepStatuses: Record<
  ExpenseResolution["approvalLines"][number]["status"],
  ApprovalStepStatus
> = {
  APPROVED: "승인완료",
  CURRENT: "결재대기",
  REJECTED: "반려",
  WAITING: "대기",
};

export function toManagedExpenseResolutionDraft(
  resolution: ExpenseResolution,
): ManagedExpenseResolution {
  const approvalLine = resolution.approvalLines.map((line) => ({
    approver: line.approverName,
    order: line.order,
    processedAt: line.approvedAt,
    role: line.approverTitle,
    status: approvalStepStatuses[line.status],
  }));
  const currentApprover = approvalLine.find(
    (step) => step.status === "결재대기",
  );

  return {
    accountHolder: resolution.accountHolder,
    approvalLine,
    approvalStatus: approvalStatuses[resolution.approvalStatus],
    author: `${resolution.createdBy} ${resolution.createdByTitle}`.trim(),
    batchPaymentMode: "GROUP",
    budgetItem: resolution.budgetItem,
    budgetOverReason: resolution.budgetOverReason ?? "",
    budgetSnapshot: {
      budgetCheckStatus: "정상",
      budgetPeriod: resolution.createdAt.slice(0, 7),
      budgetUsageRate: 0,
      calculationBasis: "기안 승인금액",
      currentAnnualBudgetAmount: resolution.totalAmount,
      currentRequestAmount: resolution.totalAmount,
      expectedUsedAmount: resolution.totalAmount,
      monthlyBudgetAmount: resolution.totalAmount,
      paymentWaitingAmount: 0,
      pendingApprovalAmount: resolution.totalAmount,
      previousAnnualBudgetAmount: 0,
      remainingBudgetAmount: 0,
      usedAmount: 0,
    },
    createdAt: resolution.createdAt,
    currentApprover: currentApprover
      ? `${currentApprover.approver} ${currentApprover.role}`
      : undefined,
    evidenceAttached: resolution.evidenceFiles.length > 0,
    evidenceMaterials: resolution.evidenceFiles.map(
      (file) => file.evidenceTypeLabel,
    ),
    expenseItems: [],
    expenseType: resolution.expenseType as ManagedExpenseResolution["expenseType"],
    history: resolution.history.map((item) => ({
      actionAt: item.actionAt,
      actionLabel: item.actionLabel,
      actionType: item.actionType,
      actorName: item.actorName,
      actorTitle: item.actorTitle ?? "",
      comment: item.comment,
      id: item.id,
    })),
    id: resolution.id,
    itemCount: 1,
    memo: resolution.memo ?? "",
    operationExpenseDetail: "",
    overBudgetItemCount: 0,
    paymentAccountNo: resolution.accountNumber,
    paymentBank: resolution.bankName,
    paymentFlowType: "사전결의",
    paymentStatus: paymentStatuses[resolution.paymentStatus],
    plannedPaymentDate: resolution.plannedPaymentDate,
    printRecords: [],
    projectName: resolution.projectName ?? "",
    reason: resolution.reason,
    relatedContract: resolution.relatedContract ?? "",
    relatedMeeting: resolution.relatedMeeting ?? "",
    representativeAccountTitle: resolution.expenseType,
    representativeVendorName: resolution.vendorName,
    resolutionNo: resolution.resolutionNo,
    resolutionType: resolution.resolutionType ?? "SINGLE",
    settlementStatus:
      settlementStatuses[resolution.settlementStatus ?? "NOT_REQUIRED"],
    subject: resolution.subject ?? "",
    supplyAmount: resolution.supplyAmount,
    totalOverBudgetAmount: 0,
    totalPaymentAmount: resolution.totalAmount,
    vat: resolution.vatAmount,
    vendorName: resolution.vendorName,
    voucherCreationMode: "GROUP_VOUCHER",
  };
}
