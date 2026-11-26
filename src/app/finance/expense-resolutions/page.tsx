import { ExpenseResolutionPage } from "@/features/finance/expense-resolution-page";
import { correctApprovedExpenseResolutionAction, loadApprovedExpenseCorrectionOptionsAction } from "./actions";
import { parseExpenseEntry } from "@/features/finance/expense-entry";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";
import { listExpenseResolutionPageFromSupabase } from "@/features/finance/expense-resolution-repository";
import { parseExpenseResolutionListRequest, type ExpenseResolutionListPage } from "@/features/finance/expense-resolution-list";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { ReimbursementLogin } from "@/features/finance/reimbursement-login";
import { loadExpenseResolutionBudgetView } from "@/features/finance/expense-resolution-budget-view";
import { loadQuickExpenseConversionDraft, type QuickExpenseConversionDraft } from "@/features/finance/quick-expense-conversion-repository";
import { getEditBankTransactionCandidates, type ExpenseResolutionFormOptions } from "@/features/finance/expense-resolution-form-options";
import { loadExpenseResolutionFormOptions } from "@/features/finance/expense-resolution-form-options.server";
import { convertQuickExpenseResolutionAction, createExpenseEvidenceDownloadUrlAction, deleteExpenseEvidenceAction, deleteExpenseFactConfirmationAction, deleteExpenseResolutionAction, ensureBusinessPartnerFromOcrAction, getExpenseEvidenceOcrJobAction, listExpenseFactConfirmationsAction, loadExpenseResolutionDetailAction, loadExpenseResolutionFormOptionsAction, retryExpenseEvidenceOcrJobAction, saveExpenseFactConfirmationAction, saveExpenseResolutionAction, transitionExpenseApprovalAction, transitionExpenseDisbursementResultAction, uploadExpenseFactSupportingFileAction } from "./actions";

export const dynamic = "force-dynamic";

export function selectExpenseResolutionBudgetItems(
  resolutions: ManagedExpenseResolution[],
  editResolutionId?: string,
) {
  if (!editResolutionId) return resolutions;
  const editResolution = resolutions.find((resolution) => resolution.id === editResolutionId);
  return editResolution ? [editResolution] : [];
}

