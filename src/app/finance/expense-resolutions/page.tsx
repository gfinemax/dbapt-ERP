import { ExpenseResolutionPage } from "@/features/finance/expense-resolution-page";
import { parseExpenseEntry } from "@/features/finance/expense-entry";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";
import { listExpenseResolutionsFromSupabase } from "@/features/finance/expense-resolution-repository";
import { listUnresolvedWithdrawalTransactions } from "@/features/finance/expense-compliance-repository";
import { getExpenseComplianceSettings } from "@/features/finance/expense-compliance-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { ReimbursementLogin } from "@/features/finance/reimbursement-login";
import { defaultExpenseComplianceSettings } from "@/features/finance/expense-compliance";
import { listApprovalDocuments } from "@/features/approval/approval-repository";
import { listUnresolvedCorporateCardTransactions } from "@/features/finance/corporate-card-transaction-repository";
import { listExpenseBudgetProfiles } from "@/features/finance/budget-profile-repository";
import { listOperatingExpenseDetails } from "@/features/finance/operating-budget-repository";
import { loadQuickExpenseConversionDraft, type QuickExpenseConversionDraft } from "@/features/finance/quick-expense-conversion-repository";
import { convertQuickExpenseResolutionAction, createExpenseEvidenceDownloadUrlAction, deleteExpenseEvidenceAction, deleteExpenseFactConfirmationAction, deleteExpenseResolutionAction, ensureBusinessPartnerFromOcrAction, getExpenseEvidenceOcrJobAction, listExpenseFactConfirmationsAction, retryExpenseEvidenceOcrJobAction, saveExpenseFactConfirmationAction, saveExpenseResolutionAction, transitionExpenseApprovalAction, transitionExpenseDisbursementAction, uploadExpenseFactSupportingFileAction } from "./actions";

export const dynamic = "force-dynamic";
export default async function ExpenseResolutionsRoute({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const entry = parseExpenseEntry(await searchParams ?? {});
  let viewer;
  try { viewer = await requireExpenseActor(); } catch (error) { return <ReimbursementLogin title="지출결의" description="본인 계정으로 로그인해서 지출결의 권한을 확인해줘." error={error instanceof Error ? error.message : "로그인이 필요합니다."} />; }
  let dataLoadError: string | undefined;
  let initialQuickExpense: QuickExpenseConversionDraft | undefined;
  let initialResolutionId = entry.resolutionId;
  let initialResolutions: ManagedExpenseResolution[] = [];
  let initialBankTransactions: Awaited<ReturnType<typeof listUnresolvedWithdrawalTransactions>> = [];
  let initialCardTransactions: Awaited<ReturnType<typeof listUnresolvedCorporateCardTransactions>> = [];
  let initialApprovalDocuments: Awaited<ReturnType<typeof listApprovalDocuments>> = [];
  let directExpenseSettings = defaultExpenseComplianceSettings;
  let initialBudgetProfiles = {};
  let initialExpenseDetails: Awaited<ReturnType<typeof listOperatingExpenseDetails>> = [];
  const organizationId = viewer.organization_id;
  const [resolutionResult, quickResult, approvalResult, settingsResult, bankResult, cardResult, budgetResult, detailResult] = await Promise.allSettled([
    listExpenseResolutionsFromSupabase(),
    entry.quickExpenseId ? loadQuickExpenseConversionDraft(entry.quickExpenseId) : Promise.resolve(undefined),
    listApprovalDocuments(organizationId),
    getExpenseComplianceSettings(organizationId),
    listUnresolvedWithdrawalTransactions(organizationId),
    listUnresolvedCorporateCardTransactions(organizationId),
    listExpenseBudgetProfiles(organizationId),
    listOperatingExpenseDetails(organizationId),
  ] as const);

  if (resolutionResult.status === "fulfilled") initialResolutions = resolutionResult.value ?? [];
  else {
    console.warn(`[expense-resolutions] Supabase data unavailable: ${resolutionResult.reason instanceof Error ? resolutionResult.reason.message : String(resolutionResult.reason)}`);
    dataLoadError = "지출결의 저장소에 연결하지 못했습니다. 목록이 최신 상태가 아닐 수 있습니다. 잠시 후 새로고침해주세요.";
  }

  if (quickResult.status === "fulfilled" && quickResult.value) {
    const draft = quickResult.value;
    if (draft.linkedResolutionId) initialResolutionId = draft.linkedResolutionId;
    else if (draft.recordStatus === "NEEDS_RESOLUTION") initialQuickExpense = draft;
    else dataLoadError = "이 간편지출은 현재 정식 지출결의 전환 대상이 아닙니다. 간편지출 목록에서 처리 상태를 확인해주세요.";
  } else if (quickResult.status === "rejected") {
    dataLoadError = quickResult.reason instanceof Error ? quickResult.reason.message : "간편지출 전환 원본을 불러오지 못했습니다.";
  }

  if (approvalResult.status === "fulfilled") initialApprovalDocuments = approvalResult.value.filter((document) => document.approvalStatus === "APPROVED");
  else console.warn(`[expense-resolutions] Approval data unavailable: ${approvalResult.reason instanceof Error ? approvalResult.reason.message : String(approvalResult.reason)}`);
  if (settingsResult.status === "fulfilled") directExpenseSettings = settingsResult.value ?? directExpenseSettings;
  else console.warn(`[expense-resolutions] Approval policy data unavailable: ${settingsResult.reason instanceof Error ? settingsResult.reason.message : String(settingsResult.reason)}`);
  if (bankResult.status === "fulfilled") initialBankTransactions = bankResult.value;
  else console.warn(`[expense-resolutions] Bank transaction data unavailable: ${bankResult.reason instanceof Error ? bankResult.reason.message : String(bankResult.reason)}`);
  if (cardResult.status === "fulfilled") initialCardTransactions = cardResult.value;
  else console.warn(`[expense-resolutions] Card transaction data unavailable: ${cardResult.reason instanceof Error ? cardResult.reason.message : String(cardResult.reason)}`);
  if (budgetResult.status === "fulfilled") initialBudgetProfiles = budgetResult.value;
  else console.warn(`[expense-resolutions] Budget data unavailable: ${budgetResult.reason instanceof Error ? budgetResult.reason.message : String(budgetResult.reason)}`);
  if (detailResult.status === "fulfilled") initialExpenseDetails = detailResult.value;
  else console.warn(`[expense-resolutions] Expense detail data unavailable: ${detailResult.reason instanceof Error ? detailResult.reason.message : String(detailResult.reason)}`);
  return (
    <ExpenseResolutionPage
      key={`${viewer.organization_id}:${viewer.user_id}:${JSON.stringify(entry)}`}
      viewer={viewer}
      initialEntryStart={entry.start}
      initialResolutionId={initialResolutionId}
      initialQuickExpense={initialQuickExpense}
      convertQuickExpense={convertQuickExpenseResolutionAction}
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
      initialBudgetProfiles={initialBudgetProfiles}
      initialExpenseDetails={initialExpenseDetails}
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
