import type { ApprovalDocument } from "./approval-domain";

export type ApprovalDashboardRole = "DRAFTER" | "APPROVER" | "CHAIR" | "ACCOUNTING" | "AUDITOR";

export function buildApprovalDashboard(documents: ApprovalDocument[], actorLabel?: string, roles: ApprovalDashboardRole[] = ["DRAFTER", "APPROVER", "ACCOUNTING"]) {
  const unique = [...new Map(documents.map((document) => [document.id, document])).values()];
  const pendingMine = unique.filter((document) => document.approvalSteps.some((step) => step.status === "PENDING" && (!actorLabel || step.approverLabel === actorLabel)));
  const meetingPending = unique.filter((document) => ["REQUIRED", "SCHEDULED", "DEFERRED"].includes(document.meetingStatus));
  const executionPending = unique.filter((document) => ["BUDGET_RESERVED", "EXECUTION_READY", "EXPENSE_DRAFT", "EXPENSE_APPROVED"].includes(document.executionStatus));
  const attention = unique.filter((document) => document.approvalStatus === "REVISION_REQUESTED" || document.approvalStatus === "REJECTED" || (document.approvalStatus === "APPROVED" && document.meetingStatus === "REQUIRED"));
  const visible = unique.filter((document) => roles.some((role) => role === "AUDITOR" || (role === "DRAFTER" && (!actorLabel || document.drafterLabel === actorLabel)) || (role === "APPROVER" && document.approvalSteps.some((step) => !actorLabel || step.approverLabel === actorLabel)) || (role === "ACCOUNTING" && document.approvalStatus === "APPROVED") || (role === "CHAIR" && document.amount >= 100_000_000)));
  return {
    cards: [
      { count: pendingMine.length, href: "/approval?view=to-approve", label: "내 결재 대기", note: "검토할 문서" },
      { count: meetingPending.length, href: "/approval?view=meeting", label: "의결 대기", note: "안건 연결 확인" },
      { count: executionPending.length, href: "/approval?view=execution", label: "집행 대기", note: "예산·회계 처리" },
      { count: attention.length, href: "/approval?view=attention", label: "확인 필요", note: "보완·연결 누락" },
    ],
    tasks: visible.filter((document) => pendingMine.includes(document) || meetingPending.includes(document) || executionPending.includes(document) || attention.includes(document)).slice(0, 8),
  };
}