export default async function ExpenseResolutionsRoute({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const params = await searchParams ?? {};
  const entry = parseExpenseEntry(params);
  const listRequest = parseExpenseResolutionListRequest(params);
  let viewer;
  try { viewer = await requireExpenseActor(); } catch (error) { return <ReimbursementLogin title="지출결의" description="본인 계정으로 로그인해서 지출결의 권한을 확인해줘." error={error instanceof Error ? error.message : "로그인이 필요합니다."} />; }
  let dataLoadError: string | undefined;
  let initialQuickExpense: QuickExpenseConversionDraft | undefined;
  let initialResolutionId = entry.resolutionId;
  let initialResolutions: ManagedExpenseResolution[] = [];
  let initialListPage: ExpenseResolutionListPage | undefined;
  let initialFormOptions: ExpenseResolutionFormOptions | undefined;
  let initialBudgetProfiles = {};
  let budgetDataError: string | undefined;
  const organizationId = viewer.organization_id;
  const resolutionPromise = listExpenseResolutionPageFromSupabase({ ...listRequest, includeId: entry.resolutionId }, viewer);
  const budgetPromise = resolutionPromise.then((result) => loadExpenseResolutionBudgetView(
    selectExpenseResolutionBudgetItems(result?.items ?? [], entry.editResolutionId),
    organizationId,
  ));
  const formOptionsPromise = entry.start || entry.quickExpenseId || entry.editResolutionId
    ? loadExpenseResolutionFormOptions()
    : Promise.resolve(undefined);
  const [resolutionResult, quickResult, budgetResult, formOptionsResult] = await Promise.allSettled([
    resolutionPromise,
    entry.quickExpenseId ? loadQuickExpenseConversionDraft(entry.quickExpenseId) : Promise.resolve(undefined),
    budgetPromise,
    formOptionsPromise,
  ] as const);

  if (resolutionResult.status === "fulfilled") {
    initialResolutions = resolutionResult.value?.items ?? [];
    initialListPage = resolutionResult.value?.pagination;
  }
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

  if (budgetResult.status === "fulfilled") {
    initialBudgetProfiles = budgetResult.value.budgetProfiles;
    const refreshed = budgetResult.value.resolutions;
    initialResolutions = entry.editResolutionId
      ? initialResolutions.map((resolution) => refreshed[0]?.id === resolution.id ? refreshed[0] : resolution)
      : refreshed;
  }
  else {
    console.warn(`[expense-resolutions] Budget data unavailable: ${budgetResult.reason instanceof Error ? budgetResult.reason.message : String(budgetResult.reason)}`);
    budgetDataError = "공식 예산을 불러오지 못했습니다. 예산 미편성으로 판단하지 말고 잠시 후 새로고침해주세요.";
  }
  if (formOptionsResult.status === "fulfilled") {
    const loadedFormOptions = formOptionsResult.value;
    const editResolution = entry.editResolutionId
      ? initialResolutions.find((resolution) => resolution.id === entry.editResolutionId)
      : undefined;
    initialFormOptions = loadedFormOptions && editResolution ? {
      ...loadedFormOptions,
      bankTransactions: getEditBankTransactionCandidates(loadedFormOptions.bankTransactions, editResolution.id, editResolution),
    } : loadedFormOptions;
  }
  else {
    console.warn(`[expense-resolutions] Form options unavailable: ${formOptionsResult.reason instanceof Error ? formOptionsResult.reason.message : String(formOptionsResult.reason)}`);
    dataLoadError ??= "작성용 기준정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
  return (
    <ExpenseResolutionPage
      key={`${viewer.organization_id}:${viewer.user_id}:${JSON.stringify(entry)}:${initialListPage?.page ?? "local"}:${initialListPage?.query ?? ""}:${initialListPage?.month ?? ""}:${initialListPage?.sort ?? ""}:${initialListPage?.scope ?? ""}`}
      viewer={viewer}
      initialEditResolutionId={entry.editResolutionId}
      initialEntryStart={entry.start}
      initialResolutionId={entry.editResolutionId ? undefined : initialResolutionId}
      initialQuickExpense={initialQuickExpense}
      convertQuickExpense={convertQuickExpenseResolutionAction}
      correctApprovedResolution={correctApprovedExpenseResolutionAction}
      loadCorrectionOptions={loadApprovedExpenseCorrectionOptionsAction}
      createEvidenceDownloadUrl={createExpenseEvidenceDownloadUrlAction}
      dataLoadError={dataLoadError}
      deleteEvidence={deleteExpenseEvidenceAction}
      deleteResolution={deleteExpenseResolutionAction}
      ensureBusinessPartnerFromOcr={ensureBusinessPartnerFromOcrAction}
      getEvidenceOcrJob={getExpenseEvidenceOcrJobAction}
      initialResolutions={initialResolutions}
      initialListPage={initialListPage}
      initialFormOptions={initialFormOptions}
      loadFormOptions={loadExpenseResolutionFormOptionsAction}
      loadResolutionDetail={loadExpenseResolutionDetailAction}
      initialBudgetProfiles={initialBudgetProfiles}
      budgetDataError={budgetDataError}
      persistResolution={saveExpenseResolutionAction}
      saveFactConfirmation={saveExpenseFactConfirmationAction}
      listFactConfirmations={listExpenseFactConfirmationsAction}
      deleteFactConfirmation={deleteExpenseFactConfirmationAction}
      uploadFactSupportingFile={uploadExpenseFactSupportingFileAction}
      retryEvidenceOcrJob={retryExpenseEvidenceOcrJobAction}
      transitionApproval={transitionExpenseApprovalAction}
      transitionDisbursement={transitionExpenseDisbursementResultAction}
    />
  );
}
