import type { ReimbursementMember } from "./reimbursement-domain";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

export function canApproveExpense(resolution: ManagedExpenseResolution, viewer: ReimbursementMember) {
  const index = resolution.approvalLine.findIndex(step => step.status === "결재대기");
  return viewer.active && resolution.approvalStatus === "승인대기" && index >= 0 &&
    resolution.authorization?.steps.some(step => step.order === index + 1 && step.approver_user_id === viewer.user_id) === true;
}

export function canEditExpense(resolution: ManagedExpenseResolution, viewer: ReimbursementMember) {
  return viewer.active && ["작성중", "반려", "승인대기"].includes(resolution.approvalStatus) &&
    (viewer.permissions.includes("ADMIN") || resolution.authorization?.author_user_id === viewer.user_id);
}
