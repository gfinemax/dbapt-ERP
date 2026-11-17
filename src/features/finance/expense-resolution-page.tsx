"use client";

import { CheckCircle2, FilePlus2, FileSpreadsheet, Search, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { createContext, Fragment, useDeferredValue, useEffectEvent, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createExpenseApprovalPolicy, type ExpenseApprovalPolicy, type ApprovalRecordKind } from "@/features/approval/approval-effective-policy";
import { canApproveExpense, canEditExpense } from "./expense-access-model";
import type { ReimbursementMember } from "./reimbursement-domain";
import type { ExpenseEntryStart } from "./expense-entry";
import { defaultExpenseResolutionSort, expenseResolutionListHref, formatFinanceMonth, normalizeFinanceMonth, type ExpenseResolutionListPage, type ExpenseResolutionSort } from "./expense-resolution-list";
import type { OperatingExpenseDetail } from "./operating-budget-classification";
import type { QuickExpenseConversionDraft } from "./quick-expense-conversion-repository";
import type { ExpenseBudgetDecisionSnapshot } from "./expense-resolution-budget-view";
import { getEditBankTransactionCandidates, type ExpenseResolutionFormOptions } from "./expense-resolution-form-options";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { buildDocumentPdfFileName } from "@/features/shared/document-print-filename";
import { getOrganizationApproverDisplayRole, getOrganizationExpenseApprovalLine } from "@/features/approval/organization-approval-line";
import type { ApprovalDocumentCandidate } from "@/features/approval/approval-domain";
import type { ExpenseComplianceSettings } from "./expense-compliance";
import { defaultExpenseComplianceSettings } from "./expense-compliance";
import { evaluateDirectExpensePolicy, type DirectExpenseDecision, type ExpenseCreationSource } from "./direct-expense-policy";
import { validateExpenseCompliance, type EvidenceKind, type EvidenceStatus, type ExpenseKind, type PettyCashTransaction } from "./expense-compliance";
import type { BankTransactionResolutionCandidate, ExpenseFactConfirmation, ExpenseFactConfirmationInput } from "./expense-compliance-repository";
import { isBankVerifiedCorporateCard, isTaxiCardTransaction, type CorporateCardReconciliationStatus, type CorporateCardSettlementMode, type CorporateCardTransactionCandidate, type CorporateCardVerificationSource } from "./corporate-card-transaction";
import type { BusinessPartnerOcrInput, BusinessPartnerRegistrationResult } from "@/features/basic-info/business-partner-data";
import { recommendExpenseBudget, recommendOperatingExpenseDetail, type ExpenseBudgetRecommendation } from "./expense-budget-recommendation";
import { isBudgetProfilePeriodKey, resolveBudgetProfile } from "./budget-profile-lookup";
import { calculateBatchEvidenceSettlement } from "./expense-batch-settlement";
import { getEmployeeAdvanceSourceFacts, isEmployeeAdvanceSettlementSource, validateEmployeeAdvanceSelection } from "./expense-advance-source";
import {
  expenseResolutionTypeOptions,
  formatExpenseResolutionAmount,
} from "./expense-resolution-data";
import type { ExpenseResolution, ExpenseResolutionType, ResolutionHistory } from "./expense-resolution-data";
import { getNextDocumentNo } from "./finance-numbering";
import { hasExtractedEvidenceData, normalizeEvidenceVendorFields, normalizeVendorName, type EvidenceOcrData, type EvidenceOcrJobProgress, type ExpenseEvidenceAttachment, type ExpenseEvidenceUploadResult } from "./expense-evidence";
import { transitionExpenseApproval, type ApprovalTransitionRequest, type ApprovalWorkflowCommand } from "./expense-approval-workflow";
import {
  buildExpenseApprovalRoute,
  inferExpenseApprovalRoute,
  type ExpenseApprovalParticipant,
  type ExpenseApprovalRoute,
} from "./expense-approval-routing";
import { transitionExpenseDisbursement, type DisbursementTransitionRequest, type DisbursementTransitionResult } from "./expense-disbursement-workflow";
import { buildExpenseResolutionAlerts, filterExpenseResolutions, getExpenseResolutionDashboard } from "./expense-resolution-insights";
import { isLegacySmallExpenseResolution } from "./legacy-small-expense";
import {
  buildExpenseResolutionImportTemplateCsv,
  parseExpenseResolutionImportRows,
  type ExpenseResolutionImportResult,
} from "./expense-resolution-import";
import {
  normalizeExpenseTiming,
  normalizeInputMethod,
  normalizeResolutionMode,
  validateExpenseResolutionWorkflow,
  type ExpenseInputMethod,
  type ExecutionMethod,
  type ExpenseBurdenType,
  type ExpenseTiming,
  type ResolutionMode,
} from "./expense-resolution-domain";

export type ApprovalStepStatus = "대기" | "결재대기" | "승인완료" | "반려";
export type ApprovalStatus = "작성중" | "승인대기" | "승인완료" | "반려";
const expenseResolutionLocalStorageKey = "dbapt-erp:finance:expense-resolutions";
export type PaymentStatus = "지급전" | "지급대기" | "부분지급" | "지급완료" | "보류";
export type ResolutionDocumentType = "SINGLE" | "BATCH";
export type BatchPaymentMode = "GROUP" | "ITEM";
export type VoucherCreationMode = "GROUP_VOUCHER" | "ITEM_VOUCHER";
export type VoucherStatus = "전표초안" | "전표확정" | "전표취소";
export type PaymentFlowType = "사전결의" | "선지급" | "사후정산";
export type SettlementStatus = "정산없음" | "정산대기" | "정산완료" | "추가지급" | "환급필요" | "보류";
export type BudgetCheckStatus = "정상" | "주의" | "예산초과" | "예산항목 선택 필요";
export type ExpenseResolutionHistoryActionType =
  | "CREATED"
  | "SAVED_DRAFT"
  | "REQUESTED_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "PAYMENT_PENDING"
  | "PAYMENT_COMPLETED"
  | "PAYMENT_HOLD"
  | "VOUCHER_CREATED"
  | "EVIDENCE_ATTACHED"
  | "PRINTED"
  | "ARCHIVED"
  | "UPDATED";

export type ApprovalStep = {
  approver: string;
  order: number;
  processedAt?: string;
  role: string;
  status: ApprovalStepStatus;
};

export type ExpenseResolutionHistoryItem = {
  actionAt: string;
  actionLabel: string;
  actionType: ExpenseResolutionHistoryActionType;
  actorName: string;
  actorTitle: string;
  comment?: string;
  budgetDecision?: ExpenseBudgetDecisionSnapshot;
  id: string;
};

export type BudgetSnapshot = {
  budgetId?: string;
  reservedAmount?: number;
  unresolvedCount?: number;
  budgetCheckStatus: BudgetCheckStatus;
  calculationBasis: string;
  budgetPeriod: string;
  budgetUsageRate: number;
  currentRequestAmount: number;
  currentAnnualBudgetAmount: number;
  expectedUsedAmount: number;
  monthlyBudgetAmount: number;
  paymentWaitingAmount: number;
  pendingApprovalAmount: number;
  previousAnnualBudgetAmount: number;
  remainingBudgetAmount: number;
  usedAmount: number;
};

export type BatchBudgetStatus = "NORMAL" | "OVER_BUDGET";
export type BatchExpenseItem = {
  accountTitle: string;
  allocatedBudget: number;
  budgetItem: string;
  budgetStatus: BatchBudgetStatus;
  bankTransactionId?: string;
  currentRequestAmount: number;
  description: string;
  actualSpender: string;
  businessPurpose: string;
  evidenceFileName: string;
  evidenceId?: string;
  evidenceKind: EvidenceKind;
  evidenceStatus: EvidenceStatus;
  evidenceType: string;
  factConfirmationId?: string;
  executedAmount: number;
  expenseDate: string;
  expenseType: ExpenseResolutionType;
  id: string;
  itemNo: number;
  itemTitle: string;
  memo: string;
  overBudgetAmount: number;
  overBudgetReason: string;
  actualPaidAmount?: number;
  paidAt?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  remainingBudget: number;
  supplyAmount: string;
  totalAmount: number;
  vatAmount: string;
  vendorName: string;
  vendorId?: string;
  vendorAddress?: string;
  vendorBusinessCategory?: string;
  vendorBusinessNumber?: string;
  vendorBusinessType?: string;
  vendorContact?: string;
  vendorRepresentative?: string;
  voucherNo?: string;
  voucherStatus?: VoucherStatus;
};

export type SingleExpenseTaxCategory = "TAXABLE" | "NON_DEDUCTIBLE" | "NO_VAT";

export type SingleExpenseItem = {
  id: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
  supplyAmount: number;
  taxCategory?: SingleExpenseTaxCategory;
  vatAmount: number;
  totalAmount: number;
  memo: string;
};

export type AccountAllocation = {
  id: string;
  accountTitle: string;
  amount: string;
  description: string;
  budgetItem: string;
};

export type PrintRecordItem = {
  copyKind: "원본" | "사본" | "재출력";
  id: string;
  memo?: string;
  printedAt: string;
  printedBy: string;
  printNo: string;
  printPurpose: "미리보기" | "보관용" | "감사대응" | "재출력";
  storageLocation?: string;
};

export type ManagedExpenseResolution = {
  authorization?: import("./expense-authorization").ExpenseAuthorization | null;
  creationSource?: ExpenseCreationSource;
  approvalDocumentId?: string;
  approvalDocumentNo?: string;
  approvalSkipReason?: string;
  directExpenseDecision?: DirectExpenseDecision;
  directExpenseReasons?: string[];
  actualPaidAmount?: number;
  accountHolder: string;
  approvalLine: ApprovalStep[];
  approvalParticipants?: ExpenseApprovalParticipant[];
  approvalPolicy?: ExpenseApprovalPolicy;
  approvalRoute?: ExpenseApprovalRoute;
  approvalStatus: ApprovalStatus;
  author: string;
  budgetItem: string;
  budgetId?: string;
  budgetMonth?: string;
  createdAt: string;
  currentApprover?: string;
  evidenceAttached: boolean;
  evidenceMaterials: string[];
  evidenceFiles?: ExpenseEvidenceAttachment[];
  evidenceType?: EvidenceType;
  expenseItems: BatchExpenseItem[];
  singleItems?: SingleExpenseItem[];
  accountAllocations?: AccountAllocation[];
  expenseType: ExpenseResolutionType;
  expenseTiming?: ExpenseTiming;
  executionMethod?: ExecutionMethod;
  expenseBurdenType?: ExpenseBurdenType;
  holdReason?: string;
  id: string;
  memo: string;
  inputMethod?: ExpenseInputMethod;
  operationExpenseDetail: string;
  expenseDetailId?: string;
  paymentMemo?: string;
  paymentMethod?: string;
  paymentFlowType: PaymentFlowType;
  paidAt?: string;
  paymentAccountNo: string;
  paymentBank: string;
  paymentTargetId?: string;
  paymentStatus: PaymentStatus;
  settlementStatus: SettlementStatus;
  advancePaidAt?: string;
  advancePayer?: string;
  advancePaymentMethod?: string;
  advancePaidAmount?: number;
  actualUsedAmount?: number;
  settlementDifference?: number;
  settlementDifferenceAction?: "차액없음" | "추가지급" | "환급필요";
  advanceReason?: string;
  postApprovalReason?: string;
  originalResolutionId?: string;
  settlementDueDate?: string;
  settlementManager?: string;
  budgetSnapshot: BudgetSnapshot;
  budgetOverReason: string;
  batchPaymentMode: BatchPaymentMode;
  itemCount: number;
  overBudgetItemCount: number;
  plannedPaymentDate: string;
  projectName: string;
  printRecords: PrintRecordItem[];
  reason: string;
  representativeAccountTitle: string;
  representativeVendorName: string;
  rejectionReason?: string;
  history: ExpenseResolutionHistoryItem[];
  relatedContract: string;
  relatedMeeting: string;
  resolutionNo: string;
  resolutionMode?: ResolutionMode;
  subject: string;
  supplyAmount: number;
  totalPaymentAmount: number;
  totalOverBudgetAmount: number;
  resolutionType: ResolutionDocumentType;
  voucherCreationMode: VoucherCreationMode;
  transferReceiptStatus?: string;
  vat: number;
  vendorName: string;
  vendorId?: string;
  vendorAddress?: string;
  vendorBusinessCategory?: string;
  vendorBusinessNumber?: string;
  vendorBusinessType?: string;
  vendorContact?: string;
  vendorRepresentative?: string;
  voucherNo?: string;
  voucherGenerated?: boolean;
  voucherStatus?: VoucherStatus;
  voucherConfirmedAt?: string;
  voucherConfirmedBy?: string;
  expenseKind?: ExpenseKind;
  accountingDate?: string;
  actualExpenseDate?: string;
  draftedAt?: string;
  approvedAt?: string;
  disbursedAt?: string;
  isPostApproval?: boolean;
  evidenceKind?: EvidenceKind;
  evidenceStatus?: EvidenceStatus;
  missingEvidenceReason?: string;
  bankTransactionId?: string;
  bankTransactions?: Array<{
    amount: number;
    description: string;
    id: string;
    itemId: string;
    transactionDate: string;
  }>;
  cardTransactionId?: string;
  cardLastFour?: string;
  cardReconciliationStatus?: CorporateCardReconciliationStatus;
  cardSettlementMode?: CorporateCardSettlementMode;
  cardVerificationSource?: CorporateCardVerificationSource;
  bankTransactionUid?: string;
  settlementRecipient?: string;
  settlementCompletedAt?: string;
  settlementAmount?: number;
  pettyCashTransactions?: PettyCashTransaction[];
  complianceWarnings?: string[];
  workflowTransactionId?: string;
};

export function getExpenseAuthorizationReadiness(resolution: ManagedExpenseResolution) {
  const expectedApproverCount = resolution.approvalLine.length;
  const linkedOrders = new Set(
    (resolution.authorization?.steps ?? [])
      .filter((step) => {
        const expectedStep = resolution.approvalLine[step.order - 1];
        return step.approver_user_id
          && expectedStep
          && step.legacy_step?.approver === expectedStep.approver
          && step.legacy_step?.role === expectedStep.role;
      })
      .map((step) => step.order),
  );
  const linkedApproverCount = linkedOrders.size;
  const authorLinked = Boolean(resolution.authorization?.author_user_id);

  return {
    authorLinked,
    expectedApproverCount,
    linkedApproverCount,
    ready: authorLinked && expectedApproverCount > 0 && linkedApproverCount === expectedApproverCount,
  };
}

export function getApprovalTransitionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/Server Components render|digest property/i.test(message)) {
    return "승인처리 중 서버 오류가 발생했습니다. 새로고침 후 계정 연결 상태를 확인해 주세요.";
  }
  return message || "결재 상태를 변경하지 못했습니다.";
}

export type EvidenceType = "세금계산서" | "계산서" | "영수증" | "현금영수증" | "이체확인증" | "계약서" | "견적서" | "의결서" | "기타";

function mapEvidenceTypeToComplianceKind(value: string): EvidenceKind {
  if (value.includes("세금계산서")) return "E_TAX_INVOICE";
  if (value.includes("계산서")) return "INVOICE";
  if (value.includes("카드")) return "CARD_RECEIPT";
  if (value.includes("현금영수증")) return "CASH_RECEIPT";
  if (value.includes("영수증")) return "SIMPLE_RECEIPT";
  if (value.includes("이체")) return "BANK_TRANSFER";
  return "OTHER_ALTERNATIVE";
}

function getDefaultEvidenceStatus(kind: EvidenceKind): EvidenceStatus {
  if (["E_TAX_INVOICE", "INVOICE", "CARD_RECEIPT", "CASH_RECEIPT"].includes(kind)) return "QUALIFIED";
  if (["EXPENSE_FACT_CONFIRMATION", "OTHER_ALTERNATIVE"].includes(kind)) return "ALTERNATIVE";
  if (kind === "NONE") return "NONE";
  return "GENERAL";
}

function currentDateLabel(value: string) {
  const [, month, day] = value.split("-");
  return month && day ? `${Number(month)}월 ${Number(day)}일` : "당일";
}

export type ResolutionFormState = {
  approvalRecordKind?: ApprovalRecordKind;
  originalApprovalDate?: string;
  originalApprovalReference?: string;
  creationSource: ExpenseCreationSource;
  approvalDocumentId: string;
  approvalDocumentNo: string;
  approvalSkipReason: string;
  approvalSkipReasonDetail: string;
  approvalRoute: ExpenseApprovalRoute;
  expenseKind: ExpenseKind;
  accountingDate: string;
  actualExpenseDate: string;
  evidenceKind: EvidenceKind;
  evidenceStatus: EvidenceStatus;
  missingEvidenceReason: string;
  bankTransactionId: string;
  bankTransactions: NonNullable<ManagedExpenseResolution["bankTransactions"]>;
  cardTransactionId: string;
  cardLastFour: string;
  cardReconciliationStatus: CorporateCardReconciliationStatus;
  cardSettlementMode: CorporateCardSettlementMode;
  cardVerificationSource?: CorporateCardVerificationSource;
  settlementRecipient: string;
  settlementCompletedAt: string;
  accountHolder: string;
  author: string;
  advancePaidAmount: string;
  advancePaidAt: string;
  advancePayer: string;
  advancePaymentMethod: PaymentMethod;
  actualUsedAmount: string;
  budgetItem: string;
  budgetRecommendation: ExpenseBudgetRecommendation | null;
  budgetOverReason: string;
  budgetPeriod: string;
  batchItems: BatchExpenseItem[];
  singleItems: SingleExpenseItem[];
  accountAllocations: AccountAllocation[];
  batchPaymentMode: BatchPaymentMode;
  createdAt: string;
  evidenceType: EvidenceType;
  evidenceFiles: ExpenseEvidenceAttachment[];
  expenseType: ExpenseResolutionType;
  expenseTiming: ExpenseTiming;
  executionMethod: ExecutionMethod;
  expenseBurdenType: ExpenseBurdenType;
  inputMethod: ExpenseInputMethod;
  quickEntryMode: "NONE" | "BUDGET_DIRECT";
  quickPaymentMethod: "CORPORATE_CARD" | "BANK_TRANSFER" | "AUTO_DEBIT" | "CASH" | "PERSONAL_PREPAID";
  quickExpenseCategory: "택시" | "주차" | "통행료" | "식대" | "소모품" | "기타";
  memo: string;
  operationExpenseDetail: string;
  expenseDetailId: string;
  paymentTargetId: string;
  paymentAccountNo: string;
  paymentBank: string;
  paymentFlowType: PaymentFlowType;
  plannedPaymentDate: string;
  postApprovalReason: string;
  originalResolutionId: string;
  settlementDueDate: string;
  settlementManager: string;
  reason: string;
  relatedContract: string;
  relatedMeeting: string;
  resolutionNo: string;
  resolutionMode: ResolutionMode;
  subject: string;
  resolutionType: ResolutionDocumentType;
  projectName: string;
  voucherCreationMode: VoucherCreationMode;
  settlementDifferenceAction: "차액없음" | "추가지급" | "환급필요";
  supplyAmount: string;
  vat: string;
  vendorName: string;
  vendorId: string;
  vendorAddress: string;
  vendorBusinessCategory: string;
  vendorBusinessNumber: string;
  vendorBusinessType: string;
  vendorContact: string;
  vendorRepresentative: string;
};

const currentUser = {
  name: "오학동",
  title: "사무국장",
};
const currentUserName = `${currentUser.name} ${currentUser.title}`;
type PaymentTarget = {
  accountHolder: string;
  accountNumber: string;
  bankName: string;
  id: string;
  label: string;
  sourceLabel: string;
};
export const paymentTargets: PaymentTarget[] = [
  {
    accountHolder: "오학동",
    accountNumber: "110-123-456789",
    bankName: "국민은행",
    id: "staff-oh",
    label: "오학동 사무국장",
    sourceLabel: "직원 기본정보",
  },
  {
    accountHolder: "대방사무용품",
    accountNumber: "1002-333-444555",
    bankName: "우리은행",
    id: "vendor-office",
    label: "대방사무용품",
    sourceLabel: "업체 기본정보",
  },
  {
    accountHolder: "박서연",
    accountNumber: "110-987-654321",
    bankName: "신한은행",
    id: "member-refund",
    label: "박서연 조합원",
    sourceLabel: "조합원 환불계좌",
  },
  {
    accountHolder: "",
    accountNumber: "",
    bankName: "",
    id: "manual",
    label: "직접 입력",
    sourceLabel: "이번 결의서 직접 입력",
  },
];
const resolutionNoPrefix = "지결";
const resolutionFlow = "지출결의서 작성 → 승인요청 → 승인완료 → 지급대기 → 지급완료 → 지출전표 생성 → 증빙자료 연결";
const evidenceTypeOptions: EvidenceType[] = ["세금계산서", "계산서", "영수증", "현금영수증", "이체확인증", "계약서", "견적서", "의결서", "기타"];
export const transactionEvidenceTypeOptions: EvidenceType[] = ["세금계산서", "계산서", "영수증", "현금영수증", "이체확인증", "기타"];
export const projectNameOptions = [
  "사무국 비품 구입",
  "사무국 운영관리",
  "2026년 정기총회 준비",
  "이사회 운영",
  "동작구청 실태조사 대응",
  "업무대행계약 해지 대응",
  "조합원 현행화 작업",
  "탈퇴·자격상실 환불관리",
  "제3차 사업부지 매입 추진",
  "홈페이지·ERP 구축",
  "세무·회계 정비",
  "기타",
];
export const accountTitleOptions = [
  "임차료",
  "비품비",
  "소모품비",
  "통신비",
  "법무비",
  "세무자문료",
  "감정평가비",
  "업무대행비",
  "토지계약금",
  "토지중도금",
  "총회대관료",
  "인쇄비",
  "우편발송비",
  "현수막제작비",
  "음향장비임차료",
  "홈페이지관리비",
  "ERP개발비",
  "환불금",
  "기타",
];
export const batchEvidenceTypeOptions = ["세금계산서", "계산서", "카드영수증", "현금영수증", "계좌이체확인증", "견적서", "계약서", "의결서", "기타"];
export const legacyOperatingExpenseDetailOptions = [
  "조합장 급여",
  "사무장 급여",
  "사무직원 급여",
  "상여금",
  "보험료",
  "퇴직예치금",
  "감사비",
  "회의비",
  "업무추진비",
  "임대료",
  "도서인쇄비",
  "사무등록비",
  "사무용품비",
  "소모품비",
  "복리후생비",
  "수선비",
  "광고비",
  "수도광열비",
  "통신비",
  "여비교통비",
  "지급수수료",
  "예비비",
  "기타",
];

export type BudgetProfile = Omit<BudgetSnapshot, "budgetCheckStatus" | "budgetUsageRate" | "currentRequestAmount" | "expectedUsedAmount" | "remainingBudgetAmount">;

export const BudgetProfilesContext = createContext<Record<string, BudgetProfile>>({});

const OperatingBudgetPrintModal = dynamic(
  () => import("./operating-budget-print-modal").then((module) => module.OperatingBudgetPrintModal),
  {
    loading: () => <p aria-live="polite" className="sr-only">운영비 예산표 출력 화면을 준비하고 있습니다.</p>,
    ssr: false,
  },
);

const ExpenseResolutionCreateModal = dynamic(
  () => import("./expense-resolution-create-modal").then((module) => module.ExpenseResolutionCreateModal),
  {
    loading: () => <p aria-live="polite" className="sr-only">지출결의 작성 화면을 준비하고 있습니다.</p>,
    ssr: false,
  },
);

const ExpenseResolutionPrintPreviewModal = dynamic(
  () => import("./expense-resolution-print-preview").then((module) => module.ExpenseResolutionPrintPreviewModal),
  {
    loading: () => <p aria-live="polite" className="sr-only">지출결의 출력 화면을 준비하고 있습니다.</p>,
    ssr: false,
  },
);

const ExpenseResolutionDetailModal = dynamic(
  () => import("./expense-resolution-detail-modal").then((module) => module.ExpenseResolutionDetailModal),
  {
    loading: () => <p aria-live="polite" className="sr-only">지출결의 상세 화면을 준비하고 있습니다.</p>,
    ssr: false,
  },
);

const ExpenseFactConfirmationModal = dynamic(
  () => import("./expense-resolution-detail-modal").then((module) => module.ExpenseFactConfirmationModal),
  { ssr: false },
);

type ResolutionTabKey = "all" | "mine" | "approvalInbox" | "rejected" | "paymentWaiting" | "partialPaid" | "paid" | "hold" | "voucherCreated";
export type PaymentMethod = "계좌이체" | "카드결제" | "현금" | "기타";

type PaymentFormState = {
  actualPaidAmount: string;
  accountHolder: string;
  batchPaymentMode: BatchPaymentMode;
  paidAt: string;
  paymentBank: string;
  paymentAccountNo: string;
  paymentMemo: string;
  paymentMethod: PaymentMethod;
};

type RejectionFormState = {
  error: string;
  reason: string;
  resolutionId: string;
};

const statusClasses: Record<string, string> = {
  작성중: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  승인대기: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  승인완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  반려: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  지급전: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  지급대기: "bg-[var(--color-lilac-mist)] text-[var(--color-amethyst)]",
  부분지급: "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]",
  지급완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  보류: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  정상: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  주의: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  예산초과: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  "예산항목 선택 필요": "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  대기: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  결재대기: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  첨부완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  미첨부: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  미생성: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  전표초안: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  전표확정: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  전표취소: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
};

export function buildApprovalLine(): ApprovalStep[] {
  return getOrganizationExpenseApprovalLine();
}

export function getApproverLabel(step?: ApprovalStep) {
  return step ? `${step.approver} ${step.role}` : "";
}

function splitActorLabel(actorLabel: string) {
  if (actorLabel === "시스템") {
    return { actorName: "시스템", actorTitle: "" };
  }

  const parts = actorLabel.trim().split(/\s+/);
  if (parts.length <= 1) {
    return { actorName: actorLabel, actorTitle: "" };
  }

  return {
    actorName: parts.slice(0, -1).join(" "),
    actorTitle: parts.at(-1) ?? "",
  };
}

export function formatHistoryActor(item: ExpenseResolutionHistoryItem) {
  return item.actorTitle ? `${item.actorName} ${item.actorTitle}` : item.actorName;
}

function getBudgetCheckStatus(remainingBudgetAmount: number, budgetUsageRate: number): BudgetCheckStatus {
  if (remainingBudgetAmount < 0 || budgetUsageRate >= 100) {
    return "예산초과";
  }
  if (budgetUsageRate >= 80) {
    return "주의";
  }
  return "정상";
}

function createBudgetSnapshot(
  budgetItem: string,
  requestAmount: number,
  requestedBudgetPeriod: string | undefined,
  budgetProfiles: Record<string, BudgetProfile>,
  currentBudgetId?: string,
  currentBudgetMonth?: string,
  currentApprovalStatus?: ApprovalStatus,
  currentResolutionAmount = 0,
): BudgetSnapshot {
  const selectedProfile = resolveBudgetProfile(budgetItem, requestedBudgetPeriod, budgetProfiles);
  const profile = selectedProfile ?? {
    budgetPeriod: requestedBudgetPeriod ?? getCurrentDateIso().slice(0, 7),
    calculationBasis: "예산항목을 선택해 주세요.",
    currentAnnualBudgetAmount: 0,
    monthlyBudgetAmount: 0,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 0,
    usedAmount: 0,
  };
  const currentRequestAmount = requestAmount;
  const currentIncludedAmount = selectedProfile?.budgetId
    && currentBudgetId === selectedProfile.budgetId
    && currentBudgetMonth === `${requestedBudgetPeriod}-01`
    && (currentApprovalStatus === "작성중" || currentApprovalStatus === "승인대기")
    ? currentResolutionAmount
    : 0;
  const expectedUsedAmount = profile.usedAmount + (profile.reservedAmount ?? profile.paymentWaitingAmount) + profile.pendingApprovalAmount - currentIncludedAmount + currentRequestAmount;
  const remainingBudgetAmount = selectedProfile ? profile.monthlyBudgetAmount - expectedUsedAmount : 0;
  const budgetUsageRate = selectedProfile && profile.monthlyBudgetAmount > 0 ? Number(((expectedUsedAmount / profile.monthlyBudgetAmount) * 100).toFixed(1)) : 0;

  return {
    ...profile,
    budgetCheckStatus: selectedProfile ? getBudgetCheckStatus(remainingBudgetAmount, budgetUsageRate) : "예산항목 선택 필요",
    budgetPeriod: requestedBudgetPeriod ?? profile.budgetPeriod,
    budgetUsageRate,
    currentRequestAmount,
    expectedUsedAmount,
    remainingBudgetAmount,
  };
}

