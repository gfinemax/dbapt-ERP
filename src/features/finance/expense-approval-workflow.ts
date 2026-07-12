import { normalizeExpenseTiming } from "./expense-resolution-domain";
import type { ApprovalStep, ExpenseResolutionHistoryItem, ManagedExpenseResolution, PaymentStatus, SettlementStatus } from "./expense-resolution-page";

export type ApprovalWorkflowCommand = "REQUEST" | "APPROVE" | "REJECT";

export type ApprovalTransitionRequest = {
  actorLabel: string;
  command: ApprovalWorkflowCommand;
  expectedCurrentApprover?: string;
  expectedStatus: ManagedExpenseResolution["approvalStatus"];
  reason?: string;
  resolutionId: string;
};

export type ApprovalWorkflowInput = {
  actorLabel: string;
  command: ApprovalWorkflowCommand;
  reason?: string;
  resolution: ManagedExpenseResolution;
  transitionedAt?: string;
};

export class ApprovalWorkflowError extends Error {}

export function transitionExpenseApproval({ actorLabel, command, reason, resolution, transitionedAt = currentSeoulDateTime() }: ApprovalWorkflowInput) {
  if (command === "REQUEST") return requestApproval(resolution, actorLabel, transitionedAt);
  if (command === "APPROVE") return approveCurrentStep(resolution, actorLabel, transitionedAt);
  return rejectCurrentStep(resolution, actorLabel, reason, transitionedAt);
}

function requestApproval(resolution: ManagedExpenseResolution, actorLabel: string, transitionedAt: string) {
  if (resolution.approvalStatus !== "작성중" && resolution.approvalStatus !== "반려") {
    throw new ApprovalWorkflowError("작성중 또는 반려 문서만 승인요청할 수 있습니다.");
  }
  if (resolution.author !== actorLabel) throw new ApprovalWorkflowError("작성자만 승인요청 또는 재상신할 수 있습니다.");
  const isResubmission = resolution.approvalStatus === "반려";
  const approvalLine = resetApprovalLine(resolution.approvalLine);
  const firstApprover = approvalLine[0];
  if (!firstApprover) throw new ApprovalWorkflowError("결재선이 설정되지 않았습니다.");
  return {
    ...resolution,
    approvalLine,
    approvalStatus: "승인대기" as const,
    currentApprover: getApproverLabel(firstApprover),
    history: [...resolution.history, createHistory(transitionedAt, isResubmission ? "재상신" : "승인요청", "REQUESTED_APPROVAL", actorLabel, isResubmission ? resolution.rejectionReason : undefined)],
    paymentStatus: "지급전" as PaymentStatus,
    rejectionReason: undefined,
  };
}

function approveCurrentStep(resolution: ManagedExpenseResolution, actorLabel: string, transitionedAt: string) {
  assertCurrentApprover(resolution, actorLabel);
  const currentStepIndex = resolution.approvalLine.findIndex((step) => getApproverLabel(step) === actorLabel);
  if (currentStepIndex < 0) throw new ApprovalWorkflowError("현재 결재자를 결재선에서 찾을 수 없습니다.");
  if (resolution.approvalLine[currentStepIndex].status === "승인완료") throw new ApprovalWorkflowError("이미 승인한 결재 단계입니다.");

  const approvalLine = resolution.approvalLine.map((step, index) => {
    if (index === currentStepIndex) return { ...step, processedAt: transitionedAt, status: "승인완료" as const };
    if (index === currentStepIndex + 1) return { ...step, status: "결재대기" as const };
    return step;
  });
  const nextStep = approvalLine[currentStepIndex + 1];
  const approvedHistory = createHistory(transitionedAt, "결재승인", "APPROVED", actorLabel, `${actorLabel} 승인`);
  if (nextStep) {
    return { ...resolution, approvalLine, currentApprover: getApproverLabel(nextStep), history: [...resolution.history, approvedHistory] };
  }

  const { paymentStatus, settlementStatus } = getFinalApprovalStatuses(resolution);
  return {
    ...resolution,
    approvalLine,
    approvalStatus: "승인완료" as const,
    currentApprover: undefined,
    expenseItems: resolution.resolutionType === "BATCH" ? resolution.expenseItems.map((item) => ({ ...item, paymentStatus })) : resolution.expenseItems,
    history: [
      ...resolution.history,
      approvedHistory,
      createHistory(transitionedAt, paymentStatus === "지급대기" ? "지급대기 전환" : "지급상태 확인", paymentStatus === "지급대기" ? "PAYMENT_PENDING" : "PAYMENT_COMPLETED", "시스템"),
    ],
    paymentStatus,
    settlementStatus,
  };
}

