export const accountTransactionKinds = ["입금", "출금"] as const;
export const accountTransactionMatchStatuses = ["미매칭", "자동매칭", "수동매칭", "매칭확정", "제외"] as const;
export const voucherTypes = ["INCOME", "EXPENSE", "TRANSFER", "REFUND"] as const;
export const voucherStatuses = ["DRAFT", "CONFIRMED", "CANCELLED"] as const;
export const expenseResolutionTypes = [
  "운영비",
  "용역비",
  "토지매입비",
  "업무대행비",
  "법무비",
  "세무비",
  "감정평가비",
  "환불금",
  "차입금상환",
  "총회비",
  "인쇄비",
  "우편비",
  "홍보비",
  "행사운영비",
  "비품비",
  "소모품비",
  "기타",
] as const;
export const expenseResolutionDocumentTypes = ["SINGLE", "BATCH"] as const;
export const expenseResolutionBatchPaymentModes = ["GROUP", "ITEM"] as const;
export const expenseResolutionVoucherCreationModes = ["GROUP_VOUCHER", "ITEM_VOUCHER"] as const;
export const expenseResolutionApprovalStatuses = ["DRAFT", "PENDING", "APPROVED", "REJECTED"] as const;
export const expenseResolutionPaymentStatuses = ["BEFORE_PAYMENT", "PAYMENT_PENDING", "PARTIAL_PAID", "PAID", "HOLD"] as const;
export const expensePaymentFlowTypes = ["PRE_APPROVAL", "ADVANCE_PAYMENT", "POST_SETTLEMENT"] as const;
export const settlementStatuses = ["NOT_REQUIRED", "SETTLEMENT_PENDING", "SETTLED", "ADDITIONAL_PAYMENT", "REFUND_REQUIRED", "HOLD"] as const;
export const budgetCheckStatuses = ["NORMAL", "WARNING", "EXCEEDED"] as const;
export const approvalLineStatuses = ["WAITING", "CURRENT", "APPROVED", "REJECTED"] as const;
export const evidenceDocumentTypes = ["TAX_INVOICE", "INVOICE", "RECEIPT", "CASH_RECEIPT", "TRANSFER_CONFIRMATION", "CONTRACT", "ESTIMATE", "MEETING_RESOLUTION", "OTHER"] as const;
export const resolutionHistoryActionTypes = [
  "CREATED",
  "SAVED_DRAFT",
  "REQUESTED_APPROVAL",
  "APPROVED",
  "REJECTED",
  "PAYMENT_PENDING",
  "PAYMENT_COMPLETED",
  "PAYMENT_HOLD",
  "VOUCHER_CREATED",
  "EVIDENCE_ATTACHED",
  "PRINTED",
  "ARCHIVED",
  "UPDATED",
] as const;
export const paymentMethods = ["BANK_TRANSFER", "CARD", "CASH", "OTHER"] as const;
export const memberPaymentMatchStatuses = ["미매칭", "자동매칭", "수동매칭", "매칭확정"] as const;
export const budgetItemFields = ["예산항목", "승인예산", "집행액", "잔액", "집행률"] as const;

export type AccountTransactionKind = (typeof accountTransactionKinds)[number];
export type AccountTransactionMatchStatus = (typeof accountTransactionMatchStatuses)[number];
export type VoucherType = (typeof voucherTypes)[number];
export type VoucherStatus = (typeof voucherStatuses)[number];
export type ExpenseResolutionType = (typeof expenseResolutionTypes)[number];
export type ExpenseResolutionDocumentType = (typeof expenseResolutionDocumentTypes)[number];
export type ExpenseResolutionBatchPaymentMode = (typeof expenseResolutionBatchPaymentModes)[number];
export type ExpenseResolutionVoucherCreationMode = (typeof expenseResolutionVoucherCreationModes)[number];
export type ExpenseResolutionApprovalStatus = (typeof expenseResolutionApprovalStatuses)[number];
export type ExpenseResolutionPaymentStatus = (typeof expenseResolutionPaymentStatuses)[number];
export type ExpensePaymentFlowType = (typeof expensePaymentFlowTypes)[number];
export type SettlementStatus = (typeof settlementStatuses)[number];
export type BudgetCheckStatus = (typeof budgetCheckStatuses)[number];
export type ApprovalLineStatus = (typeof approvalLineStatuses)[number];
export type EvidenceType = (typeof evidenceDocumentTypes)[number];
export type ResolutionHistoryActionType = (typeof resolutionHistoryActionTypes)[number];
export type PaymentMethod = (typeof paymentMethods)[number];
export type MemberPaymentMatchStatus = (typeof memberPaymentMatchStatuses)[number];

