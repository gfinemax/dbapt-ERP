"use client";

import { CheckCircle2, ChevronDown, FilePlus2, FileSpreadsheet, Search, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { createContext, useDeferredValue, useEffectEvent, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { canApproveExpense, canEditExpense } from "./expense-access-model";
import type { ReimbursementMember } from "./reimbursement-domain";
import type { ExpenseEntryStart } from "./expense-entry";
import { expenseResolutionListHref, type ExpenseResolutionListPage } from "./expense-resolution-list";
import type { OperatingExpenseDetail } from "./operating-budget-classification";
import type { QuickExpenseConversionDraft } from "./quick-expense-conversion-repository";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { buildDocumentPdfFileName } from "@/features/shared/document-print-filename";
import { getOrganizationExpenseApprovalLine } from "@/features/approval/organization-approval-line";
import type { ApprovalDocument } from "@/features/approval/approval-domain";
import type { ExpenseComplianceSettings } from "./expense-compliance";
import { defaultExpenseComplianceSettings } from "./expense-compliance";
import { evaluateDirectExpensePolicy, type DirectExpenseDecision, type ExpenseCreationSource } from "./direct-expense-policy";
import { validateExpenseCompliance, type EvidenceKind, type EvidenceStatus, type ExpenseKind, type PettyCashTransaction } from "./expense-compliance";
import type { BankTransactionResolutionCandidate, ExpenseFactConfirmation, ExpenseFactConfirmationInput } from "./expense-compliance-repository";
import { isTaxiCardTransaction, type CorporateCardReconciliationStatus, type CorporateCardTransactionCandidate } from "./corporate-card-transaction";
import type { BusinessPartnerOcrInput, BusinessPartnerRegistrationResult } from "@/features/basic-info/business-partner-data";
import { recommendExpenseBudget, recommendOperatingExpenseDetail, type ExpenseBudgetRecommendation } from "./expense-budget-recommendation";
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
import { transitionExpenseDisbursement, type DisbursementTransitionRequest } from "./expense-disbursement-workflow";
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
  id: string;
};

export type BudgetSnapshot = {
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
  approvalStatus: ApprovalStatus;
  author: string;
  budgetItem: string;
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
  cardTransactionId?: string;
  cardLastFour?: string;
  cardReconciliationStatus?: CorporateCardReconciliationStatus;
  bankTransactionUid?: string;
  settlementRecipient?: string;
  settlementCompletedAt?: string;
  settlementAmount?: number;
  pettyCashTransactions?: PettyCashTransaction[];
  complianceWarnings?: string[];
};

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
  creationSource: ExpenseCreationSource;
  approvalDocumentId: string;
  approvalDocumentNo: string;
  approvalSkipReason: string;
  approvalSkipReasonDetail: string;
  expenseKind: ExpenseKind;
  accountingDate: string;
  actualExpenseDate: string;
  evidenceKind: EvidenceKind;
  evidenceStatus: EvidenceStatus;
  missingEvidenceReason: string;
  bankTransactionId: string;
  cardTransactionId: string;
  cardLastFour: string;
  cardReconciliationStatus: CorporateCardReconciliationStatus;
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
  title: "사무장",
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

function formatHistoryActor(item: ExpenseResolutionHistoryItem) {
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

function createBudgetSnapshot(budgetItem: string, requestAmount: number, requestedBudgetPeriod: string | undefined, budgetProfiles: Record<string, BudgetProfile>): BudgetSnapshot {
  const selectedProfile = budgetProfiles[budgetItem];
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
  const expectedUsedAmount = profile.usedAmount + (profile.reservedAmount ?? (profile.pendingApprovalAmount + profile.paymentWaitingAmount)) + currentRequestAmount;
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

export function maskAccountNumber(accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, "");
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

function escapeHtmlText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
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

function getResolutionTaxCategorySummary(resolution: ManagedExpenseResolution) {
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

function getResolutionTypeFullLabel(type: ResolutionDocumentType) {
  return type === "BATCH" ? "프로젝트 일괄 지출결의" : "단일 지출결의";
}

function getExpenseTimingLabel(timing: ExpenseTiming) {
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
      resolution.monthlyBudgetAmount !== undefined
        ? {
            budgetCheckStatus: toBudgetCheckStatus(resolution.budgetCheckStatus),
            calculationBasis: resolution.calculationBasis ?? budgetProfiles[resolution.budgetItem]?.calculationBasis ?? "-",
            budgetPeriod: resolution.budgetPeriod ?? "2026-07",
            budgetUsageRate: resolution.budgetUsageRate ?? 0,
            currentRequestAmount: resolution.currentRequestAmount ?? resolution.totalAmount,
            currentAnnualBudgetAmount:
              resolution.currentAnnualBudgetAmount ?? budgetProfiles[resolution.budgetItem]?.currentAnnualBudgetAmount ?? resolution.monthlyBudgetAmount * 12,
            expectedUsedAmount: resolution.expectedUsedAmount ?? resolution.totalAmount,
            monthlyBudgetAmount: resolution.monthlyBudgetAmount,
            paymentWaitingAmount: resolution.paymentWaitingAmount ?? 0,
            pendingApprovalAmount: resolution.pendingApprovalAmount ?? 0,
            previousAnnualBudgetAmount:
              resolution.previousAnnualBudgetAmount ?? budgetProfiles[resolution.budgetItem]?.previousAnnualBudgetAmount ?? resolution.monthlyBudgetAmount * 12,
            remainingBudgetAmount: resolution.remainingBudgetAmount ?? 0,
            usedAmount: resolution.usedAmount ?? 0,
          }
        : createBudgetSnapshot(resolution.budgetItem, resolution.totalAmount, resolution.budgetPeriod, budgetProfiles),
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
    expenseKind: resolution.expenseKind ?? "GENERAL",
    accountingDate: resolution.accountingDate ?? resolution.actualExpenseDate ?? resolution.createdAt,
    actualExpenseDate: resolution.actualExpenseDate ?? "",
    evidenceKind: resolution.evidenceKind ?? "NONE",
    evidenceStatus: resolution.evidenceStatus ?? "NONE",
    missingEvidenceReason: resolution.missingEvidenceReason ?? "",
    bankTransactionId: resolution.bankTransactionId ?? "",
    cardTransactionId: resolution.cardTransactionId ?? "",
    cardLastFour: resolution.cardLastFour ?? "",
    cardReconciliationStatus: resolution.cardReconciliationStatus ?? (resolution.cardTransactionId ? "MATCHED" : "PENDING"),
    settlementRecipient: resolution.settlementRecipient ?? resolution.accountHolder,
    settlementCompletedAt: resolution.settlementCompletedAt ?? "",
    accountHolder: resolution.accountHolder,
    author: resolution.author,
    advancePaidAmount: String(resolution.advancePaidAmount ?? ""),
    advancePaidAt: resolution.advancePaidAt ?? "",
    advancePayer: resolution.advancePayer ?? "",
    advancePaymentMethod: (resolution.advancePaymentMethod as PaymentMethod | undefined) ?? "계좌이체",
    actualUsedAmount: String(resolution.actualUsedAmount ?? ""),
    budgetItem: resolution.resolutionType === "BATCH" ? "운영비 > 임대료" : resolution.budgetItem,
    budgetRecommendation: null,
    budgetOverReason: resolution.budgetOverReason,
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
    quickEntryMode: resolution.cardReconciliationStatus || resolution.cardTransactionId || resolution.bankTransactionId ? "BUDGET_DIRECT" : "NONE",
    quickPaymentMethod: resolution.cardReconciliationStatus || resolution.cardTransactionId
      ? "CORPORATE_CARD"
      : resolution.bankTransactionId
        ? "BANK_TRANSFER"
        : resolution.expenseKind === "PERSONAL_REIMBURSEMENT"
          ? "PERSONAL_PREPAID"
          : resolution.expenseBurdenType === "CASH"
            ? "CASH"
            : "BANK_TRANSFER",
    quickExpenseCategory: resolution.subject.includes("택시") ? "택시" : resolution.subject.includes("주차") ? "주차" : resolution.subject.includes("통행료") ? "통행료" : resolution.subject.includes("식대") ? "식대" : resolution.subject.includes("소모품") ? "소모품" : "기타",
    memo: resolution.memo,
    operationExpenseDetail: resolution.operationExpenseDetail,
    expenseDetailId: resolution.expenseDetailId ?? "",
    paymentTargetId: getResolutionPaymentTargetId(resolution),
    paymentAccountNo: resolution.paymentAccountNo,
    paymentBank: resolution.paymentBank,
    paymentFlowType: resolution.paymentFlowType,
    plannedPaymentDate: resolution.plannedPaymentDate,
    postApprovalReason: resolution.postApprovalReason ?? "",
    originalResolutionId: resolution.originalResolutionId ?? "",
    settlementDueDate: resolution.settlementDueDate ?? "",
    settlementManager: resolution.settlementManager ?? "",
    reason: resolution.reason,
    relatedContract: resolution.relatedContract,
    relatedMeeting: resolution.relatedMeeting,
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
    expenseKind: "GENERAL",
    accountingDate: currentDate,
    actualExpenseDate: "",
    evidenceKind: "NONE",
    evidenceStatus: "NONE",
    missingEvidenceReason: "",
    bankTransactionId: "",
    cardTransactionId: "",
    cardLastFour: "",
    cardReconciliationStatus: "PENDING",
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
      : source.evidenceKind === "ALTERNATIVE" ? "OTHER_ALTERNATIVE" : "NONE";
  const evidenceStatus: EvidenceStatus = ["QUALIFIED", "GENERAL", "ALTERNATIVE"].includes(source.evidenceStatus)
    ? source.evidenceStatus as EvidenceStatus : "NONE";
  const expenseBurdenType: ExpenseBurdenType = source.paymentMethod === "CORPORATE_CARD" ? "CORPORATE_CARD"
    : ["BANK_TRANSFER", "AUTO_DEBIT"].includes(source.paymentMethod) ? "ORGANIZATION_PAID"
      : source.paymentMethod === "CASH" ? "CASH" : "EMPLOYEE_PREPAID";
  const expenseKind: ExpenseKind = source.paymentMethod === "PERSONAL_PREPAID" ? "PERSONAL_REIMBURSEMENT" : "GENERAL";
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
    bankTransactionId: source.bankTransactionId ?? "",
    cardTransactionId: source.cardTransactionId ?? "",
    cardReconciliationStatus: source.cardTransactionId ? "MATCHED" : "PENDING",
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

function getDisplayApprovalLine(resolution: ManagedExpenseResolution) {
  return resolution.approvalLine.map((step) =>
    getApproverLabel(step) === resolution.currentApprover && step.status === "대기"
      ? { ...step, status: "결재대기" as const }
      : step,
  );
}

function getRelatedVoucherNo(resolution: ManagedExpenseResolution) {
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

function getEvidenceRows(resolution: ManagedExpenseResolution) {
  if (resolution.evidenceMaterials.length === 0) {
    return [
      {
        amount: resolution.totalPaymentAmount,
        attachedAt: "-",
        evidenceType: resolution.evidenceType ?? "기타",
        fileName: "첨부 대기",
        issuer: resolution.vendorName,
      },
    ];
  }

  return resolution.evidenceMaterials.map((material, index) => ({
    amount: resolution.totalPaymentAmount,
    attachedAt: resolution.evidenceAttached ? resolution.createdAt : "-",
    evidenceType: normalizeEvidenceType(material),
    fileName: `${resolution.resolutionNo}-${index + 1}-${material}.pdf`,
    issuer: resolution.vendorName,
  }));
}

function normalizeEvidenceType(material: string): EvidenceType {
  if (material.includes("세금계산서")) {
    return "세금계산서";
  }
  if (material.includes("계산서")) {
    return "계산서";
  }
  if (material.includes("현금영수증")) {
    return "현금영수증";
  }
  if (material.includes("영수증")) {
    return "영수증";
  }
  if (material.includes("이체확인증")) {
    return "이체확인증";
  }
  if (material.includes("계약")) {
    return "계약서";
  }
  if (material.includes("견적")) {
    return "견적서";
  }
  if (material.includes("의결") || material.includes("회의")) {
    return "의결서";
  }

  return "기타";
}

export function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[value] ?? statusClasses.작성중}`}>
      {value}
    </span>
  );
}

function getHistoryTone(actionType: ExpenseResolutionHistoryActionType) {
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
  initialBankTransactions = [],
  initialCardTransactions = [],
  initialApprovalDocuments = [],
  initialBudgetProfiles = {},
  initialExpenseDetails = [],
  directExpenseSettings = defaultExpenseComplianceSettings,
  initialBankTransactionId,
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
  initialBankTransactions?: BankTransactionResolutionCandidate[];
  initialCardTransactions?: CorporateCardTransactionCandidate[];
  initialApprovalDocuments?: ApprovalDocument[];
  initialBudgetProfiles?: Record<string, BudgetProfile>;
  initialExpenseDetails?: OperatingExpenseDetail[];
  directExpenseSettings?: ExpenseComplianceSettings;
  initialBankTransactionId?: string;
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
  transitionDisbursement?: (input: DisbursementTransitionRequest) => Promise<ManagedExpenseResolution>;
  uploadEvidence?: (formData: FormData) => Promise<ExpenseEvidenceAttachment | ExpenseEvidenceUploadResult>;
} = {}) {
  const router = useRouter();
  const currentUserName = viewer?.display_name ?? `${currentUser.name} ${currentUser.title}`;
  const uploadEvidenceRequest = uploadEvidence ?? uploadExpenseEvidenceViaRoute;
  const [resolutions, setResolutions] = useState<ManagedExpenseResolution[]>(() =>
    initialResolutions ?? [],
  );
  const initialBankDraft = initialBankTransactions.find((item) => item.id === initialBankTransactionId && !item.linkedResolutionId);
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(!initialResolutionId && Boolean(initialBankDraft || initialEntryStart || initialQuickExpense));
  const [editingResolutionId, setEditingResolutionId] = useState<string | null>(null);
  const [isOperatingBudgetPrintOpen, setIsOperatingBudgetPrintOpen] = useState(false);
  const [paymentTargetId, setPaymentTargetId] = useState<string | null>(null);
  const [factConfirmationTarget, setFactConfirmationTarget] = useState<{ detailItem?: BatchExpenseItem; resolution: ManagedExpenseResolution } | null>(null);
  const [printWarning, setPrintWarning] = useState<{ mode: PrintRecordItem["printPurpose"]; resolutionId: string; warnings: string[] } | null>(null);
  const [printPreviewTargetId, setPrintPreviewTargetId] = useState<string | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(initialResolutionId ?? null);
  const [rejectionForm, setRejectionForm] = useState<RejectionFormState | null>(null);
  const [formState, setFormState] = useState<ResolutionFormState>(() => {
    if (initialBankDraft) return { ...createBankTransactionDraftFormState(initialBankDraft, getNextResolutionNoForLoadedPage(resolutions, initialNextResolutionNo)), author: currentUserName, settlementManager: currentUserName };
    if (initialQuickExpense) return createQuickExpenseConversionFormState(initialQuickExpense, getNextResolutionNoForLoadedPage(resolutions, initialNextResolutionNo), currentUserName);
    const form = createFormState(getNextResolutionNoForLoadedPage(resolutions, initialNextResolutionNo), undefined, currentUserName);
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
  const formBudgetSnapshot = createBudgetSnapshot(formState.budgetItem, formTotalAmount, formState.budgetPeriod, initialBudgetProfiles);
  const settlementDifference = toNumber(formState.advancePaidAmount) - toNumber(formState.actualUsedAmount || String(formTotalAmount));
  const tabItems = useMemo(() => getResolutionTabItems(resolutions, viewer), [resolutions, viewer]);
  const activeTabItem = tabItems.find((item) => item.key === activeTab) ?? tabItems[0];
  const clientSearchQuery = initialListPage && deferredSearchQuery === initialListPage.query ? "" : deferredSearchQuery;
  const visibleResolutions = useMemo(() => filterExpenseResolutions(activeTabItem.resolutions, {
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
  }), [accountTitleFilter, activeTabItem.resolutions, approvalFilter, bankLinkedFilter, clientSearchQuery, dateFromFilter, dateToFilter, evidenceStatusFilter, expenseKindFilter, overdueOnly, paymentFilter, pettyCashBatchFilter, postApprovalFilter, spenderFilter, vendorFilter]);
  const dashboard = useMemo(() => getExpenseResolutionDashboard(resolutions, getCurrentDateIso()), [resolutions]);
  const repeatedMissingEvidenceSpenders = useMemo(() => new Set(Object.entries(resolutions.filter((item) => item.evidenceStatus === "NONE" || item.evidenceStatus === "DEFICIENT").reduce<Record<string, number>>((counts, item) => { const spender = item.advancePayer || item.author; counts[spender] = (counts[spender] ?? 0) + 1; return counts; }, {})).filter(([, count]) => count >= 2).map(([spender]) => spender)), [resolutions]);
  const workflowAlerts = useMemo(() => buildExpenseResolutionAlerts(resolutions, getCurrentDateIso()), [resolutions]);
  const pendingEvidenceJobIds = formState.evidenceFiles
    .filter((file) => file.ocrJobId && file.ocrStatus === "REVIEW_REQUIRED")
    .map((file) => file.ocrJobId)
    .join(",");

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
      if (initialResolutions !== undefined) setResolutions(initialResolutions);
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

  const applyAutomaticExpenseDetail = useEffectEvent(() => {
    if (!isCreateModalOpen || formState.resolutionType === "BATCH" || expenseDetailSelectionRef.current === "MANUAL") return;
    const evidenceText = formState.evidenceFiles.map((file) => [
      file.ocrData.itemName,
      file.ocrData.recognizedText,
      file.ocrData.items?.map((item) => item.itemName).join(" "),
    ].filter(Boolean).join(" ")).join(" ");
    const result = recommendOperatingExpenseDetail(initialExpenseDetails, {
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
  }, [formState.evidenceFiles, formState.expenseDetailId, formState.memo, formState.reason, formState.resolutionType, formState.singleItems, formState.subject, formState.vendorBusinessCategory, formState.vendorBusinessType, formState.vendorName, initialExpenseDetails, isCreateModalOpen]);

  function openCreateModal() {
    setQuickConversionSourceId(null);
    setBatchImportResult(null);
    setBatchImportFileName("");
    setBatchImportError("");
    setEvidenceUploadError("");
    setVendorRegistrationNotice("");
    setEditingResolutionId(null);
    expenseDetailSelectionRef.current = "AUTO";
    setFormState(createFormState(getNextResolutionNoForLoadedPage(resolutions, initialNextResolutionNo), undefined, currentUserName));
    setIsCreateModalOpen(true);
  }

  function openExcelImportModal() {
    setQuickConversionSourceId(null);
    setEditingResolutionId(null);
    expenseDetailSelectionRef.current = "AUTO";
    setBatchImportResult(null);
    setBatchImportFileName("");
    setBatchImportError("");
    setEvidenceUploadError("");
    setFormState({
      ...createFormState(getNextResolutionNoForLoadedPage(resolutions, initialNextResolutionNo), undefined, currentUserName),
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
  }

  function openEditModal(resolution: ManagedExpenseResolution) {
    setQuickConversionSourceId(null);
    setEvidenceUploadError("");
    setPrintWarning(null);
    setSelectedDetailId(null);
    setEditingResolutionId(resolution.id);
    expenseDetailSelectionRef.current = resolution.expenseDetailId ? "MANUAL" : "AUTO";
    setFormState(createEditFormState(resolution));
    setIsCreateModalOpen(true);
  }

  function editPrintWarningResolution() {
    if (!printWarning) return;
    const resolution = resolutions.find((item) => item.id === printWarning.resolutionId);
    if (resolution) openEditModal(resolution);
  }

  function closeDetailModal() {
    setSelectedDetailId(null);
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
      const nextState = { ...current, [key]: normalizedValue };
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
          cardReconciliationStatus: current.cardTransactionId ? "MATCHED" : "PENDING",
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
        const common = {
          ...nextState,
          approvalSkipReason: value === "AUTO_DEBIT" ? "정기·반복 지출" : "승인 예산 내 일상 지출",
          bankTransactionId: value === "BANK_TRANSFER" || value === "AUTO_DEBIT" ? current.bankTransactionId : "",
          cardReconciliationStatus: value === "CORPORATE_CARD" ? (current.cardTransactionId ? "MATCHED" as const : "PENDING" as const) : "PENDING" as const,
          cardTransactionId: value === "CORPORATE_CARD" ? current.cardTransactionId : "",
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

      if (key === "cardTransactionId" && typeof value === "string") {
        const transaction = initialCardTransactions.find((candidate) => candidate.id === value);
        if (!transaction) return { ...nextState, cardLastFour: "", cardReconciliationStatus: "PENDING" };
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
        ? `신규 거래처 '${result.partner.name}'을 기초정보에 자동등록했습니다.`
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
    const expenseDetailRecommendation = recommendOperatingExpenseDetail(initialExpenseDetails, {
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
    const linkedApproval = initialApprovalDocuments.find((document) => document.id === formState.approvalDocumentId);
    const directPolicy = evaluateDirectExpensePolicy({ amount: totalPaymentAmount, budgetItem: formState.budgetItem, budgetOverReason: formState.budgetOverReason, expenseKind: formState.expenseKind, relatedContract: formState.relatedContract, relatedMeeting: formState.relatedMeeting, subject: formState.subject, reason: formState.reason, memo: formState.memo, source: formState.creationSource }, directExpenseSettings);
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
    const firstApprover = buildApprovalLine()[0];
    const isAlreadyPaid = formState.expenseTiming === "REIMBURSEMENT" && (formState.expenseBurdenType === "CORPORATE_CARD" || formState.expenseBurdenType === "ORGANIZATION_PAID");
    const usesAdvanceFields = formState.expenseTiming === "SETTLEMENT" || (formState.expenseTiming === "ADVANCE" && formState.executionMethod === "EMPLOYEE_ADVANCE");
    const approvalLine = buildApprovalLine().map((step, index) =>
      mode === "approval-request" && !viewer && index === 0 ? { ...step, status: "결재대기" as const } : step,
    );
    const pettyCashTransactions = formState.expenseKind === "PETTY_CASH_BATCH" || formState.expenseKind === "RECURRING_BATCH" ? formState.batchItems.map((item) => ({ accountTitle: item.accountTitle, amount: item.totalAmount, businessPurpose: item.businessPurpose || formState.reason || item.description, evidenceKind: item.evidenceKind, evidenceStatus: item.evidenceStatus, factConfirmationId: item.factConfirmationId, id: item.id, item: item.itemTitle, overrideReason: item.overBudgetReason, spender: item.actualSpender || formState.advancePayer || formState.author, transactionDate: item.expenseDate, vendor: item.vendorName })) : undefined;
    const compliance = validateExpenseCompliance({ beforeExpense: formState.expenseTiming === "ADVANCE", actualExpenseDate: formState.actualExpenseDate, bankTransactionId: formState.bankTransactionId || undefined, evidenceKind: formState.evidenceKind, evidenceStatus: formState.evidenceStatus, expenseKind: formState.expenseKind, missingEvidenceReason: formState.missingEvidenceReason, pettyCashItems: pettyCashTransactions, postApprovalReason: formState.postApprovalReason });
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
      cardTransactionId: formState.cardTransactionId || undefined,
      cardLastFour: formState.cardLastFour || undefined,
      cardReconciliationStatus: formState.cardTransactionId ? "MATCHED" : formState.quickEntryMode === "BUDGET_DIRECT" && formState.quickPaymentMethod === "CORPORATE_CARD" ? "PENDING" : undefined,
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
      budgetSnapshot: isBatch ? createBudgetSnapshot(formState.budgetItem, batchSummary.totalAmount, formState.budgetPeriod, initialBudgetProfiles) : formBudgetSnapshot,
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

    const editingResolution = editingResolutionId ? resolutions.find((resolution) => resolution.id === editingResolutionId) : undefined;
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
      setSaveError(error instanceof Error ? error.message : "결재 상태를 변경하지 못했습니다.");
      return false;
    }
  }

  async function approveResolution(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution?.currentApprover) await runApprovalTransition(resolution, "APPROVE", currentUserName);
  }

  async function requestApproval(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution) await runApprovalTransition(resolution, "REQUEST", resolution.author);
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
      const transitioned = transitionDisbursement
        ? await transitionDisbursement(request)
        : transitionExpenseDisbursement({ ...request, resolution, voucherNo: command === "VOUCHER_CREATE" ? getNextExpenseVoucherNo(resolutions) : undefined });
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
    if (printPurpose === "미리보기") {
      setPrintPreviewTargetId(resolution.id);
    }
  }

  function continuePrintAfterWarning() {
    if (!printWarning) {
      return;
    }

    createPrintRecord(printWarning.resolutionId, printWarning.mode);
    if (printWarning.mode === "미리보기") {
      setPrintPreviewTargetId(printWarning.resolutionId);
    }
    setPrintWarning(null);
  }

  function navigateList(page: number, query = initialListPage?.query ?? "") {
    if (!initialListPage) return;
    startListNavigation(() => router.push(expenseResolutionListHref(page, query)));
  }

  function submitListSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (initialListPage) navigateList(1, searchQuery);
  }

  return (
    <BudgetProfilesContext.Provider value={initialBudgetProfiles}>
    <ErpShell
      userLabel={currentUserName}
      activeDetailLabel="지출결의서 관리"
      activeLabel="회계/자금"
      activeWorkspaceLabel="전표·증빙관리"
      onQuickMenuSelect={(label) => {
        if (label === "지출결의 작성") {
          openCreateModal();
        }
      }}
    >
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        {saveError && !isCreateModalOpen ? <p role="alert" className="rounded-xl border border-orange-300 bg-orange-50 p-4">{saveError}</p> : null}
        {viewer?.permissions.includes("ADMIN") && <Link className="self-start rounded-lg border bg-white px-4 py-2 font-semibold" href="/finance/expense-authorizations">작성자·결재선 계정 연결</Link>}
        {selectedDetailId && !selectedDetail ? <p role="alert" className="rounded-xl border p-4">조회된 목록에서 해당 지출결의서를 찾을 수 없습니다. 조회 권한과 원본 상태를 확인해주세요.</p> : null}
        {dataLoadError ? (
          <div className="rounded-xl border border-[var(--color-tangerine)]/30 bg-[var(--color-sunset-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">
            {dataLoadError}
          </div>
        ) : null}
        <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
              회계/자금 &gt; 전표·증빙관리 &gt; 지출결의서 관리
            </p>
            <h1 className="text-3xl font-bold tracking-normal">지출결의서 관리</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
              운영비, 용역비, 토지매입비, 환불금 등 조합 지출을 결의서 작성과 승인 절차 이후 지급 및 지출전표 생성으로 연결합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full" onClick={openExcelImportModal} size="lg" variant="outline">
              <FileSpreadsheet className="size-4" />
              엑셀 가져오기
            </Button>
            <Button className="rounded-full" onClick={() => setIsOperatingBudgetPrintOpen(true)} size="lg" variant="outline">
              <FileSpreadsheet className="size-4" />
              운영비 예산표 출력
            </Button>
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={openCreateModal} size="lg">
              <FilePlus2 className="size-4" />
              지출결의 작성
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
                <button className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800" key={alert.id} onClick={() => setSelectedDetailId(alert.resolutionId)} type="button">{alert.label}</button>
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
              <form className="flex min-w-0 gap-2 xl:w-[520px]" onSubmit={submitListSearch}>
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)]">
                  <Search className="size-4 shrink-0" />
                  <input aria-label="지출결의서 검색" className="min-w-0 flex-1 bg-transparent text-[var(--color-midnight-ink)] outline-none" onChange={(event) => setSearchQuery(event.target.value)} placeholder="결의서번호, 건명, 프로젝트, 작성자 검색" value={searchQuery} />
                </label>
                {initialListPage ? <button className="rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={isListNavigationPending} type="submit">검색</button> : null}
                {initialListPage?.query ? <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm font-semibold" disabled={isListNavigationPending} onClick={() => { setSearchQuery(""); navigateList(1, ""); }} type="button">초기화</button> : null}
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
                  {activeTabItem.label} 기준 {visibleResolutions.length}건
                  {initialListPage ? ` · 전체 ${initialListPage.total}건 · ${initialListPage.page}/${initialListPage.totalPages} 페이지` : ""}
                </p>
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
                    <th className="px-4 py-3 text-left">결의내용</th>
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
                          <button className="font-bold text-[var(--color-midnight-ink)] hover:text-[var(--color-deep-cobalt)] hover:underline" onClick={() => setSelectedDetailId(resolution.id)} type="button">
                            {resolution.resolutionNo}
                          </button>
                          <p className="mt-1 text-xs text-[var(--color-stone)]">작성 {resolution.createdAt}</p>
                          {resolution.actualExpenseDate ? <p className="mt-0.5 text-xs text-[var(--color-stone)]">지출 {resolution.actualExpenseDate}</p> : null}
                          <p className="mt-1 text-[11px] font-semibold text-[var(--color-stone)]">{resolution.creationSource === "APPROVAL_LINKED" ? "기안연결" : isLegacySmallExpenseResolution(resolution) ? "기존자료" : resolution.creationSource === "CONTRACT_PAYMENT" ? "계약지급" : "직접작성"}</p>
                          {resolution.cardReconciliationStatus === "PENDING" ? <p className="mt-1 w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">카드내역 연결대기</p> : resolution.cardReconciliationStatus === "MATCHED" ? <p className="mt-1 w-fit rounded-full bg-[var(--color-mint-wash)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-green-ink)]">카드내역 매칭완료</p> : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <button className="block max-w-full truncate text-left font-bold text-[var(--color-midnight-ink)] hover:text-[var(--color-deep-cobalt)] hover:underline" onClick={() => setSelectedDetailId(resolution.id)} title={getResolutionSubject(resolution)} type="button">
                            {getResolutionSubject(resolution)}
                          </button>
                          <p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">{expenseKindLabel} · {getResolutionTypeLabel(resolution.resolutionType)}</p>
                          {resolution.projectName ? <p className="mt-1 truncate text-xs text-[var(--color-stone)]" title={resolution.projectName}>프로젝트: {resolution.projectName}</p> : null}
                          {resolution.representativeAccountTitle ? <p className="mt-0.5 truncate text-xs text-[var(--color-stone)]" title={resolution.representativeAccountTitle}>계정: {resolution.representativeAccountTitle}</p> : null}
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {resolution.isPostApproval ? <ComplianceBadge label="사후결의" tone="warning" /> : null}
                            {resolution.evidenceStatus === "DEFICIENT" || resolution.evidenceStatus === "NONE" ? <ComplianceBadge label="증빙불비" tone="danger" /> : null}
                            {resolution.expenseKind === "BANK_POST_APPROVAL" && !resolution.bankTransactionId ? <ComplianceBadge label="통장 미연결" tone="danger" /> : null}
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
                              onClick={() => setSelectedDetailId(resolution.id)}
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
                                  onClick={() => setSelectedDetailId(resolution.id)}
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
                              <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-green-ink)]" type="button">
                                전표보기
                              </button>
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
          bankTransactionCandidates={initialBankTransactions}
          cardTransactionCandidates={initialCardTransactions}
          approvalDocuments={initialApprovalDocuments}
          directExpenseSettings={directExpenseSettings}
          expenseDetails={initialExpenseDetails}
          settlementCandidates={resolutions.filter(isEmployeeAdvanceSettlementSource)}
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
          canApprove={isCurrentUserApprover(selectedDetail, viewer)}
          onApprove={() => approveResolution(selectedDetail.id)}
          onClose={closeDetailModal}
          onCancelApproval={() => cancelApproval(selectedDetail.id)}
          onCancelVoucher={() => cancelVoucher(selectedDetail.id)}
          onConfirmVoucher={() => confirmVoucher(selectedDetail.id)}
          onCreateVoucher={() => createVoucher(selectedDetail.id)}
          onCreateFactConfirmation={isLegacySmallExpenseResolution(selectedDetail) ? undefined : (detailItem) => { setFactConfirmationTarget({ detailItem, resolution: selectedDetail }); setSelectedDetailId(null); }}
          onDelete={isLegacySmallExpenseResolution(selectedDetail) ? undefined : () => removeResolution(selectedDetail.id)}
          onEdit={!isLegacySmallExpenseResolution(selectedDetail) && (viewer ? canEditExpense(selectedDetail, viewer) : selectedDetail.author === currentUserName && ["작성중", "승인대기", "반려"].includes(selectedDetail.approvalStatus)) ? () => openEditModal(selectedDetail) : undefined}
          onPrintArchive={() => openPrintWithValidation(selectedDetail, "보관용")}
          onPrintPreview={() => openPrintWithValidation(selectedDetail, "미리보기")}
          onProcessPayment={() => openPaymentModal(selectedDetail)}
          onReject={() => rejectResolution(selectedDetail.id)}
          onRequestApproval={() => requestApproval(selectedDetail.id)}
          resolution={selectedDetail}
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

function ComplianceBadge({ label, tone = "default" }: { label: string; tone?: "default" | "danger" | "success" | "warning" }) {
  const tones = { default: "bg-blue-50 text-blue-800", danger: "bg-red-50 text-red-800", success: "bg-green-50 text-green-800", warning: "bg-amber-50 text-amber-900" };
  return <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${tones[tone]}`}>{label}</span>;
}

function ExpenseFactConfirmationModal({ actorLabel, deleteConfirmation, detailItem, listConfirmations, onClose, onSave, onUploadSupportingFile, resolution }: { actorLabel: string; deleteConfirmation?: (id: string, resolutionId: string, actorLabel: string) => Promise<void>; detailItem?: BatchExpenseItem; listConfirmations?: (resolutionId: string) => Promise<ExpenseFactConfirmation[]>; onClose: () => void; onSave?: (input: ExpenseFactConfirmationInput) => Promise<string>; onUploadSupportingFile?: (formData: FormData) => Promise<{ fileName: string; id: string }>; resolution: ManagedExpenseResolution }) {
  const [form, setForm] = useState<ExpenseFactConfirmationInput>({
    actualExpenseDate: detailItem?.expenseDate ?? resolution.actualExpenseDate ?? resolution.createdAt,
    actualSpender: detailItem?.actualSpender || resolution.advancePayer || resolution.author,
    amount: detailItem?.totalAmount ?? resolution.totalPaymentAmount,
    authorLabel: actorLabel,
    businessPurpose: detailItem?.businessPurpose || resolution.reason,
    detailTransactionId: detailItem?.id,
    itemDescription: detailItem?.itemTitle || resolution.subject || resolution.operationExpenseDetail,
    missingReceiptReason: "",
    paymentMethod: detailItem?.paymentMethod ?? resolution.advancePaymentMethod ?? resolution.paymentMethod ?? "개인 현금",
    resolutionId: resolution.id,
    vendorName: detailItem?.vendorName || resolution.vendorName,
  });
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState("");
  const factSaving = useRef(false);
  const [isFactSaving, setIsFactSaving] = useState(false);
  const [supportingFiles, setSupportingFiles] = useState<string[]>([]);
  const [confirmations, setConfirmations] = useState<ExpenseFactConfirmation[]>([]);
  useEffect(() => { if (listConfirmations) void listConfirmations(resolution.id).then(setConfirmations).catch(() => setConfirmations([])); }, [listConfirmations, resolution.id]);
  const update = <K extends keyof ExpenseFactConfirmationInput>(key: K, value: ExpenseFactConfirmationInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    if (!onSave) { setError("지출사실확인서 저장소가 연결되지 않았습니다."); return; }
    if (factSaving.current) return;
    factSaving.current = true; setIsFactSaving(true);
    try { setError(""); const id = await onSave(form); setSavedId(id); setForm((current) => ({ ...current, id })); if (listConfirmations) setConfirmations(await listConfirmations(resolution.id)); } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했습니다."); } finally { factSaving.current = false; setIsFactSaving(false); }
  }
  async function uploadSupportingFile(file?: File) {
    if (!file || !savedId || !onUploadSupportingFile) { setError("확인서를 먼저 저장한 후 보완자료를 첨부해주세요."); return; }
    const data = new FormData(); data.set("file", file); data.set("factConfirmationId", savedId); data.set("resolutionId", resolution.id);
    try { const result = await onUploadSupportingFile(data); setSupportingFiles((current) => [...current, result.fileName]); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "보완자료를 저장하지 못했습니다."); }
  }
  function editConfirmation(item: ExpenseFactConfirmation) { setForm({ ...item, authorLabel: actorLabel }); setSavedId(item.id); setSupportingFiles([]); }
  async function removeConfirmation(item: ExpenseFactConfirmation) { if (!deleteConfirmation || !window.confirm("지출사실확인서를 삭제할까요? 이전 이력은 감사로그에 보존됩니다.")) return; try { await deleteConfirmation(item.id, resolution.id, actorLabel); setConfirmations((current) => current.filter((entry) => entry.id !== item.id)); if (savedId === item.id) setSavedId(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "삭제하지 못했습니다."); } }
  return <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/45 p-6 print:static print:bg-white print:p-0" onClick={onClose}>
    <section aria-label="지출사실확인서" className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl print:max-w-none print:rounded-none print:shadow-none" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b px-6 py-4 print:hidden"><div><h2 className="text-xl font-bold">지출사실확인서 작성</h2><p className="mt-1 text-sm text-[var(--color-stone)]">지출결의서 {resolution.resolutionNo}{detailItem ? ` · 상세거래 ${detailItem.itemNo}` : ""}의 보완자료이며 독립 지급·전표 문서가 아닙니다.</p></div><Button onClick={onClose} variant="outline">닫기</Button></div>
      {confirmations.length ? <div className="mx-6 mt-4 grid gap-2 print:hidden">{confirmations.map((item) => <div className="flex items-center justify-between rounded-lg border bg-gray-50 px-4 py-2 text-sm" key={item.id}><span className="font-bold">{item.vendorName} · {item.amount.toLocaleString("ko-KR")}원 · revision {item.revisionNo}</span><span className="flex gap-2"><Button onClick={() => editConfirmation(item)} size="sm" variant="outline">수정</Button><Button onClick={() => void removeConfirmation(item)} size="sm" variant="outline">삭제</Button></span></div>)}</div> : null}
      <div className="m-6 min-h-[257mm] border-2 border-black p-10 print:m-0 print:min-h-[297mm] print:border-0">
        <h1 className="text-center text-3xl font-bold tracking-[0.35em]">지출사실확인서</h1>
        <p className="mt-3 text-center text-sm">연결 결의번호: {resolution.resolutionNo}</p>
        <div className="mt-10 grid grid-cols-2 gap-4 print:gap-2">
          <FactField label="실제 지출자" value={form.actualSpender} onChange={(value) => update("actualSpender", value)} />
          <FactField label="실제 지출일" type="date" value={form.actualExpenseDate} onChange={(value) => update("actualExpenseDate", value)} />
          <FactField label="구입처" value={form.vendorName} onChange={(value) => update("vendorName", value)} />
          <FactField label="지출금액" type="number" value={String(form.amount)} onChange={(value) => update("amount", Number(value))} />
          <FactField className="col-span-2" label="구입 품목 또는 서비스" value={form.itemDescription} onChange={(value) => update("itemDescription", value)} />
          <FactField className="col-span-2" label="지출 목적 및 조합 업무 관련성" value={form.businessPurpose} onChange={(value) => update("businessPurpose", value)} />
          <FactField className="col-span-2" label="영수증 미첨부 사유" value={form.missingReceiptReason} onChange={(value) => update("missingReceiptReason", value)} />
          <FactField label="결제수단" value={form.paymentMethod} onChange={(value) => update("paymentMethod", value)} />
          <div className="rounded-lg border p-3 text-sm"><span className="block text-xs font-bold text-gray-500">작성자 · 로그인 계정</span>{form.authorLabel}</div>
          <div className="rounded-lg border p-3 text-sm"><span className="block text-xs font-bold text-gray-500">사실 확인자</span>{form.confirmerLabel || "확인 권한 정책 설정 후 서명 가능"}</div>
          <div className="rounded-lg border p-3 text-sm"><span className="block text-xs font-bold text-gray-500">전자 확인기록</span>{savedId ? `저장 ID ${savedId}` : "저장 후 생성"}</div>
          <label className="col-span-2 grid gap-2 rounded-lg border p-3 text-sm font-bold print:hidden"><span>보완자료</span><input disabled={!savedId} onChange={(event) => void uploadSupportingFile(event.target.files?.[0])} type="file" />{supportingFiles.length ? <span className="text-xs text-green-700">{supportingFiles.join(", ")}</span> : <span className="text-xs text-gray-500">확인서를 저장한 뒤 사진·이체내역 등 보완자료를 첨부할 수 있습니다.</span>}</label>
        </div>
        <p className="mt-10 text-sm leading-7">위 지출은 조합 업무 수행 과정에서 실제 발생하였으며, 영수증을 첨부하지 못한 사유와 기재 내용이 사실임을 확인합니다.</p>
        <div className="mt-16 flex justify-end gap-12 text-sm"><p>작성자: {form.authorLabel} (서명)</p><p>확인자: {form.confirmerLabel || "____________"} (서명)</p></div>
      </div>
      <div className="flex justify-between border-t px-6 py-4 print:hidden"><p className="text-sm font-bold text-amber-800">저장 후에도 증빙상태는 대체증빙 또는 증빙불비로 유지됩니다.</p><div className="flex gap-2"><Button onClick={() => window.print()} variant="outline">A4 인쇄·PDF</Button><Button disabled={isFactSaving} onClick={() => void save()}>{isFactSaving ? "저장 중" : savedId ? "수정 저장" : "확인서 초안 저장"}</Button></div></div>
      {error ? <p className="mx-6 mb-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700 print:hidden">{error}</p> : null}
    </section>
  </div>;
}

function FactField({ className = "", label, onChange, type = "text", value }: { className?: string; label: string; onChange: (value: string) => void; type?: "date" | "number" | "text"; value: string }) {
  return <label className={`grid gap-1 rounded-lg border p-3 ${className}`}><span className="text-xs font-bold text-gray-500">{label}</span><input className="border-0 bg-transparent font-semibold outline-none print:appearance-none" onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

export function ExpenseResolutionDetailModal({
  canApprove = false,
  onApprove,
  onCancelApproval,
  onCancelVoucher,
  onClose,
  onConfirmVoucher,
  onCreateFactConfirmation,
  onDelete,
  onEdit,
  onCreateVoucher,
  onPrintArchive,
  onPrintPreview,
  onProcessPayment,
  onReject,
  onRequestApproval,
  resolution,
}: {
  canApprove?: boolean;
  onApprove: () => void;
  onCancelApproval?: () => void;
  onCancelVoucher?: () => void;
  onClose: () => void;
  onConfirmVoucher: () => void;
  onCreateFactConfirmation?: (detailItem?: BatchExpenseItem) => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onCreateVoucher: () => void;
  onPrintArchive: () => void;
  onPrintPreview: () => void;
  onProcessPayment: () => void;
  onReject: () => void;
  onRequestApproval: () => void;
  resolution: ManagedExpenseResolution;
}) {
  const evidenceRows = getEvidenceRows(resolution);
  const isCorporateCardPayment = normalizeExpenseTiming(resolution) === "REIMBURSEMENT" && resolution.expenseBurdenType === "CORPORATE_CARD";
  const approvalLine = getDisplayApprovalLine(resolution);
  const [historySort, setHistorySort] = useState<"asc" | "desc">("asc");
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const timelineItems = [...resolution.history].sort((first, second) =>
    historySort === "asc" ? first.actionAt.localeCompare(second.actionAt) : second.actionAt.localeCompare(first.actionAt),
  );
  const transferReceiptAttached = resolution.paymentStatus === "지급완료" || resolution.transferReceiptStatus ? "첨부" : "미첨부";

  function handleApprove() {
    onApprove();
  }

  function handleReject() {
    onReject();
  }

  function handlePayment() {
    onProcessPayment();
  }

  function handleRequestApproval() {
    onRequestApproval();
  }

  function handlePrintPreview() {
    setIsPrintMenuOpen(false);
    onPrintPreview();
  }

  function handlePrintArchive() {
    setIsPrintMenuOpen(false);
    onPrintArchive();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/88 px-4 py-8" onClick={onClose}>
      <section
        aria-labelledby="expense-resolution-detail-title"
        aria-modal="true"
        className="w-full max-w-6xl overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold" id="expense-resolution-detail-title">
              지출결의서 상세
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">
              지출결의서의 결의 내용, 결재 진행상태, 증빙자료, 지급정보, 처리이력을 확인합니다.
            </p>
          </div>
          <button aria-label="상세 닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid max-h-[72vh] gap-5 overflow-y-auto bg-[var(--color-sky-wash)]/45 p-6 xl:grid-cols-2">
          {resolution.resolutionType === "BATCH" ? (
            <>
              <DetailSection title="프로젝트 일괄 지출결의 요약" wide>
                <DetailItem label="작성방식" value={getResolutionTypeFullLabel(resolution.resolutionType)} />
                <DetailItem label="프로젝트/사업과제" value={resolution.projectName || "-"} />
                <DetailItem label="대표 계정항목" value={resolution.representativeAccountTitle} />
                <DetailItem label="대표 거래처" value={resolution.representativeVendorName} />
                <DetailItem label="총지급액" value={formatExpenseResolutionAmount(resolution.totalPaymentAmount)} />
                <DetailItem label="항목수" value={`${resolution.itemCount}건`} />
                <DetailItem label="예산초과 항목 수" value={getBudgetOverLabel(resolution.overBudgetItemCount)} />
                <DetailItem label="총 예산초과금액" value={formatExpenseResolutionAmount(resolution.totalOverBudgetAmount)} />
              </DetailSection>

              <DetailSection title="세부 지출내역" wide>
                <div className="overflow-x-auto rounded-lg border border-[var(--color-soft-border)] bg-white md:col-span-2">
                  <table className="w-full min-w-[1320px] text-left text-sm">
                    <thead className="bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]">
                      <tr>
                        {["순번", "거래일", "실제 지출자", "거래처", "지출항목명", "업무목적", "계정항목", "예산항목", "공급가액", "부가세", "합계", "예산상태", "지급상태", "증빙", "사실확인서", "전표번호"].map((column) => (
                          <th className="px-3 py-2" key={column}>
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-soft-border)]">
                      {resolution.expenseItems.map((item) => (
                        <tr className={item.budgetStatus === "OVER_BUDGET" ? "bg-[var(--color-sunset-soft)]/25" : "bg-white"} key={item.id}>
                          <td className="px-3 py-3 font-bold">{item.itemNo}</td>
                          <td className="px-3 py-3 text-[var(--color-stone)]">{item.expenseDate || "-"}</td>
                          <td className="px-3 py-3">{item.actualSpender || resolution.author}</td>
                          <td className="px-3 py-3 font-semibold">{item.vendorName || "거래처 미입력"}</td>
                          <td className="px-3 py-3">{item.itemTitle}</td>
                          <td className="px-3 py-3">{item.businessPurpose || resolution.reason}</td>
                          <td className="px-3 py-3">{item.accountTitle}</td>
                          <td className="px-3 py-3">{item.budgetItem}</td>
                          <td className="px-3 py-3 text-right">{formatExpenseResolutionAmount(toNumber(item.supplyAmount))}</td>
                          <td className="px-3 py-3 text-right">{formatExpenseResolutionAmount(toNumber(item.vatAmount))}</td>
                          <td className="px-3 py-3 text-right font-bold">{formatExpenseResolutionAmount(item.totalAmount)}</td>
                          <td className="px-3 py-3">
                            <Badge value={item.budgetStatus === "OVER_BUDGET" ? "예산초과" : "정상"} />
                          </td>
                          <td className="px-3 py-3">
                            <Badge value={item.paymentStatus} />
                          </td>
                          <td className="px-3 py-3">{item.evidenceFileName || item.evidenceType || "미첨부"}</td>
                          <td className="px-3 py-3">{onCreateFactConfirmation ? <button className="rounded-full border border-[var(--color-soft-border)] px-2.5 py-1 text-xs font-bold text-[var(--color-deep-cobalt)]" onClick={() => onCreateFactConfirmation(item)} type="button">작성</button> : item.factConfirmationId ? "연결됨" : "-"}</td>
                          <td className="px-3 py-3 font-semibold text-[var(--color-deep-cobalt)]">{item.voucherNo ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DetailSection>
            </>
          ) : null}

          {isLegacySmallExpenseResolution(resolution) ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-bold">기존 소액 일괄결의 · 조회 전용</p>
              <p className="mt-1 leading-6">내용 수정과 삭제는 중단됐어. 기존 승인·지급 이력 확인과 출력, 진행 중인 후속 처리는 계속할 수 있어.</p>
            </div>
          ) : null}

          <DetailSection title="기본정보">
            <DetailItem label="결의서번호" value={resolution.resolutionNo} />
            <DetailItem label="작성경로" value={resolution.creationSource === "APPROVAL_LINKED" ? `기안연결 · ${resolution.approvalDocumentNo ?? "문서번호 미확인"}` : isLegacySmallExpenseResolution(resolution) ? "기존 소액 일괄결의 · 조회 전용" : resolution.creationSource === "CONTRACT_PAYMENT" ? "계약 분할지급" : `직접 작성 · ${resolution.approvalSkipReason ?? "생략 사유 미입력"}`} />
            <DetailItem label="작성방식" value={getResolutionTypeFullLabel(resolution.resolutionType)} />
            <DetailItem label="건명" value={getResolutionSubject(resolution)} wide />
            <DetailItem label="작성일" value={resolution.createdAt} />
            <DetailItem label="작성자" value={resolution.author} />
            <DetailItem label="지출예정일" value={resolution.plannedPaymentDate || "-"} />
            <DetailItem label="승인상태" value={<Badge value={resolution.approvalStatus} />} />
            <DetailItem label="지급상태" value={<Badge value={resolution.paymentStatus} />} />
            <DetailItem label="현재결재자" value={resolution.currentApprover ?? "없음"} />
          </DetailSection>

          <DetailSection title="지출정보">
            <DetailItem label="지출구분" value={resolution.expenseType} />
            <DetailItem label="예산항목" value={resolution.budgetItem || "-"} />
            <DetailItem label="거래처명" value={resolution.vendorName} />
            <DetailItem label="총지급액" value={formatExpenseResolutionAmount(resolution.totalPaymentAmount)} />
            <DetailItem label="공급가액" value={formatExpenseResolutionAmount(resolution.supplyAmount)} />
            <DetailItem label="세금구분" value={getResolutionTaxCategorySummary(resolution)} />
            <DetailItem label="부가세" value={formatExpenseResolutionAmount(resolution.vat)} />
            <DetailItem label="지출사유" value={resolution.reason || "-"} wide />
          </DetailSection>

          <DetailSection title={isCorporateCardPayment ? "법인카드 결제정보" : "지급정보"}>
            {isCorporateCardPayment ? <><DetailItem label="결제수단" value="공용 법인카드" /><DetailItem label="별도 지급" value="없음" /><DetailItem label="카드번호" value={resolution.cardLastFour ? `끝 ${resolution.cardLastFour}` : "카드내역 연결대기"} /></> : <><DetailItem label="지급은행" value={resolution.paymentBank || "-"} /><DetailItem label="지급계좌번호" value={resolution.paymentAccountNo || "-"} /><DetailItem label="예금주" value={resolution.accountHolder || "-"} /></>}
            <DetailItem label="지급예정일" value={resolution.plannedPaymentDate || "-"} />
            <DetailItem label="지급일" value={resolution.paidAt ?? "-"} />
            <DetailItem label="업무유형" value={getExpenseTimingLabel(normalizeExpenseTiming(resolution))} />
            <DetailItem label="지급상태" value={<Badge value={resolution.paymentStatus} />} />
            <DetailItem label="정산상태" value={resolution.settlementStatus} />
            <DetailItem label="이체확인증 첨부 여부" value={transferReceiptAttached} />
          </DetailSection>

          <DetailSection title="예산반영">
            <DetailItem label="예산기간" value={resolution.budgetSnapshot.budgetPeriod} />
            <DetailItem label="예산항목" value={resolution.budgetItem || "-"} />
            <DetailItem label="월 예산" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.monthlyBudgetAmount)} />
            <DetailItem label="2025년(전기) 연간예산" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.previousAnnualBudgetAmount)} />
            <DetailItem label="2026년(당기) 연간예산" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.currentAnnualBudgetAmount)} />
            <DetailItem label="내역 및 산출근거" value={resolution.budgetSnapshot.calculationBasis} wide />
            <DetailItem label="기집행액" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.usedAmount)} />
            <DetailItem label="승인대기액" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.pendingApprovalAmount)} />
            <DetailItem label="지급대기액" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.paymentWaitingAmount)} />
            <DetailItem label="이번 결의금액" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.currentRequestAmount)} />
            <DetailItem label="결의 후 잔여예산" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.remainingBudgetAmount)} />
            <DetailItem label="집행률" value={`${resolution.budgetSnapshot.budgetUsageRate}%`} />
            <DetailItem label="예산검토" value={<Badge value={resolution.budgetSnapshot.budgetCheckStatus} />} />
          </DetailSection>

          <DetailSection title="연결정보">
            <DetailItem label="관련계약" value={resolution.relatedContract || "-"} />
            <DetailItem label="관련회의/의결" value={resolution.relatedMeeting || "-"} />
            <DetailItem label="관련 전표번호" value={getRelatedVoucherNo(resolution)} />
            <DetailItem label="전표상태" value={<Badge value={getVoucherStatusLabel(resolution)} />} />
            <DetailItem label="관련 예산항목" value={resolution.budgetItem || "-"} />
          </DetailSection>

          <DetailSection title="출력보관" wide>
            <div className="overflow-hidden rounded-lg border border-[var(--color-soft-border)] bg-white">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]">
                  <tr>
                    <th className="px-3 py-2">출력번호</th>
                    <th className="px-3 py-2">출력일시</th>
                    <th className="px-3 py-2">출력자</th>
                    <th className="px-3 py-2">출력목적</th>
                    <th className="px-3 py-2">출력본</th>
                    <th className="px-3 py-2">보관위치</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-soft-border)]">
                  {resolution.printRecords.length > 0 ? (
                    resolution.printRecords.map((record) => (
                      <tr key={record.id}>
                        <td className="px-3 py-3 font-semibold text-[var(--color-deep-cobalt)]">{record.printNo}</td>
                        <td className="px-3 py-3 text-[var(--color-stone)]">{record.printedAt}</td>
                        <td className="px-3 py-3">{record.printedBy}</td>
                        <td className="px-3 py-3">{record.printPurpose}</td>
                        <td className="px-3 py-3">{record.copyKind}</td>
                        <td className="px-3 py-3 text-[var(--color-stone)]">{record.storageLocation ?? "보관위치 미등록"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-center text-[var(--color-stone)]" colSpan={6}>
                        아직 출력 또는 보관 이력이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DetailSection>

          <DetailSection title="결재선" wide>
            <div className="overflow-hidden rounded-lg border border-[var(--color-soft-border)] bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]">
                  <tr>
                    <th className="px-3 py-2">순서</th>
                    <th className="px-3 py-2">결재자</th>
                    <th className="px-3 py-2">직책</th>
                    <th className="px-3 py-2">결재상태</th>
                    <th className="px-3 py-2">처리일</th>
                    <th className="px-3 py-2">의견</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-soft-border)]">
                  {approvalLine.map((step) => (
                    <tr key={step.order}>
                      <td className="px-3 py-3">{step.order}차</td>
                      <td className="px-3 py-3 font-semibold">{step.approver}</td>
                      <td className="px-3 py-3">{step.role}</td>
                      <td className="px-3 py-3">
                        <Badge value={step.status} />
                      </td>
                      <td className="px-3 py-3 text-[var(--color-stone)]">{step.processedAt ?? "-"}</td>
                      <td className="px-3 py-3 text-[var(--color-stone)]">
                        {step.status === "반려" ? (resolution.rejectionReason ?? "반려") : step.status === "승인완료" ? "승인" : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailSection>

          <DetailSection title="증빙자료" wide>
            <div className="overflow-hidden rounded-lg border border-[var(--color-soft-border)] bg-white">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]">
                  <tr>
                    <th className="px-3 py-2">증빙유형</th>
                    <th className="px-3 py-2">파일명</th>
                    <th className="px-3 py-2">발행처</th>
                    <th className="px-3 py-2">금액</th>
                    <th className="px-3 py-2">첨부일</th>
                    <th className="px-3 py-2">보기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-soft-border)]">
                  {evidenceRows.map((evidence) => (
                    <tr key={`${evidence.evidenceType}-${evidence.fileName}`}>
                      <td className="px-3 py-3 font-semibold">{evidence.evidenceType}</td>
                      <td className="px-3 py-3 text-[var(--color-stone)]">{evidence.fileName}</td>
                      <td className="px-3 py-3">{evidence.issuer}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatExpenseResolutionAmount(evidence.amount)}</td>
                      <td className="px-3 py-3 text-[var(--color-stone)]">{evidence.attachedAt}</td>
                      <td className="px-3 py-3">
                        <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]" type="button">
                          보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailSection>

          <DetailSection title="처리이력" wide>
            <div className="md:col-span-2">
              <div className="mb-3 flex justify-end gap-2">
                {[
                  { label: "오래된순", value: "asc" as const },
                  { label: "최신순", value: "desc" as const },
                ].map((option) => (
                  <button
                    className={`rounded-full border border-[var(--color-soft-border)] px-3 py-1.5 text-xs font-semibold ${
                      historySort === option.value ? "bg-[var(--color-pressed-charcoal)] text-white" : "bg-white text-[var(--color-stone)]"
                    }`}
                    key={option.value}
                    onClick={() => setHistorySort(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <ol className="grid gap-3">
                {timelineItems.map((item) => (
                  <li className="grid gap-3 rounded-lg border border-[var(--color-soft-border)] bg-white p-4 text-sm md:grid-cols-[150px_22px_1fr]" key={item.id}>
                    <time className="font-semibold text-[var(--color-stone)]">{item.actionAt}</time>
                    <span className="relative flex justify-center">
                      <span className={`mt-1.5 size-3 rounded-full ${getHistoryTone(item.actionType).split(" ")[0]}`} />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-[var(--color-midnight-ink)]">
                          {formatHistoryActor(item)} · {item.actionLabel}
                        </p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getHistoryTone(item.actionType)}`}>{item.actionLabel}</span>
                      </div>
                      {item.comment ? <p className="mt-2 leading-6 text-[var(--color-stone)]">{item.comment}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </DetailSection>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          {onCreateFactConfirmation ? <Button className="rounded-full" onClick={() => onCreateFactConfirmation()} variant="outline">지출사실확인서 작성</Button> : null}
          <div className="relative">
            <Button
              aria-expanded={isPrintMenuOpen}
              aria-haspopup="menu"
              className="rounded-full"
              onClick={() => setIsPrintMenuOpen((current) => !current)}
              variant="outline"
            >
              인쇄하기
              <ChevronDown className="size-4" />
            </Button>
            {isPrintMenuOpen ? (
              <div
                className="absolute right-0 bottom-full z-10 mb-2 w-44 overflow-hidden rounded-xl border border-[var(--color-soft-border)] bg-white py-1 text-sm shadow-[0_16px_40px_rgba(16,20,24,0.16)]"
                role="menu"
              >
                <button
                  className="block w-full px-4 py-2.5 text-left font-semibold text-[var(--color-midnight-ink)] hover:bg-[var(--color-cloud-veil)]"
                  onClick={handlePrintPreview}
                  role="menuitem"
                  type="button"
                >
                  A4 출력 미리보기
                </button>
                <button
                  className="block w-full px-4 py-2.5 text-left font-semibold text-[var(--color-midnight-ink)] hover:bg-[var(--color-cloud-veil)]"
                  onClick={handlePrintArchive}
                  role="menuitem"
                  type="button"
                >
                  보관용 PDF 생성
                </button>
              </div>
            ) : null}
          </div>
          {resolution.approvalStatus === "작성중" ? (
            <>
              {onDelete ? <Button className="rounded-full text-red-700" onClick={onDelete} variant="outline">삭제</Button> : null}
              {onEdit ? <Button className="rounded-full" onClick={onEdit} variant="outline">수정</Button> : null}
              <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={handleRequestApproval}>
                승인요청
              </Button>
            </>
          ) : null}
          {resolution.approvalStatus === "승인대기" && onEdit ? (
            <Button className="rounded-full" onClick={onEdit} variant="outline">수정 후 재요청</Button>
          ) : null}
          {resolution.approvalStatus === "승인대기" && canApprove ? (
            <>
              <Button className="rounded-full" onClick={handleApprove} variant="outline">
                승인
              </Button>
              <Button className="rounded-full text-[var(--color-tangerine)]" onClick={handleReject} variant="outline">
                반려
              </Button>
            </>
          ) : null}
          {resolution.approvalStatus === "승인완료" && ["지급대기", "부분지급"].includes(resolution.paymentStatus) ? (
            <><Button className="rounded-full" onClick={onCancelApproval} variant="outline">승인취소</Button><Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={handlePayment}>지급처리</Button></>
          ) : null}
          {resolution.paymentStatus === "지급완료" && !resolution.voucherNo ? (
            <Button className="rounded-full" onClick={onCreateVoucher} variant="outline">
              전표초안 생성
            </Button>
          ) : null}
          {resolution.paymentStatus === "지급완료" && resolution.voucherStatus === "전표초안" ? (
            <Button className="rounded-full" onClick={onConfirmVoucher} variant="outline">
              전표확정
            </Button>
          ) : null}
          {resolution.voucherStatus === "전표확정" ? (
            <><Button className="rounded-full" variant="outline">전표보기</Button>{onCancelVoucher ? <Button className="rounded-full text-red-700" onClick={onCancelVoucher} variant="outline">전표취소</Button> : null}</>
          ) : null}
          {resolution.approvalStatus === "반려" && onEdit ? (
            <Button className="rounded-full" onClick={onEdit} variant="outline">
              수정 후 재요청
            </Button>
          ) : null}
          <Button className="rounded-full" onClick={onClose} variant="outline">
            닫기
          </Button>
        </div>
      </section>
    </div>
  );
}

export async function waitForExpensePrintLayout(printDocument: Document, printWindow: Window, timeoutMs = 8_000) {
  const styleLinks = Array.from(printDocument.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  const stylesReady = Promise.all(styleLinks.map((link) => {
    if (link.sheet) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => reject(new Error("출력용 스타일시트를 불러오지 못했습니다.")), { once: true });
    });
  }));
  const timeout = new Promise<never>((_, reject) => {
    printWindow.setTimeout(() => reject(new Error("출력 스타일 준비 시간이 초과되었습니다. 다시 시도해주세요.")), timeoutMs);
  });

  await Promise.race([stylesReady, timeout]);
  if (printDocument.fonts?.ready) await Promise.race([printDocument.fonts.ready, timeout]);
  await new Promise<void>((resolve) => printWindow.setTimeout(resolve, 0));
  await new Promise<void>((resolve) => printWindow.setTimeout(resolve, 0));

  const header = printDocument.querySelector<HTMLElement>(".expense-resolution-print-header");
  if (!header || printWindow.getComputedStyle(header).display !== "grid") {
    throw new Error("출력 스타일이 적용되지 않았습니다. 잠시 후 다시 시도해주세요.");
  }
}

export function getExpensePrintAmountSummary(input: {
  actualUsedAmount?: number;
  advancePaidAmount?: number;
  settlementDifference?: number;
  timing: ExpenseTiming;
  totalPaymentAmount: number;
}) {
  if (input.timing === "SETTLEMENT") {
    const advanceAmount = input.advancePaidAmount ?? 0;
    const expenseAmount = input.actualUsedAmount ?? input.totalPaymentAmount;
    const difference = input.settlementDifference ?? advanceAmount - expenseAmount;
    return {
      items: [
        { label: "선지급액", value: advanceAmount },
        { label: "총 지출액", value: expenseAmount },
        { label: difference > 0 ? "반납액" : difference < 0 ? "추가 지급액" : "정산차액", value: Math.abs(difference) },
      ],
      primaryLabel: "총 지출액",
      primaryValue: expenseAmount,
    };
  }
  return {
    items: [],
    primaryLabel: input.timing === "REIMBURSEMENT" ? "총 지출액" : "총 결의금액",
    primaryValue: input.totalPaymentAmount,
  };
}

type ExpenseEvidencePrintPage = {
  evidenceType: string;
  fileName: string;
  id: string;
  sourcePage: number;
  sourcePageCount: number;
  src: string;
};

async function prepareExpenseEvidencePrintPages(
  evidenceFiles: ExpenseEvidenceAttachment[],
  createEvidenceDownloadUrl: (storagePath: string) => Promise<string>,
) {
  const printPages: ExpenseEvidencePrintPage[] = [];
  for (const evidence of evidenceFiles) {
    const signedUrl = await createEvidenceDownloadUrl(evidence.storagePath);
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error(`${evidence.fileName} 증빙 원본을 불러오지 못했습니다.`);
    const responseContentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const contentType = responseContentType || evidence.contentType.toLowerCase();
    const isPdf = contentType === "application/pdf" || evidence.storagePath.toLowerCase().endsWith(".pdf") || evidence.fileName.toLowerCase().endsWith(".pdf");
    const isImage = contentType.startsWith("image/") || evidence.contentType.startsWith("image/");

    if (isPdf) {
      const pageImages = await renderExpenseEvidencePdfPages(await response.arrayBuffer());
      pageImages.forEach((src, pageIndex) => {
        printPages.push({
          evidenceType: evidence.ocrData.normalizedEvidenceType || evidence.evidenceType,
          fileName: evidence.fileName,
          id: `${evidence.id}-pdf-${pageIndex + 1}`,
          sourcePage: pageIndex + 1,
          sourcePageCount: pageImages.length,
          src,
        });
      });
    } else if (isImage) {
      printPages.push({
        evidenceType: evidence.ocrData.normalizedEvidenceType || evidence.evidenceType,
        fileName: evidence.fileName,
        id: `${evidence.id}-image`,
        sourcePage: 1,
        sourcePageCount: 1,
        src: await blobToDataUrl(await response.blob()),
      });
    }
  }
  return printPages;
}

async function renderExpenseEvidencePdfPages(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data }).promise;
  const pageImages: string[] = [];
  try {
    for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
      const page = await document.getPage(pageNo);
      const viewport = page.getViewport({ scale: 2.4 });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, intent: "print", viewport }).promise;
      pageImages.push(canvas.toDataURL("image/jpeg", 0.94));
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  return pageImages;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("증빙 이미지를 변환하지 못했습니다.")));
    reader.readAsDataURL(blob);
  });
}

function ExpenseResolutionPrintPreviewModal({
  createEvidenceDownloadUrl,
  onClose,
  resolution,
}: {
  createEvidenceDownloadUrl?: (storagePath: string) => Promise<string>;
  onClose: () => void;
  resolution: ManagedExpenseResolution;
}) {
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printPreparationError, setPrintPreparationError] = useState("");
  const [evidencePrintPages, setEvidencePrintPages] = useState<ExpenseEvidencePrintPage[]>([]);
  const [isEvidencePreparing, setIsEvidencePreparing] = useState(Boolean((resolution.evidenceFiles?.length ?? 0) && createEvidenceDownloadUrl));
  const vendorMissing = !resolution.vendorName.trim() || resolution.vendorName === "거래처 미입력";
  const reasonText = resolution.reason.trim() || "지출사유 미입력";
  const warningTextClass = "font-bold text-[var(--color-tangerine)]";
  const isBatchResolution = resolution.resolutionType === "BATCH";
  const expenseTiming = normalizeExpenseTiming(resolution);
  const printAmountSummary = getExpensePrintAmountSummary({
    actualUsedAmount: resolution.actualUsedAmount,
    advancePaidAmount: resolution.advancePaidAmount,
    settlementDifference: resolution.settlementDifference,
    timing: expenseTiming,
    totalPaymentAmount: resolution.totalPaymentAmount,
  });
  const printExpenseItems = isBatchResolution
    ? resolution.expenseItems
    : resolution.singleItems?.length
      ? resolution.singleItems.map((item, index) => ({
          description: item.itemName + (item.memo ? `\n${item.memo}` : ""),
          expenseDate: resolution.plannedPaymentDate || resolution.actualExpenseDate || "",
          id: item.id,
          itemNo: index + 1,
          supplyAmount: String(item.supplyAmount),
          taxCategory: item.taxCategory,
          totalAmount: item.totalAmount,
          vatAmount: String(item.vatAmount),
          vendorName: resolution.vendorName,
        }))
      : [
        {
          id: `${resolution.id}-print-item`,
          itemNo: 1,
          expenseDate: resolution.plannedPaymentDate || resolution.actualExpenseDate || "",
          vendorName: resolution.vendorName,
          itemTitle: resolution.operationExpenseDetail || resolution.expenseType,
          accountTitle: resolution.expenseType,
          budgetItem: resolution.budgetItem,
          description: resolution.budgetSnapshot.calculationBasis,
          supplyAmount: String(resolution.supplyAmount),
          vatAmount: String(resolution.vat),
          totalAmount: resolution.totalPaymentAmount,
        },
        ];
  const firstPageItems = printExpenseItems.slice(0, 7);
  const continuationPages = Array.from({ length: Math.ceil(Math.max(0, printExpenseItems.length - 7) / 12) }, (_, pageIndex) =>
    printExpenseItems.slice(7 + pageIndex * 12, 7 + (pageIndex + 1) * 12),
  );
  const totalPrintPages = 1 + continuationPages.length + evidencePrintPages.length;
  const evidenceCount = resolution.evidenceMaterials.length + resolution.expenseItems.filter((item) => item.evidenceFileName).length;
  const attachedEvidenceTypes = Array.from(new Set(
    (resolution.evidenceFiles ?? [])
      .map((file) => file.ocrData.normalizedEvidenceType || file.evidenceType)
      .filter(Boolean),
  ));
  const evidenceSummary = isBatchResolution
    ? Array.from(new Set(resolution.expenseItems.map((item) => item.evidenceType).filter(Boolean))).join(", ") || "증빙 미첨부"
    : attachedEvidenceTypes.join(", ") || resolution.evidenceType || resolution.evidenceMaterials.join(", ") || "증빙 미첨부";
  const evidenceText = evidenceCount > 0 ? `${evidenceSummary} ${evidenceCount}건` : "증빙 미첨부";
  const evidenceConnectionError = (resolution.evidenceFiles?.length ?? 0) > 0 && !createEvidenceDownloadUrl
    ? "증빙 원본을 출력할 수 있도록 연결되지 않았습니다."
    : "";
  const displayedPrintError = printPreparationError || evidenceConnectionError;

  useEffect(() => {
    const evidenceFiles = resolution.evidenceFiles ?? [];
    if (!evidenceFiles.length || !createEvidenceDownloadUrl) return;

    let cancelled = false;
    void prepareExpenseEvidencePrintPages(evidenceFiles, createEvidenceDownloadUrl)
      .then((pages) => {
        if (!cancelled) setEvidencePrintPages(pages);
      })
      .catch((error) => {
        if (!cancelled) setPrintPreparationError(error instanceof Error ? error.message : "증빙 원본을 출력용으로 준비하지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setIsEvidencePreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [createEvidenceDownloadUrl, resolution.evidenceFiles]);

  async function handleBrowserPrint() {
    const printShell = document.querySelector<HTMLElement>(".print-modal-shell");
    if (!printShell) return;
    setIsPreparingPrint(true);
    setPrintPreparationError("");

    const pdfFileName = buildExpenseResolutionPdfFileName(resolution.resolutionNo, getResolutionSubject(resolution));
    const printTitle = pdfFileName.replace(/\.pdf$/i, "");
    const originalDocumentTitle = document.title;
    let titleRestored = false;
    const restoreDocumentTitle = () => {
      if (titleRestored) return;
      titleRestored = true;
      document.title = originalDocumentTitle;
    };

    // Chrome uses the top-level document title, rather than the hidden print
    // iframe title, as the suggested "Save as PDF" file name.
    document.title = printTitle;

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    document.body.appendChild(frame);

    const printDocument = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!printDocument || !printWindow) {
      frame.remove();
      restoreDocumentTitle();
      return;
    }

    const styles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join("\n");

    printDocument.open();
    printDocument.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtmlText(printTitle)}</title>${styles}</head><body>${printShell.outerHTML}</body></html>`);
    printDocument.close();

    try {
      await waitForExpensePrintLayout(printDocument, printWindow);
      const cleanup = () => {
        restoreDocumentTitle();
        frame.remove();
      };
      printWindow.addEventListener("afterprint", cleanup, { once: true });
      printWindow.focus();
      printWindow.print();
      window.setTimeout(cleanup, 60_000);
    } catch (error) {
      frame.remove();
      restoreDocumentTitle();
      setPrintPreparationError(error instanceof Error ? error.message : "출력 스타일을 준비하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setIsPreparingPrint(false);
    }
  }

  return createPortal(
    <div className="print-modal-shell fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/88 px-4 py-8" onClick={onClose}>
      <section
        aria-labelledby="expense-resolution-print-title"
        aria-modal="true"
        className="w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="expense-resolution-print-modal-header flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold" id="expense-resolution-print-title">
              지출결의서 출력 미리보기
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">A4 세로 기준 보관용 문서 형태를 확인합니다.</p>
          </div>
          <button aria-label="출력 미리보기 닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="print-expense-resolution bg-[var(--color-cloud-veil)] p-6">
          <article className="erp-print-page expense-resolution-print-page mx-auto rounded-sm bg-white shadow-sm">
            <header className="expense-resolution-print-header grid grid-cols-[1fr_70mm] items-center gap-8 border-b-2 border-[var(--color-midnight-ink)] pb-5">
              <div className="min-w-0">
                <p className="mb-2 inline-flex rounded-full bg-[var(--color-cloud-veil)] px-2.5 py-1 text-[9px] font-bold text-[var(--color-stone)]">{getExpenseTimingLabel(expenseTiming)}</p>
                <h3 className="text-[35px] font-black tracking-[0.16em]">지출결의서</h3>
                <p className="mt-1.5 text-[15px] font-semibold text-[var(--color-stone)]">대방동 지역주택조합</p>
              </div>
              <ExpenseApprovalBox resolution={resolution} />
            </header>

            <section className="expense-resolution-print-section mt-6">
              <h4 className="mb-2 text-[15px] font-bold">핵심 결의정보</h4>
              <div className="grid grid-cols-2 border-y border-solid border-[#9ca3af]">
                <PrintCell label="결의서번호" value={resolution.resolutionNo} />
                <PrintCell className="border-r-0" label="작성일" value={resolution.createdAt} />
                {isBatchResolution ? <PrintCell label="프로젝트명" value={<span className={resolution.projectName.trim() ? "" : warningTextClass}>{resolution.projectName.trim() || "프로젝트 미입력"}</span>} wide /> : null}
                <PrintCell label="건명" value={getResolutionSubject(resolution)} wide />
                <PrintCell label="거래처" value={<span className={vendorMissing ? warningTextClass : ""}>{resolution.vendorName || "거래처 미입력"}</span>} />
                <PrintCell className="border-r-0" label="예산항목" value={resolution.budgetItem || "-"} />
                <PrintCell label="작성자" value={getExpensePrintPersonName(resolution.author)} />
                <PrintCell className="border-r-0" label="지출일" value={resolution.plannedPaymentDate || resolution.actualExpenseDate || "-"} />
                {resolution.expenseKind === "PERSONAL_REIMBURSEMENT" ? <PrintCell label="정산정보" value={`${resolution.settlementRecipient ?? resolution.advancePayer ?? "-"} · ${resolution.settlementStatus}`} wide /> : null}
              </div>
            </section>

            <section className="expense-resolution-print-section mt-5 border-y-2 border-[var(--color-midnight-ink)] py-3">
              {expenseTiming === "SETTLEMENT" ? (
                <div className="grid grid-cols-3 gap-4">
                  {printAmountSummary.items.map((item) => (
                    <div className="border-r border-[var(--color-soft-border)] px-3 last:border-r-0" key={item.label}>
                      <p className="text-xs font-bold text-[var(--color-stone)]">{item.label}</p>
                      <p className="mt-1 text-right text-xl font-black tracking-tight">{formatExpenseResolutionAmount(item.value)}</p>
                    </div>
                  ))}
                </div>
              ) : <div className="flex items-center justify-between gap-4">
                <p className="text-[17px] font-bold">{printAmountSummary.primaryLabel}</p>
                <p className="text-[25px] font-black tracking-tight">{formatExpenseResolutionAmount(printAmountSummary.primaryValue)}</p>
              </div>}
            </section>

            <section className="expense-resolution-print-section expense-resolution-print-items mt-5">
              <div className="mb-2 flex items-end justify-between gap-3">
                <h4 className="text-[15px] font-bold">세부 지출내역</h4>
                {isBatchResolution ? <p className="text-xs font-semibold text-[var(--color-stone)]">{resolution.projectName.trim() || "프로젝트 미입력"} · {printExpenseItems.length}건</p> : null}
              </div>
              <ExpensePrintItemsTable items={firstPageItems} totalLabel={continuationPages.length ? "본지 소계" : "전체 합계"} />
            </section>

            <section className="expense-resolution-print-section mt-5">
              <h4 className="mb-2 text-[15px] font-bold">지출사유 및 증빙</h4>
              <div className="border-y border-solid border-[#9ca3af]">
                <PrintCell label="지출사유" value={<span className={`whitespace-pre-wrap ${resolution.reason.trim() ? "" : warningTextClass}`}>{reasonText}</span>} wide />
                <PrintCell label="증빙" value={evidenceText} wide />
              </div>
            </section>

            <ExpensePrintFooter page={1} resolutionNo={resolution.resolutionNo} totalPages={totalPrintPages} />
          </article>
          {continuationPages.map((items, pageIndex) => (
            <article className="erp-print-page expense-resolution-print-page expense-resolution-continuation-page mx-auto mt-6 rounded-sm bg-white shadow-sm" key={`continuation-${pageIndex + 1}`}>
              <header className="border-b-2 border-[var(--color-midnight-ink)] pb-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold">지출결의서 세부 지출내역 계속지</h3>
                    <p className="mt-1 font-semibold">{resolution.resolutionNo} · {getResolutionSubject(resolution)}</p>
                    {isBatchResolution ? <p className="mt-1 text-xs text-[var(--color-stone)]">프로젝트: {resolution.projectName || "프로젝트 미입력"}</p> : null}
                  </div>
                  <p className="text-xs font-semibold text-[var(--color-stone)]">{pageIndex + 2} / {totalPrintPages} 페이지</p>
                </div>
              </header>
              <section className="expense-resolution-print-items mt-5">
                <ExpensePrintItemsTable
                  items={items}
                  totalLabel={pageIndex === continuationPages.length - 1 ? "전체 합계" : "계속지 소계"}
                  totals={pageIndex === continuationPages.length - 1 ? { supplyAmount: resolution.supplyAmount, totalAmount: resolution.totalPaymentAmount, vatAmount: resolution.vat } : undefined}
                />
              </section>
              <ExpensePrintFooter page={pageIndex + 2} resolutionNo={resolution.resolutionNo} totalPages={totalPrintPages} />
            </article>
          ))}
          {evidencePrintPages.map((evidencePage, pageIndex) => {
            const documentPage = 1 + continuationPages.length + pageIndex + 1;
            return (
              <article className="erp-print-page expense-resolution-print-page expense-resolution-evidence-page mx-auto mt-6 rounded-sm bg-white shadow-sm" key={evidencePage.id}>
                <header className="flex items-end justify-between gap-6 border-b-2 border-[var(--color-midnight-ink)] pb-4">
                  <div className="min-w-0">
                    <h3 className="text-[22px] font-black tracking-[0.08em]">증빙자료</h3>
                    <p className="mt-1.5 truncate text-[10px] font-semibold text-[var(--color-stone)]">{resolution.resolutionNo} · {evidencePage.fileName}</p>
                  </div>
                  <p className="shrink-0 text-[10px] font-bold text-[var(--color-stone)]">{evidencePage.evidenceType} · {evidencePage.sourcePage} / {evidencePage.sourcePageCount}</p>
                </header>
                <figure className="mt-6 flex h-[205mm] items-center justify-center overflow-hidden border border-[var(--color-soft-border)] bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={`${evidencePage.fileName} 증빙 ${evidencePage.sourcePage}페이지`} className="max-h-full max-w-full object-contain" src={evidencePage.src} />
                </figure>
                <ExpensePrintFooter page={documentPage} resolutionNo={resolution.resolutionNo} totalPages={totalPrintPages} />
              </article>
            );
          })}
        </div>

        <div className="expense-resolution-print-actions flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          {displayedPrintError ? <p className="mr-auto self-center text-sm font-bold text-[var(--color-tangerine)]" role="alert">{displayedPrintError}</p> : null}
          <Button className="rounded-full" onClick={onClose} variant="outline">
            닫기
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" disabled={isPreparingPrint || isEvidencePreparing || Boolean(displayedPrintError)} onClick={() => void handleBrowserPrint()}>
            {isEvidencePreparing ? "증빙 준비 중…" : isPreparingPrint ? "출력 스타일 준비 중…" : "브라우저 프린트"}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

type ExpensePrintItem = {
  description: string;
  expenseDate: string;
  id: string;
  itemNo: number;
  supplyAmount: string;
  taxCategory?: SingleExpenseTaxCategory;
  totalAmount: number;
  vatAmount: string;
  vendorName: string;
};

function ExpenseApprovalBox({ resolution }: { resolution: ManagedExpenseResolution }) {
  const approvalLine = getDisplayApprovalLine(resolution);
  return (
    <section className="expense-resolution-print-approval min-w-0 self-end">
      <h4 className="sr-only">결재선</h4>
      <table className="ml-auto w-[219px] table-fixed border-collapse text-center text-[13px]">
        <colgroup>
          <col className="w-[18px]" />
          {approvalLine.map((step) => <col className="w-[67px]" key={`approval-column-${step.order}`} />)}
        </colgroup>
        <tbody>
          <tr>
            <th className="expense-approval-vertical-label w-[18px] border border-[var(--color-midnight-ink)] p-0 align-middle font-black" rowSpan={2}>
              <span style={{ alignItems: "center", display: "inline-flex", flexDirection: "column", gap: "10px", lineHeight: 1 }}><span>결</span><span>재</span></span>
            </th>
            {approvalLine.map((step) => (
              <th className="border border-[var(--color-midnight-ink)] bg-[var(--color-cloud-veil)] py-0.5 font-bold" key={`role-${step.order}`}>{step.role}</th>
            ))}
          </tr>
          <tr>
            {approvalLine.map((step) => {
              const processedAt = formatApprovalDateTime(getApprovalProcessedAt(resolution, step));
              return (
                <td className="h-[52px] border border-[var(--color-midnight-ink)] px-0.5 py-0.5" key={`approval-${step.order}`}>
                  <span className="block font-bold">{step.approver}</span>
                  <span className="mt-1 block whitespace-nowrap text-[var(--color-stone)]">{processedAt || "서명란"}</span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function ExpensePrintFooter({ page, resolutionNo, totalPages }: { page: number; resolutionNo: string; totalPages: number }) {
  return (
    <footer className="mt-auto flex items-end justify-between gap-6 border-t border-[var(--color-soft-border)] pt-4 text-[9px] text-[var(--color-stone)]">
      <div>
        <p className="text-[12px] font-bold text-[var(--color-midnight-ink)]">대방동 지역주택조합</p>
        <p className="mt-1">조합원의 소중한 자금을 투명하고 책임 있게 집행합니다.</p>
      </div>
      <p className="shrink-0 text-right">{resolutionNo} · 출력일 {getCurrentDateIso()} · {page} / {totalPages}</p>
    </footer>
  );
}

function ExpensePrintItemsTable({
  items,
  totalLabel,
  totals,
}: {
  items: ExpensePrintItem[];
  totalLabel: string;
  totals?: { supplyAmount: number; totalAmount: number; vatAmount: number };
}) {
  const pageSupplyAmount = items.reduce((sum, item) => sum + toNumber(item.supplyAmount), 0);
  const pageVatAmount = items.reduce((sum, item) => sum + toNumber(item.vatAmount), 0);
  const pageTotalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
  const emptyRowCount = Math.max(0, 5 - items.length);

  return (
    <div className="overflow-x-auto border-y border-[var(--color-soft-border)] [border-bottom-style:dashed] [border-top-style:dashed]">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col className="w-[14.5833%]" />
          <col className="w-1/4" />
          <col className="w-1/6" />
          <col className="w-[14.5833%]" />
          <col className="w-[14.5833%]" />
          <col className="w-[14.5833%]" />
        </colgroup>
        <thead className="border-y border-solid border-[#9ca3af] bg-[var(--color-cloud-veil)]">
          <tr>
            {["지출일", "거래처", "내역", "공급가액", "부가세", "합계"].map((label) => (
              <th className="border-b border-r border-[var(--color-soft-border)] px-2 py-[4.5px] text-center [border-bottom-style:dashed] last:border-r-0" key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr className="expense-resolution-print-item-row text-center text-[var(--color-stone)]" key={item.id}>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-[4.5px] whitespace-nowrap [border-bottom-style:dashed]">{item.expenseDate || "-"}</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-[4.5px] font-semibold [border-bottom-style:dashed]">{item.vendorName || "거래처 미입력"}</td>
              <td className="whitespace-pre-wrap break-words border-b border-r border-[var(--color-soft-border)] px-2 py-[4.5px] [border-bottom-style:dashed]">{item.description || "-"}</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-[4.5px] whitespace-nowrap [border-bottom-style:dashed]">{formatExpenseResolutionAmount(toNumber(item.supplyAmount))}</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-[4.5px] whitespace-nowrap [border-bottom-style:dashed]">{formatExpenseResolutionAmount(toNumber(item.vatAmount))}</td>
              <td className="border-b border-[var(--color-soft-border)] px-2 py-[4.5px] font-bold whitespace-nowrap [border-bottom-style:dashed]">{formatExpenseResolutionAmount(item.totalAmount)}</td>
            </tr>
          ))}
          {Array.from({ length: emptyRowCount }, (_, rowIndex) => (
            <tr aria-hidden="true" className="expense-resolution-print-empty-row text-center" key={`empty-${rowIndex}`}>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-[4.5px] [border-bottom-style:dashed]">&nbsp;</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-[4.5px] [border-bottom-style:dashed]">&nbsp;</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-[4.5px] [border-bottom-style:dashed]">&nbsp;</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-[4.5px] [border-bottom-style:dashed]">&nbsp;</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-[4.5px] [border-bottom-style:dashed]">&nbsp;</td>
              <td className="border-b border-[var(--color-soft-border)] px-2 py-[4.5px] [border-bottom-style:dashed]">&nbsp;</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-y border-solid border-[#9ca3af] bg-[var(--color-cloud-veil)] text-center font-bold">
          <tr>
            <td className="px-2 py-[4.5px]" colSpan={3}>{totalLabel}</td>
            <td className="px-2 py-[4.5px] whitespace-nowrap">{formatExpenseResolutionAmount(totals?.supplyAmount ?? pageSupplyAmount)}</td>
            <td className="px-2 py-[4.5px] whitespace-nowrap">{formatExpenseResolutionAmount(totals?.vatAmount ?? pageVatAmount)}</td>
            <td className="px-2 py-[4.5px] whitespace-nowrap">{formatExpenseResolutionAmount(totals?.totalAmount ?? pageTotalAmount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
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

function PrintCell({ className = "", label, value, valueClassName = "", wide }: { className?: string; label: string; value: ReactNode; valueClassName?: string; wide?: boolean }) {
  return (
    <div className={`grid min-h-[8mm] grid-cols-[26mm_1fr] border-b border-r border-[var(--color-soft-border)] last:border-r-0 ${wide ? "col-span-2 border-r-0" : ""} ${className}`}>
      <span className="flex items-center bg-[var(--color-cloud-veil)] px-2.5 py-2 text-[13px] font-bold text-[var(--color-stone)]">{label}</span>
      <span className={`flex items-center justify-center whitespace-normal px-3 py-2 text-center text-[13px] font-semibold text-[var(--color-stone)] ${valueClassName}`}>{value}</span>
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

function DetailSection({ children, title, wide }: { children: ReactNode; title: string; wide?: boolean }) {
  return (
    <section className={`rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-4 ${wide ? "xl:col-span-2" : ""}`}>
      <h3 className="mb-3 text-base font-bold">{title}</h3>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
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
    ...Object.keys(budgetProfiles),
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
