export const organizationApprovalLine = [
  { approverLabel: "장현제", approverRole: "담당자" },
  { approverLabel: "오학동", approverRole: "사무국장" },
  { approverLabel: "안동연", approverRole: "조합장" },
] as const;

export function getOrganizationApprovalSteps() {
  return organizationApprovalLine.map((step) => ({ ...step }));
}

export function getOrganizationExpenseApprovalLine() {
  return organizationApprovalLine.map((step, index) => ({
    approver: step.approverLabel,
    order: index + 1,
    role: step.approverRole,
    status: "대기" as const,
  }));
}
