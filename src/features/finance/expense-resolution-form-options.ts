import type { ApprovalDocumentCandidate } from "@/features/approval/approval-domain";
import type { CorporateCardTransactionCandidate } from "./corporate-card-transaction";
import type { ExpenseComplianceSettings } from "./expense-compliance";
import type { BankTransactionResolutionCandidate } from "./expense-compliance-repository";
import type { OperatingExpenseDetail } from "./operating-budget-classification";

export type ExpenseResolutionFormOptions = {
  approvalDocuments: ApprovalDocumentCandidate[];
  bankTransactions: BankTransactionResolutionCandidate[];
  cardTransactions: CorporateCardTransactionCandidate[];
  directExpenseSettings: ExpenseComplianceSettings;
  expenseDetails: OperatingExpenseDetail[];
  nextResolutionNo?: string;
};

export function getEditBankTransactionCandidates(
  candidates: BankTransactionResolutionCandidate[],
  editingResolutionId: string | null,
  form: { bankTransactionId?: string; bankTransactions?: Array<{ id: string }> },
) {
  if (!editingResolutionId) return candidates;
  const linkedIds = new Set([
    form.bankTransactionId,
    ...(form.bankTransactions ?? []).map((transaction) => transaction.id),
  ].filter((id): id is string => Boolean(id)));
  if (!linkedIds.size) return candidates;
  return candidates.filter((transaction) => linkedIds.has(transaction.id));
}
