import { ExpenseResolutionPage } from "@/features/finance/expense-resolution-page";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";
import { listExpenseResolutionsFromSupabase } from "@/features/finance/expense-resolution-repository";
import { listUnresolvedWithdrawalTransactions } from "@/features/finance/expense-compliance-repository";
import { createExpenseEvidenceDownloadUrlAction, deleteExpenseEvidenceAction, deleteExpenseFactConfirmationAction, deleteExpenseResolutionAction, ensureBusinessPartnerFromOcrAction, getExpenseEvidenceOcrJobAction, listExpenseFactConfirmationsAction, retryExpenseEvidenceOcrJobAction, saveExpenseFactConfirmationAction, saveExpenseResolutionAction, transitionExpenseApprovalAction, transitionExpenseDisbursementAction, uploadExpenseEvidenceAction, uploadExpenseFactSupportingFileAction } from "./actions";

export default async function ExpenseResolutionsRoute() {
  let dataLoadError: string | undefined;
  let initialResolutions: ManagedExpenseResolution[] = [];
  let initialBankTransactions: Awaited<ReturnType<typeof listUnresolvedWithdrawalTransactions>> = [];
  try {
    initialResolutions = (await listExpenseResolutionsFromSupabase()) ?? [];
  } catch (error) {
    console.warn(`[expense-resolutions] Supabase data unavailable: ${error instanceof Error ? error.message : String(error)}`);
    dataLoadError = "지출결의 저장소에 연결하지 못했습니다. 목록이 최신 상태가 아닐 수 있습니다. 잠시 후 새로고침해주세요.";
  }
  try {
    initialBankTransactions = await listUnresolvedWithdrawalTransactions();
  } catch (error) {
    console.warn(`[expense-resolutions] Bank transaction data unavailable: ${error instanceof Error ? error.message : String(error)}`);
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
      persistResolution={saveExpenseResolutionAction}
      saveFactConfirmation={saveExpenseFactConfirmationAction}
      listFactConfirmations={listExpenseFactConfirmationsAction}
      deleteFactConfirmation={deleteExpenseFactConfirmationAction}
      uploadFactSupportingFile={uploadExpenseFactSupportingFileAction}
      retryEvidenceOcrJob={retryExpenseEvidenceOcrJobAction}
      transitionApproval={transitionExpenseApprovalAction}
      transitionDisbursement={transitionExpenseDisbursementAction}
      uploadEvidence={uploadExpenseEvidenceAction}
    />
  );
}