function createBatchExpenseItem(itemNo: number, overrides: Partial<BatchExpenseItem> = {}): BatchExpenseItem {
  const baseItem: BatchExpenseItem = {
    accountTitle: "",
    allocatedBudget: 0,
    budgetItem: "",
    budgetStatus: "NORMAL",
    currentRequestAmount: 0,
    description: "",
    actualSpender: "",
    businessPurpose: "",
    evidenceFileName: "",
    evidenceKind: "NONE",
    evidenceStatus: "NONE",
    evidenceType: "",
    executedAmount: 0,
    expenseDate: getCurrentDateIso(),
    expenseType: "기타",
    id: `batch-item-${itemNo}-${Date.now()}`,
    itemNo,
    itemTitle: "",
    memo: "",
    overBudgetAmount: 0,
    overBudgetReason: "",
    paymentMethod: "계좌이체",
    paymentStatus: "지급전",
    remainingBudget: 0,
    supplyAmount: "0",
    totalAmount: 0,
    vatAmount: "0",
    vendorName: "",
  };

  return calculateBatchExpenseItem({ ...baseItem, ...overrides, itemNo });
}

export function getPaymentTarget(id: string) {
  return paymentTargets.find((target) => target.id === id) ?? paymentTargets.find((target) => target.id === "manual")!;
}

function getResolutionPaymentTargetId(resolution: Pick<ManagedExpenseResolution, "accountHolder" | "paymentAccountNo" | "paymentBank" | "paymentTargetId">) {
  if (resolution.paymentTargetId && paymentTargets.some((target) => target.id === resolution.paymentTargetId)) {
    return resolution.paymentTargetId;
  }

  const matchingTarget = paymentTargets.find((target) => (
    target.id !== "manual"
    && target.accountHolder === resolution.accountHolder
    && target.accountNumber === resolution.paymentAccountNo
    && target.bankName === resolution.paymentBank
  ));
  return matchingTarget?.id ?? "manual";
}

function applyPaymentTarget(formState: ResolutionFormState, paymentTargetId: string): ResolutionFormState {
  const target = getPaymentTarget(paymentTargetId);

  return {
    ...formState,
    accountHolder: target.accountHolder,
    paymentAccountNo: target.accountNumber,
    paymentBank: target.bankName,
    paymentTargetId: target.id,
  };
}

export function maskAccountNumber(accountNumber?: string | null) {
  const digits = (accountNumber ?? "").replace(/\D/g, "");
  const suffix = digits.slice(-4);
  return suffix ? `****${suffix}` : "계좌 미등록";
}

export function getExpenseBurdenLabel(value: ExpenseBurdenType) {
  return {
    CORPORATE_CARD: "법인카드 결제",
    EMPLOYEE_PREPAID: "임직원 개인 선결제",
    ORGANIZATION_PAID: "조합계좌에서 이미 지급",
    VENDOR_UNPAID: "거래처 미지급 청구",
    CASH: "현금 사용",
  }[value];
}

export function getPaymentTargetSummary(target: PaymentTarget, formState: Pick<ResolutionFormState, "accountHolder" | "paymentAccountNo" | "paymentBank">) {
  if (target.id === "manual") {
    return `${formState.paymentBank || "은행 미입력"} ${maskAccountNumber(formState.paymentAccountNo)} · 예금주 ${formState.accountHolder || "미입력"}`;
  }

  return `${target.bankName} ${maskAccountNumber(target.accountNumber)} · 예금주 ${target.accountHolder}`;
}

function calculateSingleExpenseItem(item: SingleExpenseItem, recalculateVat = false): SingleExpenseItem {
  const supplyAmount = Math.max(0, toNumber(item.quantity) * toNumber(item.unitPrice));
  const vatAmount = item.taxCategory === "NO_VAT"
    ? 0
    : recalculateVat
      ? Math.round(supplyAmount * 0.1)
      : Math.max(0, item.vatAmount);
  return { ...item, supplyAmount, vatAmount, totalAmount: supplyAmount + vatAmount };
}

export function createSingleExpenseItem(overrides: Partial<SingleExpenseItem> = {}): SingleExpenseItem {
  return calculateSingleExpenseItem({
    id: `single-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    itemName: "",
    memo: "",
    quantity: "1",
    supplyAmount: 0,
    taxCategory: "TAXABLE",
    totalAmount: 0,
    unitPrice: "0",
    vatAmount: 0,
    ...overrides,
  });
}

function summarizeSingleExpenseItems(items: SingleExpenseItem[]) {
  const calculatedItems = items.map((item) => calculateSingleExpenseItem(item));
  const supplyAmount = calculatedItems.reduce((sum, item) => sum + item.supplyAmount, 0);
  const vatAmount = calculatedItems.reduce((sum, item) => sum + item.vatAmount, 0);
  return { items: calculatedItems, supplyAmount, totalAmount: supplyAmount + vatAmount, vatAmount };
}

export function createAccountAllocation(overrides: Partial<AccountAllocation> = {}): AccountAllocation {
  return {
    accountTitle: "운영비",
    amount: "0",
    budgetItem: "",
    description: "",
    id: `allocation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...overrides,
  };
}

export function getPaymentTargetHeaderSummary(target: PaymentTarget, formState: Pick<ResolutionFormState, "paymentAccountNo" | "paymentBank">) {
  if (target.id === "manual") {
    return `직접 입력 · ${formState.paymentBank || "은행 미입력"} ${maskAccountNumber(formState.paymentAccountNo)}`;
  }

  return `${target.label} · ${target.bankName} ${maskAccountNumber(target.accountNumber)}`;
}

export function getExpenseInfoSummary(formState: ResolutionFormState) {
  const [year, month] = (formState.budgetPeriod || formState.createdAt.slice(0, 7)).split("-");
  return `${formState.expenseType} > ${formState.operationExpenseDetail} · ${year}년 ${month}월 예산`;
}

export function getResolutionSubject(resolution: ManagedExpenseResolution) {
  return resolution.subject?.trim() || (resolution.resolutionType === "BATCH" ? resolution.projectName : resolution.operationExpenseDetail) || "건명 미입력";
}

export function getExpensePrintPersonName(value: string) {
  return value
    .trim()
    .replace(/\s+(?:담당자|사무장|사무국장|팀장|실장|부장|차장|과장|대리|주임|본부장|이사|상무|전무|대표|조합장)$/u, "")
    .trim();
}

export function buildExpenseResolutionPdfFileName(resolutionNo: string, subject: string) {
  return buildDocumentPdfFileName(resolutionNo, subject, "지출결의서");
}

function getSingleExpenseTaxCategory(item: { supplyAmount: number | string; taxCategory?: SingleExpenseTaxCategory; vatAmount: number | string }): SingleExpenseTaxCategory {
  return item.taxCategory ?? (toNumber(String(item.supplyAmount)) > 0 && toNumber(String(item.vatAmount)) === 0 ? "NO_VAT" : "TAXABLE");
}

function createBatchExpenseItemFromEvidence(evidence: ExpenseEvidenceAttachment, itemNo: number, reason: string) {
  const ocr = normalizeEvidenceVendorFields(evidence.ocrData);
  const itemNames = ocr.items?.map((item) => item.itemName).filter(Boolean) ?? (ocr.itemName ? [ocr.itemName] : []);
  const evidenceKind = mapEvidenceTypeToComplianceKind(ocr.normalizedEvidenceType ?? evidence.evidenceType);
  const recommendation = recommendExpenseBudget({
    itemName: itemNames.join(" "),
    reason,
    vendorBusinessCategory: ocr.issuerBusinessCategory,
    vendorBusinessType: ocr.issuerBusinessType,
    vendorName: ocr.issuer,
  });
  const vatAmount = ocr.vatAmount ?? 0;
  const supplyAmount = ocr.supplyAmount ?? Math.max((ocr.totalAmount ?? 0) - vatAmount, 0);
  const itemTitle = itemNames.length ? `${itemNames[0]}${itemNames.length > 1 ? ` 외 ${itemNames.length - 1}종` : ""}` : evidence.fileName;
  const expenseType = expenseResolutionTypeOptions.includes(recommendation?.accountTitle as ExpenseResolutionType)
    ? recommendation?.accountTitle as ExpenseResolutionType
    : "운영비";
  return createBatchExpenseItem(itemNo, {
    accountTitle: recommendation?.accountTitle ?? "운영비",
    budgetItem: recommendation?.budgetItem ?? "",
    description: itemNames.join("\n") || `${ocr.issuer ?? "거래처 미확인"} 증빙 지출`,
    evidenceFileName: evidence.fileName,
    evidenceId: evidence.id,
    evidenceKind,
    evidenceStatus: getDefaultEvidenceStatus(evidenceKind),
    evidenceType: ocr.normalizedEvidenceType ?? evidence.evidenceType,
    expenseDate: ocr.documentDate ?? getCurrentDateIso(),
    expenseType,
    itemTitle,
    supplyAmount: String(supplyAmount),
    vatAmount: String(vatAmount),
    vendorAddress: ocr.issuerAddress,
    vendorBusinessCategory: ocr.issuerBusinessCategory,
    vendorBusinessNumber: ocr.issuerBusinessNumber,
    vendorBusinessType: ocr.issuerBusinessType,
    vendorContact: ocr.issuerContact,
    vendorName: ocr.issuer ?? "",
    vendorRepresentative: ocr.issuerRepresentative,
  });
}

function buildSingleExpenseItemsFromOcr(ocr: EvidenceOcrData, fallback: SingleExpenseItem[]) {
  const sourceItems = ocr.items?.filter((item) => item.itemName.trim()) ?? [];
  if (!sourceItems.length) {
    const supplyAmount = ocr.supplyAmount ?? (ocr.totalAmount !== undefined ? Math.max(ocr.totalAmount - (ocr.vatAmount ?? 0), 0) : undefined);
    if (supplyAmount === undefined) return fallback;
    return [calculateSingleExpenseItem({
      ...(fallback[0] ?? createSingleExpenseItem()),
      itemName: ocr.itemName ?? fallback[0]?.itemName ?? "",
      quantity: String(ocr.quantity ?? 1),
      taxCategory: ocr.vatTreatment === "VAT_NON_DEDUCTIBLE" ? "NON_DEDUCTIBLE" : ocr.vatTreatment === "NO_VAT" || !ocr.vatAmount ? "NO_VAT" : "TAXABLE",
      unitPrice: String(supplyAmount / Math.max(ocr.quantity ?? 1, 1)),
      vatAmount: ocr.vatAmount ?? 0,
    })];
  }

  const grossAmounts = sourceItems.map((item) => item.totalAmount ?? ((item.unitPrice ?? 0) * Math.max(item.quantity ?? 1, 1)));
  const grossSum = grossAmounts.reduce((sum, amount) => sum + amount, 0);
  const receiptSupply = ocr.supplyAmount ?? Math.max((ocr.totalAmount ?? grossSum) - (ocr.vatAmount ?? 0), 0);
  const receiptVat = ocr.vatAmount ?? Math.max((ocr.totalAmount ?? grossSum) - receiptSupply, 0);
  let allocatedSupply = 0;
  let allocatedVat = 0;

  return sourceItems.map((item, index) => {
    const quantity = Math.max(item.quantity ?? 1, 1);
    const isLast = index === sourceItems.length - 1;
    const ratio = grossSum > 0 ? grossAmounts[index] / grossSum : 1 / sourceItems.length;
    const supplyAmount = item.supplyAmount ?? (isLast ? receiptSupply - allocatedSupply : Math.round(receiptSupply * ratio));
    const vatAmount = item.vatAmount ?? (isLast ? receiptVat - allocatedVat : Math.round(receiptVat * ratio));
    allocatedSupply += supplyAmount;
    allocatedVat += vatAmount;
    return calculateSingleExpenseItem({
      ...createSingleExpenseItem(),
      itemName: item.itemName,
      quantity: String(quantity),
      taxCategory: ocr.vatTreatment === "VAT_NON_DEDUCTIBLE" ? "NON_DEDUCTIBLE" : receiptVat === 0 ? "NO_VAT" : "TAXABLE",
      unitPrice: String(supplyAmount / quantity),
      vatAmount,
    });
  });
}

function getSingleExpenseTaxCategoryLabel(item: { supplyAmount: number | string; taxCategory?: SingleExpenseTaxCategory; vatAmount: number | string }) {
  const category = getSingleExpenseTaxCategory(item);
  return category === "NO_VAT" ? "부가세 없음" : category === "NON_DEDUCTIBLE" ? "부가세 불공제" : "부가세 공제";
}

export function getResolutionTaxCategorySummary(resolution: ManagedExpenseResolution) {
  if (resolution.resolutionType === "BATCH" || !resolution.singleItems?.length) {
    return resolution.supplyAmount > 0 && resolution.vat === 0 ? "부가세 없음" : "부가세 공제";
  }

  const labels = new Set(resolution.singleItems.map(getSingleExpenseTaxCategoryLabel));
  return labels.size === 1 ? Array.from(labels)[0] : "부가세 처리 혼합";
}

export function formatApprovalDateTime(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^\d{4}-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  return match ? `${match[1]}.${match[2]} ${match[3] ?? "00"}:${match[4] ?? "00"}` : value;
}

export function getExpensePrintEvidenceText(resolution: ManagedExpenseResolution) {
  const writtenReason = resolution.missingEvidenceReason?.trim();
  if (writtenReason) return writtenReason;

  const evidenceFiles = resolution.evidenceFiles ?? [];
  if (evidenceFiles.length > 0) {
    const evidenceTypes = Array.from(new Set(
      evidenceFiles
        .map((file) => file.ocrData.normalizedEvidenceType || file.evidenceType)
        .filter(Boolean),
    ));
    return `${evidenceTypes.join(", ") || "증빙자료"} ${evidenceFiles.length}건 첨부`;
  }

  const bankTransactionCount = resolution.bankTransactions?.length || (resolution.bankTransactionId ? 1 : 0);
  if (resolution.expenseBurdenType === "CORPORATE_CARD") {
    if (bankTransactionCount > 0 && (resolution.cardVerificationSource === "BANK_TRANSACTION" || resolution.cardSettlementMode === "BANK_DIRECT")) {
      return `법인 체크카드 사용 · 조합 통장 건별출금 내역 ${bankTransactionCount}건으로 결제 확인`;
    }
    if (resolution.cardTransactionId) return "공용 법인카드 승인내역으로 대체 · 카드 승인내역 연결";
    return "법인카드 사용내역 미연결 · 증빙 확인 필요";
  }
  if (bankTransactionCount > 0) return `조합 통장 거래내역 ${bankTransactionCount}건 연결 · 원본 거래로 결제 확인`;
  return "증빙 미첨부 · 사유 미입력";
}

export function getExpensePrintItemDescription(item: BatchExpenseItem) {
  let detail = item.description.trim();
  for (const prefix of [item.expenseDate, item.vendorName, item.itemTitle]) {
    if (prefix && detail.startsWith(prefix)) detail = detail.slice(prefix.length).trim().replace(/^[·\-–—\s]+/, "");
  }
  const primaryDescription = Array.from(new Set([item.itemTitle, detail].map((value) => value.trim()).filter(Boolean)));
  if (primaryDescription.length > 0) return primaryDescription.join("\n");
  return item.businessPurpose.trim() || item.memo.trim() || "-";
}

function calculateBatchExpenseItem(item: BatchExpenseItem): BatchExpenseItem {
  const supplyAmount = toNumber(item.supplyAmount);
  const vatAmount = toNumber(item.vatAmount);
  const totalAmount = supplyAmount + vatAmount;
  const profile = { allocatedBudget: item.allocatedBudget, executedAmount: item.executedAmount };
  const currentRequestAmount = totalAmount;
  const remainingBudget = profile.allocatedBudget - profile.executedAmount - currentRequestAmount;
  const budgetStatus: BatchBudgetStatus = remainingBudget < 0 ? "OVER_BUDGET" : "NORMAL";

  return {
    ...item,
    allocatedBudget: profile.allocatedBudget,
    budgetStatus,
    currentRequestAmount,
    executedAmount: profile.executedAmount,
    overBudgetAmount: budgetStatus === "OVER_BUDGET" ? Math.abs(remainingBudget) : 0,
    remainingBudget,
    totalAmount,
  };
}

function reindexBatchItems(items: BatchExpenseItem[]) {
  return items.map((item, index) => calculateBatchExpenseItem({ ...item, itemNo: index + 1 }));
}

export function summarizeBatchItems(items: BatchExpenseItem[]) {
  const calculatedItems = reindexBatchItems(items);
  const accountTitles = new Set(calculatedItems.map((item) => item.accountTitle).filter(Boolean));
  const expenseTypes = new Set(calculatedItems.map((item) => item.expenseType).filter(Boolean));
  const vendorNames = new Set(calculatedItems.map((item) => item.vendorName).filter(Boolean));
  const overBudgetItems = calculatedItems.filter((item) => item.budgetStatus === "OVER_BUDGET");
  const totalSupplyAmount = calculatedItems.reduce((sum, item) => sum + toNumber(item.supplyAmount), 0);
  const totalVatAmount = calculatedItems.reduce((sum, item) => sum + toNumber(item.vatAmount), 0);

  return {
    items: calculatedItems,
    itemCount: calculatedItems.length,
    overBudgetItemCount: overBudgetItems.length,
    representativeAccountTitle: accountTitles.size === 0 ? "-" : accountTitles.size === 1 ? [...accountTitles][0] : "복합계정",
    representativeExpenseType: expenseTypes.size === 0 ? "기타" : expenseTypes.size === 1 ? ([...expenseTypes][0] as ExpenseResolutionType) : "기타",
    representativeExpenseTypeLabel: expenseTypes.size === 0 ? "-" : expenseTypes.size === 1 ? [...expenseTypes][0] : "복합지출",
    representativeVendorName:
      calculatedItems.some((item) => !item.vendorName.trim()) ? "거래처 미입력" : vendorNames.size === 1 ? [...vendorNames][0] : vendorNames.size > 1 ? "다수 거래처" : "거래처 미입력",
    totalAmount: totalSupplyAmount + totalVatAmount,
    totalOverBudgetAmount: overBudgetItems.reduce((sum, item) => sum + item.overBudgetAmount, 0),
    totalSupplyAmount,
    totalVatAmount,
  };
}

function getResolutionTypeLabel(type: ResolutionDocumentType) {
  return type === "BATCH" ? "일괄" : "단일";
}

export function getResolutionTypeFullLabel(type: ResolutionDocumentType) {
  return type === "BATCH" ? "프로젝트 일괄 지출결의" : "단일 지출결의";
}

export function getExpenseTimingLabel(timing: ExpenseTiming) {
  return timing === "ADVANCE" ? "사전 집행결의" : timing === "REIMBURSEMENT" ? "사후 지출결의" : "선지급금 정산";
}

export function getExpenseDateLabel(timing: ExpenseTiming) {
  return timing === "ADVANCE" ? "집행예정일" : timing === "REIMBURSEMENT" ? "실제 지출일" : "정산일";
}

export function getBudgetOverLabel(count: number) {
  return count > 0 ? `예산초과 ${count}건` : "정상";
}

function toPaymentFlowType(value?: ExpenseResolution["paymentFlowType"]): PaymentFlowType {
  const labels: Record<NonNullable<ExpenseResolution["paymentFlowType"]>, PaymentFlowType> = {
    ADVANCE_PAYMENT: "선지급",
    POST_SETTLEMENT: "사후정산",
    PRE_APPROVAL: "사전결의",
  };

  return value ? labels[value] : "사전결의";
}

function toSettlementStatus(value?: ExpenseResolution["settlementStatus"]): SettlementStatus {
  const labels: Record<NonNullable<ExpenseResolution["settlementStatus"]>, SettlementStatus> = {
    ADDITIONAL_PAYMENT: "추가지급",
    HOLD: "보류",
    NOT_REQUIRED: "정산없음",
    REFUND_REQUIRED: "환급필요",
    SETTLED: "정산완료",
    SETTLEMENT_PENDING: "정산대기",
  };

  return value ? labels[value] : "정산없음";
}

function toBudgetCheckStatus(value?: ExpenseResolution["budgetCheckStatus"]): BudgetCheckStatus {
  const labels: Record<NonNullable<ExpenseResolution["budgetCheckStatus"]>, BudgetCheckStatus> = {
    EXCEEDED: "예산초과",
    NORMAL: "정상",
    WARNING: "주의",
  };

  return value ? labels[value] : "정상";
}

function toPrintRecords(records?: NonNullable<ExpenseResolution["printRecords"]>): PrintRecordItem[] {
  return (records ?? []).map((record) => ({
    copyKind: record.copyKind,
    id: record.id,
    memo: record.memo,
    printedAt: record.printedAt,
    printedBy: record.printedBy,
    printNo: record.printNo,
    printPurpose: record.printPurpose,
    storageLocation: record.storageLocation,
  }));
}

export function createHistoryItem({
  actionAt,
  actionLabel,
  actionType,
  actorLabel,
  comment,
}: {
  actionAt: string;
  actionLabel: string;
  actionType: ExpenseResolutionHistoryActionType;
  actorLabel: string;
  comment?: string;
}): ExpenseResolutionHistoryItem {
  const actor = splitActorLabel(actorLabel);
  const key = [actionType, actionAt, actor.actorName, actor.actorTitle, comment ?? actionLabel].join("-");

  return {
    ...actor,
    actionAt,
    actionLabel,
    actionType,
    comment,
    id: key.replace(/[^\dA-Za-z가-힣-]/g, ""),
  };
}

function getSeedActorLabel(resolution: Pick<ManagedExpenseResolution, "id" | "author">) {
  return resolution.id.startsWith("expense-resolution-") ? "오학동 사무국장" : resolution.author;
}

function getApprovalActionAt(order: number) {
  if (order === 1) {
    return "2026-07-02 11:10";
  }
  if (order === 2) {
    return "2026-07-02 14:20";
  }

  return "2026-07-03 09:30";
}

export function buildExpenseResolutionHistory(
  resolution: Pick<
    ManagedExpenseResolution,
    | "approvalLine"
    | "approvalStatus"
    | "author"
    | "evidenceAttached"
    | "evidenceMaterials"
    | "holdReason"
    | "id"
    | "paidAt"
    | "paymentMemo"
    | "paymentStatus"
    | "printRecords"
    | "rejectionReason"
    | "voucherNo"
  >,
) {
  const actorLabel = getSeedActorLabel(resolution);
  const approvalStatus = resolution.approvalStatus;
  const paymentStatus = resolution.paymentStatus;
  const approvalLine = resolution.approvalLine;
  const history: ExpenseResolutionHistoryItem[] = [
    createHistoryItem({
      actionAt: "2026-07-02 10:30",
      actionLabel: "지출결의서 작성",
      actionType: "CREATED",
      actorLabel,
    }),
  ];

  if (approvalStatus !== "작성중") {
    history.push(
      createHistoryItem({
        actionAt: "2026-07-02 10:35",
        actionLabel: "승인요청",
        actionType: "REQUESTED_APPROVAL",
        actorLabel,
      }),
    );
  }

  const approvedSteps = approvalLine.filter((step) => step.status === "승인완료");
  const approvalSteps = approvedSteps.length > 0 || approvalStatus !== "승인완료" ? approvedSteps : buildApprovalLine();
  approvalSteps.forEach((step) => {
    const approverLabel = getApproverLabel(step);
    history.push(
      createHistoryItem({
        actionAt: step.processedAt ? `${step.processedAt} 11:10` : getApprovalActionAt(step.order),
        actionLabel: "결재승인",
        actionType: "APPROVED",
        actorLabel: approverLabel,
        comment: `${approverLabel} 승인`,
      }),
    );
  });

  if (approvalStatus === "반려" && resolution.rejectionReason) {
    const rejectedStep = approvalLine.find((step) => step.status === "반려");
    history.push(
      createHistoryItem({
        actionAt: "2026-07-02 16:20",
        actionLabel: "반려",
        actionType: "REJECTED",
        actorLabel: rejectedStep ? getApproverLabel(rejectedStep) : actorLabel,
        comment: resolution.rejectionReason,
      }),
    );
  }

  if (approvalStatus === "승인완료") {
    history.push(
      createHistoryItem({
        actionAt: "2026-07-03 09:31",
        actionLabel: "지급대기 전환",
        actionType: "PAYMENT_PENDING",
        actorLabel: "시스템",
      }),
    );
  }

  if (resolution.evidenceAttached) {
    history.push(
      createHistoryItem({
        actionAt: "2026-07-02 10:40",
        actionLabel: "증빙자료 첨부",
        actionType: "EVIDENCE_ATTACHED",
        actorLabel,
        comment: resolution.evidenceMaterials.join(", "),
      }),
    );
  }

  if (paymentStatus === "보류" && resolution.holdReason) {
    history.push(
      createHistoryItem({
        actionAt: "2026-07-02 16:30",
        actionLabel: "지급보류",
        actionType: "PAYMENT_HOLD",
        actorLabel: "사무국 관리자",
        comment: resolution.holdReason,
      }),
    );
  }

  if (paymentStatus === "지급완료") {
    history.push(
      createHistoryItem({
        actionAt: `${resolution.paidAt ?? "2026-07-03"} 15:00`,
        actionLabel: "지급완료",
        actionType: "PAYMENT_COMPLETED",
        actorLabel: "시스템",
        comment: resolution.paymentMemo,
      }),
    );
  }

  if (resolution.voucherNo) {
    history.push(
      createHistoryItem({
        actionAt: "2026-07-03 16:50",
        actionLabel: "지출전표 생성",
        actionType: "VOUCHER_CREATED",
        actorLabel: "시스템",
        comment: `전표번호 ${resolution.voucherNo} 생성`,
      }),
    );
  }

  for (const record of resolution.printRecords) {
    history.push(
      createHistoryItem({
        actionAt: record.printedAt,
        actionLabel: record.printPurpose === "미리보기" ? "출력 미리보기" : "보관용 PDF 생성",
        actionType: record.printPurpose === "미리보기" ? "PRINTED" : "ARCHIVED",
        actorLabel: record.printedBy,
        comment: `${record.printNo} · ${record.storageLocation ?? "보관위치 미등록"}`,
      }),
    );
  }

  return history;
}

export function appendExpenseResolutionHistory(resolution: ManagedExpenseResolution, item: ExpenseResolutionHistoryItem) {
  return {
    ...resolution,
    history: [...resolution.history, item],
  };
}

function getInitialCurrentApprover(resolution: ExpenseResolution) {
  if (resolution.currentApprover) {
    return `${resolution.currentApprover} ${resolution.currentApproverTitle ?? ""}`.trim();
  }

  return resolution.approvalStatus === "PENDING" ? getApproverLabel(buildApprovalLine()[0]) : undefined;
}

export function toApprovalStatus(status: ExpenseResolution["approvalStatus"]): ApprovalStatus {
  const labels: Record<ExpenseResolution["approvalStatus"], ApprovalStatus> = {
    APPROVED: "승인완료",
    DRAFT: "작성중",
    PENDING: "승인대기",
    REJECTED: "반려",
  };

  return labels[status];
}

export function toPaymentStatus(status: ExpenseResolution["paymentStatus"]): PaymentStatus {
  const labels: Record<ExpenseResolution["paymentStatus"], PaymentStatus> = {
    BEFORE_PAYMENT: "지급전",
    HOLD: "보류",
    PARTIAL_PAID: "부분지급",
    PAID: "지급완료",
    PAYMENT_PENDING: "지급대기",
  };

  return labels[status];
}

function toApprovalLineStatus(status: ExpenseResolution["approvalLines"][number]["status"]): ApprovalStepStatus {
  const labels: Record<ExpenseResolution["approvalLines"][number]["status"], ApprovalStepStatus> = {
    APPROVED: "승인완료",
    CURRENT: "결재대기",
    REJECTED: "반려",
    WAITING: "대기",
  };

  return labels[status];
}

function toHistoryItem(history: ResolutionHistory): ExpenseResolutionHistoryItem {
  return {
    actionAt: history.actionAt,
    actionLabel: history.actionLabel,
    actionType: history.actionType,
    actorName: history.actorName,
    actorTitle: history.actorTitle ?? "",
    comment: history.comment,
    id: history.id,
  };
}

function toPaymentMethodLabel(method: NonNullable<ExpenseResolution["paymentMethod"]>): PaymentMethod {
  const labels: Record<NonNullable<ExpenseResolution["paymentMethod"]>, PaymentMethod> = {
    BANK_TRANSFER: "계좌이체",
    CARD: "카드결제",
    CASH: "현금",
    OTHER: "기타",
  };

  return labels[method];
}

export function toManagedExpenseResolution(resolution: ExpenseResolution, budgetProfiles: Record<string, BudgetProfile> = {}): ManagedExpenseResolution {
  const expenseItems = reindexBatchItems(
    (resolution.expenseItems ?? []).map((item) =>
      createBatchExpenseItem(item.itemNo, {
        accountTitle: item.accountTitle,
        budgetItem: item.budgetItem,
        description: item.description ?? "",
        evidenceFileName: item.evidenceFileName ?? "",
        evidenceType: item.evidenceType ?? "기타",
        expenseDate: item.expenseDate ?? resolution.plannedPaymentDate,
        expenseType: item.expenseType as ExpenseResolutionType,
        id: item.id,
        itemTitle: item.itemTitle,
        memo: item.memo ?? "",
        overBudgetReason: item.overBudgetReason ?? "",
        actualPaidAmount: item.actualPaidAmount,
        paidAt: item.paidAt,
        paymentMethod: item.paymentMethod ? toPaymentMethodLabel(item.paymentMethod) : "계좌이체",
        paymentStatus: toPaymentStatus(item.paymentStatus),
        supplyAmount: String(item.supplyAmount),
        vatAmount: String(item.vatAmount),
        vendorName: item.vendorName,
        voucherNo: item.voucherNo,
      }),
    ),
  );
  const batchSummary = summarizeBatchItems(expenseItems);
  const resolutionType = resolution.resolutionType ?? "SINGLE";
  const initialVoucherNo = resolution.voucherNo ?? (resolution.paymentStatus === "PAID" ? "지출-2026-0001" : undefined);
  const liveBudgetProfile = resolveBudgetProfile(resolution.budgetItem, resolution.budgetPeriod, budgetProfiles);
  const liveBudgetSnapshot = createBudgetSnapshot(resolution.budgetItem, resolution.totalAmount, resolution.budgetPeriod, budgetProfiles);
  const shouldRefreshEmptyBudgetSnapshot = Boolean(
    liveBudgetProfile
    && (resolution.monthlyBudgetAmount ?? 0) <= 0
    && liveBudgetProfile.monthlyBudgetAmount > 0,
  );
  const managedResolution: ManagedExpenseResolution = {
    id: resolution.id,
    resolutionNo: resolution.resolutionNo,
    subject: resolution.subject ?? "",
    resolutionType,
    projectName: resolution.projectName ?? "",
    createdAt: resolution.createdAt,
    author: `${resolution.createdBy} ${resolution.createdByTitle}`.trim(),
    plannedPaymentDate: resolution.plannedPaymentDate,
    expenseType: resolutionType === "BATCH" ? batchSummary.representativeExpenseType : (resolution.expenseType as ExpenseResolutionType),
    budgetItem: resolution.budgetItem,
    budgetOverReason: resolution.budgetOverReason ?? "",
    batchPaymentMode: resolution.batchPaymentMode ?? "GROUP",
    vendorName: resolutionType === "BATCH" ? batchSummary.representativeVendorName : resolution.vendorName,
    representativeVendorName: resolution.representativeVendorName ?? (resolutionType === "BATCH" ? batchSummary.representativeVendorName : resolution.vendorName),
    representativeAccountTitle: resolution.representativeAccountTitle ?? (resolutionType === "BATCH" ? batchSummary.representativeAccountTitle : resolution.expenseType),
    itemCount: resolution.itemCount ?? (resolutionType === "BATCH" ? batchSummary.itemCount : 1),
    overBudgetItemCount: resolution.overBudgetItemCount ?? batchSummary.overBudgetItemCount,
    totalOverBudgetAmount: resolution.totalOverBudgetAmount ?? batchSummary.totalOverBudgetAmount,
    expenseItems,
    voucherCreationMode: resolution.voucherCreationMode ?? (batchSummary.representativeAccountTitle === "복합계정" || batchSummary.representativeVendorName === "다수 거래처" ? "ITEM_VOUCHER" : "GROUP_VOUCHER"),
    paymentBank: resolution.bankName,
    paymentAccountNo: resolution.accountNumber,
    accountHolder: resolution.accountHolder,
    supplyAmount: resolutionType === "BATCH" ? batchSummary.totalSupplyAmount : resolution.supplyAmount,
    vat: resolutionType === "BATCH" ? batchSummary.totalVatAmount : resolution.vatAmount,
    totalPaymentAmount: resolutionType === "BATCH" ? batchSummary.totalAmount : resolution.totalAmount,
    reason: resolution.reason,
    relatedContract: resolution.relatedContract ?? "",
    relatedMeeting: resolution.relatedMeeting ?? "",
    evidenceMaterials: resolution.evidenceFiles.map((file) => file.evidenceTypeLabel),
    evidenceAttached: resolution.evidenceFiles.length > 0,
    approvalLine: resolution.approvalLines.map((line) => ({
      approver: line.approverName,
      order: line.order,
      processedAt: line.approvedAt,
      role: line.approverTitle,
      status: toApprovalLineStatus(line.status),
    })),
    approvalStatus: toApprovalStatus(resolution.approvalStatus),
    currentApprover: getInitialCurrentApprover(resolution),
    paymentStatus: toPaymentStatus(resolution.paymentStatus),
    paidAt: resolution.paidAt,
    paymentMethod: resolution.paymentMethod ? toPaymentMethodLabel(resolution.paymentMethod) : undefined,
    actualPaidAmount: resolution.actualPaidAmount,
    paymentFlowType: toPaymentFlowType(resolution.paymentFlowType),
    settlementStatus: toSettlementStatus(resolution.settlementStatus),
    operationExpenseDetail: resolution.operationExpenseDetail ?? "",
    advancePaidAt: resolution.advancePaidAt,
    advancePayer: resolution.advancePayer,
    advancePaymentMethod: resolution.advancePaymentMethod ? toPaymentMethodLabel(resolution.advancePaymentMethod) : undefined,
    advancePaidAmount: resolution.advancePaidAmount,
    actualUsedAmount: resolution.actualUsedAmount,
    settlementDifference: resolution.settlementDifference,
    settlementDifferenceAction:
      resolution.settlementDifferenceAction === "ADDITIONAL_PAYMENT" ? "추가지급" : resolution.settlementDifferenceAction === "REFUND_REQUIRED" ? "환급필요" : "차액없음",
    advanceReason: resolution.advanceReason,
    postApprovalReason: resolution.postApprovalReason,
    budgetSnapshot:
      resolution.monthlyBudgetAmount !== undefined && !shouldRefreshEmptyBudgetSnapshot
        ? {
            budgetCheckStatus: toBudgetCheckStatus(resolution.budgetCheckStatus),
            calculationBasis: resolution.calculationBasis ?? liveBudgetProfile?.calculationBasis ?? "-",
            budgetPeriod: resolution.budgetPeriod ?? "2026-07",
            budgetUsageRate: resolution.budgetUsageRate ?? 0,
            currentRequestAmount: resolution.currentRequestAmount ?? resolution.totalAmount,
            currentAnnualBudgetAmount:
              resolution.currentAnnualBudgetAmount ?? liveBudgetProfile?.currentAnnualBudgetAmount ?? resolution.monthlyBudgetAmount * 12,
            expectedUsedAmount: resolution.expectedUsedAmount ?? resolution.totalAmount,
            monthlyBudgetAmount: resolution.monthlyBudgetAmount,
            paymentWaitingAmount: resolution.paymentWaitingAmount ?? 0,
            pendingApprovalAmount: resolution.pendingApprovalAmount ?? 0,
            previousAnnualBudgetAmount:
              resolution.previousAnnualBudgetAmount ?? liveBudgetProfile?.previousAnnualBudgetAmount ?? resolution.monthlyBudgetAmount * 12,
            remainingBudgetAmount: resolution.remainingBudgetAmount ?? 0,
            usedAmount: resolution.usedAmount ?? 0,
          }
        : liveBudgetSnapshot,
    printRecords: toPrintRecords(resolution.printRecords),
    rejectionReason: resolution.rejectionReason,
    history: resolution.history.map(toHistoryItem),
    memo: resolution.memo ?? "",
    voucherNo: initialVoucherNo,
    voucherGenerated: Boolean(initialVoucherNo),
    voucherStatus: initialVoucherNo ? "전표초안" : undefined,
  };

  return {
    ...managedResolution,
    history: managedResolution.history.length > 0 ? managedResolution.history : buildExpenseResolutionHistory(managedResolution),
  };
}

function createEditFormState(resolution: ManagedExpenseResolution): ResolutionFormState {
  return {
    creationSource: resolution.creationSource ?? (resolution.approvalDocumentId ? "APPROVAL_LINKED" : "DIRECT"),
    approvalDocumentId: resolution.approvalDocumentId ?? "",
    approvalDocumentNo: resolution.approvalDocumentNo ?? "",
    approvalSkipReason: resolution.approvalSkipReason ?? "",
    approvalSkipReasonDetail: resolution.approvalSkipReason && !["승인 예산 내 일상 지출", "정기·반복 지출", "기존 계약에 따른 지급", "소액경비 일괄결의"].includes(resolution.approvalSkipReason) ? resolution.approvalSkipReason : "",
    approvalRoute: resolution.approvalRoute ?? inferExpenseApprovalRoute(resolution.approvalLine),
    approvalRecordKind: resolution.approvalPolicy?.kind ?? "CURRENT",
    originalApprovalDate: resolution.approvalPolicy?.kind === "HISTORICAL" ? resolution.approvalPolicy.referenceDate : "",
    originalApprovalReference: resolution.approvalPolicy?.originalReference ?? "",
    expenseKind: resolution.expenseKind ?? "GENERAL",
    accountingDate: resolution.accountingDate ?? resolution.actualExpenseDate ?? resolution.createdAt,
    actualExpenseDate: resolution.actualExpenseDate ?? "",
    evidenceKind: resolution.evidenceKind ?? "NONE",
    evidenceStatus: resolution.evidenceStatus ?? "NONE",
    missingEvidenceReason: resolution.missingEvidenceReason ?? "",
    bankTransactionId: resolution.bankTransactionId ?? "",
    bankTransactions: resolution.bankTransactions?.map((transaction) => ({ ...transaction })) ?? [],
    cardTransactionId: resolution.cardTransactionId ?? "",
    cardLastFour: resolution.cardLastFour ?? "",
    cardReconciliationStatus: resolution.cardReconciliationStatus ?? (resolution.cardTransactionId ? "MATCHED" : "PENDING"),
    cardSettlementMode: resolution.cardSettlementMode ?? (resolution.cardTransactionId ? "CARD_BILLING" : "BANK_DIRECT"),
    cardVerificationSource: resolution.cardVerificationSource ?? (resolution.cardTransactionId ? "CARD_TRANSACTION" : undefined),
    settlementRecipient: resolution.settlementRecipient ?? resolution.accountHolder ?? "",
    settlementCompletedAt: resolution.settlementCompletedAt ?? "",
    accountHolder: resolution.accountHolder ?? "",
    author: resolution.author,
    advancePaidAmount: String(resolution.advancePaidAmount ?? ""),
    advancePaidAt: resolution.advancePaidAt ?? "",
    advancePayer: resolution.advancePayer ?? "",
    advancePaymentMethod: (resolution.advancePaymentMethod as PaymentMethod | undefined) ?? "계좌이체",
    actualUsedAmount: String(resolution.actualUsedAmount ?? ""),
    budgetItem: resolution.resolutionType === "BATCH" ? "운영비 > 임대료" : resolution.budgetItem,
    budgetRecommendation: null,
    budgetOverReason: resolution.budgetOverReason ?? "",
    budgetPeriod: resolution.budgetSnapshot.budgetPeriod,
    batchItems: resolution.resolutionType === "BATCH" ? resolution.expenseItems.map((item) => ({ ...item })) : [createBatchExpenseItem(1)],
    singleItems: resolution.singleItems?.length
      ? resolution.singleItems.map((item) => createSingleExpenseItem({
          ...item,
          taxCategory: getSingleExpenseTaxCategory(item),
        }))
      : [createSingleExpenseItem({
          itemName: resolution.operationExpenseDetail,
          quantity: "1",
          taxCategory: resolution.supplyAmount > 0 && resolution.vat === 0 ? "NO_VAT" : "TAXABLE",
          unitPrice: String(resolution.supplyAmount),
          vatAmount: resolution.vat,
        })],
    accountAllocations: resolution.accountAllocations?.length
      ? resolution.accountAllocations.map((allocation) => ({ ...allocation }))
      : [createAccountAllocation({ accountTitle: resolution.representativeAccountTitle || resolution.expenseType, amount: String(resolution.totalPaymentAmount), budgetItem: resolution.budgetItem })],
    batchPaymentMode: resolution.batchPaymentMode,
    createdAt: resolution.createdAt,
    evidenceFiles: resolution.evidenceFiles?.map((file) => ({ ...file, ocrData: { ...file.ocrData } })) ?? [],
    evidenceType: resolution.evidenceType ?? "기타",
    expenseType: resolution.expenseType,
    expenseTiming: normalizeExpenseTiming(resolution),
    executionMethod: resolution.executionMethod ?? "VENDOR_DIRECT",
    expenseBurdenType: resolution.expenseBurdenType ?? "EMPLOYEE_PREPAID",
    inputMethod: normalizeInputMethod(resolution),
    quickEntryMode: resolution.cardReconciliationStatus || resolution.cardTransactionId || resolution.bankTransactionId || resolution.bankTransactions?.length ? "BUDGET_DIRECT" : "NONE",
    quickPaymentMethod: resolution.expenseBurdenType === "CORPORATE_CARD" || resolution.cardReconciliationStatus || resolution.cardTransactionId
      ? "CORPORATE_CARD"
      : resolution.bankTransactionId
        ? "BANK_TRANSFER"
        : resolution.expenseKind === "PERSONAL_REIMBURSEMENT"
          ? "PERSONAL_PREPAID"
          : resolution.expenseBurdenType === "CASH"
            ? "CASH"
            : "BANK_TRANSFER",
    quickExpenseCategory: resolution.subject.includes("택시") ? "택시" : resolution.subject.includes("주차") ? "주차" : resolution.subject.includes("통행료") ? "통행료" : resolution.subject.includes("식대") ? "식대" : resolution.subject.includes("소모품") ? "소모품" : "기타",
    memo: resolution.memo ?? "",
    operationExpenseDetail: resolution.operationExpenseDetail,
    expenseDetailId: resolution.expenseDetailId ?? "",
    paymentTargetId: getResolutionPaymentTargetId(resolution),
    paymentAccountNo: resolution.paymentAccountNo ?? "",
    paymentBank: resolution.paymentBank ?? "",
    paymentFlowType: resolution.paymentFlowType,
    plannedPaymentDate: resolution.plannedPaymentDate,
    postApprovalReason: resolution.postApprovalReason ?? "",
    originalResolutionId: resolution.originalResolutionId ?? "",
    settlementDueDate: resolution.settlementDueDate ?? "",
    settlementManager: resolution.settlementManager ?? "",
    reason: resolution.reason ?? "",
    relatedContract: resolution.relatedContract ?? "",
    relatedMeeting: resolution.relatedMeeting ?? "",
    resolutionNo: resolution.resolutionNo,
    resolutionMode: normalizeResolutionMode(resolution),
    subject: resolution.subject ?? "",
    resolutionType: resolution.resolutionType,
    projectName: resolution.projectName,
    voucherCreationMode: resolution.voucherCreationMode,
    settlementDifferenceAction: resolution.settlementDifferenceAction ?? "차액없음",
    supplyAmount: String(resolution.supplyAmount),
    vat: String(resolution.vat),
    vendorName: resolution.vendorName === "거래처 미입력" ? "" : resolution.vendorName,
    vendorId: resolution.vendorId ?? "",
    vendorAddress: resolution.vendorAddress ?? "",
    vendorBusinessCategory: resolution.vendorBusinessCategory ?? "",
    vendorBusinessNumber: resolution.vendorBusinessNumber ?? "",
    vendorBusinessType: resolution.vendorBusinessType ?? "",
    vendorContact: resolution.vendorContact ?? "",
    vendorRepresentative: resolution.vendorRepresentative ?? "",
  };
}

export function createFormState(nextNo: string, currentDate = getCurrentDateIso(), authorLabel = currentUserName): ResolutionFormState {
  return applyPaymentTarget({
    creationSource: "DIRECT",
    approvalDocumentId: "",
    approvalDocumentNo: "",
    approvalSkipReason: "",
    approvalSkipReasonDetail: "",
    approvalRoute: "SECRETARY_CHAIR",
    approvalRecordKind: "CURRENT", originalApprovalDate: "", originalApprovalReference: "",
    expenseKind: "GENERAL",
    accountingDate: currentDate,
    actualExpenseDate: "",
    evidenceKind: "NONE",
    evidenceStatus: "NONE",
    missingEvidenceReason: "",
    bankTransactionId: "",
    bankTransactions: [],
    cardTransactionId: "",
    cardLastFour: "",
    cardReconciliationStatus: "PENDING",
    cardSettlementMode: "CARD_BILLING",
    cardVerificationSource: undefined,
    settlementRecipient: "",
    settlementCompletedAt: "",
    resolutionNo: nextNo,
    resolutionMode: "SINGLE",
    subject: "",
    resolutionType: "SINGLE",
    projectName: "",
    createdAt: currentDate,
    author: authorLabel,
    plannedPaymentDate: "",
    paymentFlowType: "사전결의",
    expenseTiming: "ADVANCE",
    executionMethod: "VENDOR_DIRECT",
    expenseBurdenType: "EMPLOYEE_PREPAID",
    inputMethod: "MANUAL",
    quickEntryMode: "NONE",
    quickPaymentMethod: "CORPORATE_CARD",
    quickExpenseCategory: "택시",
    expenseType: "운영비",
    operationExpenseDetail: "기타",
    expenseDetailId: "",
    budgetPeriod: currentDate.slice(0, 7),
    budgetItem: "",
    budgetRecommendation: null,
    budgetOverReason: "",
    batchItems: [createBatchExpenseItem(1)],
    singleItems: [createSingleExpenseItem()],
    accountAllocations: [createAccountAllocation()],
    batchPaymentMode: "ITEM",
    voucherCreationMode: "ITEM_VOUCHER",
    vendorName: "",
    vendorId: "",
    vendorAddress: "",
    vendorBusinessCategory: "",
    vendorBusinessNumber: "",
    vendorBusinessType: "",
    vendorContact: "",
    vendorRepresentative: "",
    paymentTargetId: "manual",
    paymentBank: "",
    paymentAccountNo: "",
    accountHolder: "",
    supplyAmount: "0",
    vat: "0",
    advancePaidAt: "",
    advancePayer: "",
    advancePaymentMethod: "계좌이체",
    advancePaidAmount: "0",
    actualUsedAmount: "0",
    settlementDifferenceAction: "차액없음",
    postApprovalReason: "",
    originalResolutionId: "",
    settlementDueDate: "",
    settlementManager: authorLabel,
    reason: "",
    relatedContract: "",
    relatedMeeting: "",
    evidenceFiles: [],
    evidenceType: "영수증",
    memo: "",
  }, "manual");
}

function createQuickExpenseConversionFormState(source: QuickExpenseConversionDraft, nextNo: string, authorLabel: string): ResolutionFormState {
  const base = createFormState(nextNo, source.occurredDate, authorLabel);
  const evidenceKind: EvidenceKind = source.evidenceKind === "CARD_TRANSACTION" ? "CARD_RECEIPT"
    : source.evidenceKind === "RECEIPT" ? "SIMPLE_RECEIPT"
      : source.evidenceKind === "BANK_TRANSFER" ? "BANK_TRANSFER"
        : source.evidenceKind === "ALTERNATIVE" ? "OTHER_ALTERNATIVE" : "NONE";
  const evidenceStatus: EvidenceStatus = ["QUALIFIED", "GENERAL", "ALTERNATIVE"].includes(source.evidenceStatus)
    ? source.evidenceStatus as EvidenceStatus : "NONE";
  const expenseBurdenType: ExpenseBurdenType = source.paymentMethod === "CORPORATE_CARD" ? "CORPORATE_CARD"
    : ["BANK_TRANSFER", "AUTO_DEBIT"].includes(source.paymentMethod) ? "ORGANIZATION_PAID"
      : source.paymentMethod === "CASH" ? "CASH" : "EMPLOYEE_PREPAID";
  const expenseKind: ExpenseKind = source.paymentMethod === "PERSONAL_PREPAID" ? "PERSONAL_REIMBURSEMENT" : "GENERAL";
  const isBankVerifiedCard = source.paymentMethod === "CORPORATE_CARD" && Boolean(source.bankTransactionId);
  const amount = String(source.amount);
  return {
    ...base,
    accountingDate: source.occurredDate,
    actualExpenseDate: source.occurredDate,
    plannedPaymentDate: source.occurredDate,
    paymentFlowType: "사후정산",
    expenseTiming: "REIMBURSEMENT",
    executionMethod: source.paymentMethod === "CORPORATE_CARD" ? "CORPORATE_CARD" : "AUTHORIZATION_ONLY",
    expenseBurdenType,
    expenseKind,
    approvalSkipReason: source.approvalSkipReason,
    bankTransactionId: isBankVerifiedCard ? "" : source.bankTransactionId ?? "",
    bankTransactions: isBankVerifiedCard && source.bankTransactionId ? [{
      amount: source.amount,
      description: source.usageDescription,
      id: source.bankTransactionId,
      itemId: `quick-bank-${source.bankTransactionId}`,
      transactionDate: source.occurredDate,
    }] : [],
    cardTransactionId: source.cardTransactionId ?? "",
    cardReconciliationStatus: source.cardTransactionId || isBankVerifiedCard ? "MATCHED" : "PENDING",
    cardSettlementMode: isBankVerifiedCard ? "BANK_DIRECT" : "CARD_BILLING",
    cardVerificationSource: isBankVerifiedCard ? "BANK_TRANSACTION" : source.cardTransactionId ? "CARD_TRANSACTION" : undefined,
    budgetItem: source.budgetItem,
    expenseDetailId: source.expenseDetailId ?? "",
    operationExpenseDetail: source.usageDescription,
    subject: source.usageDescription,
    vendorName: source.counterparty,
    reason: source.usageDescription,
    quickEntryMode: "BUDGET_DIRECT",
    quickPaymentMethod: source.paymentMethod,
    singleItems: [createSingleExpenseItem({ itemName: source.usageDescription, quantity: "1", taxCategory: "NO_VAT", unitPrice: amount })],
    accountAllocations: [createAccountAllocation({ amount, budgetItem: source.budgetItem, description: source.usageDescription })],
    supplyAmount: amount,
    vat: "0",
    actualUsedAmount: amount,
    postApprovalReason: "간편지출에서 정식 지출결의로 전환",
    settlementRecipient: expenseKind === "PERSONAL_REIMBURSEMENT" ? authorLabel : "",
    evidenceFiles: source.evidenceFiles,
    evidenceKind,
    evidenceStatus,
    evidenceType: (["세금계산서", "계산서", "영수증", "현금영수증", "이체확인증", "계약서", "견적서", "의결서"] as string[]).includes(source.evidenceFiles[0]?.evidenceType ?? "")
      ? source.evidenceFiles[0]!.evidenceType as EvidenceType : "기타",
  };
}

export function toNumber(value: string) {
  const number = Number(value.replaceAll(",", ""));
  return Number.isFinite(number) ? number : 0;
}

function getCurrentDateIso() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).format(new Date());
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createExpenseResolutionInternalId(resolutionNo: string) {
  const match = resolutionNo.match(/(\d{4})-(\d+)$/);
  if (!match) {
    return `er_${resolutionNo.replace(/[^\dA-Za-z가-힣]+/g, "_").replace(/^_+|_+$/g, "")}`;
  }

  return `er_${match[1]}_${match[2].padStart(4, "0")}`;
}

