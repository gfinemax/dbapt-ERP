import type { ApprovalDocument } from "./approval-domain";

export type ApprovalDashboardRole =
  "DRAFTER" | "APPROVER" | "CHAIR" | "ACCOUNTING" | "AUDITOR";
export type ApprovalAlert = {
  documentId: string;
  href: string;
  label: string;
  severity: "긴급" | "주의";
  detail: string;
};

export function buildApprovalDashboard(
  documents: ApprovalDocument[],
  actorLabel?: string,
  roles: ApprovalDashboardRole[] = ["DRAFTER", "APPROVER", "ACCOUNTING"],
) {
  const unique = [
    ...new Map(documents.map((document) => [document.id, document])).values(),
  ];
  const pendingMine = unique.filter((document) =>
    document.approvalSteps.some(
      (step) =>
        step.status === "PENDING" &&
        (!actorLabel || step.approverLabel === actorLabel),
    ),
  );
  const meetingPending = unique.filter((document) =>
    ["REQUIRED", "SCHEDULED", "DEFERRED"].includes(document.meetingStatus),
  );
  const executionPending = unique.filter((document) =>
    [
      "BUDGET_RESERVED",
      "EXECUTION_READY",
      "EXPENSE_DRAFT",
      "EXPENSE_APPROVED",
    ].includes(document.executionStatus),
  );
  const attention = unique.filter(
    (document) =>
      document.approvalStatus === "REVISION_REQUESTED" ||
      document.approvalStatus === "REJECTED" ||
      (document.approvalStatus === "APPROVED" &&
        document.meetingStatus === "REQUIRED"),
  );
  const visible = unique.filter((document) =>
    roles.some(
      (role) =>
        role === "AUDITOR" ||
        (role === "DRAFTER" &&
          (!actorLabel || document.drafterLabel === actorLabel)) ||
        (role === "APPROVER" &&
          document.approvalSteps.some(
            (step) => !actorLabel || step.approverLabel === actorLabel,
          )) ||
        (role === "ACCOUNTING" && document.approvalStatus === "APPROVED") ||
        (role === "CHAIR" && document.amount >= 100_000_000),
    ),
  );
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });
  const alerts: ApprovalAlert[] = [];
  for (const document of visible) {
    const href = `/approval/${document.id}`;
    if (
      document.paymentDueDate &&
      document.paymentDueDate < today &&
      !["PAID", "VOUCHER_POSTED", "CLOSED"].includes(document.executionStatus)
    )
      alerts.push({
        detail: `지급예정일 ${document.paymentDueDate} 경과`,
        documentId: document.id,
        href,
        label: "지급예정일 경과",
        severity: "긴급",
      });
    if (document.isOutOfBudget)
      alerts.push({
        detail: "예산 변경 또는 필요한 의결 전 집행 차단",
        documentId: document.id,
        href,
        label: "예산 초과",
        severity: "긴급",
      });
    if (
      document.approvalStatus === "APPROVED" &&
      document.meetingStatus === "REQUIRED"
    )
      alerts.push({
        detail: "필요한 회의 안건이 연결되지 않음",
        documentId: document.id,
        href,
        label: "의결 없이 집행 시도",
        severity: "긴급",
      });
    if (
      ["BUDGET_RESERVED", "EXECUTION_READY", "EXPENSE_DRAFT"].includes(
        document.executionStatus,
      ) &&
      !document.evidenceKind &&
      !document.attachments?.length
    )
      alerts.push({
        detail: "집행 전 증빙을 등록해야 함",
        documentId: document.id,
        href,
        label: "증빙 누락",
        severity: "주의",
      });
    if (document.approvalStatus === "REJECTED")
      alerts.push({
        detail: "반려 후 수정·재상신이 필요함",
        documentId: document.id,
        href,
        label: "반려 후 미수정",
        severity: "주의",
      });
  }
  return {
    cards: [
      {
        count: pendingMine.length,
        href: "/approval?view=to-approve",
        label: "내 결재 대기",
        note: "검토할 문서",
      },
      {
        count: meetingPending.length,
        href: "/approval?view=meeting",
        label: "의결 대기",
        note: "안건 연결 확인",
      },
      {
        count: executionPending.length,
        href: "/approval?view=execution",
        label: "집행 대기",
        note: "예산·회계 처리",
      },
      {
        count: attention.length,
        href: "/approval?view=attention",
        label: "확인 필요",
        note: "보완·연결 누락",
      },
    ],
    tasks: visible
      .filter(
        (document) =>
          pendingMine.includes(document) ||
          meetingPending.includes(document) ||
          executionPending.includes(document) ||
          attention.includes(document),
      )
      .slice(0, 8),
    alerts: [
      ...new Map(
        alerts.map((alert) => [`${alert.documentId}-${alert.label}`, alert]),
      ).values(),
    ],
  };
}
