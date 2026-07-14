import { ExpenseResolutionPage } from "@/features/finance/expense-resolution-page";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";
import { listExpenseResolutionsFromSupabase } from "@/features/finance/expense-resolution-repository";
import { createExpenseEvidenceDownloadUrlAction, deleteExpenseEvidenceAction, ensureBusinessPartnerFromOcrAction, getExpenseEvidenceOcrJobAction, retryExpenseEvidenceOcrJobAction, saveExpenseResolutionAction, transitionExpenseApprovalAction, transitionExpenseDisbursementAction, uploadExpenseEvidenceAction } from "./actions";

export default async function ExpenseResolutionsRoute() {
  let dataLoadError: string | undefined;
  let initialResolutions: ManagedExpenseResolution[] = [];
  try {
    initialResolutions = (await listExpenseResolutionsFromSupabase()) ?? [];
  } catch (error) {
    console.warn(`[expense-resolutions] Supabase data unavailable: ${error instanceof Error ? error.message : String(error)}`);
    dataLoadError = "지출결의 저장소에 연결하지 못했습니다. 목록이 최신 상태가 아닐 수 있습니다. 잠시 후 새로고침해주세요.";
  }
  return (
    <ExpenseResolutionPage
      createEvidenceDownloadUrl={createExpenseEvidenceDownloadUrlAction}
      dataLoadError={dataLoadError}
      deleteEvidence={deleteExpenseEvidenceAction}
      ensureBusinessPartnerFromOcr={ensureBusinessPartnerFromOcrAction}
      getEvidenceOcrJob={getExpenseEvidenceOcrJobAction}
      initialResolutions={initialResolutions}
      persistResolution={saveExpenseResolutionAction}
      retryEvidenceOcrJob={retryExpenseEvidenceOcrJobAction}
      transitionApproval={transitionExpenseApprovalAction}
      transitionDisbursement={transitionExpenseDisbursementAction}
      uploadEvidence={uploadExpenseEvidenceAction}
    />
  );
}
