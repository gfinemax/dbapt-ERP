import { listApprovedApprovalDocumentCandidates } from "@/features/approval/approval-repository";
import { defaultExpenseComplianceSettings } from "./expense-compliance";
import { getExpenseComplianceSettings, listUnresolvedWithdrawalTransactions } from "./expense-compliance-repository";
import { listUnresolvedCorporateCardTransactions } from "./corporate-card-transaction-repository";
import type { ExpenseResolutionFormOptions } from "./expense-resolution-form-options";
import { listOperatingExpenseDetails } from "./operating-budget-repository";
import { requireExpenseActor } from "./expense-authorization";
import { getNextExpenseResolutionNoFromSupabase } from "./expense-resolution-repository";

export async function loadExpenseResolutionFormOptions(): Promise<ExpenseResolutionFormOptions> {
  const actor = await requireExpenseActor();
  const organizationId = actor.organization_id;
  const [approvalDocuments, directExpenseSettings, bankTransactions, cardTransactions, expenseDetails, nextResolutionNo] = await Promise.all([
    listApprovedApprovalDocumentCandidates(organizationId, 50),
    getExpenseComplianceSettings(organizationId),
    listUnresolvedWithdrawalTransactions(organizationId, 50),
    listUnresolvedCorporateCardTransactions(organizationId, 50),
    listOperatingExpenseDetails(organizationId),
    getNextExpenseResolutionNoFromSupabase(actor),
  ]);

  return {
    approvalDocuments,
    bankTransactions,
    cardTransactions,
    directExpenseSettings: directExpenseSettings ?? defaultExpenseComplianceSettings,
    expenseDetails,
    nextResolutionNo,
  };
}