export type ApprovalLine = {
  approvedAt?: string;
  approverName: string;
  approverTitle: string;
  comment?: string;
  id: string;
  order: number;
  status: ApprovalLineStatus;
};

export type EvidenceFile = {
  amount?: number;
  evidenceType: EvidenceType;
  evidenceTypeLabel: string;
  fileName: string;
  fileUrl?: string;
  id: string;
  issuer?: string;
  uploadedAt: string;
  uploadedBy: string;
};

export type ResolutionHistory = {
  actionAt: string;
  actionLabel: string;
  actionType: ResolutionHistoryActionType;
  actorName: string;
  actorTitle?: string;
  comment?: string;
  id: string;
};

export type PrintRecord = {
  id: string;
  printNo: string;
  printedAt: string;
  printedBy: string;
  printPurpose: "미리보기" | "보관용" | "감사대응" | "재출력";
  copyKind: "원본" | "사본" | "재출력";
  storageLocation?: string;
  memo?: string;
};

export type ExpenseResolutionItem = {
  accountTitle: string;
  allocatedBudget?: number;
  budgetItem: string;
  budgetStatus?: "NORMAL" | "OVER_BUDGET";
  currentRequestAmount?: number;
  description?: string;
  evidenceFileName?: string;
  evidenceType?: string;
  executedAmount?: number;
  expenseDate?: string;
  expenseType: string;
  id: string;
  itemNo: number;
  itemTitle: string;
  memo?: string;
  overBudgetAmount?: number;
  overBudgetReason?: string;
  actualPaidAmount?: number;
  paidAt?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus: ExpenseResolutionPaymentStatus;
  remainingBudget?: number;
  supplyAmount: number;
  totalAmount: number;
  vatAmount: number;
  vendorName: string;
  voucherNo?: string;
};

export type ExpenseResolution = {
  accountHolder: string;
  accountNumber: string;
  actualPaidAmount?: number;
  approvalLines: ApprovalLine[];
  approvalStatus: ExpenseResolutionApprovalStatus;
  bankName: string;
  batchPaymentMode?: ExpenseResolutionBatchPaymentMode;
  budgetItem: string;
  budgetOverReason?: string;
  createdAt: string;
  createdBy: string;
  createdByTitle: string;
  currentApprover?: string;
  currentApproverTitle?: string;
  evidenceFiles: EvidenceFile[];
  expenseItems?: ExpenseResolutionItem[];
  expenseType: string;
  history: ResolutionHistory[];
  id: string;
  itemCount?: number;
  memo?: string;
  overBudgetItemCount?: number;
  paidAt?: string;
  paymentMethod?: PaymentMethod;
  paymentFlowType?: ExpensePaymentFlowType;
  paymentStatus: ExpenseResolutionPaymentStatus;
  settlementStatus?: SettlementStatus;
  operationExpenseDetail?: string;
  budgetPeriod?: string;
  calculationBasis?: string;
  currentAnnualBudgetAmount?: number;
  monthlyBudgetAmount?: number;
  previousAnnualBudgetAmount?: number;
  usedAmount?: number;
  pendingApprovalAmount?: number;
  paymentWaitingAmount?: number;
  currentRequestAmount?: number;
  expectedUsedAmount?: number;
  remainingBudgetAmount?: number;
  budgetUsageRate?: number;
  budgetCheckStatus?: BudgetCheckStatus;
  advancePaidAt?: string;
  advancePayer?: string;
  advancePaymentMethod?: PaymentMethod;
  advancePaidAmount?: number;
  actualUsedAmount?: number;
  settlementDifference?: number;
  settlementDifferenceAction?: "NONE" | "ADDITIONAL_PAYMENT" | "REFUND_REQUIRED";
  advanceReason?: string;
  postApprovalReason?: string;
  plannedPaymentDate: string;
  projectName?: string;
  printRecords?: PrintRecord[];
  reason: string;
  representativeAccountTitle?: string;
  representativeVendorName?: string;
  rejectionReason?: string;
  relatedContract?: string;
  relatedMeeting?: string;
  resolutionNo: string;
  supplyAmount: number;
  totalAmount: number;
  totalOverBudgetAmount?: number;
  totalSupplyAmount?: number;
  totalVatAmount?: number;
  vatAmount: number;
  vendorName: string;
  voucherCreationMode?: ExpenseResolutionVoucherCreationMode;
  voucherNo?: string;
  resolutionType?: ExpenseResolutionDocumentType;
};

export type Voucher = {
  accountTitle: string;
  amount: number;
  createdAt: string;
  createdBy: string;
  evidenceConfirmed: boolean;
  evidenceLinked: boolean;
  id: string;
  paymentConfirmed: boolean;
  relatedResolutionNo?: string;
  voucherStatus: VoucherStatus;
  vendorName: string;
  voucherDate: string;
  voucherNo: string;
  voucherType: VoucherType;
};

