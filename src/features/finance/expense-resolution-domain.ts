export const resolutionModes = ["SINGLE", "PROJECT_BULK"] as const;
export const expenseTimings = ["ADVANCE", "REIMBURSEMENT", "SETTLEMENT"] as const;
export const expenseInputMethods = ["MANUAL", "EXCEL", "EVIDENCE_OCR"] as const;
export const executionMethods = ["VENDOR_DIRECT", "EMPLOYEE_ADVANCE", "CORPORATE_CARD", "AUTHORIZATION_ONLY"] as const;
export const expenseBurdenTypes = ["EMPLOYEE_PREPAID", "VENDOR_UNPAID", "CORPORATE_CARD", "ORGANIZATION_PAID", "CASH"] as const;

export type ResolutionMode = (typeof resolutionModes)[number];
export type ExpenseTiming = (typeof expenseTimings)[number];
export type ExpenseInputMethod = (typeof expenseInputMethods)[number];
export type ExecutionMethod = (typeof executionMethods)[number];
export type ExpenseBurdenType = (typeof expenseBurdenTypes)[number];

export type ExpenseResolutionWorkflowFields = {
  expenseTiming?: ExpenseTiming;
  executionMethod?: ExecutionMethod;
  expenseBurdenType?: ExpenseBurdenType;
  inputMethod?: ExpenseInputMethod;
  projectName?: string;
  resolutionMode?: ResolutionMode;
  subject?: string;
  totalPaymentAmount?: number;
  plannedPaymentDate?: string;
  reason?: string;
  paymentAccountNo?: string;
  originalResolutionId?: string;
  advancePaidAmount?: number;
  actualUsedAmount?: number;
  settlementDueDate?: string;
  settlementManager?: string;
  itemCount?: number;
  invalidItemCount?: number;
  accountAllocationTotal?: number;
  evidenceCount?: number;
};

export function normalizeResolutionMode(value: ExpenseResolutionWorkflowFields & { resolutionType?: "SINGLE" | "BATCH" }): ResolutionMode {
  return value.resolutionMode ?? (value.resolutionType === "BATCH" ? "PROJECT_BULK" : "SINGLE");
}

export function normalizeExpenseTiming(value: ExpenseResolutionWorkflowFields & { paymentFlowType?: string }): ExpenseTiming {
  if (value.expenseTiming) return value.expenseTiming;
  if (value.paymentFlowType === "사후정산" || value.paymentFlowType === "POST_SETTLEMENT") return "REIMBURSEMENT";
  if (value.paymentFlowType === "선지급" || value.paymentFlowType === "ADVANCE_PAYMENT") return "SETTLEMENT";
  return "ADVANCE";
}

export function normalizeInputMethod(value: ExpenseResolutionWorkflowFields): ExpenseInputMethod {
  return value.inputMethod ?? "MANUAL";
}

export function validateExpenseResolutionWorkflow(value: ExpenseResolutionWorkflowFields & { resolutionType?: "SINGLE" | "BATCH"; paymentFlowType?: string }) {
  const errors: string[] = [];
  const mode = normalizeResolutionMode(value);
  const timing = normalizeExpenseTiming(value);
  const inputMethod = normalizeInputMethod(value);

  if (mode === "SINGLE" && inputMethod === "EXCEL") errors.push("엑셀 일괄등록은 프로젝트 일괄 지출결의에서만 사용할 수 있습니다.");
  if (!value.subject?.trim()) errors.push("건명을 입력해주세요.");
  if (!value.projectName?.trim()) errors.push("프로젝트/사업과제를 선택해주세요.");
  if (!value.plannedPaymentDate) errors.push(timing === "ADVANCE" ? "집행예정일을 입력해주세요." : timing === "REIMBURSEMENT" ? "실제 지출일을 입력해주세요." : "정산일을 입력해주세요.");
  if (!value.totalPaymentAmount || value.totalPaymentAmount <= 0) errors.push("총금액은 0원보다 커야 합니다.");
  if (!value.reason?.trim()) errors.push(timing === "SETTLEMENT" ? "정산사유를 입력해주세요." : "지출사유를 입력해주세요.");
  if (!value.paymentAccountNo?.trim()) errors.push("지급계좌를 확인해주세요.");
  if (value.itemCount !== undefined && value.itemCount < 1) errors.push("품목을 한 개 이상 입력해주세요.");
  if (value.invalidItemCount) errors.push("품목명·수량·단가를 확인해주세요.");
  if (value.accountAllocationTotal !== undefined && value.totalPaymentAmount !== undefined && Math.abs(value.accountAllocationTotal - value.totalPaymentAmount) > 0.5) {
    errors.push("계정과목 분할금액 합계가 총지급금액과 일치해야 합니다.");
  }
  if (value.evidenceCount !== undefined && value.evidenceCount < 1) errors.push("증빙자료를 한 개 이상 첨부해주세요.");
  if (timing === "ADVANCE" && !value.executionMethod) errors.push("집행방식을 선택해주세요.");
  if (timing === "ADVANCE" && value.executionMethod === "EMPLOYEE_ADVANCE") {
    if (!value.settlementDueDate) errors.push("정산기한을 입력해주세요.");
    if (!value.settlementManager?.trim()) errors.push("정산담당자를 입력해주세요.");
  }
  if (timing === "REIMBURSEMENT" && !value.expenseBurdenType) errors.push("비용부담 유형을 선택해주세요.");
  if (timing === "SETTLEMENT") {
    if (!value.originalResolutionId) errors.push("정산할 원 사전결의를 선택해주세요.");
    if (!value.advancePaidAmount || value.advancePaidAmount <= 0) errors.push("선지급액은 0원보다 커야 합니다.");
    if (value.actualUsedAmount === undefined || value.actualUsedAmount < 0) errors.push("실제 사용액을 확인해주세요.");
  }

  return { errors, expenseTiming: timing, inputMethod, resolutionMode: mode };
}