function rejectCurrentStep(resolution: ManagedExpenseResolution, actorLabel: string, reason: string | undefined, transitionedAt: string) {
  assertCurrentApprover(resolution, actorLabel);
  const rejectionReason = reason?.trim();
  if (!rejectionReason) throw new ApprovalWorkflowError("반려사유를 입력해주세요.");
  return {
    ...resolution,
    approvalLine: resolution.approvalLine.map((step) => getApproverLabel(step) === actorLabel ? { ...step, processedAt: transitionedAt, status: "반려" as const } : step),
    approvalStatus: "반려" as const,
    currentApprover: undefined,
    expenseItems: resolution.expenseItems.map((item) => ({ ...item, paymentStatus: "지급전" as const })),
    history: [...resolution.history, createHistory(transitionedAt, "반려", "REJECTED", actorLabel, rejectionReason)],
    paymentStatus: "지급전" as PaymentStatus,
    rejectionReason,
  };
}

function assertCurrentApprover(resolution: ManagedExpenseResolution, actorLabel: string) {
  if (resolution.approvalStatus !== "승인대기") throw new ApprovalWorkflowError("승인대기 문서만 결재할 수 있습니다.");
  if (!resolution.currentApprover || resolution.currentApprover !== actorLabel) throw new ApprovalWorkflowError("현재 결재자만 승인 또는 반려할 수 있습니다.");
}

function resetApprovalLine(existing: ApprovalStep[]) {
  const source = existing.length ? existing : defaultApprovalLine();
  return source.map((step, index) => ({ ...step, processedAt: undefined, status: index === 0 ? "결재대기" as const : "대기" as const }));
}

function defaultApprovalLine(): ApprovalStep[] {
  return [
    { approver: "장현제", order: 1, role: "부장", status: "결재대기" },
    { approver: "오학동", order: 2, role: "사무장", status: "대기" },
    { approver: "안동연", order: 3, role: "조합장", status: "대기" },
  ];
}

function getFinalApprovalStatuses(resolution: ManagedExpenseResolution): { paymentStatus: PaymentStatus; settlementStatus: SettlementStatus } {
  const timing = normalizeExpenseTiming(resolution);
  const alreadyPaid = timing === "REIMBURSEMENT" && (resolution.expenseBurdenType === "CORPORATE_CARD" || resolution.expenseBurdenType === "ORGANIZATION_PAID");
  const paymentStatus: PaymentStatus = timing === "SETTLEMENT" ? ((resolution.settlementDifference ?? 0) < 0 ? "지급대기" : "지급완료") : alreadyPaid ? "지급완료" : "지급대기";
  const settlementStatus: SettlementStatus = timing !== "SETTLEMENT"
    ? resolution.settlementStatus
    : (resolution.settlementDifference ?? 0) > 0
      ? "환급필요"
      : (resolution.settlementDifference ?? 0) < 0
        ? "추가지급"
        : "정산완료";
  return { paymentStatus, settlementStatus };
}

function getApproverLabel(step: ApprovalStep) {
  return `${step.approver} ${step.role}`;
}

function createHistory(actionAt: string, actionLabel: string, actionType: ExpenseResolutionHistoryItem["actionType"], actorLabel: string, comment?: string): ExpenseResolutionHistoryItem {
  const parts = actorLabel.trim().split(/\s+/);
  const actorTitle = parts.length > 1 ? parts.pop()! : "";
  const actorName = parts.join(" ") || actorLabel;
  return { actionAt, actionLabel, actionType, actorName, actorTitle, comment, id: `${actionType}-${actionAt}-${actorLabel}`.replace(/[^\dA-Za-z가-힣-]/g, "") };
}

function currentSeoulDateTime() {
  const parts = new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeStyle: "short", hour12: false, timeZone: "Asia/Seoul" }).format(new Date());
  return parts.replace(",", "");
}
