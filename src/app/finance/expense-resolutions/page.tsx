import { ExpenseResolutionPage } from "@/features/finance/expense-resolution-page";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";
import { listExpenseResolutionsFromSupabase } from "@/features/finance/expense-resolution-repository";
import { listUnresolvedWithdrawalTransactions } from "@/features/finance/expense-compliance-repository";
import { getExpenseComplianceSettings } from "@/features/finance/expense-compliance-repository";
import { getDefaultOrganizationId } from "@/features/finance/expense-compliance-repository";
import { defaultExpenseComplianceSettings } from "@/features/finance/expense-compliance";
import { listApprovalDocuments } from "@/features/approval/approval-repository";
import { listUnresolvedCorporateCardTransactions } from "@/features/finance/corporate-card-transaction-repository";
import { createExpenseEvidenceDownloadUrlAction, deleteExpenseEvidenceAction, deleteExpenseFactConfirmationAction, deleteExpenseResolutionAction, ensureBusinessPartnerFromOcrAction, getExpenseEvidenceOcrJobAction, listExpenseFactConfirmationsAction, retryExpenseEvidenceOcrJobAction, saveExpenseFactConfirmationAction, saveExpenseResolutionAction, transitionExpenseApprovalAction, transitionExpenseDisbursementAction, uploadExpenseFactSupportingFileAction } from "./actions";

export default async function ExpenseResolutionsRoute() {
  let dataLoadError: string | undefined;
  let initialResolutions: ManagedExpenseResolution[] = [];
  let initialBankTransactions: Awaited<ReturnType<typeof listUnresolvedWithdrawalTransactions>> = [];
  let initialCardTransactions: Awaited<ReturnType<typeof listUnresolvedCorporateCardTransactions>> = [];
  let initialApprovalDocuments: Awaited<ReturnType<typeof listApprovalDocuments>> = [];
  let directExpenseSettings = defaultExpenseComplianceSettings;
  try {
    initialResolutions = (await listExpenseResolutionsFromSupabase()) ?? [];
  } catch (error) {
    console.warn(`[expense-resolutions] Supabase data unavailable: ${error instanceof Error ? error.message : String(error)}`);
    dataLoadError = "지출결의 저장소에 연결하지 못했습니다. 목록이 최신 상태가 아닐 수 있습니다. 잠시 후 새로고침해주세요.";
  }
  try {
    initialApprovalDocuments = (await listApprovalDocuments()).filter((document) => document.approvalStatus === "APPROVED");
    const organizationId = await getDefaultOrganizationId();
    if (organizationId) directExpenseSettings = (await getExpenseComplianceSettings(organizationId)) ?? directExpenseSettings;
  } catch (error) {
    console.warn(`[expense-resolutions] Approval policy data unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const [bankResult, cardResult] = await Promise.allSettled([
      listUnresolvedWithdrawalTransactions(),
      listUnresolvedCorporateCardTransactions(),
    ]);
    if (bankResult.status === "fulfilled") initialBankTransactions = bankResult.value;
    else console.warn(`[expense-resolutions] Bank transaction data unavailable: ${bankResult.reason instanceof Error ? bankResult.reason.message : String(bankResult.reason)}`);
    if (cardResult.status === "fulfilled") initialCardTransactions = cardResult.value;
    else console.warn(`[expense-resolutions] Card transaction data unavailable: ${cardResult.reason instanceof Error ? cardResult.reason.message : String(cardResult.reason)}`);
  } catch (error) {
    console.warn(`[expense-resolutions] Bank/card transaction data unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  return (
    <ExpenseResolutionPage
      createEvidenceDownloadUrl={createExpenseEvidenceDownloadUrlAction}
      dataLoadError={dataLoadError}
      deleteEvidence={deleteExpenseEvidenceAction}
      deleteResolution={deleteExpenseResolutionAction}
      ensureBusinessPartnerFromOcr={ensureBusinessPartnerFromOcrAction}
      getEvidenceOcrJob={getExpenseEvidenceOcrJobAction}
      initialResolutions={initialResolutions}
      initialBankTransactions={initialBankTransactions}
      initialCardTransactions={initialCardTransactions}
      initialApprovalDocuments={initialApprovalDocuments}
      directExpenseSettings={directExpenseSettings}
      persistResolution={saveExpenseResolutionAction}
      saveFactConfirmation={saveExpenseFactConfirmationAction}
      listFactConfirmations={listExpenseFactConfirmationsAction}
      deleteFactConfirmation={deleteExpenseFactConfirmationAction}
      uploadFactSupportingFile={uploadExpenseFactSupportingFileAction}
      retryEvidenceOcrJob={retryExpenseEvidenceOcrJobAction}
      transitionApproval={transitionExpenseApprovalAction}
      transitionDisbursement={transitionExpenseDisbursementAction}
    />
  );
}
