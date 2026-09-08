import type { ApprovalDocument } from "./approval-domain";
import type { ReimbursementMember } from "@/features/finance/reimbursement-domain";
export function canDecideApproval(document: ApprovalDocument, viewer?: ReimbursementMember) {
 const current = document.approvalSteps.find(step => step.status === "PENDING");
 return !!viewer?.active && viewer.permissions.some(permission => ["ADMIN", "APPROVE"].includes(permission)) && ["SUBMITTED", "IN_REVIEW"].includes(document.approvalStatus) && !!current && document.authorization?.steps.some(step => step.order === current.order && step.user_id === viewer.user_id) === true;
}
export function isApprovalAuthor(document: ApprovalDocument, viewer?: ReimbursementMember) { return !!viewer?.active && document.authorization?.drafter_user_id === viewer.user_id; }
