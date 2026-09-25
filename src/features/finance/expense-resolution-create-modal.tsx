"use client";

import { FileSpreadsheet, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ApprovalDocument } from "@/features/approval/approval-domain";
import type { OperatingExpenseDetail } from "./operating-budget-classification";
import type { ExpenseComplianceSettings, EvidenceKind, EvidenceStatus, ExpenseKind } from "./expense-compliance";
import type { BankTransactionResolutionCandidate } from "./expense-compliance-repository";
import { findCorporateCardMatchCandidates, isTaxiCardTransaction, type CorporateCardTransactionCandidate } from "./corporate-card-transaction";
import { evaluateDirectExpensePolicy } from "./direct-expense-policy";
import { calculateBatchEvidenceSettlement, findDuplicateEvidenceIds } from "./expense-batch-settlement";
import { getEmployeeAdvanceSourceFacts } from "./expense-advance-source";
import { buildExpenseOcrFormSuggestions } from "./expense-ocr-form-suggestions";
import { expenseResolutionTypeOptions, formatExpenseResolutionAmount, type ExpenseResolutionType } from "./expense-resolution-data";
import type { EvidenceOcrJobProgress } from "./expense-evidence";
import type { ExpenseResolutionImportResult } from "./expense-resolution-import";
import type { ExecutionMethod, ExpenseBurdenType, ExpenseInputMethod, ExpenseTiming, ResolutionMode } from "./expense-resolution-domain";
import {
  AccountAllocationEditor,
  accountTitleOptions,
  Badge,
  batchEvidenceTypeOptions,
  BudgetProfilesContext,
  BudgetRow,
  buildApprovalLine,
  CollapsibleFormSection,
  createAccountAllocation,
  createSingleExpenseItem,
  DetailItem,
  formatFileSize,
  FormSection,
  getBudgetOverLabel,
  getExpenseBurdenLabel,
  getExpenseDateLabel,
  getExpenseInfoSummary,
  getPaymentTarget,
  getPaymentTargetHeaderSummary,
  getPaymentTargetSummary,
  getResolutionSubject,
  legacyOperatingExpenseDetailOptions,
  maskAccountNumber,
  OcrValue,
  paymentTargets,
  projectNameOptions,
  QuestionChoiceGroup,
  SingleExpenseItemsEditor,
  summarizeBatchItems,
  SummaryTile,
  TextareaInput,
  TextInput,
  toNumber,
  transactionEvidenceTypeOptions,
  type AccountAllocation,
  type BatchExpenseItem,
  type BatchPaymentMode,
  type BudgetSnapshot,
  type EvidenceType,
  type ManagedExpenseResolution,
  type PaymentMethod,
  type ResolutionFormState,
  type SingleExpenseItem,
  type VoucherCreationMode,
} from "./expense-resolution-page";