function getNextResolutionNo(resolutions: ManagedExpenseResolution[], currentDate = getCurrentDateIso(), prefix = resolutionNoPrefix) {
  const year = currentDate.slice(0, 4);
  const resolutionNoPattern = new RegExp(`^${escapeRegExp(prefix)}-${year}-(\\d+)$`);
  const maxSequence = resolutions.reduce((max, resolution) => {
    const match = resolution.resolutionNo.match(resolutionNoPattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `${prefix}-${year}-${String(maxSequence + 1).padStart(4, "0")}`;
}

function getNextResolutionNoForLoadedPage(resolutions: ManagedExpenseResolution[], serverSuggestion?: string) {
  const localSuggestion = getNextResolutionNo(resolutions);
  return serverSuggestion && serverSuggestion > localSuggestion ? serverSuggestion : localSuggestion;
}

export function getDisplayApprovalLine(resolution: ManagedExpenseResolution) {
  const useCurrentOrganizationRole = ["작성중", "승인대기", "반려"].includes(resolution.approvalStatus);
  return resolution.approvalLine.map((step) => {
    const currentApprover = getApproverLabel(step) === resolution.currentApprover;
    const role = useCurrentOrganizationRole
      ? getOrganizationApproverDisplayRole(step.approver, step.role)
      : step.role;
    return {
      ...step,
      role,
      status: currentApprover && step.status === "대기" ? "결재대기" as const : step.status,
    };
  });
}

type DocumentApprovalParticipant = ExpenseApprovalParticipant & {
  processedAt?: string;
  statusLabel: string;
};

export function getDocumentApprovalParticipants(resolution: ManagedExpenseResolution): DocumentApprovalParticipant[] {
  if (!resolution.approvalParticipants?.length) {
    return getDisplayApprovalLine(resolution).map((step) => ({
      action: step.role as ExpenseApprovalParticipant["action"],
      approvalOrder: step.order,
      name: step.approver,
      processedAt: getApprovalProcessedAt(resolution, step),
      statusLabel: step.status,
      title: step.role,
    }));
  }

  return resolution.approvalParticipants.map((participant) => {
    const approvalStep = participant.approvalOrder
      ? resolution.approvalLine.find((step) => step.order === participant.approvalOrder)
      : undefined;
    const statusLabel = approvalStep
      ? ["대기", "결재대기"].includes(approvalStep.status) ? "서명란" : approvalStep.status
      : (participant.action === "작성" ? "작성완료"
        : participant.action === "규정상 생략" ? "생략"
          : participant.action === "후열·보고" ? "후열대상" : "대기");
    return {
      ...participant,
      processedAt: approvalStep ? getApprovalProcessedAt(resolution, approvalStep) : participant.action === "작성" ? resolution.draftedAt ?? resolution.createdAt : undefined,
      statusLabel,
    };
  });
}

export function getRelatedVoucherNo(resolution: ManagedExpenseResolution) {
  if (resolution.voucherNo) {
    return resolution.voucherNo;
  }

  const itemVoucherNos = resolution.expenseItems.map((item) => item.voucherNo).filter(Boolean);
  return itemVoucherNos.length > 0 ? itemVoucherNos.join(", ") : "-";
}

function getResolutionVoucherNos(resolution: ManagedExpenseResolution) {
  return [resolution.voucherNo, ...resolution.expenseItems.map((item) => item.voucherNo)].filter(Boolean) as string[];
}

export function getNextExpenseVoucherNo(resolutions: ManagedExpenseResolution[], currentDate = getCurrentDateIso()) {
  return getNextDocumentNo("EXPENSE_VOUCHER", resolutions.flatMap(getResolutionVoucherNos), Number(currentDate.slice(0, 4)));
}

export function getVoucherStatusLabel(resolution: ManagedExpenseResolution) {
  if (!resolution.voucherNo) {
    return "미생성";
  }

  return resolution.voucherStatus ?? "전표초안";
}

export function applyVoucherDraft(resolution: ManagedExpenseResolution, voucherNo: string, actionAt = "2026-07-03 09:32") {
  if (resolution.voucherNo) {
    return resolution;
  }

  if (resolution.resolutionType === "BATCH" && resolution.voucherCreationMode === "ITEM_VOUCHER") {
    const expenseItems = resolution.expenseItems.map((item) => ({
      ...item,
      voucherNo: `${voucherNo}-${String(item.itemNo).padStart(2, "0")}`,
      voucherStatus: "전표초안" as const,
    }));
    const itemVoucherNos = expenseItems.map((item) => item.voucherNo).filter(Boolean).join(", ");

    return {
      ...resolution,
      expenseItems,
      history: [
        ...resolution.history,
        createHistoryItem({
          actionAt,
          actionLabel: "지출전표 초안 생성",
          actionType: "VOUCHER_CREATED",
          actorLabel: "시스템",
          comment: `항목별 전표초안 ${itemVoucherNos} 생성`,
        }),
      ],
      voucherGenerated: true,
      voucherNo: expenseItems[0]?.voucherNo,
      voucherStatus: "전표초안" as const,
    };
  }

  return {
    ...resolution,
    history: [
      ...resolution.history,
      createHistoryItem({
        actionAt,
        actionLabel: "지출전표 초안 생성",
        actionType: "VOUCHER_CREATED",
        actorLabel: "시스템",
        comment: `전표번호 ${voucherNo} 초안 생성`,
      }),
    ],
    voucherGenerated: true,
    voucherNo,
    voucherStatus: "전표초안" as const,
  };
}

export function applyVoucherConfirmation(resolution: ManagedExpenseResolution, confirmedAt = "2026-07-03 16:50") {
  if (!resolution.voucherNo || resolution.voucherStatus !== "전표초안") {
    return resolution;
  }

  return {
    ...resolution,
    expenseItems: resolution.expenseItems.map((item) => (item.voucherNo ? { ...item, voucherStatus: "전표확정" as const } : item)),
    history: [
      ...resolution.history,
      createHistoryItem({
        actionAt: confirmedAt,
        actionLabel: "지출전표 확정",
        actionType: "VOUCHER_CREATED",
        actorLabel: currentUserName,
        comment: `전표번호 ${getRelatedVoucherNo(resolution)} 확정`,
      }),
    ],
    voucherConfirmedAt: confirmedAt,
    voucherConfirmedBy: currentUserName,
    voucherGenerated: true,
    voucherStatus: "전표확정" as const,
  };
}

function getArchiveStorageLocation(resolution: ManagedExpenseResolution, sequence: number) {
  const dateSource = resolution.plannedPaymentDate || resolution.createdAt || getCurrentDateIso();
  const [year = "2026", month = "07"] = dateSource.split("-");
  return `${year}년 ${resolution.expenseType} 지출결의서 / ${Number(month)}월 / ${String(sequence).padStart(3, "0")}`;
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function unwrapEvidenceUploadResult(result: ExpenseEvidenceAttachment | ExpenseEvidenceUploadResult) {
  if ("ok" in result) {
    if (!result.ok) throw new Error(result.message);
    return result.attachment;
  }
  return result;
}

export function getEvidenceUploadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "업로드 실패");
  if (/Server Components render|Server Action.*not found|Failed to find Server Action|digest property/i.test(message)) {
    return "화면이 새 버전으로 업데이트되었습니다. 새로고침한 후 증빙파일을 다시 선택해 주세요.";
  }
  return message;
}

export async function uploadExpenseEvidenceViaRoute(formData: FormData): Promise<ExpenseEvidenceUploadResult> {
  const response = await fetch("/api/finance/expense-evidence", { body: formData, method: "POST" });
  const result = await response.json().catch(() => null) as ExpenseEvidenceUploadResult | null;
  if (result && typeof result === "object" && "ok" in result) return result;
  throw new Error(response.ok
    ? "증빙자료 처리 결과를 확인하지 못했습니다. 다시 시도해 주세요."
    : "증빙자료를 전송하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export function OcrValue({ confirmed = false, label, value }: { confirmed?: boolean; label: string; value: string }) {
  const missing = value === "-";
  const status = missing ? "인식 안 됨" : confirmed ? "사용자 확인" : "자동입력 · 확인 필요";
  return (
    <div>
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-[var(--color-stone)]">{label}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${missing ? "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]" : confirmed ? "bg-[var(--color-sprout)] text-[var(--color-green-ink)]" : "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]"}`}>{status}</span></div>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function createBankTransactionDraftFormState(transaction: BankTransactionResolutionCandidate, nextNo: string): ResolutionFormState {
  const amount = transaction.withdrawalAmount;
  return {
    ...createFormState(nextNo),
    actualExpenseDate: transaction.transactedAt.slice(0, 10),
    bankTransactionId: transaction.id,
    evidenceKind: "BANK_TRANSFER",
    evidenceStatus: "GENERAL",
    expenseKind: "BANK_POST_APPROVAL",
    plannedPaymentDate: transaction.transactedAt.slice(0, 10),
    reason: transaction.description,
    singleItems: [createSingleExpenseItem({ itemName: transaction.description, quantity: "1", taxCategory: "NO_VAT", unitPrice: String(amount) })],
    supplyAmount: String(amount),
    vat: "0",
    vendorName: transaction.counterparty || transaction.description,
  };
}

function getApprovalProcessedAt(resolution: ManagedExpenseResolution, step: ApprovalStep) {
  if (step.processedAt?.includes(" ")) return step.processedAt;
  const approvalHistory = resolution.history.find(
    (item) => item.actionType === "APPROVED" && `${item.actorName} ${item.actorTitle}`.trim() === getApproverLabel(step),
  );
  return approvalHistory?.actionAt ?? step.processedAt;
}

function getCurrentDateTime() {
  const now = new Date();
  const date = getCurrentDateIso();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${date} ${hours}:${minutes}`;
}

const expenseResolutionExportHeaders = [
  "결의서번호",
  "건명",
  "작성방식",
  "프로젝트/사업과제",
  "작성일",
  "작성자",
  "집행/지출/정산일",
  "업무유형",
  "지출구분",
  "운영비 세부구분",
  "대표 거래처",
  "거래처명",
  "대표 계정항목",
  "예산항목",
  "항목수",
  "공급가액",
  "부가세",
  "총지급액",
  "예산초과건수",
  "예산초과금액",
  "현재결재자",
  "승인상태",
  "지급상태",
  "전표상태",
  "전표번호",
  "증빙여부",
  "지급은행",
  "지급계좌번호",
  "예금주",
  "지급일",
  "정산상태",
  "지출사유",
  "관련계약",
  "관련회의",
  "메모",
] as const;

function escapeCsvCell(value: string | number | undefined) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildExpenseResolutionExportRow(resolution: ManagedExpenseResolution) {
  return [
    resolution.resolutionNo,
    getResolutionSubject(resolution),
    getResolutionTypeLabel(resolution.resolutionType),
    resolution.projectName || "-",
    resolution.createdAt,
    resolution.author,
    resolution.plannedPaymentDate,
    getExpenseTimingLabel(normalizeExpenseTiming(resolution)),
    resolution.expenseType,
    resolution.operationExpenseDetail,
    resolution.representativeVendorName,
    resolution.vendorName,
    resolution.representativeAccountTitle,
    resolution.budgetItem,
    `${resolution.itemCount}건`,
    formatExpenseResolutionAmount(resolution.supplyAmount),
    formatExpenseResolutionAmount(resolution.vat),
    formatExpenseResolutionAmount(resolution.totalPaymentAmount),
    `${resolution.overBudgetItemCount}건`,
    formatExpenseResolutionAmount(resolution.totalOverBudgetAmount),
    resolution.currentApprover ?? "없음",
    resolution.approvalStatus,
    resolution.paymentStatus,
    getVoucherStatusLabel(resolution),
    getRelatedVoucherNo(resolution),
    resolution.evidenceAttached ? "첨부완료" : "미첨부",
    resolution.paymentBank,
    resolution.paymentAccountNo,
    resolution.accountHolder,
    resolution.paidAt ?? "-",
    resolution.settlementStatus,
    resolution.reason || "-",
    resolution.relatedContract || "-",
    resolution.relatedMeeting || "-",
    resolution.memo || "-",
  ];
}

export function buildExpenseResolutionExportCsv(resolutions: ManagedExpenseResolution[]) {
  return [expenseResolutionExportHeaders, ...resolutions.map(buildExpenseResolutionExportRow)].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function downloadTextFile({ content, fileName, mimeType }: { content: string; fileName: string; mimeType: string }) {
  const blob = new Blob(["\ufeff", content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getPrintValidationWarnings(resolution: ManagedExpenseResolution) {
  const warnings: string[] = [];

  if (!resolution.vendorName.trim() || resolution.vendorName === "거래처 미입력") {
    warnings.push("거래처가 입력되지 않았습니다. 보관용 출력 전 거래처 정보를 확인해주세요.");
  }

  if (resolution.reason.trim().length < 10) {
    warnings.push("지출사유가 너무 짧습니다. 보관용 문서에는 구체적인 지출사유를 입력해주세요.");
  }

  if (resolution.totalPaymentAmount <= 0) {
    warnings.push("총지급액이 0원 이하입니다. 금액 정보를 확인해주세요.");
  }

  if (!resolution.budgetItem.trim()) {
    warnings.push("예산항목이 선택되지 않았습니다. 예산항목을 확인해주세요.");
  }

  if (resolution.budgetSnapshot.remainingBudgetAmount < 0 && !resolution.budgetOverReason.trim()) {
    warnings.push("예산을 초과한 지출결의입니다. 초과사유를 입력한 후 보관용 출력하는 것을 권장합니다.");
  }

  if (resolution.approvalLine.length === 0) {
    warnings.push("결재선이 없습니다. 결재선을 확인해주세요.");
  }

  return warnings;
}

export function getEvidenceRows(resolution: ManagedExpenseResolution) {
  return (resolution.evidenceFiles ?? []).map((file) => ({
    amount: resolution.totalPaymentAmount,
    attachedAt: file.uploadedAt,
    evidenceType: file.evidenceType,
    fileName: file.fileName,
    issuer: resolution.vendorName,
  }));
}

export function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[value] ?? statusClasses.작성중}`}>
      {value}
    </span>
  );
}

