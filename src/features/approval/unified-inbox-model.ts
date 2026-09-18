import type { ApprovalDocument } from "./approval-domain";
import { approvalTypeLabels } from "./approval-domain";
import { canDecideApproval } from "./approval-access-model";
import { canApproveExpense } from "@/features/finance/expense-access-model";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";
import type { ReimbursementMember } from "@/features/finance/reimbursement-domain";

export type InboxTask = { key: string; kind: "general" | "expense" | "small"; title: string; label: string; amount: number; href: string };

export function documentInboxTasks(viewer: ReimbursementMember, documents: ApprovalDocument[], resolutions: ManagedExpenseResolution[]): InboxTask[] {
  return [
    ...documents.filter(d => canDecideApproval(d, viewer)).map(d => ({ key: `general:${d.id}`, kind: "general" as const, title: d.title, label: approvalTypeLabels[d.documentType], amount: d.amount, href: `/approval/${d.id}` })),
    ...resolutions.filter(r => canApproveExpense(r, viewer)).map(r => ({ key: `expense:${r.id}`, kind: "expense" as const, title: r.subject || r.resolutionNo, label: `지출결의 · ${r.resolutionNo}`, amount: r.totalPaymentAmount, href: `/approval/inbox?${new URLSearchParams({ type: "expense", id: r.id })}` })),
  ];
}