export function ExpenseResolutionCreateModal({
  bankTransactionCandidates,
  cardTransactionCandidates,
  approvalDocuments,
  directExpenseSettings,
  expenseDetails,
  batchImportError,
  batchImportFileName,
  batchImportResult,
  evidenceOcrProgress,
  evidenceUploadError,
  vendorRegistrationNotice,
  batchSummary,
  budgetSnapshot,
  formState,
  settlementCandidates,
  isEditing,
  isQuickConversion,
  isEvidenceUploading,
  onAddBatchItem,
  onAddSingleItem,
  onAddAccountAllocation,
  onAttachBatchEvidence,
  onBatchItemChange,
  onCancel,
  onChange,
  onCopyBatchItem,
  onDeleteBatchItem,
  onDeleteSingleItem,
  onDeleteAccountAllocation,
  onDownloadBatchImportTemplate,
  onImportBatchExpenseFile,
  onApplyEvidenceOcr,
  onOpenEvidenceOriginal,
  onRemoveEvidenceFile,
  onRetryEvidenceFile,
  onReviewBatchBudget,
  onRequestApproval,
  onSaveDraft,
  onUploadEvidenceFiles,
  saveError,
  isSaving,
  settlementDifference,
  totalAmount,
  accountAllocationTotal,
  onSingleItemChange,
  onAccountAllocationChange,
}: {
  bankTransactionCandidates: BankTransactionResolutionCandidate[];
  cardTransactionCandidates: CorporateCardTransactionCandidate[];
  approvalDocuments: ApprovalDocument[];
  directExpenseSettings: ExpenseComplianceSettings;
  expenseDetails: OperatingExpenseDetail[];
  batchImportError: string;
  batchImportFileName: string;
  batchImportResult: ExpenseResolutionImportResult | null;
  evidenceOcrProgress: Record<string, EvidenceOcrJobProgress>;
  evidenceUploadError: string;
  vendorRegistrationNotice: string;
  batchSummary: ReturnType<typeof summarizeBatchItems>;
  budgetSnapshot: BudgetSnapshot;
  formState: ResolutionFormState;
  settlementCandidates: ManagedExpenseResolution[];
  isEditing: boolean;
  isQuickConversion: boolean;
  isEvidenceUploading: boolean;
  onAddBatchItem: () => void;
  onAddSingleItem: () => void;
  onAddAccountAllocation: () => void;
  onAttachBatchEvidence: (itemNo: number, file: File) => void | Promise<void>;
  onBatchItemChange: (itemNo: number, key: keyof BatchExpenseItem, value: string) => void;
  onCancel: () => void;
  onChange: <K extends keyof ResolutionFormState>(key: K, value: ResolutionFormState[K]) => void;
  onCopyBatchItem: (itemNo: number) => void;
  onDeleteBatchItem: (itemNo: number) => void;
  onDeleteSingleItem: (id: string) => void;
  onDeleteAccountAllocation: (id: string) => void;
  onDownloadBatchImportTemplate: () => void;
  onImportBatchExpenseFile: (file: File) => void | Promise<void>;
  onApplyEvidenceOcr: (id: string) => void | Promise<void>;
  onOpenEvidenceOriginal: (storagePath: string) => void | Promise<void>;
  onRemoveEvidenceFile: (id: string) => void | Promise<void>;
  onRetryEvidenceFile: (id: string) => void | Promise<void>;
  onReviewBatchBudget: (itemNo: number) => void;
  onRequestApproval: () => void | Promise<void>;
  onSaveDraft: () => boolean | undefined | Promise<boolean | undefined>;
  onUploadEvidenceFiles: (files: File[]) => number | Promise<number>;
  saveError: string;
  isSaving: boolean;
  settlementDifference: number;
  totalAmount: number;
  accountAllocationTotal: number;
  onSingleItemChange: (id: string, key: keyof SingleExpenseItem, value: string) => void;
  onAccountAllocationChange: (id: string, key: keyof AccountAllocation, value: string) => void;
}) {
  const budgetProfiles = useContext(BudgetProfilesContext);
  const operatingExpenseDetailOptions = Array.from(new Set(expenseDetails.length ? [...expenseDetails.map((detail) => detail.name), formState.operationExpenseDetail].filter(Boolean) : legacyOperatingExpenseDetailOptions));
  const budgetItemOptions = Array.from(new Set([
    ...Object.keys(budgetProfiles),
    formState.budgetItem,
    ...formState.accountAllocations.map((allocation) => allocation.budgetItem),
  ].filter(Boolean)));
  const isBatch = formState.resolutionType === "BATCH";
  const isCorporateCardPayment = formState.expenseTiming === "REIMBURSEMENT" && formState.expenseBurdenType === "CORPORATE_CARD";
  const cardMatchCandidates = useMemo(() => findCorporateCardMatchCandidates({ amount: totalAmount, cardLastFour: formState.cardLastFour, expenseDate: formState.actualExpenseDate, transactions: cardTransactionCandidates }), [cardTransactionCandidates, formState.actualExpenseDate, formState.cardLastFour, totalAmount]);
  const displayedCardTransactions = useMemo(() => {
    const recommendedIds = new Set(cardMatchCandidates.map((candidate) => candidate.id));
    return [...cardMatchCandidates, ...cardTransactionCandidates.filter((transaction) => !recommendedIds.has(transaction.id))];
  }, [cardMatchCandidates, cardTransactionCandidates]);
  const directPolicy = evaluateDirectExpensePolicy({ amount: totalAmount, budgetItem: formState.budgetItem, budgetOverReason: formState.budgetOverReason, expenseKind: formState.expenseKind, relatedContract: formState.relatedContract, relatedMeeting: formState.relatedMeeting, subject: formState.subject, reason: formState.reason, memo: formState.memo, source: formState.creationSource }, directExpenseSettings);
  const selectedApprovalDocument = approvalDocuments.find((document) => document.id === formState.approvalDocumentId);
  const [isExpenseDetailOpen, setIsExpenseDetailOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [evidenceProcessingFileName, setEvidenceProcessingFileName] = useState("");
  const [evidenceProcessingStartedAt, setEvidenceProcessingStartedAt] = useState<number | null>(null);
  const [ocrElapsedSeconds, setOcrElapsedSeconds] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [ocrUndoSnapshot, setOcrUndoSnapshot] = useState<Pick<ResolutionFormState, "plannedPaymentDate" | "vendorName" | "vendorAddress" | "vendorBusinessCategory" | "vendorBusinessNumber" | "vendorBusinessType" | "vendorContact" | "vendorRepresentative" | "singleItems" | "accountAllocations" | "budgetItem" | "budgetRecommendation" | "budgetPeriod" | "operationExpenseDetail" | "supplyAmount" | "vat"> | null>(null);
  const evidenceFileInputRef = useRef<HTMLInputElement>(null);
  const moveToField = (step: 1 | 2, fieldId: string) => {
    setCurrentStep(step);
    window.setTimeout(() => {
      const field = document.getElementById(fieldId);
      field?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      field?.focus({ preventScroll: true });
    }, 0);
  };
  const selectedPaymentTarget = getPaymentTarget(formState.paymentTargetId);
  const latestEvidenceFile = formState.evidenceFiles.at(-1);
  const latestOcrProgress = latestEvidenceFile?.ocrJobId ? evidenceOcrProgress[latestEvidenceFile.ocrJobId] : undefined;
  const batchEvidenceSettlement = calculateBatchEvidenceSettlement({ advancePaidAmount: toNumber(formState.advancePaidAmount), evidenceFiles: formState.evidenceFiles });
  const ocrFormSuggestions = formState.inputMethod === "EVIDENCE_OCR" && latestEvidenceFile
    ? buildExpenseOcrFormSuggestions({
        budgetItems: formState.accountAllocations.map((allocation) => allocation.budgetItem).filter(Boolean),
        ocr: latestEvidenceFile.ocrData,
        projectOptions: projectNameOptions,
      })
    : {};
  const getReviewSuggestion = (label: string) => label === "건명 입력"
    ? ocrFormSuggestions.subject
    : label === "프로젝트 선택"
      ? ocrFormSuggestions.projectName
      : label === "지출사유 입력"
        ? ocrFormSuggestions.reason
        : undefined;
  const applyReviewSuggestion = (label: string) => {
    const suggestion = getReviewSuggestion(label);
    if (!suggestion) return;
    if (label === "건명 입력") onChange("subject", suggestion);
    if (label === "프로젝트 선택") onChange("projectName", suggestion);
    if (label === "지출사유 입력") onChange("reason", suggestion);
  };
  const moveToReviewField = (label: string) => {
    if (label === "건명 입력") return moveToField(1, "expense-subject");
    if (label === "프로젝트 선택") return moveToField(1, "expense-project-name");
    if (label === "지출사유 입력") return moveToField(2, "expense-reason");
    setCurrentStep(["지급계좌 확인", "집행방식", "비용부담 유형", "원 사전결의 연결"].includes(label) ? 1 : 2);
  };
  const reviewItems = [
    { complete: Boolean(formState.subject.trim()), label: "건명 입력" },
    { complete: Boolean(formState.projectName.trim()), label: "프로젝트 선택" },
    { complete: Boolean(formState.plannedPaymentDate), label: getExpenseDateLabel(formState.expenseTiming) },
    { complete: Boolean(formState.paymentTargetId && formState.paymentBank && formState.paymentAccountNo && formState.accountHolder), label: "지급계좌 확인" },
    { complete: totalAmount > 0, label: "지급금액 입력" },
    { complete: Boolean(formState.budgetItem) && (budgetSnapshot.remainingBudgetAmount >= 0 || Boolean(formState.budgetOverReason.trim())), label: "예산 확인" },
    { complete: Boolean(formState.reason.trim()), label: "지출사유 입력" },
    ...(!isBatch
      ? [
          { complete: formState.singleItems.length > 0 && formState.singleItems.every((item) => item.itemName.trim() && toNumber(item.quantity) > 0), label: "품목내역 확인" },
          { complete: Math.abs(accountAllocationTotal - totalAmount) <= 0.5, label: "계정과목 분할합계" },
        ]
      : []),
    { complete: formState.evidenceFiles.length > 0, label: `${formState.evidenceType} 첨부` },
    ...(formState.expenseTiming === "ADVANCE"
      ? [
          { complete: Boolean(formState.executionMethod), label: "집행방식" },
          ...(formState.executionMethod === "EMPLOYEE_ADVANCE"
            ? [
                { complete: Boolean(formState.settlementDueDate), label: "정산기한" },
                { complete: Boolean(formState.settlementManager.trim()), label: "정산담당자" },
              ]
            : []),
        ]
      : []),
    ...(formState.expenseTiming === "REIMBURSEMENT" ? [{ complete: Boolean(formState.expenseBurdenType), label: "비용부담 유형" }] : []),
    ...(formState.expenseTiming === "SETTLEMENT"
      ? [
          { complete: Boolean(formState.originalResolutionId), label: "원 사전결의 연결" },
          { complete: toNumber(formState.advancePaidAmount) > 0, label: "선지급액" },
          { complete: toNumber(formState.actualUsedAmount) >= 0, label: "실제 사용액" },
        ]
      : []),
  ];
  const incompleteReviewItems = reviewItems.filter((item) => !item.complete);
  const stepOneRemaining = reviewItems.filter((item) => ["건명 입력", "프로젝트 선택", "지급계좌 확인", "집행방식", "비용부담 유형", "원 사전결의 연결"].includes(item.label) && !item.complete).length;
  const stepTwoRemaining = Math.max(0, incompleteReviewItems.length - stepOneRemaining);
  const stepItems = [
    { key: 1 as const, label: "지급·기본정보", remaining: stepOneRemaining },
    { key: 2 as const, label: "금액·증빙", remaining: stepTwoRemaining },
    { key: 3 as const, label: "검토·승인", remaining: incompleteReviewItems.length },
  ];
  const duplicateEvidenceIds = findDuplicateEvidenceIds(formState.evidenceFiles);
  const displayedSupplyAmount = isBatch ? batchSummary.totalSupplyAmount : formState.singleItems.reduce((sum, item) => sum + item.supplyAmount, 0);
  const displayedVatAmount = isBatch ? batchSummary.totalVatAmount : formState.singleItems.reduce((sum, item) => sum + item.vatAmount, 0);
  const amountEquationDifference = totalAmount - (displayedSupplyAmount + displayedVatAmount);
  const allocationDifference = totalAmount - accountAllocationTotal;
  const ocrStageItems = [
    { label: "증빙파일 업로드 완료", stages: ["UPLOADED", "RENDERING", "PREPROCESSING", "RECOGNIZING", "STRUCTURING", "COMPLETED"] },
    { label: latestEvidenceFile?.contentType === "application/pdf" ? "PDF 페이지를 이미지로 변환하고 있습니다" : "영수증 영역을 찾고 보정하고 있습니다", stages: ["RENDERING", "PREPROCESSING", "RECOGNIZING", "STRUCTURING", "COMPLETED"] },
    { label: "글자를 인식하고 있습니다", stages: ["RECOGNIZING", "STRUCTURING", "COMPLETED"] },
    { label: "금액과 거래처를 분석하고 있습니다", stages: ["STRUCTURING", "COMPLETED"] },
    { label: "자동입력이 완료되었습니다", stages: ["COMPLETED"] },
  ];

  function handleBatchImportChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void onImportBatchExpenseFile(file);
    event.target.value = "";
  }

  async function handleEvidenceChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setEvidenceProcessingFileName(files.length === 1 ? files[0].name : `${files.length}개 증빙파일`);
    setEvidenceProcessingStartedAt(1);
    setOcrElapsedSeconds(0);
    captureBeforeOcr();
    const uploadedCount = await onUploadEvidenceFiles(files);
    if (uploadedCount > 0) setCurrentStep(2);
  }

  useEffect(() => {
    if (!evidenceProcessingStartedAt || latestOcrProgress?.status === "COMPLETED" || latestOcrProgress?.status === "FAILED") return;
    const timer = window.setInterval(() => setOcrElapsedSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [evidenceProcessingStartedAt, latestOcrProgress?.status]);

  function captureBeforeOcr() {
    setOcrUndoSnapshot({
      accountAllocations: formState.accountAllocations.map((item) => ({ ...item })),
      budgetItem: formState.budgetItem,
      budgetRecommendation: formState.budgetRecommendation,
      budgetPeriod: formState.budgetPeriod,
      operationExpenseDetail: formState.operationExpenseDetail,
      plannedPaymentDate: formState.plannedPaymentDate,
      singleItems: formState.singleItems.map((item) => ({ ...item })),
      supplyAmount: formState.supplyAmount,
      vat: formState.vat,
      vendorAddress: formState.vendorAddress,
      vendorBusinessCategory: formState.vendorBusinessCategory,
      vendorBusinessNumber: formState.vendorBusinessNumber,
      vendorBusinessType: formState.vendorBusinessType,
      vendorContact: formState.vendorContact,
      vendorName: formState.vendorName,
      vendorRepresentative: formState.vendorRepresentative,
    });
  }

  async function handleApplyEvidenceOcr(id: string) {
    captureBeforeOcr();
    await onApplyEvidenceOcr(id);
  }

  function restoreBeforeOcr() {
    if (!ocrUndoSnapshot) return;
    onChange("accountAllocations", ocrUndoSnapshot.accountAllocations);
    onChange("budgetItem", ocrUndoSnapshot.budgetItem);
    onChange("budgetRecommendation", ocrUndoSnapshot.budgetRecommendation);
    onChange("budgetPeriod", ocrUndoSnapshot.budgetPeriod);
    onChange("operationExpenseDetail", ocrUndoSnapshot.operationExpenseDetail);
    onChange("plannedPaymentDate", ocrUndoSnapshot.plannedPaymentDate);
    onChange("singleItems", ocrUndoSnapshot.singleItems);
    onChange("supplyAmount", ocrUndoSnapshot.supplyAmount);
    onChange("vat", ocrUndoSnapshot.vat);
    onChange("vendorAddress", ocrUndoSnapshot.vendorAddress);
    onChange("vendorBusinessCategory", ocrUndoSnapshot.vendorBusinessCategory);
    onChange("vendorBusinessNumber", ocrUndoSnapshot.vendorBusinessNumber);
    onChange("vendorBusinessType", ocrUndoSnapshot.vendorBusinessType);
    onChange("vendorContact", ocrUndoSnapshot.vendorContact);
    onChange("vendorName", ocrUndoSnapshot.vendorName);
    onChange("vendorRepresentative", ocrUndoSnapshot.vendorRepresentative);
    setOcrUndoSnapshot(null);
  }

  async function handleSaveDraft() {
    const saved = await onSaveDraft();
    if (!saved) return;
    setLastSavedAt(new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/88 px-4 py-8" onClick={onCancel}>
      <section
        aria-labelledby="expense-resolution-dialog-title"
        aria-modal="true"
        className="w-full max-w-7xl overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <input
          accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv"
          aria-label="증빙자료 자동입력 파일 선택"
          className="sr-only"
          disabled={isEvidenceUploading}
          onChange={handleEvidenceChange}
          ref={evidenceFileInputRef}
          type="file"
        />
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold" id="expense-resolution-dialog-title">
              {isEditing ? "지출결의서 수정" : isQuickConversion ? "간편지출을 정식결의로 전환" : "지출결의서 작성"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">
              {isEditing
                ? "누락된 결의 내용을 보완합니다. 승인대기 문서는 저장 시 결재 상태를 다시 시작합니다."
                : isQuickConversion
                  ? "기존 사용내용과 증빙을 가져왔어. 프로젝트·계정·세금 구분을 확인하면 원본과 연결된 지출결의 초안으로 저장돼."
                : "조합 지출 전에 결의서를 작성하고 결재 승인 후 지급대기 및 지출전표 생성으로 연결합니다."}
            </p>
            <p className="mt-2 text-xs font-semibold text-[var(--color-green-ink)]">{lastSavedAt ? `마지막 임시저장 ${lastSavedAt}` : "아직 저장되지 않음 · 변경사항은 임시저장으로 보관할 수 있습니다."}</p>
          </div>
          <button aria-label="닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onCancel} type="button">
            <X className="size-4" />
          </button>
        </div>

        <nav aria-label="지출결의 작성 단계" className="grid grid-cols-3 border-b border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-5 py-3">
          {stepItems.map((step) => (
            <button
              aria-current={currentStep === step.key ? "step" : undefined}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${
                currentStep === step.key ? "bg-[var(--color-pressed-charcoal)] text-white" : currentStep > step.key ? "text-[var(--color-green-ink)]" : "text-[var(--color-stone)]"
              }`}
              key={step.key}
              onClick={() => setCurrentStep(step.key)}
              type="button"
            >
              <span className="flex size-6 items-center justify-center rounded-full border border-current text-xs">{currentStep > step.key ? "✓" : step.key}</span>
              {step.label}
              {step.remaining > 0 ? <span className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-black text-[var(--color-tangerine)]">{step.remaining}</span> : null}
            </button>
          ))}
        </nav>
        <input
          accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv"
          aria-label="증빙자료 파일 선택"
          className="sr-only"
          disabled={isEvidenceUploading}
          id="expense-evidence-file"
          multiple={isBatch && formState.inputMethod === "EVIDENCE_OCR"}
          onChange={(event) => void handleEvidenceChange(event)}
          ref={evidenceFileInputRef}
          type="file"
        />

        <div className="grid gap-4 p-5 xl:grid-cols-[1fr_320px]">
          <div className="grid min-w-0 gap-4">
            {evidenceUploadError ? (
              <div className="rounded-xl border border-[var(--color-tangerine)]/35 bg-[var(--color-sunset-soft)] px-5 py-4" role="alert">
                <p className="font-bold text-[var(--color-tangerine)]">증빙자료를 처리하지 못했습니다.</p>
                <p className="mt-1 text-sm text-[var(--color-stone)]">{evidenceUploadError}</p>
                {evidenceUploadError.includes("새로고침") ? (
                  <button className="mt-3 rounded-full border border-[var(--color-tangerine)]/40 bg-white px-4 py-2 text-sm font-bold" onClick={() => window.location.reload()} type="button">화면 새로고침</button>
                ) : (
                  <button className="mt-3 rounded-full border border-[var(--color-tangerine)]/40 bg-white px-4 py-2 text-sm font-bold" onClick={() => evidenceFileInputRef.current?.click()} type="button">다른 파일 선택</button>
                )}
              </div>
            ) : null}
            {isEvidenceUploading ? (
              <div className="rounded-xl border border-[var(--color-deep-cobalt)]/30 bg-[var(--color-morning-tint)] px-5 py-4" role="status">
                <p className="font-bold text-[var(--color-deep-cobalt)]">1/5 {evidenceProcessingFileName} 증빙파일을 업로드하고 있습니다…</p>
                <p className="mt-1 text-sm text-[var(--color-stone)]">업로드가 끝나면 백그라운드에서 영수증 분석을 계속합니다.</p>
              </div>
            ) : latestOcrProgress && (latestOcrProgress.status === "PENDING" || latestOcrProgress.status === "PROCESSING") ? (
              <div className="rounded-xl border border-[var(--color-deep-cobalt)]/30 bg-[var(--color-morning-tint)] px-5 py-4" role="status">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-[var(--color-deep-cobalt)]">AI 영수증 분석 중 · {latestOcrProgress.progress}%</p>
                  <span className="text-xs font-bold text-[var(--color-stone)]">{ocrElapsedSeconds}초</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[var(--color-deep-cobalt)] transition-all" style={{ width: `${latestOcrProgress.progress}%` }} /></div>
                <ol className="mt-4 grid gap-2 text-sm">
                  {ocrStageItems.map((item, index) => {
                    const complete = item.stages.includes(latestOcrProgress.stage);
                    const current = complete && (index === ocrStageItems.length - 1 || !ocrStageItems[index + 1].stages.includes(latestOcrProgress.stage));
                    return <li className={complete ? "font-bold text-[var(--color-deep-cobalt)]" : "text-[var(--color-stone)]"} key={item.label}>{complete ? current ? "●" : "✓" : "○"} {index + 1}/5 {item.label}</li>;
                  })}
                </ol>
                <p className="mt-3 text-sm text-[var(--color-stone)]">{ocrElapsedSeconds >= 30 ? "분석을 계속 진행 중입니다. 자동입력이 끝날 때까지 이 화면을 닫지 마세요." : ocrElapsedSeconds >= 10 ? "문서 화질에 따라 분석에 시간이 걸릴 수 있습니다." : "영수증을 분석하고 있습니다."}</p>
              </div>
            ) : latestOcrProgress?.status === "FAILED" ? (
              <div className="rounded-xl border border-[var(--color-tangerine)]/35 bg-[var(--color-sunset-soft)] px-5 py-4" role="alert">
                <p className="font-bold text-[var(--color-tangerine)]">자동인식하지 못했습니다.</p>
                <p className="mt-1 text-sm text-[var(--color-stone)]">{latestOcrProgress.errorMessage ?? "원본을 보면서 직접 입력하거나 다시 분석할 수 있습니다."}</p>
                {latestEvidenceFile ? <Button className="mt-3" onClick={() => void onRetryEvidenceFile(latestEvidenceFile.id)} type="button" variant="outline">다시 분석</Button> : null}
              </div>
            ) : currentStep === 2 && latestEvidenceFile && formState.inputMethod === "EVIDENCE_OCR" ? (
              <div className={`rounded-xl border px-5 py-4 ${latestEvidenceFile.ocrStatus === "CONFIRMED" ? "border-[var(--color-green-ink)]/25 bg-[var(--color-mint-wash)]" : "border-[var(--color-tangerine)]/30 bg-[var(--color-sunset-soft)]"}`} role="status">
                <p className="font-bold">{latestEvidenceFile.ocrStatus === "CONFIRMED" ? "OCR 자동입력이 완료되었습니다." : "OCR 분석 결과를 확인해 주세요."}</p>
                <p className="mt-1 text-sm text-[var(--color-stone)]">{latestEvidenceFile.fileName} · 아래 추출값과 원본을 비교한 뒤 필요한 항목을 수정해 주세요.</p>
              </div>
            ) : null}
            {(currentStep === 1 || currentStep === 2) ? (
            <>
            {currentStep === 1 ? <>
            <QuestionChoiceGroup
              label="지출 유형"
              onChange={(value) => {
                onChange("expenseKind", value as ExpenseKind);
                if (value === "BANK_POST_APPROVAL" || value === "PERSONAL_REIMBURSEMENT") onChange("expenseTiming", "REIMBURSEMENT");
                if (value === "RECURRING_BATCH") onChange("resolutionMode", "PROJECT_BULK");
              }}
              options={[
                { label: "일반 지출", value: "GENERAL" },
                { label: "개인 선지출 정산", value: "PERSONAL_REIMBURSEMENT" },
                { label: "통장 선출금 사후결의", value: "BANK_POST_APPROVAL" },
                { label: "정기비용 일괄결의", value: "RECURRING_BATCH" },
              ]}
              value={formState.expenseKind}
            />
            {formState.expenseKind === "BANK_POST_APPROVAL" ? <div className="rounded-xl border border-orange-300 bg-orange-50 px-5 py-4 text-sm font-bold text-orange-900">이미 통장에서 출금된 거래에 대한 사후결의입니다. 승인 후 추가 지급하지 않고 기존 출금 및 전표를 연결합니다.</div> : null}
            <section className="grid gap-5 rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] p-5">
              <QuestionChoiceGroup
                label="지출내역을 어떤 방식으로 작성하시겠습니까?"
                onChange={(value) => onChange("resolutionMode", value as ResolutionMode)}
                options={[
                  { description: "한 거래처 또는 한 지급대상에 대한 지출입니다.", label: "단일 지출결의", value: "SINGLE" },
                  { description: "여러 거래처·품목·계정과목을 하나의 프로젝트로 묶어 처리합니다.", label: "프로젝트 일괄 지출결의", value: "PROJECT_BULK" },
                ]}
                value={formState.resolutionMode}
              />
              <QuestionChoiceGroup
                label="이번 지출은 언제 신청하는 건가요?"
                onChange={(value) => {
                  onChange("expenseTiming", value as ExpenseTiming);
                  if (value === "REIMBURSEMENT" || value === "SETTLEMENT") onChange("inputMethod", "EVIDENCE_OCR");
                }}
                options={[
                  { description: "사전 집행결의", label: "구매·집행 전에 승인을 받습니다", value: "ADVANCE" },
                  { description: "사후 지출결의", label: "이미 결제한 비용을 신청합니다", value: "REIMBURSEMENT" },
                  { description: "선지급금 정산", label: "이전에 받은 금액을 정산합니다", value: "SETTLEMENT" },
                ]}
                value={formState.expenseTiming}
              />
              <QuestionChoiceGroup
                label="지출내역을 어떻게 등록하시겠습니까?"
                onChange={(value) => {
                  if (value === "BUDGET_DIRECT_SIMPLE") {
                    onChange("quickEntryMode", "BUDGET_DIRECT");
                    return;
                  }
                  onChange("quickEntryMode", "NONE");
                  onChange("inputMethod", value as ExpenseInputMethod);
                  if (value === "EVIDENCE_OCR") evidenceFileInputRef.current?.click();
                }}
                options={[
                  { label: "직접 입력", value: "MANUAL" },
                  ...(isBatch ? [{ label: "엑셀 일괄등록", value: "EXCEL" }] : []),
                  { label: "증빙자료 자동입력", value: "EVIDENCE_OCR" },
                  ...(!isBatch ? [{ description: "법인카드·계좌이체·자동이체·현금·개인 선결제를 예산 안에서 간단히 처리합니다.", label: "예산 내 간편지출", value: "BUDGET_DIRECT_SIMPLE" }] : []),
                ]}
                value={formState.quickEntryMode === "BUDGET_DIRECT" ? "BUDGET_DIRECT_SIMPLE" : formState.inputMethod}
              />
            </section>
            {formState.quickEntryMode === "BUDGET_DIRECT" ? (
              <section className="grid gap-4 rounded-xl border border-[var(--color-deep-cobalt)]/25 bg-[var(--color-morning-tint)]/45 p-5">
                <div>
                  <h3 className="font-bold text-[var(--color-deep-cobalt)]">예산 내 간편지출</h3>
                  <p className="mt-1 text-sm text-[var(--color-stone)]">사전 기안 없이 승인된 예산 범위의 일상·정기 지출을 실제 거래와 연결해 기록합니다.</p>
                </div>
                <QuestionChoiceGroup
                  label="어떻게 결제했나요?"
                  onChange={(value) => onChange("quickPaymentMethod", value as ResolutionFormState["quickPaymentMethod"])}
                  options={[
                    { label: "법인카드", value: "CORPORATE_CARD" },
                    { label: "계좌이체", value: "BANK_TRANSFER" },
                    { label: "자동이체", value: "AUTO_DEBIT" },
                    { label: "현금", value: "CASH" },
                    { label: "개인 선결제", value: "PERSONAL_PREPAID" },
                  ]}
                  value={formState.quickPaymentMethod}
                />
                {formState.quickPaymentMethod === "CORPORATE_CARD" ? <>
                <label className="grid gap-2 text-sm font-bold">
                  <span>법인카드 승인내역</span>
                  <select aria-label="법인카드 승인내역" className="h-12 rounded-lg border border-[var(--color-deep-cobalt)]/30 bg-white px-3" onChange={(event) => onChange("cardTransactionId", event.target.value)} value={formState.cardTransactionId}>
                    <option value="">아직 카드내역이 없음 · 연결대기로 임시등록</option>
                    {displayedCardTransactions.map((transaction) => <option key={transaction.id} value={transaction.id}>{cardMatchCandidates.some((candidate) => candidate.id === transaction.id) ? "추천 · " : ""}{transaction.approvedAt.slice(0, 10)} · {transaction.merchantName} · {transaction.amount.toLocaleString("ko-KR")}원 · {transaction.cardName} 끝 {transaction.cardLastFour}{isTaxiCardTransaction(transaction) ? " · 택시 자동분류" : ""}</option>)}
                  </select>
                  {cardTransactionCandidates.length ? <span className="text-xs font-semibold text-[var(--color-stone)]">미결의 승인내역 {cardTransactionCandidates.length}건 · 이미 결의서에 연결된 거래는 표시하지 않습니다.</span> : <span className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[var(--color-stone)]">불러온 미결의 카드 승인내역이 없습니다. 카드 내역 동기화 후 다시 확인해주세요.</span>}
                </label>
                <div className={`rounded-lg border px-4 py-3 text-sm ${formState.cardTransactionId ? "border-[var(--color-green-ink)]/25 bg-[var(--color-mint-wash)] text-[var(--color-green-ink)]" : "border-amber-300 bg-amber-50 text-amber-900"}`} role="status">
                  <p className="font-bold">{formState.cardTransactionId ? "카드 승인내역 매칭완료" : "카드 승인내역 연결대기"}</p>
                  <p className="mt-1 text-xs font-semibold">{formState.cardTransactionId ? "선택한 승인내역과 하나의 기록으로 통합해 중복 비용처리를 방지합니다." : "지금은 업무 목적만 임시등록합니다. 별도 지급·확정전표는 만들지 않고, 카드내역이 들어오면 날짜·금액으로 추천합니다."}</p>
                </div>
                {!formState.cardTransactionId ? <TextInput label="카드번호 끝 4자리 (선택)" maxLength={4} onChange={(value) => onChange("cardLastFour", value.replace(/\D/g, "").slice(0, 4))} value={formState.cardLastFour} /> : null}
                {!formState.cardTransactionId && cardMatchCandidates.length ? <div className="rounded-lg border border-[var(--color-deep-cobalt)]/25 bg-white px-4 py-3 text-sm"><p className="font-bold text-[var(--color-deep-cobalt)]">일치 가능성이 높은 카드내역 {cardMatchCandidates.length}건</p><p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">금액과 결제일(±2일)이 일치합니다. 위 목록의 ‘추천’ 거래를 선택해 통합해주세요.</p></div> : null}
                <QuestionChoiceGroup
                  label="어떤 비용인가요?"
                  onChange={(value) => onChange("quickExpenseCategory", value as ResolutionFormState["quickExpenseCategory"])}
                  options={["택시", "주차", "통행료", "식대", "소모품", "기타"].map((label) => ({ label, value: label }))}
                  value={formState.quickExpenseCategory}
                />
                <p className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-[var(--color-stone)]">사후 지출 · 공용 법인카드 · {formState.quickExpenseCategory === "택시" || formState.quickExpenseCategory === "주차" || formState.quickExpenseCategory === "통행료" ? "여비교통비" : "계정과목 직접 확인"}으로 설정했습니다.</p>
                </> : null}
                {formState.quickPaymentMethod === "BANK_TRANSFER" || formState.quickPaymentMethod === "AUTO_DEBIT" ? <label className="grid gap-2 text-sm font-bold"><span>통장 출금거래</span><select aria-label="간편지출 통장 출금거래" className="h-12 rounded-lg border border-[var(--color-deep-cobalt)]/30 bg-white px-3" onChange={(event) => { const transaction = bankTransactionCandidates.find((item) => item.id === event.target.value); onChange("bankTransactionId", event.target.value); if (transaction) { const amount = String(transaction.withdrawalAmount); onChange("actualExpenseDate", transaction.transactedAt.slice(0, 10)); onChange("vendorName", transaction.counterparty || transaction.description); onChange("reason", transaction.description); onChange("singleItems", [createSingleExpenseItem({ itemName: transaction.description, quantity: "1", taxCategory: "NO_VAT", unitPrice: amount })]); onChange("accountAllocations", [createAccountAllocation({ amount, description: transaction.description })]); } }} value={formState.bankTransactionId}><option value="">미결의 출금거래 선택</option>{bankTransactionCandidates.map((transaction) => <option disabled={Boolean(transaction.linkedResolutionId)} key={transaction.id} value={transaction.id}>{transaction.transactedAt.slice(0, 10)} · {transaction.withdrawalAmount.toLocaleString("ko-KR")}원 · {transaction.counterparty || transaction.description}{transaction.linkedResolutionNo ? ` · ${transaction.linkedResolutionNo} 연결됨` : ""}</option>)}</select><span className="text-xs font-semibold text-[var(--color-stone)]">{formState.quickPaymentMethod === "AUTO_DEBIT" ? "정기·반복 지출로 기록하고 선택한 출금내역과 중복되지 않게 연결합니다." : "선택한 출금내역의 날짜·금액·거래처를 사용합니다."}</span></label> : null}
                {formState.quickPaymentMethod === "PERSONAL_PREPAID" ? <div className="grid gap-3 md:grid-cols-2"><TextInput label="실제 지출자" onChange={(value) => onChange("advancePayer", value)} value={formState.advancePayer} /><TextInput label="정산받을 사람" onChange={(value) => onChange("settlementRecipient", value)} value={formState.settlementRecipient} /></div> : null}
                {formState.quickPaymentMethod === "CASH" ? <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">현금영수증 또는 적격증빙을 첨부해야 하며, 관리자 설정 한도와 직접지출 정책을 그대로 적용합니다.</p> : null}
                {formState.quickPaymentMethod !== "CORPORATE_CARD" ? <p className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-[var(--color-stone)]">사용내용과 예산항목을 입력하면 예산 차감·처리자·증빙·수정이력을 간편 지출기록으로 남깁니다.</p> : null}
              </section>
            ) : null}
            {formState.inputMethod === "EVIDENCE_OCR" ? (
              <div className="rounded-xl border border-[var(--color-deep-cobalt)]/25 bg-[var(--color-morning-tint)]/45 px-5 py-4 text-sm">
                <p className="font-bold text-[var(--color-deep-cobalt)]">증빙자료를 올리면 거래처·실제 지출일·금액을 자동 입력합니다.</p>
                <p className="mt-1 text-[var(--color-stone)]">자동 입력된 값은 다음 단계에서 원본과 비교해 수정할 수 있습니다.</p>
              </div>
            ) : null}
            {isBatch && formState.inputMethod === "EXCEL" ? (
              <section className="grid gap-4 rounded-xl border border-[var(--color-deep-cobalt)]/25 bg-[var(--color-morning-tint)]/45 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">프로젝트 일괄 지출내역 가져오기</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-stone)]">템플릿의 헤더를 유지한 CSV, XLSX 또는 XLS 파일을 올려주세요. 정상 행만 세부 지출내역에 반영됩니다.</p>
                  </div>
                  <Button onClick={onDownloadBatchImportTemplate} type="button" variant="outline">
                    <FileSpreadsheet className="size-4" />
                    입력 템플릿 받기
                  </Button>
                </div>
                <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-deep-cobalt)]/30 bg-white px-4 py-6 text-sm font-bold text-[var(--color-deep-cobalt)]">
                  <input accept=".csv,.tsv,.xlsx,.xls" aria-label="일괄 지출내역 파일 선택" className="sr-only" onChange={handleBatchImportChange} type="file" />
                  {batchImportFileName ? `${batchImportFileName} 다시 선택` : "CSV · XLSX · XLS 파일 선택"}
                </label>
                {batchImportError ? <p className="rounded-lg bg-[var(--color-sunset-soft)] px-4 py-3 text-sm font-bold text-[var(--color-tangerine)]" role="alert">{batchImportError}</p> : null}
                {batchImportResult ? (
                  <div className="grid gap-3">
                    <p className="text-sm font-bold" role="status">
                      전체 {batchImportResult.totalRowCount}행 · 반영 {batchImportResult.importedRows.length}행 · 오류 {batchImportResult.errors.length}행
                    </p>
                    {batchImportResult.errors.length ? (
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--color-tangerine)]/25 bg-white p-3" aria-label="일괄등록 오류 목록">
                        {batchImportResult.errors.map((error) => (
                          <p className="text-sm leading-6 text-[var(--color-tangerine)]" key={`${error.rowNumber}-${error.messages.join("-")}`}>
                            <strong>{error.rowNumber}행</strong> · {error.messages.join(" ")}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg bg-white px-4 py-3 text-sm font-bold text-[var(--color-green-ink)]">모든 행을 정상적으로 확인했습니다. 다음 단계에서 항목별 예산과 증빙을 검토해 주세요.</p>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}
            </> : null}
            {currentStep === 1 ? <section className="grid gap-4 rounded-xl border border-[var(--color-soft-border)] bg-white p-5">
              <div><h3 className="font-bold">작성 방식</h3><p className="mt-1 text-sm text-[var(--color-stone)]">일상·정기 지출은 바로 작성하고, 계약·고액·예산 외 지출은 승인된 기안을 연결합니다.</p></div>
              <div className="grid gap-3 md:grid-cols-2">
                <button aria-pressed={formState.creationSource === "DIRECT"} className={`rounded-xl border p-4 text-left ${formState.creationSource === "DIRECT" ? "border-[var(--color-deep-cobalt)] bg-[var(--color-morning-tint)]/45" : "border-[var(--color-soft-border)]"}`} onClick={() => { onChange("creationSource", "DIRECT"); onChange("approvalDocumentId", ""); onChange("approvalDocumentNo", ""); }} type="button"><b>기안 없이 직접 작성</b><span className="mt-1 block text-xs text-[var(--color-stone)]">승인 예산 내 일상·정기 지출</span></button>
                <button aria-pressed={formState.creationSource === "APPROVAL_LINKED"} className={`rounded-xl border p-4 text-left ${formState.creationSource === "APPROVAL_LINKED" ? "border-[var(--color-deep-cobalt)] bg-[var(--color-morning-tint)]/45" : "border-[var(--color-soft-border)]"}`} onClick={() => onChange("creationSource", "APPROVAL_LINKED")} type="button"><b>승인된 기안에서 작성</b><span className="mt-1 block text-xs text-[var(--color-stone)]">계약·고액·예산 외·의결 대상</span></button>
              </div>
              <div aria-live="polite" className={`rounded-xl border p-4 text-sm ${directPolicy.decision === "REQUIRED" ? "border-red-300 bg-red-50 text-red-800" : directPolicy.decision === "RECOMMENDED" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-green-300 bg-green-50 text-green-800"}`}><b>{directPolicy.decision === "REQUIRED" ? "기안 연결 필수" : directPolicy.decision === "RECOMMENDED" ? "기안 연결 권장" : "기안 없이 처리 가능"}</b><p className="mt-1">{directPolicy.reasons.join(" ")}</p></div>
              {formState.creationSource === "APPROVAL_LINKED" || directPolicy.decision === "REQUIRED" ? <label className="grid gap-2 text-sm font-bold"><span>승인된 기안 연결</span><select className="h-11 rounded-lg border bg-white px-3" onChange={(event) => { const selected = approvalDocuments.find((document) => document.id === event.target.value); onChange("approvalDocumentId", event.target.value); onChange("approvalDocumentNo", selected?.documentNo ?? ""); if (selected) { onChange("creationSource", "APPROVAL_LINKED"); onChange("subject", selected.title); onChange("projectName", selected.projectName ?? ""); onChange("vendorName", selected.counterpartyName ?? ""); onChange("budgetItem", selected.budgetItem ?? ""); if (selected.amount > 0) { onChange("singleItems", [createSingleExpenseItem({ itemName: selected.title, quantity: "1", taxCategory: "NO_VAT", unitPrice: String(selected.amount), vatAmount: 0 })]); onChange("accountAllocations", [createAccountAllocation({ accountTitle: selected.budgetItem || "미지정", amount: String(selected.amount), budgetItem: selected.budgetItem || "" })]); } } }} value={formState.approvalDocumentId}><option value="">문서번호·제목·거래처로 선택</option>{approvalDocuments.map((document) => <option key={document.id} value={document.id}>{document.documentNo} · {document.title} · {document.counterpartyName ?? "거래처 미지정"} · {document.amount.toLocaleString("ko-KR")}원</option>)}</select>{selectedApprovalDocument ? <span className="text-xs text-[var(--color-green-ink)]">승인완료 · 승인금액 {selectedApprovalDocument.amount.toLocaleString("ko-KR")}원</span> : null}</label> : null}
              {formState.creationSource === "DIRECT" ? <div className="grid gap-3"><label className="grid gap-2 text-sm font-bold"><span>기안 생략 사유</span><select className="h-11 rounded-lg border bg-white px-3" onChange={(event) => onChange("approvalSkipReason", event.target.value)} value={formState.approvalSkipReason}><option value="">근거 선택</option><option>승인 예산 내 일상 지출</option><option>정기·반복 지출</option><option>기존 계약에 따른 지급</option>{directExpenseSettings.allowOtherApprovalSkipReason ?? true ? <option>기타</option> : null}</select></label>{formState.approvalSkipReason === "기타" ? <label className="grid gap-2 text-sm font-bold"><span>기타 생략 사유</span><input className="h-11 rounded-lg border px-3" onChange={(event) => onChange("approvalSkipReasonDetail", event.target.value)} placeholder="기안을 생략할 수 있는 구체적인 사유" value={formState.approvalSkipReasonDetail} /></label> : null}</div> : null}
            </section> : null}
            <FormSection layout="compact" title={currentStep === 1 ? "기본정보" : "지출내역·금액"}>
              {currentStep === 1 ? <>
              <TextInput label="결의서번호" readOnly value={formState.resolutionNo} />
              <TextInput label="작성일" readOnly value={formState.createdAt} />
              <TextInput label="회계 귀속일" onChange={(value) => onChange("accountingDate", value)} type="date" value={formState.accountingDate} />
              <TextInput label="실제 지출일" onChange={(value) => onChange("actualExpenseDate", value)} type="date" value={formState.actualExpenseDate} />
              <TextInput label="작성자" readOnly value={formState.author} />
              {formState.expenseKind === "BANK_POST_APPROVAL" ? <label className="grid gap-1 text-sm font-semibold md:col-span-2"><span>통장 출금거래 연결</span><select className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3" onChange={(event) => { const transaction = bankTransactionCandidates.find((item) => item.id === event.target.value); onChange("bankTransactionId", event.target.value); if (transaction) { onChange("actualExpenseDate", transaction.transactedAt.slice(0, 10)); onChange("vendorName", transaction.counterparty || transaction.description); } }} value={formState.bankTransactionId}><option value="">미결의 출금거래 선택</option>{bankTransactionCandidates.map((transaction) => <option disabled={Boolean(transaction.linkedResolutionId)} key={transaction.id} value={transaction.id}>{transaction.transactedAt.slice(0, 10)} · {transaction.withdrawalAmount.toLocaleString("ko-KR")}원 · {transaction.counterparty || transaction.description}{transaction.linkedResolutionNo ? ` · ${transaction.linkedResolutionNo} 연결됨` : ""}</option>)}</select></label> : null}
              {formState.expenseKind === "PERSONAL_REIMBURSEMENT" ? <><TextInput label="실제 지출자" onChange={(value) => onChange("advancePayer", value)} value={formState.advancePayer} /><TextInput label="정산받을 사람" onChange={(value) => onChange("settlementRecipient", value)} value={formState.settlementRecipient} /><TextInput label="조합의 정산일" onChange={(value) => onChange("settlementCompletedAt", value)} type="date" value={formState.settlementCompletedAt} /><div className="rounded-lg border bg-white px-4 py-3 text-sm font-bold">정산 상태: {formState.settlementCompletedAt ? "정산완료" : "정산예정"}</div></> : null}
              {formState.expenseTiming === "ADVANCE" ? <TextInput label={getExpenseDateLabel(formState.expenseTiming)} onChange={(value) => onChange("plannedPaymentDate", value)} type="date" value={formState.plannedPaymentDate} /> : null}
              <p className="rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-stone)] md:col-span-3 xl:col-span-4">
                작성자는 로그인 사용자 기준으로 자동 입력되며 결재선과 별도로 관리됩니다.
              </p>
              <label className="grid gap-1 text-sm font-semibold">
                <span>프로젝트/사업과제</span>
                <select
                  id="expense-project-name"
                  className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                  onChange={(event) => onChange("projectName", event.target.value)}
                  value={formState.projectName}
                >
                  <option value="">선택</option>
                  {projectNameOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold md:col-span-3 xl:col-span-4">
                <span>건명 (필수)</span>
                <input
                  id="expense-subject"
                  className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                  maxLength={60}
                  onChange={(event) => onChange("subject", event.target.value)}
                  placeholder="예: 정기총회 준비, 7월 사무실 비품구매"
                  value={formState.subject}
                />
              </label>
              {formState.expenseTiming === "ADVANCE" ? (
                <label className="grid gap-1 text-sm font-semibold">
                  <span>집행방식</span>
                  <select aria-label="집행방식" className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm" onChange={(event) => onChange("executionMethod", event.target.value as ExecutionMethod)} value={formState.executionMethod}>
                    <option value="VENDOR_DIRECT">거래처 직접지급</option>
                    <option value="EMPLOYEE_ADVANCE">담당자 선지급</option>
                    <option value="CORPORATE_CARD">법인카드 사용승인</option>
                    <option value="AUTHORIZATION_ONLY">지급 없이 사용승인</option>
                  </select>
                </label>
              ) : null}
              {formState.expenseTiming === "REIMBURSEMENT" ? (
                <label className="grid gap-1 text-sm font-semibold">
                  <span>비용부담 유형</span>
                  <select aria-label="비용부담 유형" className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm" onChange={(event) => onChange("expenseBurdenType", event.target.value as ExpenseBurdenType)} value={formState.expenseBurdenType}>
                    <option value="EMPLOYEE_PREPAID">임직원 개인 선결제</option>
                    <option value="VENDOR_UNPAID">거래처 미지급 청구</option>
                    <option value="CORPORATE_CARD">법인카드 결제</option>
                    <option value="ORGANIZATION_PAID">조합계좌에서 이미 지급</option>
                    <option value="CASH">현금 사용</option>
                  </select>
                </label>
              ) : null}
              {formState.expenseTiming === "SETTLEMENT" ? (
                <label className="grid gap-1 text-sm font-semibold md:col-span-2">
                  <span>원 사전결의</span>
                  <select aria-label="원 사전결의" className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm" onChange={(event) => onChange("originalResolutionId", event.target.value)} value={formState.originalResolutionId}>
                    <option value="">정산할 결의 선택</option>
                    {settlementCandidates.map((resolution) => <option key={resolution.id} value={resolution.id}>{resolution.resolutionNo} · {getResolutionSubject(resolution)} · {getEmployeeAdvanceSourceFacts(resolution).blockedReason ? "실제 지급 내역 확인 필요" : formatExpenseResolutionAmount(resolution.actualPaidAmount!)}</option>)}
                  </select>
                  {!settlementCandidates.length ? <span className="text-xs text-[var(--color-tangerine)]">지급완료된 담당자 선지급 결의가 없습니다.</span> : null}
                  {formState.originalResolutionId && getEmployeeAdvanceSourceFacts(settlementCandidates.find(resolution => resolution.id === formState.originalResolutionId)).blockedReason ? <span role="status" className="text-xs text-[var(--color-tangerine)]">{getEmployeeAdvanceSourceFacts(settlementCandidates.find(resolution => resolution.id === formState.originalResolutionId)).blockedReason}</span> : null}
                </label>
              ) : null}
              {isBatch ? (
                <>
                  <label className="grid gap-1 text-sm font-semibold">
                    <span>지급처리 방식</span>
                    <select
                      className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                      onChange={(event) => onChange("batchPaymentMode", event.target.value as BatchPaymentMode)}
                      value={formState.batchPaymentMode}
                    >
                      <option value="GROUP">일괄 지급</option>
                      <option value="ITEM">항목별 지급</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    <span>전표 생성 방식</span>
                    <select
                      className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                      onChange={(event) => onChange("voucherCreationMode", event.target.value as VoucherCreationMode)}
                      value={formState.voucherCreationMode}
                    >
                      <option value="GROUP_VOUCHER">통합 전표</option>
                      <option value="ITEM_VOUCHER">항목별 전표</option>
                    </select>
                  </label>
                </>
              ) : null}
              </> : null}
              {currentStep === 2 ? (
              <div className="rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 md:col-span-3 xl:col-span-4">
                <div className="mb-4 grid gap-3 rounded-lg bg-[var(--color-cloud-veil)] p-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                  <div><p className="text-xs font-bold text-[var(--color-stone)]">프로젝트</p><p className="mt-1 font-bold">{formState.projectName || "미선택"}</p></div>
                  <div><p className="text-xs font-bold text-[var(--color-stone)]">지급대상</p><p className="mt-1 font-bold">{selectedPaymentTarget?.label ?? formState.author}</p></div>
                  <div><p className="text-xs font-bold text-[var(--color-stone)]">비용부담</p><p className="mt-1 font-bold">{getExpenseBurdenLabel(formState.expenseBurdenType)}</p></div>
                  <div className="flex items-end justify-between gap-2"><div><p className="text-xs font-bold text-[var(--color-stone)]">지급계좌</p><p className="mt-1 font-bold">{formState.paymentBank || "미입력"} {maskAccountNumber(formState.paymentAccountNo)}</p></div><Button onClick={() => setCurrentStep(1)} size="sm" type="button" variant="outline">기본정보 수정</Button></div>
                </div>
                 {formState.expenseTiming !== "ADVANCE" ? <div className="mb-4 grid gap-3 md:grid-cols-2"><TextInput label={getExpenseDateLabel(formState.expenseTiming)} onChange={(value) => onChange("plannedPaymentDate", value)} type="date" value={formState.plannedPaymentDate} /><TextInput label="거래처명" onChange={(value) => onChange("vendorName", value)} value={formState.vendorName} /></div> : null}
                 <section className="mb-4 rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] p-4">
                   <div className="mb-3">
                     <h3 className="text-sm font-black">판매처 정보</h3>
                     <p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">증빙에서 인식한 판매처 정보를 확인하고 필요한 경우 수정해줘.</p>
                   </div>
                   <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                     <TextInput label="판매처 상호명" onChange={(value) => onChange("vendorName", value)} value={formState.vendorName} />
                     <TextInput label="사업자등록번호" onChange={(value) => onChange("vendorBusinessNumber", value)} value={formState.vendorBusinessNumber} />
                     <TextInput label="대표자명" onChange={(value) => onChange("vendorRepresentative", value)} value={formState.vendorRepresentative} />
                     <TextInput label="사업장 주소" onChange={(value) => onChange("vendorAddress", value)} value={formState.vendorAddress} />
                     <TextInput label="업태" onChange={(value) => onChange("vendorBusinessType", value)} value={formState.vendorBusinessType} />
                     <TextInput label="종목" onChange={(value) => onChange("vendorBusinessCategory", value)} value={formState.vendorBusinessCategory} />
                     <TextInput label="판매처 연락처" onChange={(value) => onChange("vendorContact", value)} value={formState.vendorContact} />
                   </div>
                 </section>
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--color-soft-border)] pb-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--color-midnight-ink)]">결의 입력</p>
                    <p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">금액과 결의내용을 문서 기본값과 함께 입력합니다.</p>
                  </div>
                </div>

                {!isBatch ? (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-[var(--color-stone)]">지출정보 요약</p>
                      <p className="mt-2 text-base font-bold text-[var(--color-midnight-ink)]">{getExpenseInfoSummary(formState)}</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--color-stone)]">
                        이번 달 예산 {formatExpenseResolutionAmount(budgetSnapshot.monthlyBudgetAmount)} · 기집행 {formatExpenseResolutionAmount(budgetSnapshot.usedAmount)} · 잔여{" "}
                        {formatExpenseResolutionAmount(budgetSnapshot.remainingBudgetAmount)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--color-deep-cobalt)]">증빙 권장: {formState.evidenceType}</p>
                    </div>
                    <Button className="rounded-full" onClick={() => setIsExpenseDetailOpen((current) => !current)} type="button" variant="outline">
                      지출정보 상세 수정
                    </Button>
                  </div>
                ) : (
                  <p className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3 text-sm font-semibold text-[var(--color-stone)]">
                    일괄 지출결의의 총지급액은 세부 지출내역 합계로 자동 계산됩니다.
                  </p>
                )}

                {!isBatch && isExpenseDetailOpen ? (
                  <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0 [&_input]:min-w-0 [&_input]:w-full [&_select]:min-w-0 [&_select]:w-full">
                    <label className="grid gap-1 text-sm font-semibold">
                      <span>지출구분</span>
                      <select
                        className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                        onChange={(event) => onChange("expenseType", event.target.value as ExpenseResolutionType)}
                        value={formState.expenseType}
                      >
                        {expenseResolutionTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                      <span>운영비 세부구분</span>
                      <select
                        className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                        onChange={(event) => { const detail=expenseDetails.find((item)=>item.name===event.target.value); onChange("operationExpenseDetail", event.target.value); onChange("expenseDetailId",detail?.id??""); if(detail)onChange("budgetItem",detail.budgetItem); }}
                        value={formState.operationExpenseDetail}
                      >
                        {operatingExpenseDetailOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}{expenseDetails.find((detail)=>detail.name===option)?.status==="POLICY_REVIEW"?" · 정책 확인 필요":""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                      <span>예산항목</span>
                      <select
                        className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                        onChange={(event) => onChange("budgetItem", event.target.value)}
                        value={formState.budgetItem}
                      >
                        <option value="">선택</option>
                        {budgetItemOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <TextInput label="거래처명" onChange={(value) => onChange("vendorName", value)} value={formState.vendorName} />
                  </div>
                ) : null}

                {!isBatch ? (
                  <div className="mt-4 grid gap-4">
                    <SingleExpenseItemsEditor items={formState.singleItems} onAdd={onAddSingleItem} onChange={onSingleItemChange} onDelete={onDeleteSingleItem} />
                    <AccountAllocationEditor allocations={formState.accountAllocations} allocationTotal={accountAllocationTotal} budgetRecommendation={formState.budgetRecommendation} onAdd={onAddAccountAllocation} onChange={onAccountAllocationChange} onDelete={onDeleteAccountAllocation} totalAmount={totalAmount} />
                  </div>
                ) : null}

                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--color-stone)]">공급가액 합계</p>
                    <p className="mt-2 text-lg font-bold">{formatExpenseResolutionAmount(displayedSupplyAmount)}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--color-stone)]">부가세 합계</p>
                    <p className="mt-2 text-lg font-bold">{formatExpenseResolutionAmount(displayedVatAmount)}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--color-stone)]">총지급액</p>
                    <p className="mt-2 text-xl font-bold">{formatExpenseResolutionAmount(totalAmount)}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 rounded-lg border border-[var(--color-soft-border)] bg-white p-3 text-sm md:grid-cols-2">
                  <p className={Math.abs(amountEquationDifference) <= 0.5 ? "font-bold text-[var(--color-green-ink)]" : "font-bold text-[var(--color-tangerine)]"}>{Math.abs(amountEquationDifference) <= 0.5 ? "✓ 공급가액 + 부가세 = 총액" : `! 공급가액과 부가세 합계가 총액과 ${formatExpenseResolutionAmount(Math.abs(amountEquationDifference))} 차이 납니다.`}</p>
                  {!isBatch ? <p className={Math.abs(allocationDifference) <= 0.5 ? "font-bold text-[var(--color-green-ink)]" : "font-bold text-[var(--color-tangerine)]"}>{Math.abs(allocationDifference) <= 0.5 ? "✓ 계정과목 분할합계 = 총지급액" : `! 계정과목 분할금액을 ${formatExpenseResolutionAmount(Math.abs(allocationDifference))} ${allocationDifference > 0 ? "늘려" : "줄여"}주세요.`}</p> : null}
                  {formState.expenseTiming === "SETTLEMENT" ? <p className="font-bold text-[var(--color-deep-cobalt)]">선지급액 - 실제 사용액 = {formatExpenseResolutionAmount(settlementDifference)}</p> : null}
                </div>
                {budgetSnapshot.remainingBudgetAmount < 0 ? (
                  <div className="mt-3">
                    <TextareaInput label="예산초과 사유" onChange={(value) => onChange("budgetOverReason", value)} value={formState.budgetOverReason} />
                  </div>
                ) : null}
                <div className="mt-3">
                  <TextareaInput id="expense-reason" label="지출사유" onChange={(value) => onChange("reason", value)} value={formState.reason} />
                </div>
              </div>
              ) : null}
            </FormSection>
            </>
            ) : null}

            {currentStep === 2 && isBatch ? (
              <BatchExpenseItemsSection
                batchSummary={batchSummary}
                items={batchSummary.items}
                onAddBatchItem={onAddBatchItem}
                onAttachBatchEvidence={onAttachBatchEvidence}
                onBatchItemChange={onBatchItemChange}
                onCopyBatchItem={onCopyBatchItem}
                onDeleteBatchItem={onDeleteBatchItem}
                onReviewBatchBudget={onReviewBatchBudget}
              />
            ) : null}

            {currentStep === 2 && formState.expenseTiming === "ADVANCE" && formState.executionMethod === "EMPLOYEE_ADVANCE" ? (
              <FormSection title="담당자 선지급 정보">
                <TextInput label="선지급일" onChange={(value) => onChange("advancePaidAt", value)} type="date" value={formState.advancePaidAt} />
                <TextInput label="선지급받는 사람" onChange={(value) => onChange("advancePayer", value)} value={formState.advancePayer} />
                <label className="grid gap-1 text-sm font-semibold">
                  <span>선지급 방법</span>
                  <select
                    className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                    onChange={(event) => onChange("advancePaymentMethod", event.target.value as PaymentMethod)}
                    value={formState.advancePaymentMethod}
                  >
                    {["계좌이체", "카드결제", "현금", "기타"].map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </label>
                <TextInput label="선지급 금액" onChange={(value) => onChange("advancePaidAmount", value)} type="number" value={formState.advancePaidAmount} />
                <TextInput label="정산기한" onChange={(value) => onChange("settlementDueDate", value)} type="date" value={formState.settlementDueDate} />
                <TextInput label="정산담당자" onChange={(value) => onChange("settlementManager", value)} value={formState.settlementManager} />
              </FormSection>
            ) : null}

            {currentStep === 2 && formState.expenseTiming === "REIMBURSEMENT" ? (
              <FormSection title="사후 지출 정보">
                <TextInput label="비용부담자" onChange={(value) => onChange("advancePayer", value)} value={formState.advancePayer} />
                <TextInput label="실제 사용금액" onChange={(value) => onChange("actualUsedAmount", value)} type="number" value={formState.actualUsedAmount} />
                <TextareaInput label="사후 지출사유" onChange={(value) => onChange("postApprovalReason", value)} value={formState.postApprovalReason} />
              </FormSection>
            ) : null}

            {currentStep === 2 && formState.expenseTiming === "SETTLEMENT" ? (
              <FormSection title="선지급금 정산 정보">
                <TextInput label="선지급일" onChange={(value) => onChange("advancePaidAt", value)} type="date" value={formState.advancePaidAt} />
                <TextInput label="선지급액" onChange={(value) => onChange("advancePaidAmount", value)} type="number" value={formState.advancePaidAmount} />
                <TextInput label="실제 사용액" onChange={(value) => onChange("actualUsedAmount", value)} readOnly={isBatch && formState.inputMethod === "EVIDENCE_OCR"} type="number" value={formState.actualUsedAmount} />
                <label className="grid gap-1 text-sm font-semibold">
                  <span>차액 처리</span>
                  <select
                    className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                    disabled={isBatch && formState.inputMethod === "EVIDENCE_OCR"}
                    onChange={(event) => onChange("settlementDifferenceAction", event.target.value as ResolutionFormState["settlementDifferenceAction"])}
                    value={formState.settlementDifferenceAction}
                  >
                    {["차액없음", "추가지급", "환급필요"].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--color-stone)]">정산 차액</p>
                  <p className="mt-2 text-lg font-bold">{settlementDifference > 0 ? `반납액 ${formatExpenseResolutionAmount(settlementDifference)}` : settlementDifference < 0 ? `추가 지급액 ${formatExpenseResolutionAmount(Math.abs(settlementDifference))}` : "차액 없음"}</p>
                </div>
                {isBatch && formState.inputMethod === "EVIDENCE_OCR" ? (
                  <div className="grid gap-2 rounded-lg border border-[var(--color-soft-border)] bg-white p-3 text-sm md:col-span-2">
                    <p className="font-bold">영수증 정산 대사</p>
                    <p>전체 {batchEvidenceSettlement.totalCount}개 · 확정 {batchEvidenceSettlement.confirmedCount}개 · 확인 대기 {batchEvidenceSettlement.pendingCount}개 · 실패 {batchEvidenceSettlement.failedCount}개</p>
                    <p>확정 영수증 합계 <strong>{formatExpenseResolutionAmount(batchEvidenceSettlement.confirmedReceiptTotal)}</strong></p>
                    <p className={batchEvidenceSettlement.canApprove ? "font-bold text-[var(--color-green-ink)]" : "font-bold text-[var(--color-tangerine)]"}>{batchEvidenceSettlement.canApprove ? "정산 대사가 완료되었습니다." : batchEvidenceSettlement.errors.join(" ")}</p>
                  </div>
                ) : null}
                <TextareaInput label="정산사유" onChange={(value) => onChange("postApprovalReason", value)} value={formState.postApprovalReason} />
              </FormSection>
            ) : null}

            {currentStep === 2 ? <CollapsibleFormSection defaultOpen summary={`${formState.evidenceType} · ${formState.evidenceFiles.length}개 첨부`} title="증빙자료·OCR 결과">
              {formState.quickEntryMode === "BUDGET_DIRECT" && formState.quickPaymentMethod === "CORPORATE_CARD" ? (
                <fieldset className="grid gap-3 rounded-xl border border-[var(--color-deep-cobalt)]/20 bg-[var(--color-morning-tint)]/35 p-4 md:col-span-3">
                  <legend className="px-1 text-sm font-bold">영수증 또는 대체증빙 상태</legend>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { kind: "CARD_RECEIPT", label: "영수증 있음", reason: "", status: "QUALIFIED" },
                      { kind: "OTHER_ALTERNATIVE", label: "카드 승인내역으로 대체", reason: "공용 법인카드 승인내역으로 대체", status: "ALTERNATIVE" },
                      { kind: "NONE", label: "영수증 분실", reason: "영수증 분실 · 공용 법인카드 사용내역 확인 필요", status: "NONE" },
                      { kind: "NONE", label: "영수증 미발행", reason: "영수증 미발행 · 공용 법인카드 사용내역 확인 필요", status: "NONE" },
                    ].map((option) => {
                      const selected = option.reason ? formState.missingEvidenceReason === option.reason : formState.evidenceKind === "CARD_RECEIPT" && !formState.missingEvidenceReason;
                      return <button aria-pressed={selected} className={`rounded-lg border px-3 py-3 text-left text-sm font-bold ${selected ? "border-[var(--color-deep-cobalt)] bg-white text-[var(--color-deep-cobalt)]" : "border-[var(--color-soft-border)] bg-white/70"}`} key={option.label} onClick={() => { onChange("evidenceKind", option.kind as EvidenceKind); onChange("evidenceStatus", option.status as EvidenceStatus); onChange("missingEvidenceReason", option.reason); }} type="button">{option.label}</button>;
                    })}
                  </div>
                  {formState.evidenceStatus === "NONE" || formState.evidenceStatus === "DEFICIENT" || formState.evidenceStatus === "ALTERNATIVE" ? <p className="text-xs font-semibold text-[var(--color-stone)]">증빙이 없어도 제출할 수 있지만, 사유와 함께 결재권자의 추가 확인 대상으로 표시됩니다.</p> : null}
                </fieldset>
              ) : null}
              {vendorRegistrationNotice ? <p className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-sprout)] px-4 py-3 text-sm font-bold text-[var(--color-green-ink)]">{vendorRegistrationNotice}</p> : null}
              <label className="grid gap-1 text-sm font-semibold"><span>증빙 유형</span><select className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3" onChange={(event) => onChange("evidenceKind", event.target.value as EvidenceKind)} value={formState.evidenceKind}><option value="E_TAX_INVOICE">전자세금계산서</option><option value="INVOICE">계산서</option><option value="CARD_RECEIPT">카드매출전표</option><option value="CASH_RECEIPT">현금영수증</option><option value="SIMPLE_RECEIPT">간이영수증</option><option value="BANK_TRANSFER">계좌이체확인증</option><option value="TRANSACTION_STATEMENT">거래명세서</option><option value="BILL">청구서</option><option value="EXPENSE_FACT_CONFIRMATION">지출사실확인서</option><option value="OTHER_ALTERNATIVE">기타 대체증빙</option><option value="NONE">증빙 없음</option></select></label>
              <label className="grid gap-1 text-sm font-semibold"><span>증빙 상태</span><select className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3" onChange={(event) => onChange("evidenceStatus", event.target.value as EvidenceStatus)} value={formState.evidenceStatus}><option value="QUALIFIED">적격증빙</option><option value="GENERAL">일반증빙</option><option value="ALTERNATIVE">대체증빙</option><option value="DEFICIENT">증빙불비</option><option value="NONE">증빙 없음</option></select></label>
              {formState.evidenceKind === "EXPENSE_FACT_CONFIRMATION" ? <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 md:col-span-3">지출사실확인서는 지출결의서를 대체하지 않으며 적격증빙으로 처리되지 않습니다.</p> : null}
              {formState.evidenceStatus === "DEFICIENT" || formState.evidenceStatus === "NONE" || (formState.evidenceStatus === "ALTERNATIVE" && !formState.evidenceFiles.length) ? <TextInput label="증빙 미첨부·대체 사유" onChange={(value) => onChange("missingEvidenceReason", value)} value={formState.missingEvidenceReason} /> : null}
              <label className="grid gap-1 text-sm font-semibold">
                <span>거래 증빙 종류</span>
                <select
                  className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                  onChange={(event) => onChange("evidenceType", event.target.value as EvidenceType)}
                  value={formState.evidenceType}
                >
                  {transactionEvidenceTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold md:col-span-2" htmlFor="expense-evidence-file">
                <span>증빙자료</span>
                <span className="flex min-h-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--color-soft-border)] bg-white px-4 text-center text-sm text-[var(--color-stone)]">
                  {isEvidenceUploading ? "최대 3개씩 안전한 저장소에 업로드 중입니다…" : isBatch && formState.inputMethod === "EVIDENCE_OCR" ? `영수증을 여러 개 선택하세요. 최대 10개 · 현재 ${formState.evidenceFiles.length}개` : "PDF, 이미지, TXT, CSV 증빙을 선택하세요. 최대 10MB"}
                </span>
              </label>
              {isBatch && formState.inputMethod === "EVIDENCE_OCR" ? (
                <div className="grid gap-2 rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] p-3 text-sm md:col-span-3 md:grid-cols-4">
                  <p><span className="block text-xs font-bold text-[var(--color-stone)]">전체 증빙</span><strong>{batchEvidenceSettlement.totalCount}개</strong></p>
                  <p><span className="block text-xs font-bold text-[var(--color-stone)]">확정 합계</span><strong>{formatExpenseResolutionAmount(batchEvidenceSettlement.confirmedReceiptTotal)}</strong></p>
                  <p><span className="block text-xs font-bold text-[var(--color-stone)]">선지급액</span><strong>{formatExpenseResolutionAmount(toNumber(formState.advancePaidAmount))}</strong></p>
                  <p><span className="block text-xs font-bold text-[var(--color-stone)]">정산 결과</span><strong>{batchEvidenceSettlement.action === "REFUND_REQUIRED" ? `반납 ${formatExpenseResolutionAmount(batchEvidenceSettlement.refundAmount)}` : batchEvidenceSettlement.action === "ADDITIONAL_PAYMENT" ? `추가 지급 ${formatExpenseResolutionAmount(batchEvidenceSettlement.additionalPaymentAmount)}` : "차액 없음"}</strong></p>
                </div>
              ) : null}
              {formState.evidenceFiles.length ? (
                <div className="grid gap-3 md:col-span-3" aria-label="첨부 증빙 목록">
                  {formState.evidenceFiles.map((file) => (
                    <article className="rounded-xl border border-[var(--color-soft-border)] bg-white p-4" key={file.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{file.fileName}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">{file.evidenceType} · {formatFileSize(file.fileSize)} · {file.ocrData.provider === "OPENAI" ? "OpenAI 비전" : file.ocrData.provider === "EMBEDDED_TEXT" ? "PDF 내장문자" : "로컬 OCR(Tesseract)"} · {file.ocrStatus === "EXTRACTED" ? "추출값 검토 필요" : file.ocrStatus === "CONFIRMED" ? "추출값 확인완료" : file.ocrStatus === "FAILED" ? "OCR 처리 실패 · 직접 입력 필요" : "OCR 검토 필요"}{file.ocrData.confidence !== undefined ? ` · 인식률 ${file.ocrData.confidence}%` : ""}</p>
                          {file.ocrData.normalizedEvidenceType ? <p className="mt-2 text-xs font-bold text-[var(--color-deep-cobalt)]">인식 유형: {file.ocrData.normalizedEvidenceType} · 분류 신뢰도: {file.ocrData.classificationConfidence ?? "낮음"}</p> : null}
                          {file.ocrData.classificationReasons?.length ? <p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">판정 근거: {file.ocrData.classificationReasons.join(", ")}</p> : null}
                          {file.ocrData.processingNote ? <p className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800">{file.ocrData.processingNote}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => void onOpenEvidenceOriginal(file.storagePath)} size="sm" type="button" variant="outline">원본 보기</Button>
                          <Button onClick={() => onRemoveEvidenceFile(file.id)} size="sm" type="button" variant="outline">목록에서 제거</Button>
                          {file.ocrJobId ? <Button onClick={() => void onRetryEvidenceFile(file.id)} size="sm" type="button" variant="outline">다시 분석</Button> : null}
                        </div>
                      </div>
                      {Object.keys(file.ocrData).length ? (
                        <div className="mt-3 grid gap-2 rounded-lg bg-[var(--color-cloud-veil)] p-3 text-sm md:grid-cols-5">
                          <OcrValue confirmed={file.ocrStatus === "CONFIRMED"} label="거래처" value={file.ocrData.issuer ?? "-"} />
                          <OcrValue confirmed={file.ocrStatus === "CONFIRMED"} label="사업자등록번호" value={file.ocrData.issuerBusinessNumber ?? "-"} />
                          <OcrValue confirmed={file.ocrStatus === "CONFIRMED"} label="대표자" value={file.ocrData.issuerRepresentative ?? "-"} />
                          <OcrValue confirmed={file.ocrStatus === "CONFIRMED"} label="증빙일" value={file.ocrData.documentDate ?? "-"} />
                          <OcrValue confirmed={file.ocrStatus === "CONFIRMED"} label="공급가액" value={file.ocrData.supplyAmount === undefined ? "-" : formatExpenseResolutionAmount(file.ocrData.supplyAmount)} />
                          <OcrValue confirmed={file.ocrStatus === "CONFIRMED"} label="부가세" value={file.ocrData.vatAmount === undefined ? "-" : formatExpenseResolutionAmount(file.ocrData.vatAmount)} />
                          <OcrValue confirmed={file.ocrStatus === "CONFIRMED"} label="합계" value={file.ocrData.totalAmount === undefined ? "-" : formatExpenseResolutionAmount(file.ocrData.totalAmount)} />
                          <div className="md:col-span-5">
                            <div className="flex flex-wrap gap-2"><Button disabled={file.ocrStatus === "CONFIRMED"} onClick={() => void handleApplyEvidenceOcr(file.id)} size="sm" type="button">
                              {file.ocrStatus === "CONFIRMED" ? "추출값 반영완료" : "추출값을 결의서에 반영"}
                            </Button>{ocrUndoSnapshot ? <Button onClick={restoreBeforeOcr} size="sm" type="button" variant="outline">자동입력 이전으로 되돌리기</Button> : null}</div>
                          </div>
                          {file.ocrData.recognizedText ? (
                            <details className="md:col-span-5 rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2">
                              <summary className="cursor-pointer font-bold">인식된 원문 확인</summary>
                              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[var(--color-stone)]">{file.ocrData.recognizedText}</pre>
                            </details>
                          ) : null}
                          {duplicateEvidenceIds.has(file.id) ? <p className="md:col-span-5 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-xs font-bold text-[var(--color-tangerine)]">같은 거래처·날짜·금액의 증빙이 이미 첨부되어 있습니다. 중복 영수증인지 확인해줘.</p> : null}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </CollapsibleFormSection> : null}

            {currentStep === 1 && !isCorporateCardPayment ? <CollapsibleFormSection summary={getPaymentTargetHeaderSummary(selectedPaymentTarget, formState)} title="지급정보">
              <TextInput label="거래처명" onChange={(value) => onChange("vendorName", value)} value={formState.vendorName} />
              <label className="grid gap-1 text-sm font-semibold md:col-span-2">
                <span>지급대상</span>
                <select
                  className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                  onChange={(event) => onChange("paymentTargetId", event.target.value)}
                  value={formState.paymentTargetId}
                >
                  {paymentTargets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 md:col-span-2">
                <p className="text-xs font-bold text-[var(--color-stone)]">{selectedPaymentTarget.sourceLabel}</p>
                <p className="mt-2 text-base font-bold text-[var(--color-midnight-ink)]">{getPaymentTargetSummary(selectedPaymentTarget, formState)}</p>
                <p className="mt-1 break-keep text-sm font-semibold text-[var(--color-stone)]">
                  {selectedPaymentTarget.id === "manual"
                    ? "이번 결의서에 입력한 지급정보이며, 실제 지급 전 회계담당자가 최종 확인합니다."
                    : "등록된 기본 지급정보를 불러오며, 실제 지급 전 회계담당자가 최종 확인합니다."}
                </p>
              </div>
              <TextInput label="지급은행" onChange={(value) => onChange("paymentBank", value)} value={formState.paymentBank} />
              <TextInput label="지급계좌번호" onChange={(value) => onChange("paymentAccountNo", value)} value={formState.paymentAccountNo} />
              <TextInput label="예금주" onChange={(value) => onChange("accountHolder", value)} value={formState.accountHolder} />
            </CollapsibleFormSection> : null}
            {currentStep === 1 && isCorporateCardPayment ? <section className="rounded-xl border border-[var(--color-green-ink)]/25 bg-[var(--color-mint-wash)] px-5 py-4"><h3 className="font-bold text-[var(--color-green-ink)]">공용 법인카드 결제완료</h3><p className="mt-1 text-sm font-semibold text-[var(--color-stone)]">이미 법인카드로 결제한 건이므로 지급대상·지급계좌를 입력하지 않으며 별도 계좌이체도 발생하지 않습니다.</p></section> : null}

            {currentStep === 3 ? <section className="grid gap-4 rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">기본·지급정보</h3><p className="mt-1 text-sm text-[var(--color-stone)]">{formState.projectName || "프로젝트 미선택"} · {formState.subject || "건명 미입력"} · {isCorporateCardPayment ? "공용 법인카드 결제완료" : selectedPaymentTarget.label}</p></div><Button onClick={() => setCurrentStep(1)} size="sm" type="button" variant="outline">기본정보 수정</Button></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="지출일" value={formState.plannedPaymentDate || "-"} />
                <DetailItem label="거래처" value={formState.vendorName || "-"} />
                <DetailItem label="사업자등록번호" value={formState.vendorBusinessNumber || "-"} />
                <DetailItem label="대표자" value={formState.vendorRepresentative || "-"} />
                <DetailItem label="업태·종목" value={[formState.vendorBusinessType, formState.vendorBusinessCategory].filter(Boolean).join(" · ") || "-"} />
                <DetailItem label="총지급액" value={formatExpenseResolutionAmount(totalAmount)} />
                <DetailItem label="계정과목" value={formState.accountAllocations.map((item) => item.accountTitle).join(", ") || "-"} />
              </div>
              <div className="rounded-lg bg-white p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-bold">지출내역·증빙</p><p className="mt-1 text-sm text-[var(--color-stone)]">품목 {isBatch ? formState.batchItems.length : formState.singleItems.length}건 · 증빙 {formState.evidenceFiles.length}개 · {formState.reason || "지출사유 미입력"}</p></div><Button onClick={() => setCurrentStep(2)} size="sm" type="button" variant="outline">금액·증빙 수정</Button></div></div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg bg-white p-3"><p className="font-bold">지출 품목</p><div className="mt-2 grid gap-1 text-sm text-[var(--color-stone)]">{(isBatch ? formState.batchItems.map((item) => ({ id: item.id, label: item.itemTitle, total: item.totalAmount })) : formState.singleItems.map((item) => ({ id: item.id, label: item.itemName, total: item.totalAmount }))).map((item) => <p key={item.id}>{item.label || "품목명 미입력"} · {formatExpenseResolutionAmount(item.total)}</p>)}</div></div>
                <div className="rounded-lg bg-white p-3"><p className="font-bold">증빙자료</p><div className="mt-2 grid gap-1 text-sm text-[var(--color-stone)]">{formState.evidenceFiles.length ? formState.evidenceFiles.map((file) => <p key={file.id}>{file.fileName} · {file.ocrStatus === "CONFIRMED" ? "확인완료" : "확인 필요"}</p>) : <p>첨부된 증빙 없음</p>}</div></div>
                <div className="rounded-lg bg-white p-3"><p className="font-bold">계정과목 분할</p><div className="mt-2 grid gap-1 text-sm text-[var(--color-stone)]">{isBatch ? <p>일괄결의 항목별 계정과목 적용</p> : formState.accountAllocations.map((item) => <p key={item.id}>{item.accountTitle} · {item.budgetItem} · {formatExpenseResolutionAmount(toNumber(item.amount))}</p>)}</div></div>
                <div className="rounded-lg bg-white p-3"><p className="font-bold">예산 상태</p><p className={`mt-2 text-sm font-bold ${budgetSnapshot.remainingBudgetAmount >= 0 ? "text-[var(--color-green-ink)]" : "text-[var(--color-tangerine)]"}`}>{budgetSnapshot.budgetCheckStatus} · 결의 후 잔여 {formatExpenseResolutionAmount(budgetSnapshot.remainingBudgetAmount)}</p></div>
              </div>
            </section> : null}

            {currentStep === 3 ? <FormSection title="계약·회의 연결">
              <TextInput label="관련계약" onChange={(value) => onChange("relatedContract", value)} value={formState.relatedContract} />
              <TextInput label="관련회의/의결" onChange={(value) => onChange("relatedMeeting", value)} value={formState.relatedMeeting} />
            </FormSection> : null}

            {currentStep === 3 ? <CollapsibleFormSection summary={formState.memo.trim() ? "내부메모 입력됨" : "내부메모 없음"} title="기타">
              <TextareaInput label="내부메모" onChange={(value) => onChange("memo", value)} value={formState.memo} />
            </CollapsibleFormSection> : null}
          </div>

          <aside className="rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] p-3">
            <section className="mb-3 rounded-lg bg-white p-3">
              <h3 className="text-base font-bold">현재 결의 요약</h3>
              <div className="mt-3 grid gap-2 text-sm">
                <BudgetRow label={isCorporateCardPayment ? "결제수단" : "지급대상"} value={isCorporateCardPayment ? "공용 법인카드 · 별도 지급 없음" : selectedPaymentTarget.label} />
                <BudgetRow label="지출예정일" value={formState.plannedPaymentDate} />
                <BudgetRow label="총지급액" value={formatExpenseResolutionAmount(totalAmount)} />
                <BudgetRow label="예산상태" value={budgetSnapshot.budgetCheckStatus} />
              </div>
            </section>

            {currentStep === 2 ? <section className="mb-3 rounded-lg bg-white p-3">
              <h3 className="text-base font-bold">이번 달 예산현황</h3>
              <div className="mt-3 grid gap-2 text-sm">
                <BudgetRow label="예산기간" value={budgetSnapshot.budgetPeriod} />
                <BudgetRow label="월 예산" value={formatExpenseResolutionAmount(budgetSnapshot.monthlyBudgetAmount)} />
                <BudgetRow label="기집행액" value={formatExpenseResolutionAmount(budgetSnapshot.usedAmount)} />
                {budgetSnapshot.reservedAmount!==undefined&&<BudgetRow label="집행 예약액" value={formatExpenseResolutionAmount(budgetSnapshot.reservedAmount)} />}
                {!!budgetSnapshot.unresolvedCount&&<p className="text-sm text-amber-800">귀속 확인 필요 {budgetSnapshot.unresolvedCount}건 · 확인된 금액 기준이야. 월 예산·마감에서 배정을 마쳐줘.</p>}
                <BudgetRow label="승인대기액" value={formatExpenseResolutionAmount(budgetSnapshot.pendingApprovalAmount)} />
                <BudgetRow label="지급대기액" value={formatExpenseResolutionAmount(budgetSnapshot.paymentWaitingAmount)} />
                <BudgetRow label="이번 결의금액" value={formatExpenseResolutionAmount(budgetSnapshot.currentRequestAmount)} />
                <BudgetRow label="결의 후 잔여예산" value={formatExpenseResolutionAmount(budgetSnapshot.remainingBudgetAmount)} />
              </div>
              <details className="mt-2 rounded-lg bg-[var(--color-cloud-veil)] px-3 py-2 text-sm">
                <summary className="cursor-pointer font-bold text-[var(--color-stone)]">연간예산 및 산출근거</summary>
                <div className="mt-2 grid gap-2">
                  <BudgetRow label="2025년(전기) 연간예산" value={formatExpenseResolutionAmount(budgetSnapshot.previousAnnualBudgetAmount)} />
                  <BudgetRow label="2026년(당기) 연간예산" value={formatExpenseResolutionAmount(budgetSnapshot.currentAnnualBudgetAmount)} />
                  <BudgetRow label="내역 및 산출근거" value={budgetSnapshot.calculationBasis} />
                </div>
              </details>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--color-cloud-veil)] px-3 py-2 text-sm font-bold">
                <span>집행률 {budgetSnapshot.budgetUsageRate}%</span>
                <Badge value={budgetSnapshot.budgetCheckStatus} />
              </div>
            </section> : null}

            {currentStep === 3 ? <><section className="mb-3 rounded-lg bg-white p-3">
              <h3 className="text-base font-bold">승인 전 확인</h3>
              <div className="mt-3 grid gap-2">
                {reviewItems.map((item) => (
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${item.complete ? "bg-[var(--color-sprout)] text-[var(--color-green-ink)]" : "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]"}`} key={item.label}>
                    <span>{item.complete ? "✓" : "!"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block">{item.label}</span>
                      {!item.complete && getReviewSuggestion(item.label) ? <span className="mt-0.5 block truncate text-[10px] font-semibold text-[var(--color-stone)]">추천: {getReviewSuggestion(item.label)}</span> : null}
                    </span>
                    {!item.complete && getReviewSuggestion(item.label) ? <button className="rounded-full border border-current bg-white px-2 py-1 text-[10px] font-black" onClick={() => applyReviewSuggestion(item.label)} type="button">추천 적용</button> : null}
                    {!item.complete ? <button className="rounded-full border border-current bg-white px-2 py-1 text-[10px] font-black" onClick={() => moveToReviewField(item.label)} type="button">{getReviewSuggestion(item.label) ? "직접 입력" : item.label.includes("확인") ? "확인하기" : item.label.includes("합계") ? "수정하기" : "입력하기"}</button> : null}
                  </div>
                ))}
              </div>
              {incompleteReviewItems.length > 0 ? <p className="mt-3 text-xs font-semibold text-[var(--color-tangerine)]">승인요청 전 {incompleteReviewItems.length}개 항목을 확인해주세요.</p> : null}
            </section>
            <h3 className="text-base font-bold">결재선</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--color-stone)]">결재는 내부 승인 절차이며, 실제 계좌이체는 지급처리 단계에서 진행합니다.</p>
            <div className="mt-3 overflow-hidden rounded-lg border border-[var(--color-soft-border)] bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]">
                  <tr>
                    <th className="px-3 py-2">순서</th>
                    <th className="px-3 py-2">결재자</th>
                    <th className="px-3 py-2">직책</th>
                    <th className="px-3 py-2">결재상태</th>
                    <th className="px-3 py-2">처리일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-soft-border)]">
                  {buildApprovalLine().map((step) => (
                    <tr key={step.order}>
                      <td className="px-3 py-2">{step.order}차</td>
                      <td className="px-3 py-2 font-semibold">{step.approver}</td>
                      <td className="px-3 py-2">{step.role}</td>
                      <td className="px-3 py-2">
                        <Badge value={step.status} />
                      </td>
                      <td className="px-3 py-2 text-[var(--color-stone)]">-</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 rounded-lg bg-white p-3 text-sm">
              <p className="font-bold">초기 상태</p>
              <p className="mt-1 text-[var(--color-stone)]">승인상태: 작성중</p>
              <p className="mt-1 text-[var(--color-stone)]">지급상태: 지급전</p>
            </div>
            </> : null}
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          {saveError ? (
            <div className="w-full rounded-lg bg-[var(--color-sunset-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">
              <div className="flex flex-wrap gap-x-1 gap-y-1">
                {saveError.includes("건명을 입력해주세요.") ? <button className="underline decoration-1 underline-offset-2 hover:text-[var(--color-midnight-ink)] focus-visible:outline focus-visible:outline-2" onClick={() => moveToField(1, "expense-subject")} type="button">건명을 입력해주세요.</button> : null}
                {saveError.includes("프로젝트/사업과제를 선택해주세요.") ? <button className="underline decoration-1 underline-offset-2 hover:text-[var(--color-midnight-ink)] focus-visible:outline focus-visible:outline-2" onClick={() => moveToField(1, "expense-project-name")} type="button">프로젝트/사업과제를 선택해주세요.</button> : null}
                {saveError.includes("지출사유를 입력해주세요.") || saveError.includes("정산사유를 입력해주세요.") ? <button className="underline decoration-1 underline-offset-2 hover:text-[var(--color-midnight-ink)] focus-visible:outline focus-visible:outline-2" onClick={() => moveToField(2, "expense-reason")} type="button">{saveError.includes("정산사유를 입력해주세요.") ? "정산사유를 입력해주세요." : "지출사유를 입력해주세요."}</button> : null}
                {saveError
                  .replace("건명을 입력해주세요.", "")
                  .replace("프로젝트/사업과제를 선택해주세요.", "")
                  .replace("지출사유를 입력해주세요.", "")
                  .replace("정산사유를 입력해주세요.", "")
                  .trim() ? <span>{saveError
                    .replace("건명을 입력해주세요.", "")
                    .replace("프로젝트/사업과제를 선택해주세요.", "")
                    .replace("지출사유를 입력해주세요.", "")
                    .replace("정산사유를 입력해주세요.", "")
                    .trim()}</span> : null}
              </div>
              <p className="mt-1 text-xs font-medium">항목을 누르면 해당 입력창으로 이동해.</p>
            </div>
          ) : null}
          <Button disabled={isSaving} className="rounded-full" onClick={onCancel} variant="outline">
            취소
          </Button>
          <div className="flex gap-2">
            {currentStep > 1 ? <Button className="rounded-full" onClick={() => setCurrentStep((currentStep - 1) as 1 | 2)} variant="outline">이전</Button> : null}
            <Button disabled={isSaving} className="rounded-full" onClick={() => void handleSaveDraft()} variant="outline">{isSaving ? "저장 중…" : isEditing ? "수정사항 저장" : formState.quickEntryMode === "BUDGET_DIRECT" && formState.quickPaymentMethod === "CORPORATE_CARD" && !formState.cardTransactionId ? "카드 사용 임시등록" : "임시저장"}</Button>
            {currentStep < 3 ? (
              <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={() => setCurrentStep((currentStep + 1) as 2 | 3)}>다음 단계</Button>
            ) : (
              <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" disabled={isSaving || (formState.quickEntryMode === "BUDGET_DIRECT" && formState.quickPaymentMethod === "CORPORATE_CARD" && !formState.cardTransactionId)} onClick={onRequestApproval}>{formState.quickEntryMode === "BUDGET_DIRECT" && formState.quickPaymentMethod === "CORPORATE_CARD" && !formState.cardTransactionId ? "카드내역 연결 후 승인" : isEditing ? "수정 후 승인요청" : "승인요청"}</Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function BatchExpenseItemsSection({
  batchSummary,
  items,
  onAddBatchItem,
  onAttachBatchEvidence,
  onBatchItemChange,
  onCopyBatchItem,
  onDeleteBatchItem,
  onReviewBatchBudget,
}: {
  batchSummary: ReturnType<typeof summarizeBatchItems>;
  items: BatchExpenseItem[];
  onAddBatchItem: () => void;
  onAttachBatchEvidence: (itemNo: number, file: File) => void | Promise<void>;
  onBatchItemChange: (itemNo: number, key: keyof BatchExpenseItem, value: string) => void;
  onCopyBatchItem: (itemNo: number) => void;
  onDeleteBatchItem: (itemNo: number) => void;
  onReviewBatchBudget: (itemNo: number) => void;
}) {
  const budgetProfiles = useContext(BudgetProfilesContext);
  const batchBudgetItemOptions = Object.keys(budgetProfiles);
  return (
    <section className="rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">세부 지출내역</h3>
          <p className="mt-1 text-sm text-[var(--color-stone)]">세부 항목별 거래처, 계정항목, 예산항목, 증빙, 지급상태를 분리 관리합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {batchSummary.overBudgetItemCount > 0 ? <span className="rounded-full bg-[var(--color-sunset-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-tangerine)]">예산초과 항목 포함</span> : null}
          <Button className="rounded-full" onClick={onAddBatchItem} size="sm" type="button" variant="outline">
            행 추가
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border border-[var(--color-soft-border)] bg-white p-4 md:grid-cols-5">
        <SummaryTile label="전체 항목 수" value={`${batchSummary.itemCount}건`} />
        <SummaryTile label="정상 항목 수" value={`${batchSummary.itemCount - batchSummary.overBudgetItemCount}건`} />
        <SummaryTile label="예산초과 항목 수" value={getBudgetOverLabel(batchSummary.overBudgetItemCount)} />
        <SummaryTile label="총 결의금액" value={formatExpenseResolutionAmount(batchSummary.totalAmount)} />
        <SummaryTile label="총 예산초과금액" value={formatExpenseResolutionAmount(batchSummary.totalOverBudgetAmount)} />
      </div>

      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <section
            aria-label={`${item.itemNo}행 세부 지출항목`}
            className={`rounded-xl border border-[var(--color-soft-border)] bg-white p-4 ${item.budgetStatus === "OVER_BUDGET" ? "shadow-[inset_4px_0_0_var(--color-tangerine)]" : ""}`}
            key={item.id}
            role="group"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-bold">{item.itemNo}번 항목</p>
                  <Badge value={item.budgetStatus === "OVER_BUDGET" ? "예산초과" : "정상"} />
                </div>
                <p className="mt-1 text-sm font-semibold text-[var(--color-stone)]">
                  {item.vendorName || "거래처 미입력"} · {item.accountTitle || "계정항목 미입력"} · 합계 {formatExpenseResolutionAmount(item.totalAmount)}
                </p>
              </div>
              <div className="text-right text-sm font-semibold text-[var(--color-stone)]">
                <p>잔여 {formatExpenseResolutionAmount(item.remainingBudget)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <BatchInput ariaLabel={`${item.itemNo}행 지출예정일`} label="지출예정일" type="date" value={item.expenseDate} onChange={(value) => onBatchItemChange(item.itemNo, "expenseDate", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 거래처`} label="거래처" value={item.vendorName} onChange={(value) => onBatchItemChange(item.itemNo, "vendorName", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 실제 지출자`} label="실제 지출자" value={item.actualSpender} onChange={(value) => onBatchItemChange(item.itemNo, "actualSpender", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 계정항목`} label="계정항목" options={accountTitleOptions} value={item.accountTitle} onChange={(value) => onBatchItemChange(item.itemNo, "accountTitle", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 지급상태`} label="지급상태" options={["지급전", "지급대기", "지급완료", "보류"]} value={item.paymentStatus} onChange={(value) => onBatchItemChange(item.itemNo, "paymentStatus", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 지출구분`} label="지출구분" options={expenseResolutionTypeOptions} value={item.expenseType} onChange={(value) => onBatchItemChange(item.itemNo, "expenseType", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 예산항목`} label="예산항목" options={batchBudgetItemOptions} value={item.budgetItem} onChange={(value) => onBatchItemChange(item.itemNo, "budgetItem", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 지출항목명`} label="지출항목명" value={item.itemTitle} onChange={(value) => onBatchItemChange(item.itemNo, "itemTitle", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 지급방법`} label="지급방법" options={["계좌이체", "카드결제", "현금", "기타"]} value={item.paymentMethod} onChange={(value) => onBatchItemChange(item.itemNo, "paymentMethod", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 내역 및 산출근거`} className="xl:col-span-2" label="내역 및 산출근거" value={item.description} onChange={(value) => onBatchItemChange(item.itemNo, "description", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 업무목적`} className="xl:col-span-2" label="업무목적" value={item.businessPurpose} onChange={(value) => onBatchItemChange(item.itemNo, "businessPurpose", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 공급가액`} label="공급가액" type="number" value={item.supplyAmount} onChange={(value) => onBatchItemChange(item.itemNo, "supplyAmount", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 부가세`} label="부가세" type="number" value={item.vatAmount} onChange={(value) => onBatchItemChange(item.itemNo, "vatAmount", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 증빙유형`} label="증빙유형" options={batchEvidenceTypeOptions} value={item.evidenceType} onChange={(value) => onBatchItemChange(item.itemNo, "evidenceType", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 증빙상태`} label="증빙상태" options={["QUALIFIED", "GENERAL", "ALTERNATIVE", "DEFICIENT", "NONE"]} value={item.evidenceStatus} onChange={(value) => onBatchItemChange(item.itemNo, "evidenceStatus", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 증빙파일명`} className="xl:col-span-2" label="증빙파일명" value={item.evidenceFileName} onChange={(value) => onBatchItemChange(item.itemNo, "evidenceFileName", value)} />
              <div className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3">
                <p className="text-xs font-bold text-[var(--color-stone)]">합계</p>
                <p className="mt-2 text-lg font-bold">{formatExpenseResolutionAmount(item.totalAmount)}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-soft-border)] pt-3">
              <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-stone)]" onClick={() => onCopyBatchItem(item.itemNo)} type="button">
                {item.itemNo}행 행 복사
              </button>
              <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-tangerine)]" onClick={() => onDeleteBatchItem(item.itemNo)} type="button">
                {item.itemNo}행 행 삭제
              </button>
              <label className="cursor-pointer rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-deep-cobalt)]">
                {item.itemNo}행 실제 증빙첨부
                <input accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onAttachBatchEvidence(item.itemNo, file); event.target.value = ""; }} type="file" />
              </label>
              <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-green-ink)]" onClick={() => onReviewBatchBudget(item.itemNo)} type="button">
                {item.itemNo}행 예산검토
              </button>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function BatchInput({
  ariaLabel,
  className = "",
  label,
  onChange,
  type = "text",
  value,
}: {
  ariaLabel: string;
  className?: string;
  label: string;
  onChange: (value: string) => void;
  type?: "date" | "number" | "text";
  value: string;
}) {
  return (
    <label className={`grid min-w-0 gap-1 text-sm font-semibold ${className}`}>
      <span className="text-xs font-bold text-[var(--color-stone)]">{label}</span>
      <input
        aria-label={ariaLabel}
        className="h-10 w-full min-w-0 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm font-semibold text-[var(--color-midnight-ink)]"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function BatchSelect({ ariaLabel, label, onChange, options, value }: { ariaLabel: string; label: string; onChange: (value: string) => void; options: readonly string[]; value: string }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-semibold">
      <span className="text-xs font-bold text-[var(--color-stone)]">{label}</span>
      <select aria-label={ariaLabel} className="h-10 w-full min-w-0 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm font-semibold text-[var(--color-midnight-ink)]" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
