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