export type AccountTransaction = {
  accountId: string;
  accountName: string;
  amount: number;
  description: string;
  id: string;
  matchStatus: AccountTransactionMatchStatus;
  matchedMemberPaymentId?: string;
  matchedVoucherId?: string;
  occurredAt: string;
  transactionKind: AccountTransactionKind;
};

export type BudgetItem = {
  approvedBudget: number;
  budgetCode: string;
  executedAmount: number;
  executionRate: number;
  id: string;
  name: string;
  parentId?: string;
  remainingAmount: number;
};

export type MemberPayment = {
  accountTransactionId?: string;
  actualPaidAmount: number;
  dueAmount: number;
  matchStatus: MemberPaymentMatchStatus;
  memberId: string;
  memberName: string;
  overdueAmount: number;
  paymentRound: number;
  scheduledDueDate: string;
  voucherId?: string;
};

export type FinanceEntityName =
  | "AccountTransaction"
  | "Voucher"
  | "ExpenseResolution"
  | "ApprovalLine"
  | "EvidenceFile"
  | "ResolutionHistory"
  | "BudgetItem"
  | "MemberPayment";

export type FinanceModelRelation = {
  from: FinanceEntityName;
  kind: "many-to-one" | "one-to-many";
  to: FinanceEntityName;
  via: string;
};

export const financeModelRelations: FinanceModelRelation[] = [
  {
    from: "AccountTransaction",
    kind: "many-to-one",
    to: "Voucher",
    via: "matchedVoucherId",
  },
  {
    from: "AccountTransaction",
    kind: "many-to-one",
    to: "MemberPayment",
    via: "matchedMemberPaymentId",
  },
  {
    from: "Voucher",
    kind: "many-to-one",
    to: "ExpenseResolution",
    via: "relatedResolutionNo",
  },
  {
    from: "ExpenseResolution",
    kind: "one-to-many",
    to: "ApprovalLine",
    via: "approvalLines",
  },
  {
    from: "ExpenseResolution",
    kind: "one-to-many",
    to: "EvidenceFile",
    via: "evidenceFiles",
  },
  {
    from: "ExpenseResolution",
    kind: "one-to-many",
    to: "ResolutionHistory",
    via: "history",
  },
  {
    from: "ExpenseResolution",
    kind: "many-to-one",
    to: "BudgetItem",
    via: "budgetItem",
  },
  {
    from: "MemberPayment",
    kind: "many-to-one",
    to: "Voucher",
    via: "voucherId",
  },
];

