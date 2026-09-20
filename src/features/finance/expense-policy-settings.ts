export const expensePolicyStatuses = ["DRAFT", "PENDING", "ACTIVE", "ENDED"] as const;
export type ExpensePolicyStatus = (typeof expensePolicyStatuses)[number];

export type ExpensePolicyValues = {
  normalDays: number;
  delayedDays: number;
  longDelayDays: number;
  rejectAfterDays: number;
  allowLateException: boolean;
  simpleApprovalMax: number;
  generalApprovalMax: number;
  outOfBudgetSeparateApproval: boolean;
  trustBusinessSeparateApproval: boolean;
  relatedPartySeparateApproval: boolean;
  materialityAmount: number;
  materialityMonthlyBudgetPercent: number;
  materialityBudgetOverrun: boolean;
  materialityTrustBusiness: boolean;
  materialityRelatedParty: boolean;
  materialityFraudOrDuplicate: boolean;
  materialityReportedResultChange: boolean;
  materialityAuditImpact: boolean;
  blockPriorYearGeneralSubmission: boolean;
  requireAccountingReview: boolean;
  requireSeniorExceptionApproval: boolean;
  requireExternalAccountantReview: boolean;
  requireBoardWhenNeeded: boolean;
};

export const recommendedExpensePolicyValues: ExpensePolicyValues = {
  normalDays: 30,
  delayedDays: 60,
  longDelayDays: 180,
  rejectAfterDays: 180,
  allowLateException: true,
  simpleApprovalMax: 500_000,
  generalApprovalMax: 3_000_000,
  outOfBudgetSeparateApproval: true,
  trustBusinessSeparateApproval: true,
  relatedPartySeparateApproval: true,
  materialityAmount: 1_000_000,
  materialityMonthlyBudgetPercent: 1,
  materialityBudgetOverrun: true,
  materialityTrustBusiness: true,
  materialityRelatedParty: true,
  materialityFraudOrDuplicate: true,
  materialityReportedResultChange: true,
  materialityAuditImpact: true,
  blockPriorYearGeneralSubmission: true,
  requireAccountingReview: true,
  requireSeniorExceptionApproval: true,
  requireExternalAccountantReview: true,
  requireBoardWhenNeeded: true,
};

export type ExpensePolicyVersion = {
  id: string;
  versionNo: number;
  status: ExpensePolicyStatus;
  effectiveFrom: string;
  effectiveTo?: string;
  changeReason: string;
  policy: ExpensePolicyValues;
  createdBy?: string;
  createdByLabel: string;
  approvedBy?: string;
  approvedByLabel?: string;
  createdAt: string;
  approvedAt?: string;
};

export type ExpensePolicyImpactPreview = {
  pendingExpenseResolutions: number;
  pendingQuickExpenses: number;
  pendingReimbursements: number;
  delayedReimbursements: number;
  longDelayedReimbursements: number;
  priorYearReimbursements: number;
};

export type ExpensePolicyWorkspace = {
  active?: ExpensePolicyVersion;
  versions: ExpensePolicyVersion[];
  preview: ExpensePolicyImpactPreview;
};

export function validateExpensePolicy(values: ExpensePolicyValues) {
  const errors: string[] = [];
  if (values.normalDays < 1) errors.push("정상 접수 기한은 1일 이상이어야 해.");
  if (values.delayedDays <= values.normalDays) errors.push("지연 접수 기한은 정상 접수 기한보다 커야 해.");
  if (values.longDelayDays <= values.delayedDays) errors.push("장기 지연 기준은 지연 접수 기한보다 커야 해.");
  if (values.rejectAfterDays < values.longDelayDays) errors.push("원칙적 거절 기준은 장기 지연 기준보다 작을 수 없어.");
  if (values.simpleApprovalMax < 0 || values.generalApprovalMax <= values.simpleApprovalMax)
    errors.push("일반 승인 한도는 간소 승인 한도보다 커야 해.");
  if (values.materialityAmount < 0) errors.push("중요성 검토 금액은 0원 이상이어야 해.");
  if (values.materialityMonthlyBudgetPercent < 0 || values.materialityMonthlyBudgetPercent > 100)
    errors.push("월 예산 중요성 비율은 0~100% 사이여야 해.");
  return errors;
}

export function normalizeExpensePolicyValues(value: Partial<ExpensePolicyValues> | null | undefined): ExpensePolicyValues {
  return { ...recommendedExpensePolicyValues, ...(value ?? {}) };
}

export const expensePolicyStatusLabels: Record<ExpensePolicyStatus, string> = {
  DRAFT: "초안",
  PENDING: "승인대기",
  ACTIVE: "활성",
  ENDED: "종료",
};
