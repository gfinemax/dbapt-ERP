import { canApproveOn, seoulToday } from "./approval-effective-policy";

export const organizationApprovalLine = [
  { approverLabel: "장현제", approverRole: "이사" },
  { approverLabel: "오학동", approverRole: "사무국장" },
  { approverLabel: "안동연", approverRole: "조합장" },
] as const;

export function getOrganizationApproverDisplayRole(approverLabel: string, approverRole: string) {
  return approverLabel === "장현제" && approverRole === "담당자" ? "이사" : approverRole;
}

export function getOrganizationApprovalSteps(referenceDate = seoulToday()) {
  return organizationApprovalLine.filter(step => canApproveOn(step.approverLabel, referenceDate)).map((step) => ({ ...step }));
}

export function getOrganizationExpenseApprovalLine(referenceDate = seoulToday()) {
  return organizationApprovalLine.filter(step => canApproveOn(step.approverLabel, referenceDate)).map((step, index) => ({
    approver: step.approverLabel,
    order: index + 1,
    role: step.approverRole,
    status: "대기" as const,
  }));
}