export function formatCurrency(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

export function createDefaultApprovalLines(): ApprovalLine[] {
  return [
    {
      id: "approval-line-1",
      order: 1,
      approverName: "장현제",
      approverTitle: "부장",
      status: "WAITING",
    },
    {
      id: "approval-line-2",
      order: 2,
      approverName: "오학동",
      approverTitle: "사무장",
      status: "WAITING",
    },
    {
      id: "approval-line-3",
      order: 3,
      approverName: "안동연",
      approverTitle: "조합장",
      status: "WAITING",
    },
  ];
}

export function getNextResolutionNo(existingCount: number, year = 2026): string {
  return `지결-${year}-${String(existingCount + 1).padStart(4, "0")}`;
}

export function getNextVoucherNo(existingCount: number): string {
  return `지출-2026-${String(existingCount + 1).padStart(4, "0")}`;
}

export function getApprovalStatusLabel(status: ExpenseResolutionApprovalStatus): string {
  const labels: Record<ExpenseResolutionApprovalStatus, string> = {
    APPROVED: "승인완료",
    DRAFT: "작성중",
    PENDING: "승인대기",
    REJECTED: "반려",
  };

  return labels[status];
}

export function getPaymentStatusLabel(status: ExpenseResolutionPaymentStatus): string {
  const labels: Record<ExpenseResolutionPaymentStatus, string> = {
    BEFORE_PAYMENT: "지급전",
    HOLD: "보류",
    PARTIAL_PAID: "부분지급",
    PAID: "지급완료",
    PAYMENT_PENDING: "지급대기",
  };

  return labels[status];
}

const budgetItem: BudgetItem = {
  id: "budget-legal",
  budgetCode: "OPS-LEGAL",
  name: "운영비 > 법무비",
  approvedBudget: 50000000,
  executedAmount: 3300000,
  remainingAmount: 46700000,
  executionRate: 6.6,
};

const expenseResolution: ExpenseResolution = {
  id: "expense-resolution-0001",
  resolutionNo: "지결-2026-0001",
  createdAt: "2026-06-07",
  createdBy: "사무국",
  createdByTitle: "관리자",
  plannedPaymentDate: "2026-06-14",
  expenseType: "법무비",
  budgetItem: budgetItem.id,
  vendorName: "법무법인 ○○",
  bankName: "국민은행",
  accountNumber: "123456-78-901234",
  accountHolder: "법무법인 ○○",
  supplyAmount: 3000000,
  vatAmount: 300000,
  totalAmount: 3300000,
  reason: "동작구청 대응 및 업무대행계약 검토 관련 법률자문료 지급",
  relatedContract: "업무대행계약 검토 용역",
  relatedMeeting: "제12차 이사회 의결",
  approvalStatus: "PENDING",
  paymentStatus: "PAYMENT_PENDING",
  paymentFlowType: "PRE_APPROVAL",
  settlementStatus: "NOT_REQUIRED",
  budgetPeriod: "2026-07",
  calculationBasis: "기존 지출결의서 법무비 예산 연계",
  currentAnnualBudgetAmount: 51600000,
  monthlyBudgetAmount: 50000000,
  previousAnnualBudgetAmount: 51600000,
  usedAmount: 3300000,
  pendingApprovalAmount: 0,
  paymentWaitingAmount: 3300000,
  currentRequestAmount: 3300000,
  expectedUsedAmount: 6600000,
  remainingBudgetAmount: 43400000,
  budgetUsageRate: 13.2,
  budgetCheckStatus: "NORMAL",
  currentApprover: "장현제",
  currentApproverTitle: "부장",
  approvalLines: createDefaultApprovalLines().map((line) => (line.order === 1 ? { ...line, status: "CURRENT" } : line)),
  evidenceFiles: [
    {
      id: "evidence-0001",
      evidenceType: "TAX_INVOICE",
      evidenceTypeLabel: "세금계산서",
      fileName: "jigyeol-2026-0001-tax-invoice.pdf",
      fileUrl: "/files/finance/jigyeol-2026-0001-tax-invoice.pdf",
      issuer: "법무법인 ○○",
      amount: 3300000,
      uploadedAt: "2026-06-07",
      uploadedBy: "사무국 관리자",
    },
  ],
  history: [
    {
      id: "history-0001",
      actionType: "CREATED",
      actionLabel: "지출결의서 작성",
      actorName: "오학동",
      actorTitle: "사무장",
      actionAt: "2026-07-02 10:30",
    },
    {
      id: "history-0002",
      actionType: "REQUESTED_APPROVAL",
      actionLabel: "승인요청",
      actorName: "오학동",
      actorTitle: "사무장",
      actionAt: "2026-07-02 10:35",
    },
  ],
  printRecords: [
    {
      id: "print-0001",
      printNo: "PRINT-2026-0001",
      printedAt: "2026-07-03 10:10",
      printedBy: "오학동 사무장",
      printPurpose: "보관용",
      copyKind: "원본",
      storageLocation: "2026년 운영비 지출결의서 / 7월 / 001",
    },
  ],
  memo: "승인 후 운영계좌에서 이체 예정",
};

const voucher: Voucher = {
  id: "voucher-0001",
  voucherNo: "지출-2026-0001",
  voucherDate: "2026-06-14",
  voucherType: "EXPENSE",
  voucherStatus: "DRAFT",
  accountTitle: "법무비",
  vendorName: expenseResolution.vendorName,
  amount: expenseResolution.totalAmount,
  relatedResolutionNo: expenseResolution.resolutionNo,
  evidenceLinked: true,
  paymentConfirmed: false,
  evidenceConfirmed: false,
  createdAt: "2026-06-14",
  createdBy: "사무국 관리자",
};

const accountTransaction: AccountTransaction = {
  id: "account-transaction-0001",
  transactionKind: "출금",
  occurredAt: "2026-06-14",
  amount: expenseResolution.totalAmount,
  description: "법무법인 ○○ 법률자문료 이체",
  accountId: "bank-operation",
  accountName: "국민은행 운영계좌",
  matchStatus: "매칭확정",
  matchedVoucherId: voucher.id,
};

const memberPayment: MemberPayment = {
  memberId: "member-000124",
  memberName: "김민준",
  paymentRound: 1,
  scheduledDueDate: "2026-06-05",
  dueAmount: 380000000,
  actualPaidAmount: 380000000,
  overdueAmount: 0,
  matchStatus: "매칭확정",
  accountTransactionId: "account-transaction-income-0001",
  voucherId: "voucher-income-0001",
};

export const financeModelExample = {
  accountTransaction,
  budgetItem,
  evidenceFile: expenseResolution.evidenceFiles[0],
  expenseResolution,
  memberPayment,
  voucher,
};
