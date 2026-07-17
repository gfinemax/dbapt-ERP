export const approvalDocumentTypes = ["GENERAL", "EXPENSE", "CONTRACT"] as const;
export const approvalStatuses = ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "REVISION_REQUESTED", "WITHDRAWN", "CANCELLED"] as const;
export type ApprovalDocumentType = (typeof approvalDocumentTypes)[number];
export type ApprovalStatus = (typeof approvalStatuses)[number];
export type MeetingStatus = "NOT_REQUIRED" | "REQUIRED" | "SCHEDULED" | "APPROVED" | "REJECTED" | "DEFERRED";
export type ExecutionStatus = "NOT_LINKED" | "BUDGET_RESERVED" | "EXECUTION_READY" | "EXPENSE_DRAFT" | "EXPENSE_APPROVED" | "PAID" | "VOUCHER_POSTED" | "CLOSED";

export type ApprovalStep = {
  approverLabel: string;
  approverRole: string;
  comment?: string;
  order: number;
  status: "WAITING" | "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
  actedAt?: string;
};

export type ApprovalDocument = {
  amount: number;
  approvalStatus: ApprovalStatus;
  approvalSteps: ApprovalStep[];
  body: string;
  budgetItem?: string;
  counterpartyName?: string;
  createdAt: string;
  departmentLabel: string;
  documentNo: string;
  documentType: ApprovalDocumentType;
  drafterLabel: string;
  executionStatus: ExecutionStatus;
  expenseResolutionId?: string;
  id: string;
  meetingId?: string;
  contractId?: string;
  meetingStatus: MeetingStatus;
  purpose: string;
  reservedAmount: number;
  title: string;
  updatedAt: string;
  auditLogs?: Array<{ actionType: string; actorLabel: string; comment?: string; createdAt: string; id: string }>;
  attachments?: Array<{ fileName: string; fileSize: number; id: string }>;
};

export type ApprovalDraftLine = { accountSubjectName: string; budgetItem?: string; description: string; partnerName: string; supplyAmount: number; vatAmount: number };
export type ApprovalDraftInput = Pick<ApprovalDocument, "amount" | "body" | "budgetItem" | "counterpartyName" | "departmentLabel" | "documentType" | "drafterLabel" | "purpose" | "title"> & {
  approvalSteps: Array<Pick<ApprovalStep, "approverLabel" | "approverRole">>;
  contractRelated?: boolean; desiredExecutionDate?: string; evidenceKind?: string; expectedEffect?: string; finalMeetingBody?: string;
  fiscalYear?: number; installmentPayment?: boolean; lines?: ApprovalDraftLine[]; meetingConfirmed?: boolean; memberBurden?: boolean;
  outOfBudget?: boolean; paymentDueDate?: string; paymentMethod?: string; projectName?: string; relatedDocument?: string;
  securityLevel?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL"; urgent?: boolean;
};

export const approvalTypeLabels: Record<ApprovalDocumentType, string> = {
  GENERAL: "일반기안",
  EXPENSE: "지출품의",
  CONTRACT: "계약기안",
};

export const approvalStatusLabels: Record<ApprovalStatus, string> = {
  DRAFT: "작성중",
  SUBMITTED: "결재대기",
  IN_REVIEW: "결재중",
  APPROVED: "승인완료",
  REJECTED: "반려",
  REVISION_REQUESTED: "보완요청",
  WITHDRAWN: "회수",
  CANCELLED: "취소",
};

export function validateApprovalDraft(input: ApprovalDraftInput) {
  if (!input.title.trim()) throw new Error("제목을 입력해줘.");
  if (!input.drafterLabel.trim()) throw new Error("기안자를 입력해줘.");
  if (!input.departmentLabel.trim()) throw new Error("부서를 입력해줘.");
  if (!input.purpose.trim()) throw new Error("기안 목적을 입력해줘.");
  if (input.amount < 0 || !Number.isFinite(input.amount)) throw new Error("금액을 올바르게 입력해줘.");
  if (input.documentType !== "GENERAL" && input.amount <= 0) throw new Error("지출·계약 기안은 금액이 필요해.");
  if (!input.approvalSteps.length) throw new Error("결재자를 한 명 이상 지정해줘.");
  const lineTotal = (input.lines ?? []).reduce((sum, line) => sum + line.supplyAmount + line.vatAmount, 0);
  if (input.lines?.length && lineTotal !== input.amount) throw new Error("세부항목 합계와 기안 총액이 일치해야 해.");
}

export function meetingStatusForAmount(amount: number, threshold = 100_000_000): MeetingStatus {
  return amount >= threshold ? "REQUIRED" : "NOT_REQUIRED";
}

export function canExecute(document: Pick<ApprovalDocument, "approvalStatus" | "meetingStatus">) {
  return document.approvalStatus === "APPROVED" && (document.meetingStatus === "NOT_REQUIRED" || document.meetingStatus === "APPROVED");
}

export function calculateBudgetAvailability(approved: number, executed: number, reserved: number, request = 0) {
  const available = approved - executed - reserved;
  return { approved, available, executed, expectedBalance: available - request, request, reserved };
}

export function reconcileReservation(approvedAmount: number, paidAmount: number) {
  if (paidAmount > approvedAmount) return { released: 0, requiresReapproval: true, status: "ADJUSTMENT_REQUIRED" as const };
  return { released: approvedAmount - paidAmount, requiresReapproval: false, status: "CONSUMED" as const };
}

export function isMaterialApprovalChange(before: { amount: number; budgetItem?: string; counterpartyName?: string; meetingStatus: MeetingStatus; projectName?: string }, after: { amount: number; budgetItem?: string; counterpartyName?: string; meetingStatus: MeetingStatus; projectName?: string }) {
  return before.amount !== after.amount || before.budgetItem !== after.budgetItem || before.counterpartyName !== after.counterpartyName || before.meetingStatus !== after.meetingStatus || before.projectName !== after.projectName;
}

export function validateSmallExpensePolicy(input: { amount: number; description: string; limit: number; memo?: string }) {
  if (input.amount > input.limit) throw new Error("소액결의 한도를 초과했어.");
  if (/계약|조합원\s*환불|차입|상환|소송|예산\s*외|추가\s*부담/.test(`${input.description} ${input.memo ?? ""}`)) throw new Error("소액결의 제외 업무야.");
}