function ComplianceBadge({ label, tone = "default" }: { label: string; tone?: "default" | "danger" | "success" | "warning" }) {
  const classes = tone === "danger" ? "bg-rose-100 text-rose-800" : tone === "success" ? "bg-emerald-100 text-emerald-800" : tone === "warning" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${classes}`}>{label}</span>;
}

export function getHistoryTone(actionType: ExpenseResolutionHistoryActionType) {
  const tones: Record<ExpenseResolutionHistoryActionType, string> = {
    APPROVED: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
    ARCHIVED: "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]",
    CREATED: "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]",
    EVIDENCE_ATTACHED: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
    PAYMENT_COMPLETED: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
    PAYMENT_HOLD: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
    PAYMENT_PENDING: "bg-[var(--color-lilac-mist)] text-[var(--color-amethyst)]",
    PRINTED: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
    REJECTED: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
    REQUESTED_APPROVAL: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
    SAVED_DRAFT: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
    UPDATED: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
    VOUCHER_CREATED: "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]",
  };

  return tones[actionType];
}

function isCurrentUserApprover(resolution: ManagedExpenseResolution, viewer?: ReimbursementMember) {
  return viewer ? canApproveExpense(resolution, viewer) : resolution.currentApprover === currentUserName;
}

function getResolutionTabItems(resolutions: ManagedExpenseResolution[], viewer?: ReimbursementMember) {
  return [
    {
      key: "all" as const,
      label: "전체",
      resolutions,
    },
    {
      key: "mine" as const,
      label: "내가 작성한 결의서",
      resolutions: resolutions.filter((resolution) => viewer ? resolution.authorization?.author_user_id === viewer.user_id : resolution.author === currentUserName),
    },
    {
      key: "approvalInbox" as const,
      label: "결재함",
      resolutions: resolutions.filter((resolution) => resolution.approvalStatus === "승인대기" && isCurrentUserApprover(resolution, viewer)),
    },
    {
      key: "rejected" as const,
      label: "반려함",
      resolutions: resolutions.filter((resolution) => resolution.approvalStatus === "반려"),
    },
    {
      key: "paymentWaiting" as const,
      label: "지급대기",
      resolutions: resolutions.filter((resolution) => resolution.approvalStatus === "승인완료" && resolution.paymentStatus === "지급대기"),
    },
    {
      key: "partialPaid" as const,
      label: "부분지급",
      resolutions: resolutions.filter((resolution) => resolution.paymentStatus === "부분지급"),
    },
    {
      key: "paid" as const,
      label: "지급완료",
      resolutions: resolutions.filter((resolution) => resolution.paymentStatus === "지급완료"),
    },
    {
      key: "hold" as const,
      label: "보류",
      resolutions: resolutions.filter((resolution) => resolution.paymentStatus === "보류"),
    },
    {
      key: "voucherCreated" as const,
      label: "전표생성완료",
      resolutions: resolutions.filter((resolution) => Boolean(resolution.voucherNo)),
    },
  ];
}

export function sortExpenseResolutionsByExpenseDate(resolutions: ManagedExpenseResolution[], sort: ExpenseResolutionSort) {
  if (sort === defaultExpenseResolutionSort) return resolutions;
  const direction = sort === "expense_date_asc" ? 1 : -1;
  return [...resolutions].sort((left, right) => {
    const leftDate = left.actualExpenseDate ?? "";
    const rightDate = right.actualExpenseDate ?? "";
    if (!leftDate && rightDate) return 1;
    if (leftDate && !rightDate) return -1;
    const dateDifference = leftDate.localeCompare(rightDate) * direction;
    if (dateDifference) return dateDifference;
    const numberDifference = left.resolutionNo.localeCompare(right.resolutionNo, "ko-KR") * direction;
    return numberDifference || left.id.localeCompare(right.id) * direction;
  });
}

export function ExpenseResolutionPage({
  viewer,
  createEvidenceDownloadUrl,
  dataLoadError,
  deleteEvidence,
  deleteResolution,
  ensureBusinessPartnerFromOcr,
  getEvidenceOcrJob,
  initialResolutions,
  initialListPage,
  initialNextResolutionNo,
  initialFormOptions,
  loadFormOptions,
  loadResolutionDetail,
  initialBankTransactions = [],
  initialCardTransactions = [],
  initialApprovalDocuments = [],
  initialBudgetProfiles = {},
  budgetDataError,
  initialExpenseDetails = [],
  directExpenseSettings = defaultExpenseComplianceSettings,
  initialBankTransactionId,
  initialEditResolutionId,
  initialEntryStart,
  initialQuickExpense,
  initialResolutionId,
  convertQuickExpense,
  persistResolution,
  saveFactConfirmation,
  listFactConfirmations,
  deleteFactConfirmation,
  uploadFactSupportingFile,
  retryEvidenceOcrJob,
  transitionApproval,
  transitionDisbursement,
  uploadEvidence,
}: {
  viewer?: ReimbursementMember;
  createEvidenceDownloadUrl?: (storagePath: string) => Promise<string>;
  dataLoadError?: string;
  deleteEvidence?: (storagePath: string) => Promise<void>;
  deleteResolution?: (resolutionId: string, actorLabel: string) => Promise<void>;
  ensureBusinessPartnerFromOcr?: (input: BusinessPartnerOcrInput) => Promise<BusinessPartnerRegistrationResult>;
  getEvidenceOcrJob?: (id: string) => Promise<EvidenceOcrJobProgress>;
  initialResolutions?: ManagedExpenseResolution[];
  initialListPage?: ExpenseResolutionListPage;
  initialNextResolutionNo?: string;
  initialFormOptions?: ExpenseResolutionFormOptions;
  loadFormOptions?: () => Promise<ExpenseResolutionFormOptions>;
  loadResolutionDetail?: (id: string) => Promise<ManagedExpenseResolution>;
  initialBankTransactions?: BankTransactionResolutionCandidate[];
  initialCardTransactions?: CorporateCardTransactionCandidate[];
  initialApprovalDocuments?: ApprovalDocumentCandidate[];
  initialBudgetProfiles?: Record<string, BudgetProfile>;
  budgetDataError?: string;
  initialExpenseDetails?: OperatingExpenseDetail[];
  directExpenseSettings?: ExpenseComplianceSettings;
  initialBankTransactionId?: string;
  initialEditResolutionId?: string;
  initialEntryStart?: ExpenseEntryStart;
  initialQuickExpense?: QuickExpenseConversionDraft;
  initialResolutionId?: string;
  convertQuickExpense?: (sourceId: string, resolution: ManagedExpenseResolution) => Promise<ManagedExpenseResolution>;
  persistResolution?: (resolution: ManagedExpenseResolution) => Promise<ManagedExpenseResolution>;
  saveFactConfirmation?: (input: ExpenseFactConfirmationInput) => Promise<string>;
  listFactConfirmations?: (resolutionId: string) => Promise<ExpenseFactConfirmation[]>;
  deleteFactConfirmation?: (id: string, resolutionId: string, actorLabel: string) => Promise<void>;
  uploadFactSupportingFile?: (formData: FormData) => Promise<{ fileName: string; id: string }>;
  retryEvidenceOcrJob?: (id: string) => Promise<void>;
  transitionApproval?: (input: ApprovalTransitionRequest) => Promise<ManagedExpenseResolution>;
  transitionDisbursement?: (input: DisbursementTransitionRequest) => Promise<DisbursementTransitionResult>;
  uploadEvidence?: (formData: FormData) => Promise<ExpenseEvidenceAttachment | ExpenseEvidenceUploadResult>;
} = {}) {
  const router = useRouter();
  const currentUserName = viewer?.display_name ?? `${currentUser.name} ${currentUser.title}`;
  const uploadEvidenceRequest = uploadEvidence ?? uploadExpenseEvidenceViaRoute;
  const [resolutions, setResolutions] = useState<ManagedExpenseResolution[]>(() =>
    initialResolutions ?? [],
  );
  const initialEditCandidate = initialEditResolutionId
    ? initialResolutions?.find((resolution) => resolution.id === initialEditResolutionId)
    : undefined;
  const initialEditResolution = initialEditCandidate && !isLegacySmallExpenseResolution(initialEditCandidate) && (viewer
    ? canEditExpense(initialEditCandidate, viewer)
    : initialEditCandidate.author === currentUserName && ["작성중", "승인대기", "반려"].includes(initialEditCandidate.approvalStatus))
    ? initialEditCandidate
    : undefined;
  const initialEditDenied = Boolean(initialEditCandidate && !initialEditResolution);
  const [formOptions, setFormOptions] = useState<ExpenseResolutionFormOptions>(() => initialFormOptions ?? {
    approvalDocuments: initialApprovalDocuments,
    bankTransactions: initialBankTransactions,
    cardTransactions: initialCardTransactions,
    directExpenseSettings,
    expenseDetails: initialExpenseDetails,
  });
  const [formOptionsLoaded, setFormOptionsLoaded] = useState(Boolean(initialFormOptions) || !loadFormOptions);
  const [isFormOptionsLoading, setIsFormOptionsLoading] = useState(false);
  const formOptionsRequest = useRef<Promise<ExpenseResolutionFormOptions> | null>(null);
  const initialBankDraft = formOptions.bankTransactions.find((item) => item.id === initialBankTransactionId && !item.linkedResolutionId);
  const [isLocalStorageHydrated, setIsLocalStorageHydrated] = useState(false);
  const [saveError, setSaveError] = useState("");
  const savingResolution = useRef(false);
  const [isSavingResolution, setIsSavingResolution] = useState(false);
  const [batchImportResult, setBatchImportResult] = useState<ExpenseResolutionImportResult | null>(null);
  const [batchImportFileName, setBatchImportFileName] = useState("");
  const [batchImportError, setBatchImportError] = useState("");
  const [evidenceUploadError, setEvidenceUploadError] = useState("");
  const [vendorRegistrationNotice, setVendorRegistrationNotice] = useState("");
  const [isEvidenceUploading, setIsEvidenceUploading] = useState(false);
  const [evidenceOcrProgress, setEvidenceOcrProgress] = useState<Record<string, EvidenceOcrJobProgress>>({});
  const [activeTab, setActiveTab] = useState<ResolutionTabKey>("all");
  const [searchQuery, setSearchQuery] = useState(initialListPage?.query ?? "");
  const [monthFilter, setMonthFilter] = useState(initialListPage?.month ?? "");
  const [sortOrder, setSortOrder] = useState<ExpenseResolutionSort>(initialListPage?.sort ?? defaultExpenseResolutionSort);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [isListNavigationPending, startListNavigation] = useTransition();
  const [approvalFilter, setApprovalFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [expenseKindFilter, setExpenseKindFilter] = useState("");
  const [evidenceStatusFilter, setEvidenceStatusFilter] = useState("");
  const [postApprovalFilter, setPostApprovalFilter] = useState("");
  const [bankLinkedFilter, setBankLinkedFilter] = useState("");
  const [spenderFilter, setSpenderFilter] = useState("");
  const [accountTitleFilter, setAccountTitleFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [pettyCashBatchFilter, setPettyCashBatchFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(!initialEditResolution && !initialResolutionId && Boolean(initialBankDraft || initialEntryStart || initialQuickExpense));
  const [editingResolutionId, setEditingResolutionId] = useState<string | null>(initialEditResolution?.id ?? null);
  const [isOperatingBudgetPrintOpen, setIsOperatingBudgetPrintOpen] = useState(false);
  const [paymentTargetId, setPaymentTargetId] = useState<string | null>(null);
  const [factConfirmationTarget, setFactConfirmationTarget] = useState<{ detailItem?: BatchExpenseItem; resolution: ManagedExpenseResolution } | null>(null);
  const [printWarning, setPrintWarning] = useState<{ mode: PrintRecordItem["printPurpose"]; resolutionId: string; warnings: string[] } | null>(null);
  const [printPreviewTargetId, setPrintPreviewTargetId] = useState<string | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(initialResolutionId ?? null);
  const [rejectionForm, setRejectionForm] = useState<RejectionFormState | null>(null);
  const [formState, setFormState] = useState<ResolutionFormState>(() => {
    const nextResolutionNo = initialNextResolutionNo ?? formOptions.nextResolutionNo;
    if (initialEditResolution) return createEditFormState(initialEditResolution);
    if (initialBankDraft) return { ...createBankTransactionDraftFormState(initialBankDraft, getNextResolutionNoForLoadedPage(resolutions, nextResolutionNo)), author: currentUserName, settlementManager: currentUserName };
    if (initialQuickExpense) return createQuickExpenseConversionFormState(initialQuickExpense, getNextResolutionNoForLoadedPage(resolutions, nextResolutionNo), currentUserName);
    const form = createFormState(getNextResolutionNoForLoadedPage(resolutions, nextResolutionNo), undefined, currentUserName);
    return initialEntryStart === "reimbursement" ? { ...form, expenseTiming: "REIMBURSEMENT", paymentFlowType: "사후정산" } : form;
  });
  const [quickConversionSourceId, setQuickConversionSourceId] = useState<string | null>(initialQuickExpense?.sourceId ?? null);
  const expenseDetailSelectionRef = useRef<"AUTO" | "MANUAL">("AUTO");
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>({
    actualPaidAmount: "",
    accountHolder: "",
    batchPaymentMode: "GROUP",
    paidAt: getCurrentDateIso(),
    paymentBank: "",
    paymentAccountNo: "",
    paymentMemo: "",
    paymentMethod: "계좌이체",
  });
  const selectedDetail = selectedDetailId ? resolutions.find((resolution) => resolution.id === selectedDetailId) : undefined;
  const paymentTarget = paymentTargetId ? resolutions.find((resolution) => resolution.id === paymentTargetId) : undefined;
  const printPreviewTarget = printPreviewTargetId ? resolutions.find((resolution) => resolution.id === printPreviewTargetId) : undefined;
  const printWarningResolution = printWarning ? resolutions.find((resolution) => resolution.id === printWarning.resolutionId) : undefined;
  const legacySmallExpenseCount = resolutions.filter(isLegacySmallExpenseResolution).length;

  const summary = useMemo(() => {
    const pendingApprovalItems = resolutions.filter((resolution) => resolution.approvalStatus === "승인대기");

    return {
      pendingApprovalCount: pendingApprovalItems.length,
      waitingPaymentCount: resolutions.filter((resolution) => resolution.approvalStatus === "승인완료" && resolution.paymentStatus === "지급대기").length,
      totalPendingAmount: pendingApprovalItems.reduce((sum, resolution) => sum + resolution.totalPaymentAmount, 0),
    };
  }, [resolutions]);
  const formSingleSummary = summarizeSingleExpenseItems(formState.singleItems);
  const formTotalAmount = formSingleSummary.totalAmount;
  const accountAllocationTotal = formState.accountAllocations.reduce((sum, allocation) => sum + toNumber(allocation.amount), 0);
  const formBatchSummary = summarizeBatchItems(formState.batchItems);
  const effectiveFormTotalAmount = formState.resolutionType === "BATCH" ? formBatchSummary.totalAmount : formTotalAmount;
  const formEditingResolution = editingResolutionId ? resolutions.find((resolution) => resolution.id === editingResolutionId) : undefined;
  const formBudgetSnapshot = createBudgetSnapshot(
    formState.budgetItem,
    formTotalAmount,
    formState.budgetPeriod,
    initialBudgetProfiles,
    formEditingResolution?.budgetId,
    formEditingResolution?.budgetMonth,
    formEditingResolution?.approvalStatus,
    formEditingResolution?.totalPaymentAmount,
  );
  const settlementDifference = toNumber(formState.advancePaidAmount) - toNumber(formState.actualUsedAmount || String(formTotalAmount));
  const tabItems = getResolutionTabItems(resolutions, viewer);
  const activeTabItem = tabItems.find((item) => item.key === activeTab) ?? tabItems[0];
  const clientSearchQuery = initialListPage && deferredSearchQuery === initialListPage.query ? "" : deferredSearchQuery;
  const resolutionsAfterFilters = filterExpenseResolutions(activeTabItem.resolutions, {
    approvalStatus: approvalFilter,
    dateFrom: dateFromFilter,
    dateTo: dateToFilter,
    overdueOnly,
    paymentStatus: paymentFilter,
    expenseKind: expenseKindFilter,
    evidenceStatus: evidenceStatusFilter,
    postApproval: postApprovalFilter,
    bankLinked: bankLinkedFilter,
    spender: spenderFilter,
    accountTitle: accountTitleFilter,
    vendor: vendorFilter,
    pettyCashBatch: pettyCashBatchFilter,
    query: clientSearchQuery,
  });
  const visibleResolutions = sortExpenseResolutionsByExpenseDate(
    resolutionsAfterFilters.filter((resolution) => !monthFilter || normalizeFinanceMonth(resolution.actualExpenseDate?.slice(0, 7)) === monthFilter),
    sortOrder,
  );
  const dashboard = useMemo(() => getExpenseResolutionDashboard(resolutions, getCurrentDateIso()), [resolutions]);
  const repeatedMissingEvidenceSpenders = useMemo(() => new Set(Object.entries(resolutions.filter((item) => item.evidenceStatus === "NONE" || item.evidenceStatus === "DEFICIENT").reduce<Record<string, number>>((counts, item) => { const spender = item.advancePayer || item.author; counts[spender] = (counts[spender] ?? 0) + 1; return counts; }, {})).filter(([, count]) => count >= 2).map(([spender]) => spender)), [resolutions]);
  const workflowAlerts = useMemo(() => buildExpenseResolutionAlerts(resolutions, getCurrentDateIso()), [resolutions]);
  const formBankTransactionCandidates = useMemo(
    () => getEditBankTransactionCandidates(formOptions.bankTransactions, editingResolutionId, {
      bankTransactionId: formState.bankTransactionId,
      bankTransactions: formState.bankTransactions,
    }),
    [editingResolutionId, formOptions.bankTransactions, formState.bankTransactionId, formState.bankTransactions],
  );
  const pendingEvidenceJobIds = formState.evidenceFiles
    .filter((file) => file.ocrJobId && file.ocrStatus === "REVIEW_REQUIRED")
    .map((file) => file.ocrJobId)
    .join(",");

  async function ensureFormOptions() {
    if (formOptionsLoaded || !loadFormOptions) return formOptions;
    setIsFormOptionsLoading(true);
    setSaveError("");
    try {
      formOptionsRequest.current ??= loadFormOptions();
      const options = await formOptionsRequest.current;
      setFormOptions(options);
      setFormOptionsLoaded(true);
      return options;
    } catch (error) {
      formOptionsRequest.current = null;
      setSaveError(error instanceof Error ? error.message : "작성용 기준정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return null;
    } finally {
      setIsFormOptionsLoading(false);
    }
  }

  useEffect(() => {
    let storedResolutions: ManagedExpenseResolution[] | undefined;
    if (initialResolutions === undefined && !persistResolution && !dataLoadError) {
      const stored = localStorage.getItem(expenseResolutionLocalStorageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as ManagedExpenseResolution[];
          if (Array.isArray(parsed)) storedResolutions = parsed;
        } catch {
          localStorage.removeItem(expenseResolutionLocalStorageKey);
        }
      }
    }
    const restoreTimer = window.setTimeout(() => {
      if (initialResolutions !== undefined) {
        setResolutions(initialResolutions);
      }
      else if (storedResolutions) setResolutions(storedResolutions);
      setIsLocalStorageHydrated(true);
    }, 0);
    return () => {
      window.clearTimeout(restoreTimer);
    };
  }, [initialResolutions, persistResolution, dataLoadError]);

  useEffect(() => {
    if (isLocalStorageHydrated && initialResolutions === undefined && !persistResolution && !dataLoadError) {
      localStorage.setItem(expenseResolutionLocalStorageKey, JSON.stringify(resolutions));
    }
  }, [isLocalStorageHydrated, resolutions, initialResolutions, persistResolution, dataLoadError]);

  useEffect(() => {
    if (!initialEditResolution) return;
    const openTimer = window.setTimeout(() => setIsCreateModalOpen(true), 0);
    return () => window.clearTimeout(openTimer);
  }, [initialEditResolution]);

  const applyAutomaticExpenseDetail = useEffectEvent(() => {
    if (!isCreateModalOpen || formState.resolutionType === "BATCH" || expenseDetailSelectionRef.current === "MANUAL") return;
    const evidenceText = formState.evidenceFiles.map((file) => [
      file.ocrData.itemName,
      file.ocrData.recognizedText,
      file.ocrData.items?.map((item) => item.itemName).join(" "),
    ].filter(Boolean).join(" ")).join(" ");
    const result = recommendOperatingExpenseDetail(formOptions.expenseDetails, {
      evidenceText,
      itemName: formState.singleItems.map((item) => item.itemName).join(" "),
      memo: formState.memo,
      reason: formState.reason,
      subject: formState.subject,
      vendorBusinessCategory: formState.vendorBusinessCategory,
      vendorBusinessType: formState.vendorBusinessType,
      vendorName: formState.vendorName,
    });
    if (!result || result.detail.id === formState.expenseDetailId) return;
    setFormState((current) => ({
      ...current,
      budgetItem: result.detail.budgetItem,
      budgetRecommendation: result.recommendation,
      expenseDetailId: result.detail.id,
      operationExpenseDetail: result.detail.name,
      accountAllocations: current.accountAllocations.length === 1
        ? current.accountAllocations.map((allocation) => ({ ...allocation, accountTitle: result.recommendation.accountTitle, budgetItem: result.detail.budgetItem }))
        : current.accountAllocations,
    }));
  });

  useEffect(() => {
    const timer = window.setTimeout(applyAutomaticExpenseDetail, 0);
    return () => window.clearTimeout(timer);
  }, [formState.evidenceFiles, formState.expenseDetailId, formState.memo, formState.reason, formState.resolutionType, formState.singleItems, formState.subject, formState.vendorBusinessCategory, formState.vendorBusinessType, formState.vendorName, formOptions.expenseDetails, isCreateModalOpen]);

  async function openCreateModal() {
    const options = await ensureFormOptions();
    if (!options) return;
    setQuickConversionSourceId(null);
    setBatchImportResult(null);
    setBatchImportFileName("");
    setBatchImportError("");
    setEvidenceUploadError("");
    setVendorRegistrationNotice("");
    setEditingResolutionId(null);
    expenseDetailSelectionRef.current = "AUTO";
    setFormState(createFormState(getNextResolutionNoForLoadedPage(resolutions, initialNextResolutionNo ?? options.nextResolutionNo), undefined, currentUserName));
    setIsCreateModalOpen(true);
  }

  async function openExcelImportModal() {
    const options = await ensureFormOptions();
    if (!options) return;
    setQuickConversionSourceId(null);
    setEditingResolutionId(null);
    expenseDetailSelectionRef.current = "AUTO";
    setBatchImportResult(null);
    setBatchImportFileName("");
    setBatchImportError("");
    setEvidenceUploadError("");
    setFormState({
      ...createFormState(getNextResolutionNoForLoadedPage(resolutions, initialNextResolutionNo ?? options.nextResolutionNo), undefined, currentUserName),
      inputMethod: "EXCEL",
      resolutionMode: "PROJECT_BULK",
      resolutionType: "BATCH",
    });
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    if (savingResolution.current) return;
    setIsCreateModalOpen(false);
    setEditingResolutionId(null);
    setQuickConversionSourceId(null);
    if (initialEditResolutionId) router.push("/finance/expense-resolutions");
  }

  async function openEditModal(resolution: ManagedExpenseResolution) {
    const canEdit = viewer
      ? canEditExpense(resolution, viewer)
      : resolution.author === currentUserName && ["작성중", "승인대기", "반려"].includes(resolution.approvalStatus);
    if (!canEdit) {
      setSaveError("작성중·승인대기·반려 문서는 연결된 작성자 또는 관리자만 수정할 수 있습니다.");
      setSelectedDetailId(resolution.id);
      return;
    }
    if (!(await ensureFormOptions())) return;
    setQuickConversionSourceId(null);
    setEvidenceUploadError("");
    setPrintWarning(null);
    setSelectedDetailId(null);
    setEditingResolutionId(resolution.id);
    expenseDetailSelectionRef.current = resolution.expenseDetailId ? "MANUAL" : "AUTO";
    setFormState(createEditFormState(resolution));
    setIsCreateModalOpen(true);
  }

  async function openDetailModal(id: string) {
    setSaveError("");
    if (!loadResolutionDetail) {
      setSelectedDetailId(id);
      return;
    }
    try {
      const detail = await loadResolutionDetail(id);
      setResolutions((current) => current.some((item) => item.id === id)
        ? current.map((item) => item.id === id ? detail : item)
        : [detail, ...current]);
      setSelectedDetailId(id);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "지출결의서 상세를 불러오지 못했습니다.");
    }
  }

  function editPrintWarningResolution() {
    if (!printWarning) return;
    const resolution = resolutions.find((item) => item.id === printWarning.resolutionId);
    if (resolution) void openEditModal(resolution);
  }

  function closeDetailModal() {
    setSelectedDetailId(null);
    setSaveError("");
  }

  function exportAllExpenseResolutions() {
    downloadTextFile({
      content: buildExpenseResolutionExportCsv(resolutions),
      fileName: `지출결의서_전체_${getCurrentDateIso()}.csv`,
      mimeType: "text/csv;charset=utf-8",
    });
  }

  function updateFormValue<K extends keyof ResolutionFormState>(key: K, value: ResolutionFormState[K]) {
    if (key === "expenseDetailId") expenseDetailSelectionRef.current = value ? "MANUAL" : "AUTO";
    setFormState((current) => {
      const normalizedValue = key === "vendorName" && typeof value === "string" ? normalizeVendorName(value) : value;
      const nextState = { ...current, [key]: normalizedValue } as ResolutionFormState;
      if (key === "createdAt" && typeof value === "string" && (!current.plannedPaymentDate || current.plannedPaymentDate === current.createdAt)) {
        nextState.plannedPaymentDate = value;
      }

      if (key === "paymentTargetId" && typeof value === "string") {
        return applyPaymentTarget(nextState, value);
      }

      if (key === "quickEntryMode" && value === "BUDGET_DIRECT") {
        const category = current.quickExpenseCategory || "택시";
        const subject = current.subject.trim() || `${currentDateLabel(current.actualExpenseDate)} 업무용 ${category}비`;
        return {
          ...nextState,
          accountAllocations: current.accountAllocations.map((allocation, index) => index === 0 ? { ...allocation, accountTitle: category === "택시" || category === "주차" || category === "통행료" ? "여비교통비" : allocation.accountTitle, budgetItem: category === "택시" || category === "주차" || category === "통행료" ? "운영비 > 여비교통비" : allocation.budgetItem } : allocation),
          approvalSkipReason: "승인 예산 내 일상 지출",
          accountHolder: "",
          cardReconciliationStatus: current.cardTransactionId || isBankVerifiedCorporateCard(current) ? "MATCHED" : "PENDING",
          creationSource: "DIRECT",
          evidenceKind: "CARD_RECEIPT",
          evidenceStatus: "QUALIFIED",
          expenseBurdenType: "CORPORATE_CARD",
          expenseTiming: "REIMBURSEMENT",
          executionMethod: "CORPORATE_CARD",
          inputMethod: "MANUAL",
          missingEvidenceReason: "",
          operationExpenseDetail: category === "택시" || category === "주차" || category === "통행료" ? "여비교통비" : current.operationExpenseDetail,
          paymentAccountNo: "",
          paymentBank: "",
          paymentFlowType: "사후정산",
          paymentTargetId: "manual",
          reason: current.reason.trim() || `업무 목적 ${category} 비용 · 공용 법인카드 결제`,
          subject,
          vendorName: current.vendorName.trim() || "법인카드 사용처 미확인",
        };
      }

      if (key === "quickPaymentMethod" && typeof value === "string") {
        const keepsBankVerifiedCard = value === "CORPORATE_CARD" && current.cardSettlementMode === "BANK_DIRECT";
        const common = {
          ...nextState,
          approvalSkipReason: value === "AUTO_DEBIT" ? "정기·반복 지출" : "승인 예산 내 일상 지출",
          bankTransactionId: value === "BANK_TRANSFER" || value === "AUTO_DEBIT" ? current.bankTransactionId : "",
          bankTransactions: keepsBankVerifiedCard ? current.bankTransactions : [],
          cardReconciliationStatus: value === "CORPORATE_CARD" ? (current.cardTransactionId || keepsBankVerifiedCard && current.bankTransactions.length ? "MATCHED" as const : "PENDING" as const) : "PENDING" as const,
          cardTransactionId: value === "CORPORATE_CARD" ? current.cardTransactionId : "",
          cardVerificationSource: value === "CORPORATE_CARD"
            ? current.cardTransactionId ? "CARD_TRANSACTION" as const : keepsBankVerifiedCard && current.bankTransactions.length ? "BANK_TRANSACTION" as const : undefined
            : undefined,
          creationSource: "DIRECT" as const,
          expenseTiming: "REIMBURSEMENT" as const,
          inputMethod: "MANUAL" as const,
          paymentFlowType: "사후정산" as const,
          quickEntryMode: "BUDGET_DIRECT" as const,
        };
        if (value === "CORPORATE_CARD") return { ...common, evidenceKind: "CARD_RECEIPT", evidenceStatus: "QUALIFIED", executionMethod: "CORPORATE_CARD", expenseBurdenType: "CORPORATE_CARD", expenseKind: "GENERAL" };
        if (value === "BANK_TRANSFER" || value === "AUTO_DEBIT") return { ...common, evidenceKind: "BANK_TRANSFER", evidenceStatus: "GENERAL", executionMethod: "AUTHORIZATION_ONLY", expenseBurdenType: "ORGANIZATION_PAID", expenseKind: "BANK_POST_APPROVAL", reason: current.reason.trim() || (value === "AUTO_DEBIT" ? "승인 예산 내 정기 자동이체 지출" : "승인 예산 내 계좌이체 지출") };
        if (value === "PERSONAL_PREPAID") return { ...common, evidenceKind: "SIMPLE_RECEIPT", evidenceStatus: "GENERAL", executionMethod: "EMPLOYEE_ADVANCE", expenseBurdenType: "EMPLOYEE_PREPAID", expenseKind: "PERSONAL_REIMBURSEMENT", reason: current.reason.trim() || "승인 예산 내 개인 선결제 비용 정산" };
        return { ...common, evidenceKind: "CASH_RECEIPT", evidenceStatus: "QUALIFIED", executionMethod: "AUTHORIZATION_ONLY", expenseBurdenType: "CASH", expenseKind: "GENERAL", reason: current.reason.trim() || "승인 예산 내 현금 지출" };
      }

      if (key === "cardSettlementMode" && typeof value === "string") {
        if (value === "BANK_DIRECT") {
          return {
            ...nextState,
            bankTransactionId: "",
            cardTransactionId: "",
            cardLastFour: current.cardLastFour,
            cardReconciliationStatus: current.bankTransactions.length ? "MATCHED" : "PENDING",
            cardSettlementMode: "BANK_DIRECT",
            cardVerificationSource: current.bankTransactions.length ? "BANK_TRANSACTION" : undefined,
            evidenceKind: "BANK_TRANSFER",
            evidenceStatus: current.evidenceFiles.length ? current.evidenceStatus : "ALTERNATIVE",
            missingEvidenceReason: current.evidenceFiles.length ? current.missingEvidenceReason : "법인 체크카드 통장 건별출금 내역으로 결제 확인",
          };
        }
        return {
          ...nextState,
          bankTransactionId: "",
          bankTransactions: [],
          cardReconciliationStatus: current.cardTransactionId ? "MATCHED" : "PENDING",
          cardSettlementMode: "CARD_BILLING",
          cardVerificationSource: current.cardTransactionId ? "CARD_TRANSACTION" : undefined,
          evidenceKind: current.cardTransactionId ? current.evidenceKind : "CARD_RECEIPT",
          evidenceStatus: current.cardTransactionId ? current.evidenceStatus : "QUALIFIED",
        };
      }

      if (key === "bankTransactions" && Array.isArray(value)) {
        const bankTransactions = value as ResolutionFormState["bankTransactions"];
        const hasBankLinks = bankTransactions.length > 0;
        return {
          ...nextState,
          bankTransactionId: "",
          bankTransactions,
          cardReconciliationStatus: hasBankLinks ? "MATCHED" : "PENDING",
          cardSettlementMode: "BANK_DIRECT",
          cardVerificationSource: hasBankLinks ? "BANK_TRANSACTION" : undefined,
        };
      }

      if (key === "cardTransactionId" && typeof value === "string") {
        const transaction = formOptions.cardTransactions.find((candidate) => candidate.id === value);
        if (!transaction) return { ...nextState, cardLastFour: "", cardReconciliationStatus: "PENDING", cardVerificationSource: undefined };
        const expenseDate = transaction.approvedAt.slice(0, 10);
        const category = isTaxiCardTransaction(transaction) ? "택시" : current.quickExpenseCategory;
        const isTransport = category === "택시" || category === "주차" || category === "통행료";
        const amount = String(transaction.amount);
        return {
          ...nextState,
          accountAllocations: [createAccountAllocation({ accountTitle: isTransport ? "여비교통비" : "운영비", amount, budgetItem: isTransport ? "운영비 > 여비교통비" : "", description: `${transaction.merchantName} 법인카드 사용` })],
          accountingDate: expenseDate,
          actualExpenseDate: expenseDate,
          actualUsedAmount: amount,
          cardTransactionId: transaction.id,
          cardLastFour: transaction.cardLastFour,
          cardReconciliationStatus: "MATCHED",
          cardSettlementMode: "CARD_BILLING",
          cardVerificationSource: "CARD_TRANSACTION",
          evidenceKind: "OTHER_ALTERNATIVE",
          evidenceStatus: "ALTERNATIVE",
          expenseBurdenType: "CORPORATE_CARD",
          expenseTiming: "REIMBURSEMENT",
          missingEvidenceReason: `공용 법인카드 승인내역으로 대체${transaction.approvalNo ? ` · 승인번호 ${transaction.approvalNo}` : ""}`,
          operationExpenseDetail: isTransport ? "여비교통비" : current.operationExpenseDetail,
          plannedPaymentDate: expenseDate,
          quickEntryMode: "BUDGET_DIRECT",
          quickPaymentMethod: "CORPORATE_CARD",
          quickExpenseCategory: category,
          reason: current.reason.trim() || `업무 목적 ${category} 비용 · ${transaction.cardName} 승인내역`,
          singleItems: [createSingleExpenseItem({ itemName: `${transaction.merchantName} ${category}비`, taxCategory: "NO_VAT", unitPrice: amount })],
          subject: `${currentDateLabel(expenseDate)} 업무용 ${category}비`,
          vendorName: transaction.merchantName || "법인카드 사용처 미확인",
        };
      }

      if (key === "quickExpenseCategory" && typeof value === "string" && current.quickEntryMode === "BUDGET_DIRECT" && current.quickPaymentMethod === "CORPORATE_CARD") {
        const isTransport = value === "택시" || value === "주차" || value === "통행료";
        return {
          ...nextState,
          accountAllocations: current.accountAllocations.map((allocation, index) => index === 0 && isTransport ? { ...allocation, accountTitle: "여비교통비", budgetItem: "운영비 > 여비교통비" } : allocation),
          operationExpenseDetail: isTransport ? "여비교통비" : current.operationExpenseDetail,
          reason: `업무 목적 ${value} 비용 · 공용 법인카드 결제`,
          subject: `${currentDateLabel(current.actualExpenseDate)} 업무용 ${value}비`,
        };
      }

      if (["accountHolder", "paymentAccountNo", "paymentBank"].includes(key)) {
        nextState.paymentTargetId = "manual";
      }

      if (key === "evidenceType" && typeof value === "string") {
        nextState.evidenceFiles = current.evidenceFiles.map((file) => ({
          ...file,
          evidenceType: value,
          ocrStatus: file.ocrData.normalizedEvidenceType ? "CONFIRMED" : file.ocrStatus,
        }));
      }

      if (key === "resolutionMode") {
        nextState.resolutionType = value === "PROJECT_BULK" ? "BATCH" : "SINGLE";
        if (value === "SINGLE" && nextState.inputMethod === "EXCEL") nextState.inputMethod = "MANUAL";
      }

      if (key === "expenseTiming") {
        nextState.paymentFlowType = value === "ADVANCE" ? "사전결의" : value === "REIMBURSEMENT" ? "사후정산" : "선지급";
      }

      if (key === "originalResolutionId" && typeof value === "string") {
        const original = resolutions.find((resolution) => resolution.id === value);
        const facts = getEmployeeAdvanceSourceFacts(original);
        nextState.advancePaidAt = facts.advancePaidAt;
        nextState.advancePaidAmount = facts.advancePaidAmount;
        if (original) {
          nextState.projectName = original.projectName;
        }
      }

      if (key === "projectName" && typeof value === "string" && (!current.subject.trim() || current.subject === current.projectName)) {
        nextState.subject = value;
      }

      if (key === "inputMethod" && value === "EVIDENCE_OCR" && current.resolutionType === "BATCH" && !current.evidenceFiles.length) {
        nextState.batchItems = [];
      }

      if (key === "budgetItem" && typeof value === "string" && current.accountAllocations.length === 1) {
        nextState.accountAllocations = current.accountAllocations.map((allocation) => ({
          ...allocation,
          accountTitle: value.split(" > ")[0] || allocation.accountTitle,
          budgetItem: value,
        }));
        nextState.budgetRecommendation = null;
      }

      if (key === "resolutionMode") {
        if (nextState.resolutionType === "BATCH" && nextState.inputMethod === "EVIDENCE_OCR" && !nextState.evidenceFiles.length) {
          return { ...nextState, batchItems: [] };
        }
        return nextState;
      }
      return nextState;
    });
  }

  function updateBatchItem(itemNo: number, key: keyof BatchExpenseItem, value: string) {
    setFormState((current) => ({
      ...current,
      batchItems: reindexBatchItems(
        current.batchItems.map((item) => {
          if (item.itemNo !== itemNo) return item;
          const profile = key === "budgetItem" ? initialBudgetProfiles[value] : undefined;
          return calculateBatchExpenseItem({
                ...item,
                [key]: value,
                allocatedBudget: profile?.monthlyBudgetAmount ?? item.allocatedBudget,
                executedAmount: profile ? profile.usedAmount + (profile.reservedAmount ?? (profile.pendingApprovalAmount + profile.paymentWaitingAmount)) : item.executedAmount,
              });
        }),
      ),
    }));
  }

  function addBatchItem() {
    setFormState((current) => ({
      ...current,
      batchItems: reindexBatchItems([...current.batchItems, createBatchExpenseItem(current.batchItems.length + 1)]),
    }));
  }

  function updateSingleItem(id: string, key: keyof SingleExpenseItem, value: string) {
    setFormState((current) => {
      const items = current.singleItems.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [key]: key === "vatAmount" ? toNumber(value) : value } as SingleExpenseItem;
        return calculateSingleExpenseItem(updated, key === "quantity" || key === "unitPrice" || key === "taxCategory");
      });
      const summary = summarizeSingleExpenseItems(items);
      return {
        ...current,
        accountAllocations: current.accountAllocations.length === 1
          ? current.accountAllocations.map((allocation) => ({ ...allocation, amount: String(summary.totalAmount) }))
          : current.accountAllocations,
        singleItems: summary.items,
        supplyAmount: String(summary.supplyAmount),
        vat: String(summary.vatAmount),
      };
    });
  }

  function addSingleItem() {
    setFormState((current) => ({ ...current, singleItems: [...current.singleItems, createSingleExpenseItem()] }));
  }

  function deleteSingleItem(id: string) {
    setFormState((current) => {
      const items = current.singleItems.length > 1 ? current.singleItems.filter((item) => item.id !== id) : current.singleItems;
      const summary = summarizeSingleExpenseItems(items);
      return {
        ...current,
        accountAllocations: current.accountAllocations.length === 1
          ? current.accountAllocations.map((allocation) => ({ ...allocation, amount: String(summary.totalAmount) }))
          : current.accountAllocations,
        singleItems: summary.items,
        supplyAmount: String(summary.supplyAmount),
        vat: String(summary.vatAmount),
      };
    });
  }

  function updateAccountAllocation(id: string, key: keyof AccountAllocation, value: string) {
    setFormState((current) => {
      const targetIndex = current.accountAllocations.findIndex((allocation) => allocation.id === id);
      const accountAllocations = current.accountAllocations.map((allocation) => {
        if (allocation.id !== id) return allocation;
        if (key === "accountTitle") {
          const keepsBudgetItem = allocation.budgetItem.startsWith(`${value} >`);
          return { ...allocation, accountTitle: value, budgetItem: keepsBudgetItem ? allocation.budgetItem : "" };
        }
        return { ...allocation, [key]: value };
      });
      const primaryAllocation = accountAllocations[0];
      return {
        ...current,
        accountAllocations,
        budgetItem: targetIndex === 0 && (key === "budgetItem" || key === "accountTitle") ? primaryAllocation.budgetItem : current.budgetItem,
        budgetRecommendation: key === "budgetItem" || key === "accountTitle" ? null : current.budgetRecommendation,
      };
    });
  }

  function addAccountAllocation() {
    setFormState((current) => ({
      ...current,
      accountAllocations: [...current.accountAllocations, createAccountAllocation({ amount: "0" })],
    }));
  }

  function deleteAccountAllocation(id: string) {
    setFormState((current) => ({
      ...current,
      accountAllocations: current.accountAllocations.length > 1
        ? current.accountAllocations.filter((allocation) => allocation.id !== id)
        : current.accountAllocations,
    }));
  }

  function deleteBatchItem(itemNo: number) {
    setFormState((current) => ({
      ...current,
      batchItems: reindexBatchItems(current.batchItems.filter((item) => item.itemNo !== itemNo)),
    }));
  }

  function copyBatchItem(itemNo: number) {
    setFormState((current) => {
      const target = current.batchItems.find((item) => item.itemNo === itemNo);
      if (!target) {
        return current;
      }

      return {
        ...current,
        batchItems: reindexBatchItems([
          ...current.batchItems,
          {
            ...target,
            evidenceFileName: "",
            id: `batch-item-copy-${Date.now()}`,
            itemTitle: `${target.itemTitle} 복사`,
          },
        ]),
      };
    });
  }

  async function attachBatchEvidence(itemNo: number, file: File) {
    const item = formState.batchItems.find((entry) => entry.itemNo === itemNo);
    if (!item) return;
    setIsEvidenceUploading(true);
    setEvidenceUploadError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("resolutionNo", formState.resolutionNo);
      formData.set("evidenceType", item.evidenceType || formState.evidenceType);
      const uploaded = { ...unwrapEvidenceUploadResult(await uploadEvidenceRequest(formData)), itemId: item.id };
      setFormState((current) => ({
        ...current,
        batchItems: current.batchItems.map((entry) => entry.itemNo === itemNo ? {
          ...entry,
          evidenceFileName: uploaded.fileName,
          evidenceId: uploaded.id,
          evidenceKind: mapEvidenceTypeToComplianceKind(uploaded.evidenceType),
          evidenceStatus: "GENERAL",
        } : entry),
        evidenceFiles: [...current.evidenceFiles, uploaded],
      }));
    } catch (error) {
      setEvidenceUploadError(getEvidenceUploadErrorMessage(error));
    } finally {
      setIsEvidenceUploading(false);
    }
  }

  function reviewBatchBudget(itemNo: number) {
    setFormState((current) => ({
      ...current,
      batchItems: reindexBatchItems(current.batchItems.map((item) => (item.itemNo === itemNo ? calculateBatchExpenseItem(item) : item))),
    }));
  }

  function downloadBatchImportTemplate() {
    downloadTextFile({
      content: buildExpenseResolutionImportTemplateCsv(),
      fileName: "프로젝트_일괄_지출결의_입력템플릿.csv",
      mimeType: "text/csv;charset=utf-8",
    });
  }

  async function importBatchExpenseFile(file: File) {
    setBatchImportFileName(file.name);
    setBatchImportError("");
    try {
      const { readExpenseResolutionImportFile } = await import("./expense-resolution-file");
      const result = parseExpenseResolutionImportRows(await readExpenseResolutionImportFile(file));
      setBatchImportResult(result);
      if (result.importedRows.length) {
        setFormState((current) => ({
          ...current,
          batchItems: result.importedRows.map((row, index) =>
            createBatchExpenseItem(index + 1, {
              accountTitle: row.accountTitle,
              allocatedBudget: row.allocatedBudget,
              budgetItem: row.budgetItem,
              evidenceType: row.evidenceType,
              executedAmount: row.executedAmount,
              expenseDate: row.expenseDate,
              expenseType: expenseResolutionTypeOptions.includes(row.expenseType as ExpenseResolutionType)
                ? (row.expenseType as ExpenseResolutionType)
                : "운영비",
              itemTitle: row.itemTitle,
              memo: row.memo,
              overBudgetReason: row.overBudgetReason,
              paymentMethod: row.paymentMethod as PaymentMethod,
              supplyAmount: String(row.supplyAmount),
              vatAmount: String(row.vatAmount),
              vendorName: row.vendorName,
            }),
          ),
        }));
      }
    } catch {
      setBatchImportResult(null);
      setBatchImportError("파일을 읽지 못했습니다. 첫 번째 시트와 템플릿 헤더를 확인해 주세요.");
    }
  }

  async function uploadEvidenceFiles(files: File[]) {
    setEvidenceUploadError("");
    const remainingSlots = Math.max(0, 10 - formState.evidenceFiles.length);
    if (files.length > remainingSlots) {
      setEvidenceUploadError(`증빙은 최대 10개까지 등록할 수 있습니다. 현재 ${formState.evidenceFiles.length}개가 등록되어 있습니다.`);
      return 0;
    }
    setIsEvidenceUploading(true);
    let uploadedCount = 0;
    let cursor = 0;
    const errors: string[] = [];
    try {
      async function worker() {
        while (cursor < files.length) {
          const file = files[cursor++];
          try {
            const formData = new FormData();
            formData.set("file", file);
            formData.set("resolutionNo", formState.resolutionNo);
            formData.set("evidenceType", formState.evidenceType);
            const attachment = unwrapEvidenceUploadResult(await uploadEvidenceRequest(formData));
            uploadedCount += 1;
            setFormState((current) => {
              const withAttachment = { ...current, evidenceFiles: [...current.evidenceFiles, attachment], evidenceType: attachment.evidenceType as EvidenceType };
              return current.inputMethod === "EVIDENCE_OCR" && !attachment.ocrJobId && hasExtractedEvidenceData(attachment.ocrData)
                ? applyEvidenceOcrToFormState(withAttachment, attachment.id)
                : withAttachment;
            });
          } catch (error) {
            errors.push(`${file.name}: ${getEvidenceUploadErrorMessage(error)}`);
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, files.length) }, () => worker()));
      if (errors.length) setEvidenceUploadError(`${uploadedCount}개 업로드 완료, ${errors.length}개 실패 · ${errors.join(" / ")}`);
      return uploadedCount;
    } finally {
      setIsEvidenceUploading(false);
    }
  }

  async function removeEvidenceFile(id: string) {
    const attachment = formState.evidenceFiles.find((file) => file.id === id);
    if (!attachment) return;
    setEvidenceUploadError("");
    try {
      if (deleteEvidence) await deleteEvidence(attachment.storagePath);
      setFormState((current) => {
        const evidenceFiles = current.evidenceFiles.filter((file) => file.id !== id);
        const settlement = calculateBatchEvidenceSettlement({ advancePaidAmount: toNumber(current.advancePaidAmount), evidenceFiles });
        return {
          ...current,
          actualUsedAmount: current.resolutionType === "BATCH" && current.expenseTiming === "SETTLEMENT" ? String(settlement.confirmedReceiptTotal) : current.actualUsedAmount,
          batchItems: current.batchItems.filter((item) => item.evidenceId !== id),
          evidenceFiles,
          settlementDifferenceAction: settlement.action === "REFUND_REQUIRED" ? "환급필요" : settlement.action === "ADDITIONAL_PAYMENT" ? "추가지급" : "차액없음",
        };
      });
    } catch (error) {
      setEvidenceUploadError(error instanceof Error ? error.message : "증빙파일을 삭제하지 못했습니다.");
    }
  }

  async function applyEvidenceOcr(id: string) {
    const evidence = formState.evidenceFiles.find((file) => file.id === id);
    setFormState((current) => applyEvidenceOcrToFormState(current, id));
    if (evidence) await registerOcrBusinessPartner(evidence);
  }

  async function registerOcrBusinessPartner(evidence: ExpenseEvidenceAttachment) {
    const ocr = evidence.ocrData;
    if (!ensureBusinessPartnerFromOcr || !ocr.issuer || !ocr.issuerBusinessNumber) {
      if (ocr.issuer && !ocr.issuerBusinessNumber) setVendorRegistrationNotice("사업자등록번호를 확인하면 거래처를 자동등록할 수 있습니다.");
      return;
    }
    try {
      const result = await ensureBusinessPartnerFromOcr({
        address: ocr.issuerAddress,
        businessCategory: ocr.issuerBusinessType,
        businessItem: ocr.issuerBusinessCategory,
        evidenceId: evidence.id,
        firstTransactionDate: ocr.documentDate,
        name: ocr.issuer,
        phone: ocr.issuerContact,
        registrationNo: ocr.issuerBusinessNumber,
        representative: ocr.issuerRepresentative,
        resolutionNo: formState.resolutionNo,
      });
      setFormState((current) => ({ ...current, vendorId: result.partner.id }));
      setVendorRegistrationNotice(result.status === "CREATED"
        ? `신규 거래처 '${result.partner.name}'을 기준정보에 자동등록했습니다.`
        : `등록된 거래처 '${result.partner.name}'을 연결했습니다.`);
    } catch (error) {
      setVendorRegistrationNotice(error instanceof Error ? error.message : "거래처 자동등록에 실패했습니다.");
    }
  }
  const registerCompletedOcrPartner = useEffectEvent(registerOcrBusinessPartner);

  async function retryEvidenceFile(id: string) {
    const attachment = formState.evidenceFiles.find((file) => file.id === id);
    if (!attachment?.ocrJobId || !retryEvidenceOcrJob) return;
    setEvidenceUploadError("");
    try {
      await retryEvidenceOcrJob(attachment.ocrJobId);
      setEvidenceOcrProgress((current) => {
        const next = { ...current };
        delete next[attachment.ocrJobId!];
        return next;
      });
      setFormState((current) => ({
        ...current,
        evidenceFiles: current.evidenceFiles.map((file) => file.id === id ? { ...file, ocrData: {}, ocrStatus: "REVIEW_REQUIRED" as const } : file),
      }));
    } catch (error) {
      setEvidenceUploadError(error instanceof Error ? error.message : "OCR 재분석을 시작하지 못했습니다.");
    }
  }

  function applyEvidenceOcrToFormState(current: ResolutionFormState, id: string): ResolutionFormState {
    const evidence = current.evidenceFiles.find((file) => file.id === id);
    if (!evidence) return current;
    const ocr = normalizeEvidenceVendorFields(evidence.ocrData);
    const detectedEvidenceType = ocr.normalizedEvidenceType ?? evidence.evidenceType ?? current.evidenceType;
    const evidenceKind = current.evidenceKind === "NONE" ? mapEvidenceTypeToComplianceKind(detectedEvidenceType) : current.evidenceKind;
    const evidenceStatus = current.evidenceStatus === "NONE" ? getDefaultEvidenceStatus(evidenceKind) : current.evidenceStatus;
    const ocrItemNames = ocr.items?.map((item) => item.itemName).filter(Boolean) ?? [];
    const budgetRecommendation = recommendExpenseBudget({
      itemName: ocrItemNames.join(" ") || ocr.itemName,
      reason: current.reason,
      vendorBusinessCategory: ocr.issuerBusinessCategory,
      vendorBusinessType: ocr.issuerBusinessType,
      vendorName: ocr.issuer,
    });
    const expenseDetailRecommendation = recommendOperatingExpenseDetail(formOptions.expenseDetails, {
      evidenceText: ocr.recognizedText,
      itemName: ocrItemNames.join(" ") || ocr.itemName,
      reason: current.reason,
      subject: current.subject,
      vendorBusinessCategory: ocr.issuerBusinessCategory,
      vendorBusinessType: ocr.issuerBusinessType,
      vendorName: ocr.issuer,
    });
    const next = {
      ...current,
      budgetItem: expenseDetailSelectionRef.current === "AUTO" ? expenseDetailRecommendation?.detail.budgetItem ?? budgetRecommendation?.budgetItem ?? current.budgetItem : current.budgetItem,
      budgetRecommendation: expenseDetailSelectionRef.current === "AUTO" ? budgetRecommendation : current.budgetRecommendation,
      budgetPeriod: ocr.documentDate?.slice(0, 7) ?? current.budgetPeriod,
      plannedPaymentDate: ocr.documentDate ?? current.plannedPaymentDate,
      evidenceKind,
      evidenceStatus,
      missingEvidenceReason: evidenceStatus === "DEFICIENT" || evidenceStatus === "NONE" ? current.missingEvidenceReason : "",
      evidenceFiles: current.evidenceFiles.map((file) => file.id === id ? { ...file, ocrStatus: "CONFIRMED" as const } : file),
      vendorName: ocr.issuer ? normalizeVendorName(ocr.issuer) : current.vendorName,
      evidenceType: transactionEvidenceTypeOptions.includes(ocr.normalizedEvidenceType as EvidenceType)
        ? ocr.normalizedEvidenceType as EvidenceType
        : current.evidenceType,
      vendorAddress: ocr.issuerAddress ?? current.vendorAddress,
      vendorBusinessCategory: ocr.issuerBusinessCategory ?? current.vendorBusinessCategory,
      vendorBusinessNumber: ocr.issuerBusinessNumber ?? current.vendorBusinessNumber,
      vendorBusinessType: ocr.issuerBusinessType ?? current.vendorBusinessType,
      vendorContact: ocr.issuerContact ?? current.vendorContact,
      vendorRepresentative: ocr.issuerRepresentative ?? current.vendorRepresentative,
      expenseDetailId: expenseDetailSelectionRef.current === "AUTO" ? expenseDetailRecommendation?.detail.id ?? current.expenseDetailId : current.expenseDetailId,
      operationExpenseDetail: expenseDetailSelectionRef.current === "AUTO" ? expenseDetailRecommendation?.detail.name ?? current.operationExpenseDetail : current.operationExpenseDetail,
      accountAllocations: expenseDetailSelectionRef.current === "AUTO" && budgetRecommendation && current.accountAllocations.length === 1
        ? current.accountAllocations.map((allocation) => ({
            ...allocation,
            accountTitle: budgetRecommendation.accountTitle,
            budgetItem: budgetRecommendation.budgetItem,
            description: ocr.itemName ?? allocation.description,
          }))
        : current.accountAllocations,
    };
    if (current.resolutionType === "BATCH") {
      const existingItems = current.batchItems.filter((item) => item.evidenceId !== id);
      const batchItems = reindexBatchItems([...existingItems, createBatchExpenseItemFromEvidence(evidence, existingItems.length + 1, current.reason)]);
      const settlement = calculateBatchEvidenceSettlement({ advancePaidAmount: toNumber(current.advancePaidAmount), evidenceFiles: next.evidenceFiles });
      return {
        ...next,
        actualUsedAmount: current.expenseTiming === "SETTLEMENT" ? String(settlement.confirmedReceiptTotal) : current.actualUsedAmount,
        batchItems,
        settlementDifferenceAction: settlement.action === "REFUND_REQUIRED" ? "환급필요" : settlement.action === "ADDITIONAL_PAYMENT" ? "추가지급" : "차액없음",
      };
    }
    if (!current.singleItems.length) return next;

    const items = buildSingleExpenseItemsFromOcr(ocr, current.singleItems);
    const summary = summarizeSingleExpenseItems(items);
    const recommendedAllocations = items.map((item) => ({
      item,
      recommendation: recommendExpenseBudget({
        itemName: item.itemName,
        reason: current.reason,
        vendorBusinessCategory: ocr.issuerBusinessCategory,
        vendorBusinessType: ocr.issuerBusinessType,
        vendorName: ocr.issuer,
      }),
    })).filter((entry) => entry.recommendation);
    const allocationGroups = new Map<string, AccountAllocation>();
    for (const { item, recommendation } of recommendedAllocations) {
      if (!recommendation) continue;
      const existing = allocationGroups.get(recommendation.budgetItem);
      allocationGroups.set(recommendation.budgetItem, existing
        ? { ...existing, amount: String(toNumber(existing.amount) + item.totalAmount), description: `${existing.description}, ${item.itemName}` }
        : createAccountAllocation({ accountTitle: recommendation.accountTitle, amount: String(item.totalAmount), budgetItem: recommendation.budgetItem, description: item.itemName }));
    }
    const allocations = allocationGroups.size
      ? Array.from(allocationGroups.values())
      : next.accountAllocations.length === 1
        ? next.accountAllocations.map((allocation) => ({ ...allocation, amount: String(summary.totalAmount) }))
        : next.accountAllocations;
    return {
      ...next,
      accountAllocations: allocations,
      singleItems: summary.items,
      supplyAmount: String(summary.supplyAmount),
      vat: String(summary.vatAmount),
    };
  }

  useEffect(() => {
    if (!isCreateModalOpen || !getEvidenceOcrJob || !pendingEvidenceJobIds) return;
    const fetchOcrJob = getEvidenceOcrJob;
    let cancelled = false;
    const jobIds = pendingEvidenceJobIds.split(",");
    async function pollJobs() {
      await Promise.all(jobIds.map(async (id) => {
        try {
          const progress = await fetchOcrJob(id);
          if (cancelled) return;
          setEvidenceOcrProgress((current) => ({ ...current, [id]: progress }));
          if (progress.status === "COMPLETED") {
            setFormState((current) => {
              const hasResult = hasExtractedEvidenceData(progress.resultData);
              const classifiedType = evidenceTypeOptions.includes(progress.resultData.normalizedEvidenceType as EvidenceType)
                ? progress.resultData.normalizedEvidenceType as EvidenceType
                : current.evidenceType;
              const transactionEvidenceType = transactionEvidenceTypeOptions.includes(classifiedType)
                ? classifiedType
                : current.evidenceType;
              const updated = {
                ...current,
                evidenceType: transactionEvidenceType,
                evidenceFiles: current.evidenceFiles.map((file) => file.ocrJobId === id ? {
                  ...file,
                  evidenceType: classifiedType,
                  ocrData: progress.resultData,
                  ocrStatus: hasResult ? "EXTRACTED" as const : "FAILED" as const,
                } : file),
              };
              return hasResult && current.inputMethod === "EVIDENCE_OCR"
                ? applyEvidenceOcrToFormState(updated, id)
                : updated;
            });
            const completedEvidence = formState.evidenceFiles.find((file) => file.ocrJobId === id);
            if (completedEvidence && hasExtractedEvidenceData(progress.resultData)) {
              void registerCompletedOcrPartner({ ...completedEvidence, ocrData: progress.resultData });
            }
          } else if (progress.status === "FAILED") {
            setFormState((current) => ({
              ...current,
              evidenceFiles: current.evidenceFiles.map((file) => file.ocrJobId === id ? { ...file, ocrStatus: "FAILED" as const } : file),
            }));
          }
        } catch (error) {
          if (!cancelled) setEvidenceUploadError(error instanceof Error ? error.message : "OCR 진행 상태를 확인하지 못했습니다.");
        }
      }));
    }
    void pollJobs();
    const timer = window.setInterval(() => void pollJobs(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  // applyEvidenceOcrToFormState reads the current automatic/manual selection ref and must not restart OCR polling on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.evidenceFiles, getEvidenceOcrJob, isCreateModalOpen, pendingEvidenceJobIds]);

  async function openEvidenceOriginal(storagePath: string) {
    if (!createEvidenceDownloadUrl) {
      setEvidenceUploadError("증빙 원본 열기 기능이 연결되지 않았습니다.");
      return;
    }
    try {
      const url = await createEvidenceDownloadUrl(storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setEvidenceUploadError(error instanceof Error ? error.message : "증빙 원본을 열지 못했습니다.");
    }
  }

  function updatePaymentForm<K extends keyof PaymentFormState>(key: K, value: PaymentFormState[K]) {
    setPaymentForm((current) => ({ ...current, [key]: value }));
  }

  function openPaymentModal(resolution: ManagedExpenseResolution) {
    setPaymentTargetId(resolution.id);
    setSelectedDetailId(null);
    setPaymentForm({
      actualPaidAmount: String(resolution.totalPaymentAmount),
      accountHolder: resolution.accountHolder,
      batchPaymentMode: resolution.batchPaymentMode,
      paidAt: getCurrentDateIso(),
      paymentBank: resolution.paymentBank,
      paymentAccountNo: resolution.paymentAccountNo,
      paymentMemo: "",
      paymentMethod: "계좌이체",
    });
  }

  async function saveResolution(mode: "draft" | "approval-request") {
    if (savingResolution.current) return;
    if (viewer && mode === "approval-request") {
      const binding = resolutions.find(r => r.id === editingResolutionId)?.authorization;
      if (!binding?.author_user_id || !binding.steps.length) { setSaveError("먼저 초안을 저장하고 작성자·결재선 계정 연결을 확인한 뒤 승인요청해주세요."); return; }
    }
    const batchSummary = summarizeBatchItems(formState.batchItems);
    const isBatch = formState.resolutionType === "BATCH";
    const totalPaymentAmount = isBatch ? batchSummary.totalAmount : formTotalAmount;
    const editingResolution = editingResolutionId ? resolutions.find((resolution) => resolution.id === editingResolutionId) : undefined;
    const itemBudgetProfiles = isBatch
      ? batchSummary.items.map((item) => resolveBudgetProfile(item.budgetItem, formState.budgetPeriod, initialBudgetProfiles))
      : [];
    const resolutionBudgetProfile = isBatch
      ? itemBudgetProfiles.length > 0
        && itemBudgetProfiles.every((profile) => profile?.budgetId && profile.budgetId === itemBudgetProfiles[0]?.budgetId)
        ? itemBudgetProfiles[0]
        : undefined
      : resolveBudgetProfile(formState.budgetItem, formState.budgetPeriod, initialBudgetProfiles);
    const linkedApproval = formOptions.approvalDocuments.find((document) => document.id === formState.approvalDocumentId);
    const directPolicy = evaluateDirectExpensePolicy({ amount: totalPaymentAmount, budgetItem: formState.budgetItem, budgetOverReason: formState.budgetOverReason, expenseKind: formState.expenseKind, relatedContract: formState.relatedContract, relatedMeeting: formState.relatedMeeting, subject: formState.subject, reason: formState.reason, memo: formState.memo, source: formState.creationSource }, formOptions.directExpenseSettings);
    if (mode === "approval-request") {
      if (formState.expenseTiming === "SETTLEMENT") {
        const saved = resolutions.find(resolution => resolution.id === editingResolutionId);
        const changed = !saved || saved.originalResolutionId !== formState.originalResolutionId || saved.advancePaidAmount !== toNumber(formState.advancePaidAmount) || saved.advancePaidAt !== formState.advancePaidAt;
        if (changed) {
          const error = validateEmployeeAdvanceSelection(resolutions.find(resolution => resolution.id === formState.originalResolutionId), { advancePaidAmount: toNumber(formState.advancePaidAmount), advancePaidAt: formState.advancePaidAt });
          if (error) { setSaveError(error); return; }
        }
      }
      if (directPolicy.decision === "REQUIRED" && (!linkedApproval || linkedApproval.approvalStatus !== "APPROVED")) { setSaveError(`승인된 기안을 연결해야 합니다. ${directPolicy.reasons.join(" ")}`); return; }
      if (formState.creationSource === "APPROVAL_LINKED" && !linkedApproval) { setSaveError("승인 완료된 기안을 선택해주세요."); return; }
      if (linkedApproval && totalPaymentAmount > linkedApproval.amount) { setSaveError(`지출금액이 기안 승인금액 ${linkedApproval.amount.toLocaleString("ko-KR")}원을 초과했습니다.`); return; }
      if (formState.creationSource === "DIRECT" && (!formState.approvalSkipReason.trim() || (formState.approvalSkipReason === "기타" && !formState.approvalSkipReasonDetail.trim()))) { setSaveError("기안 생략 사유를 입력해주세요."); return; }
      if (isBatch && formState.expenseTiming === "SETTLEMENT" && formState.inputMethod === "EVIDENCE_OCR") {
        const evidenceSettlement = calculateBatchEvidenceSettlement({ advancePaidAmount: toNumber(formState.advancePaidAmount), evidenceFiles: formState.evidenceFiles });
        const settlementErrors = [...evidenceSettlement.errors];
        if (Math.abs(batchSummary.totalAmount - evidenceSettlement.confirmedReceiptTotal) > 0.5) settlementErrors.push("일괄 지출내역 합계와 확정 영수증 합계가 일치하지 않습니다.");
        if (Math.abs(toNumber(formState.actualUsedAmount) - evidenceSettlement.confirmedReceiptTotal) > 0.5) settlementErrors.push("실제 사용액과 확정 영수증 합계가 일치하지 않습니다.");
        if (settlementErrors.length) {
          setSaveError(settlementErrors.join(" "));
          return;
        }
      }
      const validation = validateExpenseResolutionWorkflow({
        ...formState,
        actualUsedAmount: toNumber(formState.actualUsedAmount),
        advancePaidAmount: toNumber(formState.advancePaidAmount),
        accountAllocationTotal: isBatch ? undefined : accountAllocationTotal,
        evidenceCount: formState.evidenceFiles.length,
        invalidItemCount: isBatch ? undefined : formState.singleItems.filter((item) => !item.itemName.trim() || toNumber(item.quantity) <= 0 || toNumber(item.unitPrice) < 0).length,
        itemCount: isBatch ? batchSummary.itemCount : formState.singleItems.length,
        totalPaymentAmount,
      });
      if (validation.errors.length) {
        setSaveError(validation.errors.join(" "));
        return;
      }
    }
    const approvalStatus: ApprovalStatus = mode === "draft" || viewer ? "작성중" : "승인대기";
    let approvalPolicy: ExpenseApprovalPolicy;
    try { approvalPolicy = createExpenseApprovalPolicy(formState.approvalRecordKind, formState.originalApprovalDate, undefined, formState.originalApprovalReference); }
    catch (error) { setSaveError(error instanceof Error ? error.message : "결재 기준일을 확인해주세요."); return false; }
    const approvalRoute = buildExpenseApprovalRoute(formState.approvalRoute, approvalPolicy.referenceDate);
    if (approvalRoute.error) { setSaveError(approvalRoute.error); return false; }
    const firstApprover = approvalRoute.approvalLine[0];
    const isAlreadyPaid = formState.expenseTiming === "REIMBURSEMENT" && (formState.expenseBurdenType === "CORPORATE_CARD" || formState.expenseBurdenType === "ORGANIZATION_PAID");
    const usesAdvanceFields = formState.expenseTiming === "SETTLEMENT" || (formState.expenseTiming === "ADVANCE" && formState.executionMethod === "EMPLOYEE_ADVANCE");
    const approvalLine = approvalRoute.approvalLine.map((step, index) =>
      mode === "approval-request" && !viewer && index === 0 ? { ...step, status: "결재대기" as const } : step,
    );
    const pettyCashTransactions = formState.expenseKind === "PETTY_CASH_BATCH" || formState.expenseKind === "RECURRING_BATCH" ? formState.batchItems.map((item) => ({ accountTitle: item.accountTitle, amount: item.totalAmount, businessPurpose: item.businessPurpose || formState.reason || item.description, evidenceKind: item.evidenceKind, evidenceStatus: item.evidenceStatus, factConfirmationId: item.factConfirmationId, id: item.id, item: item.itemTitle, overrideReason: item.overBudgetReason, spender: item.actualSpender || formState.advancePayer || formState.author, transactionDate: item.expenseDate, vendor: item.vendorName })) : undefined;
    const compliance = validateExpenseCompliance({ beforeExpense: formState.expenseTiming === "ADVANCE", actualExpenseDate: formState.actualExpenseDate, bankTransactionId: formState.bankTransactionId || undefined, bankTransactionCount: formState.bankTransactions.length, evidenceKind: formState.evidenceKind, evidenceStatus: formState.evidenceStatus, expenseKind: formState.expenseKind, missingEvidenceReason: formState.missingEvidenceReason, pettyCashItems: pettyCashTransactions, postApprovalReason: formState.postApprovalReason });
    if (mode === "approval-request" && compliance.errors.length) { setSaveError(compliance.errors.join(" ")); return; }
    const nextResolution: ManagedExpenseResolution = {
      creationSource: formState.creationSource,
      approvalDocumentId: linkedApproval?.id,
      approvalDocumentNo: linkedApproval?.documentNo,
      approvalSkipReason: formState.creationSource === "DIRECT" ? (formState.approvalSkipReason === "기타" ? formState.approvalSkipReasonDetail.trim() : formState.approvalSkipReason) : undefined,
      directExpenseDecision: directPolicy.decision,
      directExpenseReasons: directPolicy.reasons,
      expenseKind: formState.expenseKind,
      accountingDate: formState.accountingDate,
      actualExpenseDate: formState.actualExpenseDate,
      draftedAt: new Date().toISOString(),
      isPostApproval: formState.expenseKind === "BANK_POST_APPROVAL" || formState.expenseTiming !== "ADVANCE",
      evidenceKind: formState.evidenceKind,
      evidenceStatus: formState.evidenceStatus,
      missingEvidenceReason: formState.missingEvidenceReason || undefined,
      bankTransactionId: formState.bankTransactionId || undefined,
      bankTransactions: formState.bankTransactions.length ? formState.bankTransactions : undefined,
      cardTransactionId: formState.cardTransactionId || undefined,
      cardLastFour: formState.cardLastFour || undefined,
      cardReconciliationStatus: formState.cardTransactionId || formState.cardSettlementMode === "BANK_DIRECT" && formState.bankTransactions.length
        ? "MATCHED"
        : formState.quickEntryMode === "BUDGET_DIRECT" && formState.quickPaymentMethod === "CORPORATE_CARD" ? "PENDING" : undefined,
      cardSettlementMode: formState.quickPaymentMethod === "CORPORATE_CARD" ? formState.cardSettlementMode : undefined,
      cardVerificationSource: formState.quickPaymentMethod === "CORPORATE_CARD" ? formState.cardVerificationSource : undefined,
      settlementRecipient: formState.expenseKind === "PERSONAL_REIMBURSEMENT" ? formState.settlementRecipient || formState.advancePayer : undefined,
      settlementCompletedAt: formState.expenseKind === "PERSONAL_REIMBURSEMENT" ? formState.settlementCompletedAt || undefined : undefined,
      settlementAmount: formState.expenseKind === "PERSONAL_REIMBURSEMENT" ? totalPaymentAmount : undefined,
      pettyCashTransactions,
      complianceWarnings: compliance.warnings,
      id: createExpenseResolutionInternalId(formState.resolutionNo),
      resolutionNo: formState.resolutionNo,
      subject: formState.subject.trim(),
      resolutionMode: formState.resolutionMode,
      resolutionType: formState.resolutionType,
      projectName: formState.projectName,
      createdAt: formState.createdAt,
      author: formState.author,
      plannedPaymentDate: formState.plannedPaymentDate,
      paymentFlowType: formState.paymentFlowType,
      expenseTiming: formState.expenseTiming,
      executionMethod: formState.executionMethod,
      expenseBurdenType: formState.expenseBurdenType,
      inputMethod: formState.inputMethod,
      expenseType: isBatch ? batchSummary.representativeExpenseType : formState.expenseType,
      operationExpenseDetail: formState.operationExpenseDetail,
      expenseDetailId: formState.expenseDetailId || undefined,
      budgetId: resolutionBudgetProfile?.budgetId,
      budgetMonth: resolutionBudgetProfile?.budgetId ? `${formState.budgetPeriod}-01` : undefined,
      budgetItem: isBatch ? "프로젝트 일괄 예산" : formState.budgetItem,
      budgetOverReason: formState.budgetOverReason,
      vendorName: isBatch ? batchSummary.representativeVendorName : formState.vendorName || "거래처 미입력",
      vendorId: formState.vendorId || undefined,
      representativeVendorName: isBatch ? batchSummary.representativeVendorName : formState.vendorName || "거래처 미입력",
      vendorAddress: formState.vendorAddress,
      vendorBusinessCategory: formState.vendorBusinessCategory,
      vendorBusinessNumber: formState.vendorBusinessNumber,
      vendorBusinessType: formState.vendorBusinessType,
      vendorContact: formState.vendorContact,
      vendorRepresentative: formState.vendorRepresentative,
      representativeAccountTitle: isBatch ? batchSummary.representativeAccountTitle : new Set(formState.accountAllocations.map((allocation) => allocation.accountTitle)).size > 1 ? "복합계정" : formState.accountAllocations[0]?.accountTitle ?? formState.expenseType,
      itemCount: isBatch ? batchSummary.itemCount : formSingleSummary.items.length,
      overBudgetItemCount: isBatch ? batchSummary.overBudgetItemCount : formBudgetSnapshot.remainingBudgetAmount < 0 ? 1 : 0,
      totalOverBudgetAmount: isBatch ? batchSummary.totalOverBudgetAmount : Math.max(0, Math.abs(formBudgetSnapshot.remainingBudgetAmount)),
      batchPaymentMode: formState.batchPaymentMode,
      voucherCreationMode: formState.voucherCreationMode,
      expenseItems: isBatch ? batchSummary.items : [],
      singleItems: isBatch ? [] : formSingleSummary.items,
      accountAllocations: isBatch ? [] : formState.accountAllocations,
      paymentBank: isAlreadyPaid ? "" : formState.paymentBank,
      paymentAccountNo: isAlreadyPaid ? "" : formState.paymentAccountNo,
      accountHolder: isAlreadyPaid ? "" : formState.accountHolder,
      paymentTargetId: isAlreadyPaid ? undefined : formState.paymentTargetId,
      supplyAmount: isBatch ? batchSummary.totalSupplyAmount : formSingleSummary.supplyAmount,
      vat: isBatch ? batchSummary.totalVatAmount : formSingleSummary.vatAmount,
      totalPaymentAmount: isBatch ? batchSummary.totalAmount : formTotalAmount,
      reason: formState.reason,
      relatedContract: formState.relatedContract,
      relatedMeeting: formState.relatedMeeting,
      evidenceFiles: formState.evidenceFiles,
      evidenceMaterials: formState.evidenceFiles.map((file) => file.fileName),
      evidenceAttached: formState.evidenceFiles.length > 0,
      evidenceType: formState.evidenceType,
      approvalLine,
      approvalPolicy,
      approvalParticipants: approvalRoute.participants,
      approvalRoute: formState.approvalRoute,
      approvalStatus,
      currentApprover: mode === "approval-request" && !viewer ? getApproverLabel(firstApprover) : undefined,
      paymentStatus: isAlreadyPaid && !viewer ? "지급완료" : "지급전",
      settlementStatus: formState.expenseKind === "PERSONAL_REIMBURSEMENT" ? (formState.settlementCompletedAt ? "정산완료" : "정산대기") : formState.expenseTiming === "SETTLEMENT" ? "정산대기" : "정산없음",
      advancePaidAt: usesAdvanceFields ? formState.advancePaidAt : undefined,
      advancePayer: usesAdvanceFields || formState.expenseTiming === "REIMBURSEMENT" ? formState.advancePayer : undefined,
      advancePaymentMethod: usesAdvanceFields ? formState.advancePaymentMethod : undefined,
      advancePaidAmount: usesAdvanceFields ? toNumber(formState.advancePaidAmount) : undefined,
      actualUsedAmount: formState.expenseTiming !== "ADVANCE" ? toNumber(formState.actualUsedAmount || String(formTotalAmount)) : undefined,
      settlementDifference: formState.expenseTiming === "SETTLEMENT" ? settlementDifference : undefined,
      settlementDifferenceAction: formState.expenseTiming === "SETTLEMENT" ? formState.settlementDifferenceAction : "차액없음",
      postApprovalReason: formState.expenseTiming !== "ADVANCE" ? formState.postApprovalReason : undefined,
      originalResolutionId: formState.expenseTiming === "SETTLEMENT" ? formState.originalResolutionId : undefined,
      settlementDueDate: formState.executionMethod === "EMPLOYEE_ADVANCE" ? formState.settlementDueDate : undefined,
      settlementManager: formState.executionMethod === "EMPLOYEE_ADVANCE" ? formState.settlementManager : undefined,
      budgetSnapshot: isBatch ? createBudgetSnapshot(formState.budgetItem, batchSummary.totalAmount, formState.budgetPeriod, initialBudgetProfiles, editingResolution?.budgetId, editingResolution?.budgetMonth, editingResolution?.approvalStatus, editingResolution?.totalPaymentAmount) : formBudgetSnapshot,
      printRecords: [],
      memo: formState.memo,
      history: [
        createHistoryItem({
          actionAt: "2026-07-02 10:30",
          actionLabel: "지출결의서 작성",
          actionType: "CREATED",
          actorLabel: formState.author,
        }),
        createHistoryItem({
          actionAt: mode === "draft" ? "2026-07-02 10:32" : "2026-07-02 10:35",
          actionLabel: mode === "draft" ? "임시저장" : "승인요청",
          actionType: mode === "draft" ? "SAVED_DRAFT" : "REQUESTED_APPROVAL",
          actorLabel: formState.author,
        }),
      ],
    };

    const resolutionToSave: ManagedExpenseResolution = editingResolution
      ? {
                ...editingResolution,
                ...nextResolution,
                id: editingResolution.id,
                approvalStatus,
                currentApprover: mode === "approval-request" && !viewer ? getApproverLabel(firstApprover) : undefined,
                evidenceAttached: formState.evidenceFiles.length > 0,
                evidenceFiles: formState.evidenceFiles,
                evidenceMaterials: formState.evidenceFiles.map((file) => file.fileName),
                history: [
                  ...editingResolution.history,
                  createHistoryItem({
                    actionAt: `${getCurrentDateIso()} 09:00`,
                    actionLabel: mode === "draft" ? "지출결의서 수정" : "수정 후 승인요청",
                    actionType: mode === "draft" ? "SAVED_DRAFT" : "REQUESTED_APPROVAL",
                    actorLabel: formState.author,
                  }),
                ],
                printRecords: editingResolution.printRecords,
              }
      : nextResolution;

    try {
      savingResolution.current = true;
      setIsSavingResolution(true);
      setSaveError("");
      const savedDraft = quickConversionSourceId && convertQuickExpense
        ? await convertQuickExpense(quickConversionSourceId, resolutionToSave)
        : persistResolution ? await persistResolution(resolutionToSave) : resolutionToSave;
      if (quickConversionSourceId) setQuickConversionSourceId(null);
      if (viewer && mode === "approval-request") {
        setResolutions(current => [savedDraft, ...current.filter(r => r.id !== savedDraft.id)]);
        setEditingResolutionId(savedDraft.id);
        if (!transitionApproval) throw new Error("승인요청 처리가 연결되지 않았습니다. 초안은 저장됐습니다.");
      }
      const savedResolution = viewer && mode === "approval-request" && transitionApproval
        ? await transitionApproval({ command: "REQUEST", resolutionId: savedDraft.id,
          actorLabel: viewer.display_name, expectedStatus: savedDraft.approvalStatus,
          expectedCurrentApprover: savedDraft.currentApprover, expectedAuthorizationVersion: savedDraft.authorization?.version })
        : savedDraft;
      setResolutions((current) =>
        editingResolutionId
          ? current.map((resolution) => (resolution.id === editingResolutionId ? savedResolution : resolution))
          : [savedResolution, ...current],
      );
      savingResolution.current = false;
      closeCreateModal();
      return true;
    } catch (error) {
      setSaveError(`${viewer && mode === "approval-request" ? "승인요청을 완료하지 못했습니다. 저장된 초안과 입력을 유지했습니다." : "저장하지 못했습니다. 입력 내용을 유지했으니 확인 후 다시 저장해주세요."} ${error instanceof Error ? error.message : "저장소 연결을 확인해주세요."}`);
    } finally {
      savingResolution.current = false;
      setIsSavingResolution(false);
    }
  }

  async function runApprovalTransition(resolution: ManagedExpenseResolution, command: ApprovalWorkflowCommand, actorLabel: string, reason?: string) {
    setSaveError("");
    const authorization = getExpenseAuthorizationReadiness(resolution);
    if (!authorization.ready) {
      setSaveError(
        `결재 계정 연결이 필요합니다. 작성자 ${authorization.authorLinked ? "연결됨" : "미연결"} · 결재자 ${authorization.linkedApproverCount}/${authorization.expectedApproverCount}명. 결재자 로그인 계정을 등록한 뒤 작성자·결재선 계정 연결을 완료해 주세요.`,
      );
      return false;
    }
    try {
      const transitioned = transitionApproval
        ? await transitionApproval({
            actorLabel,
            command,
            expectedCurrentApprover: resolution.currentApprover,
            expectedStatus: resolution.approvalStatus,
            expectedAuthorizationVersion: resolution.authorization?.version,
            reason,
            resolutionId: resolution.id,
          })
        : transitionExpenseApproval({ actorLabel, command, reason, resolution, transitionedAt: getCurrentDateTime() });
      setResolutions((current) => current.map((item) => item.id === transitioned.id ? transitioned : item));
      return true;
    } catch (error) {
      setSaveError(getApprovalTransitionErrorMessage(error));
      return false;
    }
  }

  async function approveResolution(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution?.currentApprover) return runApprovalTransition(resolution, "APPROVE", currentUserName);
    return false;
  }

  async function requestApproval(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution) return runApprovalTransition(resolution, "REQUEST", resolution.author);
    return false;
  }

  async function cancelApproval(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (!resolution) return;
    const reason = window.prompt("승인취소 사유를 입력해주세요.");
    if (reason) await runApprovalTransition(resolution, "CANCEL", currentUserName, reason);
  }

  async function removeResolution(id: string) {
    if (!deleteResolution || !window.confirm("지출결의서를 삭제할까요? 감사로그에는 이력이 보존됩니다.")) return;
    try { await deleteResolution(id, currentUserName); setResolutions((current) => current.filter((item) => item.id !== id)); setSelectedDetailId(null); } catch (error) { setSaveError(error instanceof Error ? error.message : "지출결의서를 삭제하지 못했습니다."); }
  }

  function rejectResolution(id: string) {
    setRejectionForm({
      error: "",
      reason: "",
      resolutionId: id,
    });
  }

  async function submitRejection() {
    if (!rejectionForm) {
      return;
    }

    const reason = rejectionForm.reason.trim();
    if (!reason) {
      setRejectionForm((current) => (current ? { ...current, error: "반려사유를 입력해주세요." } : current));
      return;
    }

    const resolution = resolutions.find((item) => item.id === rejectionForm.resolutionId);
    if (!resolution) return;
    const changed = await runApprovalTransition(resolution, "REJECT", currentUserName, reason);
    if (changed) {
      setRejectionForm(null);
      setActiveTab("rejected");
    }
  }

  async function runDisbursementTransition(resolution: ManagedExpenseResolution, command: DisbursementTransitionRequest["command"], extra: Partial<DisbursementTransitionRequest> = {}) {
    setSaveError("");
    if (resolution.workflowTransactionId) {
      setSaveError("통합 연결된 건의 실제 지급과 전표는 지급관리·수입지출 전표관리에서 처리해줘.");
      return null;
    }
    try {
      const request = {
        actorLabel: currentUserName,
        command,
        expectedPaymentStatus: resolution.paymentStatus,
        expectedVoucherStatus: resolution.voucherStatus,
        idempotencyKey: crypto.randomUUID(),
        resolutionId: resolution.id,
        ...extra,
      } as DisbursementTransitionRequest;
      let transitioned: ManagedExpenseResolution;
      if (transitionDisbursement) {
        const result = await transitionDisbursement(request);
        if (!result.ok) {
          setSaveError(result.error);
          return null;
        }
        transitioned = result.data;
      } else {
        transitioned = transitionExpenseDisbursement({ ...request, resolution, voucherNo: command === "VOUCHER_CREATE" ? getNextExpenseVoucherNo(resolutions) : undefined });
      }
      setResolutions((current) => current.map((item) => item.id === transitioned.id ? transitioned : item));
      return transitioned;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "지급 처리에 실패했습니다.");
      return null;
    }
  }

  async function completePayment() {
    if (!paymentTargetId) {
      return;
    }

    const resolution = resolutions.find((item) => item.id === paymentTargetId);
    if (!resolution) return;
    const changed = await runDisbursementTransition(resolution, "PAYMENT_COMPLETE", {
      actualPaidAmount: Number(paymentForm.actualPaidAmount) || resolution.totalPaymentAmount,
      paidAt: paymentForm.paidAt,
      paymentAccountNo: paymentForm.paymentAccountNo,
      paymentBank: paymentForm.paymentBank,
      paymentMemo: paymentForm.paymentMemo,
      paymentMethod: paymentForm.paymentMethod,
    });
    if (!changed) return;
    setPaymentTargetId(null);
    setActiveTab("paid");
  }

  async function completeBatchItemPayment(itemNo: number) {
    if (!paymentTargetId) {
      return;
    }

    const resolution = resolutions.find((item) => item.id === paymentTargetId);
    if (!resolution) return;
    const changed = await runDisbursementTransition(resolution, "ITEM_PAYMENT_COMPLETE", {
      itemNo,
      paidAt: paymentForm.paidAt,
      paymentAccountNo: paymentForm.paymentAccountNo,
      paymentBank: paymentForm.paymentBank,
      paymentMemo: paymentForm.paymentMemo,
      paymentMethod: paymentForm.paymentMethod,
    });
    if (!changed) return;
    setPaymentTargetId(null);
    setActiveTab(changed.paymentStatus === "지급완료" ? "paid" : "partialPaid");
  }

  async function createVoucher(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution) await runDisbursementTransition(resolution, "VOUCHER_CREATE");
  }

  async function confirmVoucher(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution && await runDisbursementTransition(resolution, "VOUCHER_CONFIRM")) setActiveTab("voucherCreated");
  }

  async function cancelVoucher(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (!resolution) return;
    const reason = window.prompt("전표취소 사유를 입력해주세요.");
    if (reason) await runDisbursementTransition(resolution, "VOUCHER_CANCEL", { reason });
  }

  function createPrintRecord(id: string, printPurpose: PrintRecordItem["printPurpose"]) {
    setResolutions((current) => {
      const existingPrintCount = current.find((resolution) => resolution.id === id)?.printRecords.length ?? 0;
      const printNo = `PRINT-2026-${String(existingPrintCount + 1).padStart(4, "0")}`;
      const printedAt = "2026-07-03 10:10";
      const actionLabel = printPurpose === "미리보기" ? "출력 미리보기" : "보관용 PDF 생성";
      const actionType: ExpenseResolutionHistoryActionType = printPurpose === "미리보기" ? "PRINTED" : "ARCHIVED";

      return current.map((resolution) =>
        resolution.id === id
          ? (() => {
              const storageLocation = getArchiveStorageLocation(resolution, existingPrintCount + 1);

              return {
                ...resolution,
                history: [
                  ...resolution.history,
                  createHistoryItem({
                    actionAt: printedAt,
                    actionLabel,
                    actionType,
                    actorLabel: currentUserName,
                    comment: `${printNo} · ${storageLocation}`,
                  }),
                ],
                printRecords: [
                  ...resolution.printRecords,
                  {
                    copyKind: printPurpose === "미리보기" ? "사본" : "원본",
                    id: `print-${printNo}`,
                    printedAt,
                    printedBy: currentUserName,
                    printNo,
                    printPurpose,
                    storageLocation,
                  },
                ],
              };
            })()
          : resolution,
      );
    });
  }

  function openPrintWithValidation(resolution: ManagedExpenseResolution, printPurpose: PrintRecordItem["printPurpose"]) {
    const warnings = getPrintValidationWarnings(resolution);

    if (warnings.length > 0) {
      setPrintWarning({ mode: printPurpose, resolutionId: resolution.id, warnings });
      return;
    }

    createPrintRecord(resolution.id, printPurpose);
    setPrintPreviewTargetId(resolution.id);
  }

  function continuePrintAfterWarning() {
    if (!printWarning) {
      return;
    }

    createPrintRecord(printWarning.resolutionId, printWarning.mode);
    setPrintPreviewTargetId(printWarning.resolutionId);
    setPrintWarning(null);
  }

  function navigateList(page: number, query = initialListPage?.query ?? "", month = monthFilter, sort = sortOrder) {
    if (!initialListPage) return;
    startListNavigation(() => router.push(expenseResolutionListHref(page, query, month, sort)));
  }

  function submitListSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (initialListPage) navigateList(1, searchQuery);
  }

  function changeResolutionMonth(value: string) {
    const month = normalizeFinanceMonth(value);
    setMonthFilter(month);
    if (initialListPage) navigateList(1, searchQuery, month, sortOrder);
  }

  function toggleExpenseDateSort() {
    const nextSort = sortOrder === "expense_date_asc" ? "expense_date_desc" : "expense_date_asc";
    setSortOrder(nextSort);
    if (initialListPage) navigateList(1, searchQuery, monthFilter, nextSort);
  }

  return (
    <BudgetProfilesContext.Provider value={initialBudgetProfiles}>
    <ErpShell
      userLabel={currentUserName}
      activeDetailLabel="지출결의서 관리"
      activeLabel="회계·자금"
      activeWorkspaceLabel="전표·증빙"
      onQuickMenuSelect={(label) => {
        if (label === "지출결의 작성") {
          void openCreateModal();
        }
      }}
    >
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        {saveError && !isCreateModalOpen ? <p role="alert" className="rounded-xl border border-orange-300 bg-orange-50 p-4">{saveError}</p> : null}
        {viewer?.permissions.includes("ADMIN") && <Link className="self-start rounded-lg border bg-white px-4 py-2 font-semibold" href="/finance/expense-authorizations">작성자·결재선 계정 연결</Link>}
        {selectedDetailId && !selectedDetail ? <p role="alert" className="rounded-xl border p-4">조회된 목록에서 해당 지출결의서를 찾을 수 없습니다. 조회 권한과 원본 상태를 확인해주세요.</p> : null}
        {initialEditResolutionId && initialResolutions !== undefined && !resolutions.some((resolution) => resolution.id === initialEditResolutionId) ? <p role="alert" className="rounded-xl border p-4">수정할 지출결의서를 찾을 수 없습니다. 조회 권한과 원본 상태를 확인해주세요.</p> : null}
        {initialEditDenied ? <p role="alert" className="rounded-xl border p-4">작성중·승인대기·반려 문서는 연결된 작성자 또는 관리자만 수정할 수 있습니다.</p> : null}
        {dataLoadError ? (
          <div className="rounded-xl border border-[var(--color-tangerine)]/30 bg-[var(--color-sunset-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">
            {dataLoadError}
          </div>
        ) : null}
        <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
              회계·자금 &gt; 전표·증빙 &gt; 지출결의서 관리
            </p>
            <h1 className="text-3xl font-bold tracking-normal">지출결의서 관리</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
              운영비, 용역비, 토지매입비, 환불금 등 조합 지출을 결의서 작성과 승인 절차 이후 지급 및 지출전표 생성으로 연결합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex h-11 items-center rounded-full border bg-white px-5 font-semibold" href="/finance/expense-resolutions/bank-draft-manifest">
              통장거래 작성 예정표
            </Link>
            <Button className="rounded-full" disabled={isFormOptionsLoading} onClick={openExcelImportModal} size="lg" variant="outline">
              <FileSpreadsheet className="size-4" />
              {isFormOptionsLoading ? "작성 정보 불러오는 중" : "엑셀 가져오기"}
            </Button>
            <Button className="rounded-full" onClick={() => setIsOperatingBudgetPrintOpen(true)} size="lg" variant="outline">
              <FileSpreadsheet className="size-4" />
              운영비 예산표 출력
            </Button>
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" disabled={isFormOptionsLoading} onClick={openCreateModal} size="lg">
              <FilePlus2 className="size-4" />
              {isFormOptionsLoading ? "작성 정보 불러오는 중" : "지출결의 작성"}
            </Button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <SummaryTile label="지출결의 승인대기" value={`${summary.pendingApprovalCount}건`} />
          <SummaryTile label="지급대기" value={`${summary.waitingPaymentCount}건`} />
          <SummaryTile label="승인대기 금액" value={formatExpenseResolutionAmount(summary.totalPendingAmount)} />
          <SummaryTile label="처리 알림" value={`${dashboard.alertCount}건`} />
        </section>

        {workflowAlerts.length ? (
          <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-orange-900">확인이 필요한 업무 {workflowAlerts.length}건</h2>
              <span className="text-sm font-semibold text-orange-700">정산기한 경과 {dashboard.overdueSettlementCount}건 · 전표확정 대기 {dashboard.voucherWaitingCount}건</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {workflowAlerts.slice(0, 6).map((alert) => (
                <button className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800" key={alert.id} onClick={() => { void openDetailModal(alert.resolutionId); }} type="button">{alert.label}</button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">업무흐름</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">{resolutionFlow}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-lg font-bold">지출구분</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {expenseResolutionTypeOptions.map((option) => (
                <span className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-1.5 text-xs font-semibold text-[var(--color-stone)]" key={option}>
                  {option}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <form className="flex min-w-0 flex-1 flex-wrap gap-2 xl:max-w-[760px]" onSubmit={submitListSearch}>
                <label className="min-w-[170px] text-xs font-semibold text-[var(--color-stone)]">
                  실제 지출월
                  <input aria-label="지출결의 실제 지출월" className="mt-1 w-full rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-midnight-ink)]" onChange={(event) => changeResolutionMonth(event.target.value)} type="month" value={monthFilter} />
                </label>
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)]">
                  <Search className="size-4 shrink-0" />
                  <input aria-label="지출결의서 검색" className="min-w-0 flex-1 bg-transparent text-[var(--color-midnight-ink)] outline-none" onChange={(event) => setSearchQuery(event.target.value)} placeholder="결의서번호, 건명, 프로젝트, 작성자 검색" value={searchQuery} />
                </label>
                {initialListPage ? <button className="rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={isListNavigationPending} type="submit">검색</button> : null}
                {initialListPage?.query ? <button className="self-end rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm font-semibold" disabled={isListNavigationPending} onClick={() => { setSearchQuery(""); navigateList(1, "", monthFilter, sortOrder); }} type="button">검색 초기화</button> : null}
                {monthFilter ? <button className="self-end rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm font-semibold" disabled={isListNavigationPending} onClick={() => changeResolutionMonth("")} type="button">전체 기간</button> : null}
              </form>
              <div className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-stone)]">
                현재 사용자: {currentUserName}
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              <select aria-label="지출 유형 필터" className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => setExpenseKindFilter(event.target.value)} value={expenseKindFilter}><option value="">지출 유형 전체</option><option value="GENERAL">일반 지출</option><option value="PERSONAL_REIMBURSEMENT">개인 선지출 정산</option><option value="BANK_POST_APPROVAL">통장 선출금 사후결의</option><option value="RECURRING_BATCH">정기비용 일괄결의</option></select>
              <select aria-label="증빙 상태 필터" className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => setEvidenceStatusFilter(event.target.value)} value={evidenceStatusFilter}><option value="">증빙 상태 전체</option><option value="QUALIFIED">적격증빙</option><option value="GENERAL">일반증빙</option><option value="ALTERNATIVE">대체증빙</option><option value="DEFICIENT">증빙불비</option><option value="NONE">증빙 없음</option></select>
              <select aria-label="사후결의 필터" className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => setPostApprovalFilter(event.target.value)} value={postApprovalFilter}><option value="">사후결의 전체</option><option value="YES">사후결의</option><option value="NO">사전결의</option></select>
              <select aria-label="통장거래 연결 필터" className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => setBankLinkedFilter(event.target.value)} value={bankLinkedFilter}><option value="">통장연결 전체</option><option value="YES">연결됨</option><option value="NO">미연결</option></select>
              <input aria-label="개인 선지출자 필터" className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => setSpenderFilter(event.target.value)} placeholder="개인 선지출자" value={spenderFilter} />
              <input aria-label="계정과목 필터" className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => setAccountTitleFilter(event.target.value)} placeholder="계정과목" value={accountTitleFilter} />
              <input aria-label="거래처 필터" className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => setVendorFilter(event.target.value)} placeholder="거래처" value={vendorFilter} />
              <select aria-label="승인상태 필터" className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => setApprovalFilter(event.target.value)} value={approvalFilter}>
                <option value="">승인상태 전체</option><option>작성중</option><option>승인대기</option><option>승인완료</option><option>반려</option>
              </select>
              <select aria-label="지급상태 필터" className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => setPaymentFilter(event.target.value)} value={paymentFilter}>
                <option value="">지급상태 전체</option><option>지급전</option><option>지급대기</option><option>부분지급</option><option>지급완료</option><option>보류</option>
              </select>
              <input aria-label="작성일 시작" className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => setDateFromFilter(event.target.value)} type="date" value={dateFromFilter} />
              <input aria-label="작성일 종료" className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => setDateToFilter(event.target.value)} type="date" value={dateToFilter} />
              <label className="flex items-center gap-2 rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm font-semibold"><input checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} type="checkbox" />정산기한 경과만</label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Link className="font-semibold text-[var(--color-deep-cobalt)] hover:underline" href="/finance/expenses/small">소액지출 등록은 지출관리에서 →</Link>
              {legacySmallExpenseCount > 0 ? (
                <button
                  aria-pressed={pettyCashBatchFilter === "YES"}
                  className={`rounded-full border px-3 py-1.5 font-semibold ${pettyCashBatchFilter === "YES" ? "border-[var(--color-deep-cobalt)] bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]" : "border-[var(--color-soft-border)] bg-white text-[var(--color-stone)]"}`}
                  onClick={() => setPettyCashBatchFilter((current) => current === "YES" ? "" : "YES")}
                  type="button"
                >
                  기존 소액 일괄결의 {legacySmallExpenseCount}건
                </button>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {tabItems.map((item) => (
                <button
                  className={`rounded-full border border-[var(--color-soft-border)] px-3 py-2 text-sm font-semibold ${
                    activeTab === item.key ? "bg-[var(--color-pressed-charcoal)] text-white" : "bg-white text-[var(--color-stone)]"
                  }`}
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  type="button"
                >
                  {item.label} {item.key === "all" && initialListPage ? initialListPage.total : item.resolutions.length}
                </button>
              ))}
            </div>
            {initialListPage ? <p className="mt-3 text-xs text-[var(--color-stone)]">전체 건수는 서버 조회 기준이며, 상태별 건수와 요약은 현재 페이지 기준입니다.</p> : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-soft-border)] p-4">
              <div>
                <h2 className="text-lg font-bold">지출결의서 목록</h2>
                <p className="mt-1 text-sm text-[var(--color-stone)]">
                  {formatFinanceMonth(monthFilter)} · {activeTabItem.label} 기준 {visibleResolutions.length}건
                  {initialListPage ? ` · 전체 ${initialListPage.total}건 · ${initialListPage.page}/${initialListPage.totalPages} 페이지` : ""}
                </p>
                {monthFilter ? <p className="mt-1 text-xs text-[var(--color-stone)]">실제 지출일 기준이며, 실제 지출일이 없는 결의서는 월 검색에서 제외됩니다.</p> : null}
              </div>
              <Button className="rounded-full" onClick={exportAllExpenseResolutions} size="sm" variant="outline">
                <FileSpreadsheet className="size-4" />
                {initialListPage ? "현재 페이지 엑셀" : "엑셀"}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table aria-label="지출결의서 목록" className="w-full min-w-[1040px] border-collapse text-left text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
                  <tr>
                    <th className="w-[180px] px-4 py-3 text-left">결의정보</th>
                    <th aria-sort={sortOrder === "expense_date_asc" ? "ascending" : sortOrder === "expense_date_desc" ? "descending" : "none"} className="px-4 py-3 text-left">
                      <button
                        aria-label={sortOrder === "expense_date_asc" ? "결의내용을 실제 지출일 최신순으로 정렬" : "결의내용을 실제 지출일 오래된순으로 정렬"}
                        className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left font-semibold hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-deep-cobalt)]"
                        disabled={isListNavigationPending}
                        onClick={toggleExpenseDateSort}
                        type="button"
                      >
                        결의내용
                        <span aria-hidden="true" className="text-[10px] text-[var(--color-stone)]">
                          {sortOrder === "expense_date_asc" ? "지출일 ↑" : sortOrder === "expense_date_desc" ? "지출일 ↓" : "↕"}
                        </span>
                      </button>
                    </th>
                    <th className="w-[180px] px-4 py-3 text-left">거래처</th>
                    <th className="w-[140px] px-4 py-3 text-right">지급금액</th>
                    <th className="sticky right-[150px] z-20 w-[190px] border-l border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3 text-left">진행상태</th>
                    <th className="sticky right-0 z-20 w-[150px] border-l border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3 text-left shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.35)]">처리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-soft-border)]">
                  {visibleResolutions.length === 0 ? (
                    <tr>
                      <td className="px-4 py-12 text-center text-sm text-[var(--color-stone)]" colSpan={6}>
                        등록된 지출결의서가 없습니다. 상단의 지출결의 작성 버튼으로 첫 결의서를 등록해주세요.
                      </td>
                    </tr>
                  ) : null}
                  {visibleResolutions.map((resolution) => {
                    const canEditAccount = !isLegacySmallExpenseResolution(resolution) && (viewer
                      ? canEditExpense(resolution, viewer)
                      : resolution.author === currentUserName && ["작성중", "승인대기", "반려"].includes(resolution.approvalStatus));
                    const canApprove = resolution.approvalStatus === "승인대기" && isCurrentUserApprover(resolution, viewer);
                    const canPay = resolution.approvalStatus === "승인완료" && ["지급대기", "부분지급"].includes(resolution.paymentStatus);
                    const canCreateVoucher = resolution.paymentStatus === "지급완료" && !resolution.voucherNo;
                    const canConfirmVoucher = resolution.paymentStatus === "지급완료" && resolution.voucherStatus === "전표초안";
                    const expenseKindLabel = resolution.expenseKind === "PERSONAL_REIMBURSEMENT" ? "개인 선지출 정산" : resolution.expenseKind === "BANK_POST_APPROVAL" ? "통장 선출금" : isLegacySmallExpenseResolution(resolution) ? "기존 소액 일괄결의" : resolution.expenseKind === "RECURRING_BATCH" ? "정기비용 일괄" : "일반 지출";
                    const primaryStatus = resolution.approvalStatus === "반려"
                      ? "반려"
                      : resolution.approvalStatus !== "승인완료"
                        ? resolution.approvalStatus
                        : resolution.paymentStatus !== "지급완료"
                          ? resolution.paymentStatus
                          : getVoucherStatusLabel(resolution);

                    return (
                      <tr className="group bg-white/70 [content-visibility:auto] hover:bg-[var(--color-cloud-veil)]/55" key={resolution.id}>
                        <td className="px-4 py-3 align-top">
                          <button className="font-bold text-[var(--color-midnight-ink)] hover:text-[var(--color-deep-cobalt)] hover:underline" onClick={() => { void openDetailModal(resolution.id); }} type="button">
                            {resolution.resolutionNo}
                          </button>
                          <p className="mt-1 text-xs text-[var(--color-stone)]">작성 {resolution.createdAt}</p>
                          {resolution.actualExpenseDate ? <p className="mt-0.5 text-xs text-[var(--color-stone)]">지출 {resolution.actualExpenseDate}</p> : null}
                          <p className="mt-1 text-[11px] font-semibold text-[var(--color-stone)]">{resolution.creationSource === "APPROVAL_LINKED" ? "기안연결" : isLegacySmallExpenseResolution(resolution) ? "기존자료" : resolution.creationSource === "CONTRACT_PAYMENT" ? "계약지급" : "직접작성"}</p>
                          {resolution.cardReconciliationStatus === "PENDING" ? <p className="mt-1 w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">카드내역 연결대기</p> : resolution.cardReconciliationStatus === "MATCHED" ? <p className="mt-1 w-fit rounded-full bg-[var(--color-mint-wash)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-green-ink)]">{resolution.cardVerificationSource === "BANK_TRANSACTION" ? "통장거래 확인완료" : "카드내역 매칭완료"}</p> : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <button className="block max-w-full truncate text-left font-bold text-[var(--color-midnight-ink)] hover:text-[var(--color-deep-cobalt)] hover:underline" onClick={() => { void openDetailModal(resolution.id); }} title={getResolutionSubject(resolution)} type="button">
                            {getResolutionSubject(resolution)}
                          </button>
                          <p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">{expenseKindLabel} · {getResolutionTypeLabel(resolution.resolutionType)}</p>
                          {resolution.projectName ? <p className="mt-1 truncate text-xs text-[var(--color-stone)]" title={resolution.projectName}>프로젝트: {resolution.projectName}</p> : null}
                          {resolution.representativeAccountTitle ? <p className="mt-0.5 truncate text-xs text-[var(--color-stone)]" title={resolution.representativeAccountTitle}>계정: {resolution.representativeAccountTitle}</p> : null}
                          {canEditAccount ? (
                            viewer ? <Link
                              aria-label={`${resolution.resolutionNo} 계정 변경`}
                              className="mt-1 inline-flex rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)] hover:bg-blue-50"
                              href={`/finance/expense-resolutions?resolutionId=${encodeURIComponent(resolution.id)}&mode=edit`}
                            >계정 변경</Link> : <button
                              aria-label={`${resolution.resolutionNo} 계정 변경`}
                              className="mt-1 inline-flex rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)] hover:bg-blue-50"
                              onClick={() => { void openEditModal(resolution); }}
                              type="button"
                            >계정 변경</button>
                          ) : null}
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {resolution.isPostApproval ? <ComplianceBadge label="사후결의" tone="warning" /> : null}
                            {resolution.evidenceStatus === "DEFICIENT" || resolution.evidenceStatus === "NONE" ? <ComplianceBadge label="증빙불비" tone="danger" /> : null}
                            {resolution.expenseKind === "BANK_POST_APPROVAL" && !resolution.bankTransactionId && !resolution.bankTransactions?.length ? <ComplianceBadge label="통장 미연결" tone="danger" /> : null}
                            {resolution.complianceWarnings?.some((warning) => warning.includes("분할결제")) ? <ComplianceBadge label="중복의심" tone="warning" /> : null}
                            {resolution.evidenceStatus === "NONE" || resolution.complianceWarnings?.some((warning) => warning.includes("추가 확인")) ? <ComplianceBadge label="소명필요" tone="danger" /> : null}
                            {repeatedMissingEvidenceSpenders.has(resolution.advancePayer || resolution.author) ? <ComplianceBadge label="무증빙 반복" tone="danger" /> : null}
                            {resolution.totalOverBudgetAmount > 0 ? <ComplianceBadge label={`예산초과 ${formatExpenseResolutionAmount(resolution.totalOverBudgetAmount)}`} tone="warning" /> : null}
                          </div>
                          <span className="sr-only">{getResolutionTypeLabel(resolution.resolutionType)}</span>
                          <span className="sr-only">{resolution.projectName || "프로젝트 없음"}</span>
                          <span className="sr-only">{resolution.representativeAccountTitle}</span>
                        </td>
                        <td className="px-4 py-3 align-top text-sm font-semibold">{resolution.representativeVendorName || resolution.vendorName || "-"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right align-top font-bold">{formatExpenseResolutionAmount(resolution.totalPaymentAmount)}</td>
                        <td className="sticky right-[150px] z-10 border-l border-[var(--color-soft-border)] bg-white px-4 py-3 align-top group-hover:bg-[var(--color-cloud-veil)]">
                          <Badge value={primaryStatus} />
                          <span className="sr-only">{resolution.approvalStatus}</span>
                          <span className="sr-only">{resolution.paymentStatus}</span>
                          <span className="sr-only">{getVoucherStatusLabel(resolution)}</span>
                          {resolution.currentApprover ? <span className="sr-only">{resolution.currentApprover}</span> : null}
                          {resolution.currentApprover ? <p className="mt-1 text-xs text-[var(--color-stone)]">{resolution.currentApprover} 결재 대기</p> : null}
                          {resolution.rejectionReason ? <p className="mt-1 text-xs text-[var(--color-tangerine)]">{resolution.rejectionReason}</p> : null}
                          {resolution.paidAt ? <p className="mt-1 text-xs text-[var(--color-stone)]">지급일 {resolution.paidAt}</p> : null}
                          {resolution.transferReceiptStatus ? (
                            <label className="mt-2 inline-flex cursor-pointer rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-stone)]">
                              이체확인증 첨부
                              <input className="sr-only" type="file" />
                            </label>
                          ) : null}
                        </td>
                        <td className="sticky right-0 z-10 border-l border-[var(--color-soft-border)] bg-white px-4 py-3 align-top shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.35)] group-hover:bg-[var(--color-cloud-veil)]">
                          <div className="flex flex-col items-start gap-1.5">
                            <button
                              aria-label="상세보기"
                              className="order-last rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-stone)]"
                              onClick={() => { void openDetailModal(resolution.id); }}
                              type="button"
                            >
                              상세
                            </button>
                            {resolution.approvalStatus === "작성중" ? (
                              <>
                                <button
                                  className="rounded-full bg-[var(--color-deep-cobalt)] px-3 py-1.5 text-xs font-bold text-white"
                                  onClick={() => requestApproval(resolution.id)}
                                  type="button"
                                >
                                  승인요청
                                </button>
                              </>
                            ) : null}
                            {canApprove ? (
                              <>
                                <button
                                  className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]"
                                  onClick={() => { void openDetailModal(resolution.id); }}
                                  type="button"
                                >
                                  결재하기
                                </button>
                              </>
                            ) : null}
                            {canPay ? (
                              <button
                                className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-green-ink)]"
                                onClick={() => openPaymentModal(resolution)}
                                type="button"
                              >
                                지급처리
                              </button>
                            ) : null}
                            {canCreateVoucher ? (
                              <button
                                className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]"
                                onClick={() => createVoucher(resolution.id)}
                                type="button"
                              >
                                전표초안 생성
                              </button>
                            ) : null}
                            {canConfirmVoucher ? (
                              <button
                                className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]"
                                onClick={() => confirmVoucher(resolution.id)}
                                type="button"
                              >
                                전표확정
                              </button>
                            ) : null}
                            {resolution.voucherStatus === "전표확정" ? (
                              <a className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-green-ink)]" href={`/finance?resolutionId=${resolution.id}`}>
                                전표보기
                              </a>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                  <tfoot className="border-t border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] text-sm font-bold">
                    <tr>
                    <td className="px-4 py-3 text-right" colSpan={3}>
                      {activeTabItem.label} 합계
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatExpenseResolutionAmount(visibleResolutions.reduce((sum, resolution) => sum + resolution.totalPaymentAmount, 0))}
                    </td>
                    <td className="px-4 py-3" colSpan={2}>
                      표시 건수 {visibleResolutions.length}건
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {initialListPage && initialListPage.totalPages > 1 ? (
              <nav aria-label="지출결의서 페이지" className="flex items-center justify-center gap-3 border-t border-[var(--color-soft-border)] p-4">
                <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40" disabled={isListNavigationPending || initialListPage.page <= 1} onClick={() => navigateList(initialListPage.page - 1)} type="button">이전</button>
                <span className="text-sm font-semibold text-[var(--color-stone)]">{initialListPage.page} / {initialListPage.totalPages}</span>
                <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40" disabled={isListNavigationPending || initialListPage.page >= initialListPage.totalPages} onClick={() => navigateList(initialListPage.page + 1)} type="button">다음</button>
              </nav>
            ) : null}
          </section>
        </section>
      </div>

      {isCreateModalOpen ? (
        <ExpenseResolutionCreateModal
          batchImportError={batchImportError}
          batchImportFileName={batchImportFileName}
          batchImportResult={batchImportResult}
          evidenceUploadError={evidenceUploadError}
          vendorRegistrationNotice={vendorRegistrationNotice}
          evidenceOcrProgress={evidenceOcrProgress}
          batchSummary={formBatchSummary}
          budgetSnapshot={formBudgetSnapshot}
          formState={formState}
          bankTransactionCandidates={formBankTransactionCandidates}
          cardTransactionCandidates={formOptions.cardTransactions}
          approvalDocuments={formOptions.approvalDocuments}
          directExpenseSettings={formOptions.directExpenseSettings}
          expenseDetails={formOptions.expenseDetails}
          settlementCandidates={resolutions.filter(isEmployeeAdvanceSettlementSource)}
          canRestoreHistorical={Boolean(viewer?.permissions.includes("ADMIN"))}
          isEditing={Boolean(editingResolutionId)}
          isQuickConversion={Boolean(quickConversionSourceId)}
          isEvidenceUploading={isEvidenceUploading}
          saveError={saveError}
          isSaving={isSavingResolution}
          onAddBatchItem={addBatchItem}
          onAddSingleItem={addSingleItem}
          onAddAccountAllocation={addAccountAllocation}
          onAttachBatchEvidence={attachBatchEvidence}
          onCancel={closeCreateModal}
          onChange={updateFormValue}
          onCopyBatchItem={copyBatchItem}
          onDeleteBatchItem={deleteBatchItem}
          onDeleteSingleItem={deleteSingleItem}
          onDeleteAccountAllocation={deleteAccountAllocation}
          onDownloadBatchImportTemplate={downloadBatchImportTemplate}
          onImportBatchExpenseFile={importBatchExpenseFile}
          onApplyEvidenceOcr={applyEvidenceOcr}
          onOpenEvidenceOriginal={openEvidenceOriginal}
          onRemoveEvidenceFile={removeEvidenceFile}
          onRetryEvidenceFile={retryEvidenceFile}
          onReviewBatchBudget={reviewBatchBudget}
          onBatchItemChange={updateBatchItem}
          onSingleItemChange={updateSingleItem}
          onAccountAllocationChange={updateAccountAllocation}
          onRequestApproval={async () => { await saveResolution("approval-request"); }}
          onSaveDraft={() => saveResolution("draft")}
          onUploadEvidenceFiles={uploadEvidenceFiles}
          settlementDifference={settlementDifference}
          totalAmount={effectiveFormTotalAmount}
          accountAllocationTotal={accountAllocationTotal}
        />
      ) : null}

      {selectedDetail ? (
        <ExpenseResolutionDetailModal
          actionError={saveError}
          budgetDataError={budgetDataError}
          canApprove={isCurrentUserApprover(selectedDetail, viewer)}
          editHref={!isLegacySmallExpenseResolution(selectedDetail) && viewer && canEditExpense(selectedDetail, viewer) ? `/finance/expense-resolutions?resolutionId=${encodeURIComponent(selectedDetail.id)}&mode=edit` : undefined}
          linkedApproval={formOptions.approvalDocuments.find((document) => document.id === selectedDetail.approvalDocumentId)}
          onApprove={() => approveResolution(selectedDetail.id)}
          onClose={closeDetailModal}
          onCancelApproval={() => cancelApproval(selectedDetail.id)}
          onCancelVoucher={() => cancelVoucher(selectedDetail.id)}
          onConfirmVoucher={selectedDetail.workflowTransactionId ? undefined : () => confirmVoucher(selectedDetail.id)}
          onCreateVoucher={selectedDetail.workflowTransactionId ? undefined : () => createVoucher(selectedDetail.id)}
          onCreateFactConfirmation={isLegacySmallExpenseResolution(selectedDetail) ? undefined : (detailItem) => { setFactConfirmationTarget({ detailItem, resolution: selectedDetail }); setSelectedDetailId(null); }}
          onDelete={isLegacySmallExpenseResolution(selectedDetail) ? undefined : () => removeResolution(selectedDetail.id)}
          onEdit={!isLegacySmallExpenseResolution(selectedDetail) && !viewer && selectedDetail.author === currentUserName && ["작성중", "승인대기", "반려"].includes(selectedDetail.approvalStatus) ? () => openEditModal(selectedDetail) : undefined}
          onPrintArchive={() => openPrintWithValidation(selectedDetail, "보관용")}
          onPrintPreview={() => openPrintWithValidation(selectedDetail, "미리보기")}
          onProcessPayment={selectedDetail.workflowTransactionId ? undefined : () => openPaymentModal(selectedDetail)}
          onReject={() => rejectResolution(selectedDetail.id)}
          onRequestApproval={() => requestApproval(selectedDetail.id)}
          resolution={selectedDetail}
          voucherHref={`/finance?resolutionId=${selectedDetail.id}`}
        />
      ) : null}

      {factConfirmationTarget ? <ExpenseFactConfirmationModal actorLabel={currentUserName} deleteConfirmation={deleteFactConfirmation} detailItem={factConfirmationTarget.detailItem} listConfirmations={listFactConfirmations} onClose={() => setFactConfirmationTarget(null)} onSave={saveFactConfirmation} onUploadSupportingFile={uploadFactSupportingFile} resolution={factConfirmationTarget.resolution} /> : null}

      {paymentTarget ? (
        <PaymentProcessModal
          form={paymentForm}
          onCancel={() => setPaymentTargetId(null)}
          onChange={updatePaymentForm}
          onSubmit={completePayment}
          onSubmitItem={completeBatchItemPayment}
          resolution={paymentTarget}
        />
      ) : null}

      {rejectionForm ? (
        <RejectionReasonModal
          form={rejectionForm}
          onCancel={() => setRejectionForm(null)}
          onChange={(reason) => setRejectionForm((current) => (current ? { ...current, error: "", reason } : current))}
          onSubmit={submitRejection}
        />
      ) : null}

      {printPreviewTarget ? (
        <ExpenseResolutionPrintPreviewModal
          createEvidenceDownloadUrl={createEvidenceDownloadUrl}
          onClose={() => setPrintPreviewTargetId(null)}
          resolution={printPreviewTarget}
        />
      ) : null}

      {printWarning ? (
        <PrintValidationWarningModal
          onCancel={() => setPrintWarning(null)}
          onContinue={continuePrintAfterWarning}
          onEdit={printWarningResolution && !isLegacySmallExpenseResolution(printWarningResolution) ? editPrintWarningResolution : undefined}
          warnings={printWarning.warnings}
        />
      ) : null}

      {isOperatingBudgetPrintOpen ? (
        <OperatingBudgetPrintModal budgetProfiles={initialBudgetProfiles} onClose={() => setIsOperatingBudgetPrintOpen(false)} />
      ) : null}
    </ErpShell>
    </BudgetProfilesContext.Provider>
  );
}

function PrintValidationWarningModal({
  onCancel,
  onContinue,
  onEdit,
  warnings,
}: {
  onCancel: () => void;
  onContinue: () => void;
  onEdit?: () => void;
  warnings: string[];
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--color-midnight-ink)]/35 px-4" onClick={onCancel}>
      <section
        aria-labelledby="print-validation-warning-title"
        aria-modal="true"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.24)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-xl font-bold" id="print-validation-warning-title">
              보관용 출력 전 확인
            </h2>
            <p className="mt-2 text-sm font-semibold text-[var(--color-tangerine)]">보관용 출력 전 확인이 필요합니다.</p>
          </div>
          <button aria-label="보관용 출력 전 확인 닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onCancel} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-6">
          <ul className="grid gap-3 text-sm">
            {warnings.map((warning) => (
              <li className="rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-sunset-soft)]/35 px-4 py-3 font-semibold text-[var(--color-midnight-ink)]" key={warning}>
                {warning}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          {onEdit ? <Button className="rounded-full" onClick={onEdit} variant="outline">
            수정하기
          </Button> : null}
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={onContinue}>
            그래도 출력하기
          </Button>
        </div>
      </section>
    </div>
  );
}

function RejectionReasonModal({
  form,
  onCancel,
  onChange,
  onSubmit,
}: {
  form: RejectionFormState;
  onCancel: () => void;
  onChange: (reason: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--color-midnight-ink)]/35 px-4" onClick={onCancel}>
      <section
        aria-labelledby="rejection-reason-title"
        aria-modal="true"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.24)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-xl font-bold" id="rejection-reason-title">
              반려사유 입력
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">감사 대응을 위해 반려사유를 입력한 뒤 반려 처리합니다.</p>
          </div>
          <button aria-label="반려사유 입력 닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onCancel} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-6">
          <label className="grid gap-2 text-sm font-semibold">
            <span>반려사유</span>
            <textarea className="min-h-28 rounded-md border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => onChange(event.target.value)} value={form.reason} />
          </label>
          {form.error ? <p className="mt-3 text-sm font-bold text-[var(--color-tangerine)]">{form.error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          <Button className="rounded-full" onClick={onCancel} variant="outline">
            취소
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={onSubmit}>
            반려 처리
          </Button>
        </div>
      </section>
    </div>
  );
}

function PaymentProcessModal({
  form,
  onCancel,
  onChange,
  onSubmit,
  onSubmitItem,
  resolution,
}: {
  form: PaymentFormState;
  onCancel: () => void;
  onChange: <K extends keyof PaymentFormState>(key: K, value: PaymentFormState[K]) => void;
  onSubmit: () => void;
  onSubmitItem: (itemNo: number) => void;
  resolution: ManagedExpenseResolution;
}) {
  const payableItems = resolution.expenseItems.filter((item) => item.paymentStatus !== "지급완료");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/88 px-4 py-8" onClick={onCancel}>
      <section
        aria-labelledby="payment-process-title"
        aria-modal="true"
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold" id="payment-process-title">
              지급처리
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">최종 승인된 지출결의서를 실제 지급완료 상태로 처리합니다.</p>
          </div>
          <button aria-label="지급처리 닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onCancel} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2">
          <TextInput label="결의서번호" readOnly value={resolution.resolutionNo} />
          <TextInput label="거래처" readOnly value={resolution.vendorName} />
          <TextInput label="총지급액" readOnly value={formatExpenseResolutionAmount(resolution.totalPaymentAmount)} />
          <TextInput label="지급일" onChange={(value) => onChange("paidAt", value)} type="date" value={form.paidAt} />
          {resolution.resolutionType === "BATCH" ? (
            <label className="grid gap-1 text-sm font-semibold">
              <span>지급처리 방식</span>
              <select className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm" onChange={(event) => onChange("batchPaymentMode", event.target.value as BatchPaymentMode)} value={form.batchPaymentMode}>
                <option value="GROUP">일괄 지급</option>
                <option value="ITEM">항목별 지급</option>
              </select>
            </label>
          ) : null}
          <label className="grid gap-1 text-sm font-semibold">
            <span>지급방법</span>
            <select className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm" onChange={(event) => onChange("paymentMethod", event.target.value as PaymentMethod)} value={form.paymentMethod}>
              {["계좌이체", "카드결제", "현금", "기타"].map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <TextInput label="실제지급액" onChange={(value) => onChange("actualPaidAmount", value)} type="number" value={form.actualPaidAmount} />
          <TextInput label="지급은행" onChange={(value) => onChange("paymentBank", value)} value={form.paymentBank} />
          <TextInput label="지급계좌" onChange={(value) => onChange("paymentAccountNo", value)} value={form.paymentAccountNo} />
          <TextInput label="예금주" onChange={(value) => onChange("accountHolder", value)} value={form.accountHolder} />
          <label className="grid gap-1 text-sm font-semibold">
            <span>이체확인증 첨부</span>
            <span className="flex h-10 items-center rounded-md border border-dashed border-[var(--color-soft-border)] bg-white px-3 text-xs text-[var(--color-stone)]">
              파일 업로드 UI
            </span>
            <input className="sr-only" type="file" />
          </label>
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">
            <span>지급메모</span>
            <textarea className="min-h-24 rounded-md border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => onChange("paymentMemo", event.target.value)} value={form.paymentMemo} />
          </label>
          {resolution.resolutionType === "BATCH" && form.batchPaymentMode === "ITEM" ? (
            <div className="md:col-span-2 overflow-hidden rounded-xl border border-[var(--color-soft-border)] bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]">
                  <tr>
                    <th className="px-3 py-2">순번</th>
                    <th className="px-3 py-2">거래처</th>
                    <th className="px-3 py-2">계정항목</th>
                    <th className="px-3 py-2">금액</th>
                    <th className="px-3 py-2">지급상태</th>
                    <th className="px-3 py-2">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-soft-border)]">
                  {payableItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-3 font-bold">{item.itemNo}</td>
                      <td className="px-3 py-3">{item.vendorName || "거래처 미입력"}</td>
                      <td className="px-3 py-3">{item.accountTitle}</td>
                      <td className="px-3 py-3 text-right font-bold">{formatExpenseResolutionAmount(item.totalAmount)}</td>
                      <td className="px-3 py-3">
                        <Badge value={item.paymentStatus} />
                      </td>
                      <td className="px-3 py-3">
                        <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-green-ink)]" onClick={() => onSubmitItem(item.itemNo)} type="button">
                          {item.itemNo}행 지급완료 처리
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          <Button className="rounded-full" onClick={onCancel} variant="outline">
            취소
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={onSubmit}>
            지급완료 처리
          </Button>
        </div>
      </section>
    </div>
  );
}

export function DetailItem({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 ${wide ? "md:col-span-2" : ""}`}>
      <p className="text-xs font-bold text-[var(--color-fog)]">{label}</p>
      <div className="mt-2 text-sm font-semibold leading-6 text-[var(--color-midnight-ink)]">{value}</div>
    </div>
  );
}

export function SingleExpenseItemsEditor({ items, onAdd, onChange, onDelete }: { items: SingleExpenseItem[]; onAdd: () => void; onChange: (id: string, key: keyof SingleExpenseItem, value: string) => void; onDelete: (id: string) => void }) {
  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--color-soft-border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-sm font-black">품목/용역 내역</h3><p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">같은 거래처의 여러 품목을 입력하면 금액이 자동 합산됩니다.</p></div>
        <Button className="rounded-full" onClick={onAdd} type="button" variant="outline">품목 추가</Button>
      </div>
      <div className="mt-3 max-w-full overflow-x-auto">
        <table className="min-w-[1040px] w-full border-collapse text-sm">
          <thead className="bg-[var(--color-cloud-veil)] text-center"><tr>{["품목명", "수량", "단가", "공급가액", "세금구분", "부가세", "합계", "비고", "관리"].map((label) => <th className="border border-[var(--color-soft-border)] px-2 py-2 text-center" key={label}>{label}</th>)}</tr></thead>
          <tbody>{items.map((item, index) => <tr key={item.id}>
            <td className="border border-[var(--color-soft-border)] p-1"><input aria-label={`품목명 ${index + 1}`} className="h-9 w-full px-2" onChange={(event) => onChange(item.id, "itemName", event.target.value)} value={item.itemName} /></td>
            <td className="border border-[var(--color-soft-border)] p-1"><input aria-label={`수량 ${index + 1}`} className="h-9 w-20 px-2 text-right" min="0" onChange={(event) => onChange(item.id, "quantity", event.target.value)} type="number" value={item.quantity} /></td>
            <td className="border border-[var(--color-soft-border)] p-1"><input aria-label={`단가 ${index + 1}`} className="h-9 w-28 px-2 text-right" min="0" onChange={(event) => onChange(item.id, "unitPrice", event.target.value)} type="number" value={item.unitPrice} /></td>
            <td className="border border-[var(--color-soft-border)] px-2 py-1 text-right">{formatExpenseResolutionAmount(item.supplyAmount)}</td>
            <td className="border border-[var(--color-soft-border)] p-1"><select aria-label={`세금구분 ${index + 1}`} className="h-9 w-full min-w-28 bg-white px-2" onChange={(event) => onChange(item.id, "taxCategory", event.target.value)} value={item.taxCategory}><option value="TAXABLE">부가세 공제</option><option value="NON_DEDUCTIBLE">부가세 불공제</option><option value="NO_VAT">부가세 없음</option></select></td>
            <td className="border border-[var(--color-soft-border)] p-1"><input aria-label={`부가세 ${index + 1}`} className="h-9 w-24 px-2 text-right disabled:bg-[var(--color-cloud-veil)] disabled:text-[var(--color-stone)]" disabled={item.taxCategory === "NO_VAT"} min="0" onChange={(event) => onChange(item.id, "vatAmount", event.target.value)} type="number" value={item.vatAmount} /></td>
            <td className="border border-[var(--color-soft-border)] px-2 py-1 text-right font-bold">{formatExpenseResolutionAmount(item.totalAmount)}</td>
            <td className="border border-[var(--color-soft-border)] p-1"><input aria-label={`품목 비고 ${index + 1}`} className="h-9 w-full px-2" onChange={(event) => onChange(item.id, "memo", event.target.value)} value={item.memo} /></td>
            <td className="border border-[var(--color-soft-border)] p-1"><Button disabled={items.length === 1} onClick={() => onDelete(item.id)} type="button" variant="outline">삭제</Button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

export function AccountAllocationEditor({ allocations, allocationTotal, budgetRecommendation, onAdd, onChange, onDelete, totalAmount }: { allocations: AccountAllocation[]; allocationTotal: number; budgetRecommendation: ExpenseBudgetRecommendation | null; onAdd: () => void; onChange: (id: string, key: keyof AccountAllocation, value: string) => void; onDelete: (id: string) => void; totalAmount: number }) {
  const budgetProfiles = useContext(BudgetProfilesContext);
  const budgetItemOptions = Array.from(new Set([
    ...Object.keys(budgetProfiles).filter((key) => !isBudgetProfilePeriodKey(key)),
    budgetRecommendation?.budgetItem ?? "",
    ...allocations.map((allocation) => allocation.budgetItem),
  ].filter(Boolean)));
  const matches = Math.abs(allocationTotal - totalAmount) <= 0.5;
  const recommendationProfile = budgetRecommendation ? budgetProfiles[budgetRecommendation.budgetItem] : undefined;
  const recommendationRemaining = recommendationProfile
    ? recommendationProfile.monthlyBudgetAmount - recommendationProfile.usedAmount - (recommendationProfile.reservedAmount ?? (recommendationProfile.pendingApprovalAmount + recommendationProfile.paymentWaitingAmount)) - totalAmount
    : 0;
  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--color-soft-border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-sm font-black">계정과목 분할</h3><p className={`mt-1 text-xs font-semibold ${matches ? "text-[var(--color-green-ink)]" : "text-[var(--color-tangerine)]"}`}>분할 합계 {formatExpenseResolutionAmount(allocationTotal)} / 총지급액 {formatExpenseResolutionAmount(totalAmount)}</p></div>
        <Button className="rounded-full" onClick={onAdd} type="button" variant="outline">계정과목 추가</Button>
      </div>
      {budgetRecommendation ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
        <div><p className="font-black text-[var(--color-deep-cobalt)]">추천 예산항목: {budgetRecommendation.budgetItem} · 신뢰도 {budgetRecommendation.confidence}</p><p className="mt-1 font-semibold text-[var(--color-stone)]">{budgetRecommendation.reason}</p>{recommendationProfile ? <p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">월 예산 {formatExpenseResolutionAmount(recommendationProfile.monthlyBudgetAmount)} · 이번 결의 {formatExpenseResolutionAmount(totalAmount)} · 결의 후 잔액 {formatExpenseResolutionAmount(recommendationRemaining)}</p> : null}</div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[var(--color-green-ink)]">자동 적용됨</span>
      </div> : null}
      <div className="mt-3 grid gap-3">
        {allocations.map((allocation, index) => <div className="grid min-w-0 gap-2 rounded-lg bg-[var(--color-cloud-veil)] p-3 md:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_minmax(0,1fr)_auto]" key={allocation.id}>
          <label className="grid min-w-0 gap-1 text-xs font-bold">예산 구분<select aria-label={`분할 계정과목 ${index + 1}`} className="h-9 min-w-0 w-full bg-white px-2" onChange={(event) => onChange(allocation.id, "accountTitle", event.target.value)} value={allocation.accountTitle}>{expenseResolutionTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="grid min-w-0 gap-1 text-xs font-bold">세부 예산항목<select aria-label={`분할 예산항목 ${index + 1}`} className="h-9 min-w-0 w-full bg-white px-2" onChange={(event) => onChange(allocation.id, "budgetItem", event.target.value)} value={allocation.budgetItem}><option value="">선택</option>{budgetItemOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="grid min-w-0 gap-1 text-xs font-bold">분할금액<input aria-label={`분할금액 ${index + 1}`} className="h-9 min-w-0 w-full bg-white px-2 text-right" min="0" onChange={(event) => onChange(allocation.id, "amount", event.target.value)} type="number" value={allocation.amount} /></label>
          <label className="grid min-w-0 gap-1 text-xs font-bold">적요<input aria-label={`분할 적요 ${index + 1}`} className="h-9 min-w-0 w-full bg-white px-2" onChange={(event) => onChange(allocation.id, "description", event.target.value)} value={allocation.description} /></label>
          <Button className="self-end" disabled={allocations.length === 1} onClick={() => onDelete(allocation.id)} type="button" variant="outline">삭제</Button>
        </div>)}
      </div>
      {!matches ? <p className="mt-3 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-bold text-[var(--color-tangerine)]">계정과목 분할금액 합계를 총지급액과 일치시켜주세요.</p> : null}
    </section>
  );
}

export function QuestionChoiceGroup({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ description?: string; label: string; value: string }>;
  value: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-black text-[var(--color-midnight-ink)]">{label}</legend>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              aria-label={option.label}
              aria-pressed={selected}
              className={`rounded-xl border px-4 py-3 text-left transition ${selected ? "border-[var(--color-deep-cobalt)] bg-white shadow-sm" : "border-[var(--color-soft-border)] bg-white/70 hover:bg-white"}`}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <span className="block text-sm font-bold text-[var(--color-midnight-ink)]">{option.label}</span>
              {option.description ? <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--color-stone)]">{option.description}</span> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FormSection({ children, layout = "default", title }: { children: ReactNode; layout?: "compact" | "default"; title: string }) {
  const gridClassName =
    layout === "compact"
      ? "grid gap-3 md:grid-cols-3 xl:grid-cols-4 [&_label>span]:text-xs [&_label>span]:font-bold [&_label>span]:text-[var(--color-stone)] [&_select]:h-12 [&_select]:rounded-lg [&_select]:px-4 [&_select]:text-base [&_select]:font-bold [&_select]:text-[var(--color-midnight-ink)]"
      : "grid gap-3 md:grid-cols-2 [&_label>span]:text-xs [&_label>span]:font-bold [&_label>span]:text-[var(--color-stone)] [&_select]:h-12 [&_select]:rounded-lg [&_select]:px-4 [&_select]:text-base [&_select]:font-bold [&_select]:text-[var(--color-midnight-ink)]";

  return (
    <section className="rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] p-4">
      <h3 className="mb-3 text-base font-bold">{title}</h3>
      <div className={gridClassName}>{children}</div>
    </section>
  );
}

export function CollapsibleFormSection({ children, defaultOpen = false, summary, title }: { children: ReactNode; defaultOpen?: boolean; summary: string; title: string }) {
  return (
    <details className="rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] p-4" open={defaultOpen || undefined}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-base font-bold">{title}</h3>
          <span className="text-right text-sm font-semibold text-[var(--color-stone)]">{summary}</span>
        </div>
      </summary>
      <div className="mt-3 grid gap-3 border-t border-[var(--color-soft-border)] pt-3 md:grid-cols-2 [&_label>span]:text-xs [&_label>span]:font-bold [&_label>span]:text-[var(--color-stone)] [&_select]:h-12 [&_select]:rounded-lg [&_select]:px-4 [&_select]:text-base [&_select]:font-bold [&_select]:text-[var(--color-midnight-ink)]">
        {children}
      </div>
    </details>
  );
}

const fieldLabelClassName = "text-xs font-bold text-[var(--color-stone)]";
const fieldWrapperClassName = "grid gap-1.5 text-sm font-semibold";
const fieldControlClassName =
  "h-12 rounded-lg border border-[var(--color-soft-border)] px-4 text-base font-bold text-[var(--color-midnight-ink)] placeholder:text-[var(--color-fog)] focus:border-[var(--color-sky-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-morning-tint)]";

export function TextInput({
  label,
  maxLength,
  onChange,
  readOnly,
  type = "text",
  value,
}: {
  label: string;
  maxLength?: number;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  type?: "date" | "number" | "text";
  value: string;
}) {
  return (
    <label className={fieldWrapperClassName}>
      <span className={fieldLabelClassName}>{label}</span>
      <input
        className={`${fieldControlClassName} ${readOnly ? "bg-[var(--color-cloud-veil)] text-[var(--color-deep-cobalt)]" : "bg-white"}`}
        maxLength={maxLength}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readOnly}
        type={type}
        value={value}
      />
    </label>
  );
}

export function TextareaInput({ id, label, onChange, value }: { id?: string; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className={`${fieldWrapperClassName} md:col-span-2`}>
      <span className={fieldLabelClassName}>{label}</span>
      <textarea
        id={id}
        className="min-h-28 rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 text-base font-semibold leading-6 text-[var(--color-midnight-ink)] placeholder:text-[var(--color-fog)] focus:border-[var(--color-sky-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-morning-tint)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

export function BudgetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-[var(--color-cloud-veil)] px-3 py-2">
      <span className="font-semibold text-[var(--color-stone)]">{label}</span>
      <span className="text-right font-bold text-[var(--color-midnight-ink)]">{value}</span>
    </div>
  );
}

export function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
      <p className="text-sm font-semibold text-[var(--color-stone)]">{label}</p>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </div>
  );
}
