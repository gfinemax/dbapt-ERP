"use client";

import { CheckCircle2, ChevronDown, FilePlus2, FileSpreadsheet, Search, X } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import {
  expenseResolutionTypeOptions,
  expenseResolutions,
  formatExpenseResolutionAmount,
} from "./expense-resolution-data";
import type { ExpenseResolution, ExpenseResolutionType, ResolutionHistory } from "./expense-resolution-data";
import { getNextDocumentNo } from "./finance-numbering";
import { hasExtractedEvidenceData, type EvidenceOcrJobProgress, type ExpenseEvidenceAttachment } from "./expense-evidence";
import { transitionExpenseApproval, type ApprovalTransitionRequest, type ApprovalWorkflowCommand } from "./expense-approval-workflow";
import { transitionExpenseDisbursement, type DisbursementTransitionRequest } from "./expense-disbursement-workflow";
import { buildExpenseResolutionAlerts, filterExpenseResolutions, getExpenseResolutionDashboard } from "./expense-resolution-insights";
import { readExpenseResolutionImportFile } from "./expense-resolution-file";
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
export type BudgetCheckStatus = "정상" | "주의" | "예산초과";
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
  evidenceFileName: string;
  evidenceType: string;
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
  vendorAddress?: string;
  vendorBusinessCategory?: string;
  vendorBusinessNumber?: string;
  vendorBusinessType?: string;
  vendorContact?: string;
  vendorRepresentative?: string;
  voucherNo?: string;
  voucherStatus?: VoucherStatus;
};

export type SingleExpenseItem = {
  id: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
  supplyAmount: number;
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
  paymentMemo?: string;
  paymentMethod?: string;
  paymentFlowType: PaymentFlowType;
  paidAt?: string;
  paymentAccountNo: string;
  paymentBank: string;
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
};

export type EvidenceType = "세금계산서" | "계산서" | "영수증" | "현금영수증" | "이체확인증" | "계약서" | "견적서" | "의결서" | "기타";

type ResolutionFormState = {
  accountHolder: string;
  author: string;
  advancePaidAmount: string;
  advancePaidAt: string;
  advancePayer: string;
  advancePaymentMethod: PaymentMethod;
  actualUsedAmount: string;
  budgetItem: string;
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
  memo: string;
  operationExpenseDetail: string;
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
const paymentTargets: PaymentTarget[] = [
  {
    accountHolder: "오학동",
    accountNumber: "110-123-456789",
    bankName: "국민은행",
    id: "staff-oh",
    label: "오학동 사무장",
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
const projectNameOptions = [
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
const accountTitleOptions = [
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
const batchEvidenceTypeOptions = ["세금계산서", "계산서", "카드영수증", "현금영수증", "계좌이체확인증", "견적서", "계약서", "의결서", "기타"];
const operatingExpenseDetailOptions = [
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

type BudgetProfile = Omit<BudgetSnapshot, "budgetCheckStatus" | "budgetUsageRate" | "currentRequestAmount" | "expectedUsedAmount" | "remainingBudgetAmount">;

const operatingBudgetProfiles: Record<string, BudgetProfile> = {
  "인건비 > 급여 > 조합장": {
    budgetPeriod: "2026-07",
    calculationBasis: "조합장 급여",
    currentAnnualBudgetAmount: 51600000,
    monthlyBudgetAmount: 4000000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 51600000,
    usedAmount: 0,
  },
  "인건비 > 급여 > 사무장": {
    budgetPeriod: "2026-07",
    calculationBasis: "사무장 급여",
    currentAnnualBudgetAmount: 42000000,
    monthlyBudgetAmount: 3500000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 42000000,
    usedAmount: 0,
  },
  "인건비 > 급여 > 사무직원": {
    budgetPeriod: "2026-07",
    calculationBasis: "사무직원 급여",
    currentAnnualBudgetAmount: 27600000,
    monthlyBudgetAmount: 2300000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 27600000,
    usedAmount: 0,
  },
  "인건비 > 상여금": {
    budgetPeriod: "2026-07",
    calculationBasis: "연 4회 지급",
    currentAnnualBudgetAmount: 39200004,
    monthlyBudgetAmount: 3266667,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 39200004,
    usedAmount: 0,
  },
  "인건비 > 보험료": {
    budgetPeriod: "2026-07",
    calculationBasis: "조합부담 4대 보험료",
    currentAnnualBudgetAmount: 11154960,
    monthlyBudgetAmount: 929580,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 11154960,
    usedAmount: 0,
  },
  "인건비 > 퇴직예치금": {
    budgetPeriod: "2026-07",
    calculationBasis: "조합장, 직원 퇴직금 상당액 예치",
    currentAnnualBudgetAmount: 9800004,
    monthlyBudgetAmount: 816667,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 9800004,
    usedAmount: 0,
  },
  "사업추진비 > 감사비": {
    budgetPeriod: "2026-07",
    calculationBasis: "15만원×4회 ×1인",
    currentAnnualBudgetAmount: 600000,
    monthlyBudgetAmount: 50000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 600000,
    usedAmount: 0,
  },
  "사업추진비 > 회의비": {
    budgetPeriod: "2026-07",
    calculationBasis: "임·대의원 5인 × 15만 × 6회",
    currentAnnualBudgetAmount: 4500000,
    monthlyBudgetAmount: 375000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 4500000,
    usedAmount: 0,
  },
  "사업추진비 > 업무추진비": {
    budgetPeriod: "2026-07",
    calculationBasis: "사업추진 관련 업무추진비, 경조사 등",
    currentAnnualBudgetAmount: 7200000,
    monthlyBudgetAmount: 600000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 7200000,
    usedAmount: 0,
  },
  "운영비 > 임대료": {
    budgetPeriod: "2026-07",
    calculationBasis: "사무실 임차료 등",
    currentAnnualBudgetAmount: 15600000,
    monthlyBudgetAmount: 1300000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 15600000,
    usedAmount: 0,
  },
  "운영비 > 도서인쇄비": {
    budgetPeriod: "2026-07",
    calculationBasis: "신문, 소식지, 사업추진 및 업무 관련 인쇄물",
    currentAnnualBudgetAmount: 2400000,
    monthlyBudgetAmount: 200000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 2400000,
    usedAmount: 0,
  },
  "운영비 > 사무등록비": {
    budgetPeriod: "2026-07",
    calculationBasis: "복사기, 회선, 유물료, 기타",
    currentAnnualBudgetAmount: 3600000,
    monthlyBudgetAmount: 300000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 3600000,
    usedAmount: 0,
  },
  "운영비 > 사무용품비": {
    budgetPeriod: "2026-07",
    calculationBasis: "각종 사무용품(생수, 커피, 음료 및 비품 등)",
    currentAnnualBudgetAmount: 2400000,
    monthlyBudgetAmount: 200000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 2400000,
    usedAmount: 0,
  },
  "운영비 > 소모품비": {
    budgetPeriod: "2026-07",
    calculationBasis: "복사용지, 토너 및 각종 소모품",
    currentAnnualBudgetAmount: 1200000,
    monthlyBudgetAmount: 100000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 1200000,
    usedAmount: 0,
  },
  "운영비 > 복리후생비": {
    budgetPeriod: "2026-07",
    calculationBasis: "식비 등",
    currentAnnualBudgetAmount: 7800000,
    monthlyBudgetAmount: 650000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 7800000,
    usedAmount: 0,
  },
  "운영비 > 수선비": {
    budgetPeriod: "2026-07",
    calculationBasis: "사무실 및 제반 수리비",
    currentAnnualBudgetAmount: 1200000,
    monthlyBudgetAmount: 100000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 1200000,
    usedAmount: 0,
  },
  "운영비 > 광고비": {
    budgetPeriod: "2026-07",
    calculationBasis: "신문광고 및 현수막, 기타 홍보비 등",
    currentAnnualBudgetAmount: 1200000,
    monthlyBudgetAmount: 100000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 1200000,
    usedAmount: 0,
  },
  "운영비 > 수도광열비": {
    budgetPeriod: "2026-07",
    calculationBasis: "수도, 전기, 가스요금 등",
    currentAnnualBudgetAmount: 2400000,
    monthlyBudgetAmount: 200000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 2400000,
    usedAmount: 0,
  },
  "운영비 > 통신비": {
    budgetPeriod: "2026-07",
    calculationBasis: "전화, 팩스, 인터넷 등",
    currentAnnualBudgetAmount: 1200000,
    monthlyBudgetAmount: 100000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 1200000,
    usedAmount: 0,
  },
  "운영비 > 여비교통비": {
    budgetPeriod: "2026-07",
    calculationBasis: "유관기관 방문 교통비, 주유비, 출장수당",
    currentAnnualBudgetAmount: 3600000,
    monthlyBudgetAmount: 300000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 3600000,
    usedAmount: 0,
  },
  "운영비 > 지급수수료": {
    budgetPeriod: "2026-07",
    calculationBasis: "송금수수료, 공부열람수수료, 인증수수료 등",
    currentAnnualBudgetAmount: 2400000,
    monthlyBudgetAmount: 200000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 2400000,
    usedAmount: 0,
  },
  "운영비 > 예비비": {
    budgetPeriod: "2026-07",
    calculationBasis: "인건비 제외한 운영비의 10% 이내",
    currentAnnualBudgetAmount: 3600000,
    monthlyBudgetAmount: 300000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 3600000,
    usedAmount: 0,
  },
  "운영비 > 법무자문": {
    budgetPeriod: "2026-07",
    calculationBasis: "기존 지출결의서 법무비 예산 연계",
    currentAnnualBudgetAmount: 51600000,
    monthlyBudgetAmount: 4300000,
    paymentWaitingAmount: 3300000,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 51600000,
    usedAmount: 0,
  },
  "운영비 > 세무자문": {
    budgetPeriod: "2026-07",
    calculationBasis: "기존 지출결의서 세무비 예산 연계",
    currentAnnualBudgetAmount: 33000000,
    monthlyBudgetAmount: 2750000,
    paymentWaitingAmount: 0,
    pendingApprovalAmount: 0,
    previousAnnualBudgetAmount: 33000000,
    usedAmount: 33000000,
  },
};
const operatingBudgetPrintItemKeys = [
  "운영비 > 임대료",
  "운영비 > 도서인쇄비",
  "운영비 > 사무등록비",
  "운영비 > 사무용품비",
  "운영비 > 소모품비",
  "운영비 > 복리후생비",
  "운영비 > 수선비",
  "운영비 > 광고비",
  "운영비 > 수도광열비",
  "운영비 > 통신비",
  "운영비 > 여비교통비",
  "운영비 > 지급수수료",
  "운영비 > 예비비",
] as const;
const budgetItemOptions = Object.keys(operatingBudgetProfiles);
const batchBudgetProfiles: Record<string, { allocatedBudget: number; executedAmount: number }> = {
  "총회비 > 대관료": { allocatedBudget: 2000000, executedAmount: 0 },
  "총회비 > 인쇄비": { allocatedBudget: 2500000, executedAmount: 0 },
  "총회비 > 우편비": { allocatedBudget: 2500000, executedAmount: 0 },
  "홍보비 > 제작비": { allocatedBudget: 1000000, executedAmount: 0 },
  "행사운영비 > 장비임차료": { allocatedBudget: 1500000, executedAmount: 0 },
  "비품비 > 사무기기": { allocatedBudget: 3000000, executedAmount: 0 },
  "토지매입비 > 계약금": { allocatedBudget: 0, executedAmount: 0 },
  "운영비 > 임대료": { allocatedBudget: 1300000, executedAmount: 0 },
  "운영비 > 사무용품비": { allocatedBudget: 200000, executedAmount: 0 },
};
const batchBudgetItemOptions = Array.from(new Set([...budgetItemOptions, ...Object.keys(batchBudgetProfiles)]));
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

type OperatingBudgetPrintRow = {
  annualAmount: number;
  calculationBasis: string;
  itemLabel: string;
  monthlyAmount: number;
  monthlyAmounts: number[];
  previousAnnualAmount: number;
  quarterlyAmounts: number[];
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
  return [
    { order: 1, approver: "장현제", role: "부장", status: "대기" },
    { order: 2, approver: "오학동", role: "사무장", status: "대기" },
    { order: 3, approver: "안동연", role: "조합장", status: "대기" },
  ];
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

function createBudgetSnapshot(budgetItem: string, requestAmount: number): BudgetSnapshot {
  const profile = operatingBudgetProfiles[budgetItem] ?? operatingBudgetProfiles["운영비 > 임대료"];
  const currentRequestAmount = requestAmount;
  const expectedUsedAmount = profile.usedAmount + profile.pendingApprovalAmount + profile.paymentWaitingAmount + currentRequestAmount;
  const remainingBudgetAmount = profile.monthlyBudgetAmount - expectedUsedAmount;
  const budgetUsageRate = Number(((expectedUsedAmount / profile.monthlyBudgetAmount) * 100).toFixed(1));

  return {
    ...profile,
    budgetCheckStatus: getBudgetCheckStatus(remainingBudgetAmount, budgetUsageRate),
    budgetUsageRate,
    currentRequestAmount,
    expectedUsedAmount,
    remainingBudgetAmount,
  };
}

function createBatchExpenseItem(itemNo: number, overrides: Partial<BatchExpenseItem> = {}): BatchExpenseItem {
  const baseItem: BatchExpenseItem = {
    accountTitle: "총회대관료",
    allocatedBudget: 0,
    budgetItem: "총회비 > 대관료",
    budgetStatus: "NORMAL",
    currentRequestAmount: 0,
    description: "정기총회 장소 대관료",
    evidenceFileName: "",
    evidenceType: "세금계산서",
    executedAmount: 0,
    expenseDate: getCurrentDateIso(),
    expenseType: "총회비",
    id: `batch-item-${itemNo}-${Date.now()}`,
    itemNo,
    itemTitle: itemNo === 1 ? "장소 대관료" : "세부 지출항목",
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

function createDefaultBatchItems() {
  return [
    createBatchExpenseItem(1, {
      accountTitle: "총회대관료",
      budgetItem: "총회비 > 대관료",
      description: "정기총회 장소 대관료",
      evidenceType: "세금계산서",
      expenseType: "총회비",
      itemTitle: "장소 대관료",
      supplyAmount: "1363636",
      vatAmount: "136364",
      vendorName: "대방컨벤션센터",
    }),
    createBatchExpenseItem(2, {
      accountTitle: "인쇄비",
      budgetItem: "총회비 > 인쇄비",
      description: "총회책자 인쇄 400부",
      evidenceType: "견적서",
      expenseType: "인쇄비",
      itemTitle: "총회책자 인쇄",
      supplyAmount: "2909091",
      vatAmount: "290909",
      vendorName: "대방인쇄기획",
    }),
  ];
}

type ProjectExpensePreset = {
  batch?: {
    batchPaymentMode?: BatchPaymentMode;
    items: Array<Partial<BatchExpenseItem>>;
    voucherCreationMode?: VoucherCreationMode;
  };
  single?: Partial<Pick<ResolutionFormState, "budgetItem" | "evidenceType" | "expenseType" | "operationExpenseDetail" | "paymentFlowType">>;
};

const projectExpensePresets: Record<string, ProjectExpensePreset> = {
  "사무국 비품 구입": {
    single: {
      budgetItem: "운영비 > 사무용품비",
      evidenceType: "영수증",
      expenseType: "운영비",
      operationExpenseDetail: "사무용품비",
      paymentFlowType: "사전결의",
    },
    batch: {
      batchPaymentMode: "ITEM",
      voucherCreationMode: "ITEM_VOUCHER",
      items: [
        {
          accountTitle: "비품비",
          budgetItem: "비품비 > 사무기기",
          description: "사무국 비품 구입",
          evidenceType: "세금계산서",
          expenseType: "비품비",
          itemTitle: "사무기기 구입",
          supplyAmount: "0",
          vatAmount: "0",
          vendorName: "",
        },
        {
          accountTitle: "사무용품비",
          budgetItem: "운영비 > 사무용품비",
          description: "사무용품 및 소모품 구입",
          evidenceType: "영수증",
          expenseType: "운영비",
          itemTitle: "사무용품 구입",
          supplyAmount: "0",
          vatAmount: "0",
          vendorName: "",
        },
      ],
    },
  },
  "사무국 운영관리": {
    single: {
      budgetItem: "운영비 > 임대료",
      evidenceType: "세금계산서",
      expenseType: "운영비",
      operationExpenseDetail: "임대료",
      paymentFlowType: "사전결의",
    },
  },
  "2026년 정기총회 준비": {
    batch: {
      batchPaymentMode: "ITEM",
      voucherCreationMode: "ITEM_VOUCHER",
      items: [
        {
          accountTitle: "총회대관료",
          budgetItem: "총회비 > 대관료",
          description: "정기총회 장소 대관료",
          evidenceType: "세금계산서",
          expenseType: "총회비",
          itemTitle: "장소 대관료",
          supplyAmount: "1363636",
          vatAmount: "136364",
          vendorName: "대방컨벤션센터",
        },
        {
          accountTitle: "인쇄비",
          budgetItem: "총회비 > 인쇄비",
          description: "총회책자 인쇄 400부",
          evidenceType: "견적서",
          expenseType: "인쇄비",
          itemTitle: "총회책자 인쇄",
          supplyAmount: "2909091",
          vatAmount: "290909",
          vendorName: "대방인쇄기획",
        },
      ],
    },
  },
  "이사회 운영": {
    single: {
      budgetItem: "사업추진비 > 회의비",
      evidenceType: "영수증",
      expenseType: "운영비",
      operationExpenseDetail: "회의비",
      paymentFlowType: "사전결의",
    },
  },
  "동작구청 실태조사 대응": {
    single: {
      budgetItem: "운영비 > 법무자문",
      evidenceType: "세금계산서",
      expenseType: "법무비",
      operationExpenseDetail: "기타",
      paymentFlowType: "사전결의",
    },
  },
  "업무대행계약 해지 대응": {
    single: {
      budgetItem: "운영비 > 법무자문",
      evidenceType: "계약서",
      expenseType: "법무비",
      operationExpenseDetail: "기타",
      paymentFlowType: "사전결의",
    },
  },
  "탈퇴·자격상실 환불관리": {
    single: {
      budgetItem: "운영비 > 지급수수료",
      evidenceType: "이체확인증",
      expenseType: "환불금",
      operationExpenseDetail: "지급수수료",
      paymentFlowType: "사전결의",
    },
  },
  "제3차 사업부지 매입 추진": {
    batch: {
      batchPaymentMode: "ITEM",
      voucherCreationMode: "ITEM_VOUCHER",
      items: [
        {
          accountTitle: "토지계약금",
          budgetItem: "토지매입비 > 계약금",
          description: "사업부지 토지계약금",
          evidenceType: "계약서",
          expenseType: "토지매입비",
          itemTitle: "토지계약금",
          supplyAmount: "0",
          vatAmount: "0",
          vendorName: "",
        },
        {
          accountTitle: "감정평가비",
          budgetItem: "운영비 > 지급수수료",
          description: "토지 감정평가 수수료",
          evidenceType: "세금계산서",
          expenseType: "감정평가비",
          itemTitle: "감정평가 수수료",
          supplyAmount: "0",
          vatAmount: "0",
          vendorName: "",
        },
      ],
    },
  },
  "홈페이지·ERP 구축": {
    batch: {
      batchPaymentMode: "ITEM",
      voucherCreationMode: "ITEM_VOUCHER",
      items: [
        {
          accountTitle: "ERP개발비",
          budgetItem: "운영비 > 지급수수료",
          description: "ERP 구축 개발비",
          evidenceType: "세금계산서",
          expenseType: "운영비",
          itemTitle: "ERP 구축",
          supplyAmount: "0",
          vatAmount: "0",
          vendorName: "",
        },
        {
          accountTitle: "홈페이지관리비",
          budgetItem: "운영비 > 지급수수료",
          description: "홈페이지 구축 및 유지관리",
          evidenceType: "세금계산서",
          expenseType: "운영비",
          itemTitle: "홈페이지 관리",
          supplyAmount: "0",
          vatAmount: "0",
          vendorName: "",
        },
      ],
    },
  },
  "세무·회계 정비": {
    single: {
      budgetItem: "운영비 > 세무자문",
      evidenceType: "세금계산서",
      expenseType: "세무비",
      operationExpenseDetail: "기타",
      paymentFlowType: "사전결의",
    },
  },
};

function hasProjectExpensePreset(projectName: string) {
  return Boolean(projectExpensePresets[projectName]);
}

function buildPresetBatchItems(items: Array<Partial<BatchExpenseItem>>) {
  return reindexBatchItems(items.map((item, index) => createBatchExpenseItem(index + 1, item)));
}

function applyProjectExpensePreset(formState: ResolutionFormState): ResolutionFormState {
  const preset = projectExpensePresets[formState.projectName];
  if (!preset) {
    return formState;
  }

  if (formState.resolutionType === "BATCH" && preset.batch) {
    return {
      ...formState,
      batchItems: buildPresetBatchItems(preset.batch.items),
      batchPaymentMode: preset.batch.batchPaymentMode ?? formState.batchPaymentMode,
      voucherCreationMode: preset.batch.voucherCreationMode ?? formState.voucherCreationMode,
    };
  }

  if (formState.resolutionType === "SINGLE" && preset.single) {
    return {
      ...formState,
      ...preset.single,
    };
  }

  return formState;
}

function getPaymentTarget(id: string) {
  return paymentTargets.find((target) => target.id === id) ?? paymentTargets[0];
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

function maskAccountNumber(accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, "");
  const suffix = digits.slice(-4);
  return suffix ? `****${suffix}` : "계좌 미등록";
}

function getExpenseBurdenLabel(value: ExpenseBurdenType) {
  return {
    CORPORATE_CARD: "법인카드 결제",
    EMPLOYEE_PREPAID: "임직원 개인 선결제",
    ORGANIZATION_PAID: "조합계좌에서 이미 지급",
    VENDOR_UNPAID: "거래처 미지급 청구",
    CASH: "현금 사용",
  }[value];
}

function getPaymentTargetSummary(target: PaymentTarget) {
  if (target.id === "manual") {
    return "이번 결의서에서 직접 지급정보를 입력합니다.";
  }

  return `${target.bankName} ${maskAccountNumber(target.accountNumber)} · 예금주 ${target.accountHolder}`;
}

function calculateSingleExpenseItem(item: SingleExpenseItem, recalculateVat = false): SingleExpenseItem {
  const supplyAmount = Math.max(0, toNumber(item.quantity) * toNumber(item.unitPrice));
  const vatAmount = recalculateVat ? Math.round(supplyAmount * 0.1) : Math.max(0, item.vatAmount);
  return { ...item, supplyAmount, vatAmount, totalAmount: supplyAmount + vatAmount };
}

function createSingleExpenseItem(overrides: Partial<SingleExpenseItem> = {}): SingleExpenseItem {
  return calculateSingleExpenseItem({
    id: `single-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    itemName: "",
    memo: "",
    quantity: "1",
    supplyAmount: 0,
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

function createAccountAllocation(overrides: Partial<AccountAllocation> = {}): AccountAllocation {
  return {
    accountTitle: "운영비",
    amount: "0",
    budgetItem: "운영비 > 임대료",
    description: "",
    id: `allocation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...overrides,
  };
}

function getPaymentTargetHeaderSummary(target: PaymentTarget) {
  if (target.id === "manual") {
    return "직접 입력 · 계좌 미등록";
  }

  return `${target.label} · ${target.bankName} ${maskAccountNumber(target.accountNumber)}`;
}

function getExpenseInfoSummary(formState: ResolutionFormState) {
  const [year, month] = (formState.budgetPeriod || formState.createdAt.slice(0, 7)).split("-");
  return `${formState.expenseType} > ${formState.operationExpenseDetail} · ${year}년 ${month}월 예산`;
}

function getResolutionSubject(resolution: ManagedExpenseResolution) {
  return resolution.subject?.trim() || (resolution.resolutionType === "BATCH" ? resolution.projectName : resolution.operationExpenseDetail) || "건명 미입력";
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
  const profile = item.allocatedBudget || item.executedAmount
    ? { allocatedBudget: item.allocatedBudget, executedAmount: item.executedAmount }
    : batchBudgetProfiles[item.budgetItem] ?? { allocatedBudget: 0, executedAmount: 0 };
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

function summarizeBatchItems(items: BatchExpenseItem[]) {
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

function getExpenseDateLabel(timing: ExpenseTiming) {
  return timing === "ADVANCE" ? "집행예정일" : timing === "REIMBURSEMENT" ? "실제 지출일" : "정산일";
}

function getBudgetOverLabel(count: number) {
  return count > 0 ? `예산초과 ${count}건` : "정상";
}

function getOperatingBudgetPrintRows(): OperatingBudgetPrintRow[] {
  return operatingBudgetPrintItemKeys.map((key) => {
    const profile = operatingBudgetProfiles[key];
    const monthlyAmounts = Array.from({ length: 12 }, () => profile.monthlyBudgetAmount);

    return {
      annualAmount: profile.currentAnnualBudgetAmount,
      calculationBasis: profile.calculationBasis,
      itemLabel: key.replace("운영비 > ", ""),
      monthlyAmount: profile.monthlyBudgetAmount,
      monthlyAmounts,
      previousAnnualAmount: profile.previousAnnualBudgetAmount,
      quarterlyAmounts: [0, 1, 2, 3].map((quarterIndex) =>
        monthlyAmounts.slice(quarterIndex * 3, quarterIndex * 3 + 3).reduce((sum, amount) => sum + amount, 0),
      ),
    };
  });
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
  return resolution.id.startsWith("expense-resolution-") ? "오학동 사무장" : resolution.author;
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

export function toManagedExpenseResolution(resolution: ExpenseResolution): ManagedExpenseResolution {
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
            calculationBasis: resolution.calculationBasis ?? operatingBudgetProfiles[resolution.budgetItem]?.calculationBasis ?? "-",
            budgetPeriod: resolution.budgetPeriod ?? "2026-07",
            budgetUsageRate: resolution.budgetUsageRate ?? 0,
            currentRequestAmount: resolution.currentRequestAmount ?? resolution.totalAmount,
            currentAnnualBudgetAmount:
              resolution.currentAnnualBudgetAmount ?? operatingBudgetProfiles[resolution.budgetItem]?.currentAnnualBudgetAmount ?? resolution.monthlyBudgetAmount * 12,
            expectedUsedAmount: resolution.expectedUsedAmount ?? resolution.totalAmount,
            monthlyBudgetAmount: resolution.monthlyBudgetAmount,
            paymentWaitingAmount: resolution.paymentWaitingAmount ?? 0,
            pendingApprovalAmount: resolution.pendingApprovalAmount ?? 0,
            previousAnnualBudgetAmount:
              resolution.previousAnnualBudgetAmount ?? operatingBudgetProfiles[resolution.budgetItem]?.previousAnnualBudgetAmount ?? resolution.monthlyBudgetAmount * 12,
            remainingBudgetAmount: resolution.remainingBudgetAmount ?? 0,
            usedAmount: resolution.usedAmount ?? 0,
          }
        : createBudgetSnapshot(resolution.budgetItem, resolution.totalAmount),
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
    accountHolder: resolution.accountHolder,
    author: resolution.author,
    advancePaidAmount: String(resolution.advancePaidAmount ?? ""),
    advancePaidAt: resolution.advancePaidAt ?? "",
    advancePayer: resolution.advancePayer ?? "",
    advancePaymentMethod: (resolution.advancePaymentMethod as PaymentMethod | undefined) ?? "계좌이체",
    actualUsedAmount: String(resolution.actualUsedAmount ?? ""),
    budgetItem: resolution.resolutionType === "BATCH" ? "운영비 > 임대료" : resolution.budgetItem,
    budgetOverReason: resolution.budgetOverReason,
    budgetPeriod: resolution.budgetSnapshot.budgetPeriod,
    batchItems: resolution.resolutionType === "BATCH" ? resolution.expenseItems.map((item) => ({ ...item })) : createDefaultBatchItems(),
    singleItems: resolution.singleItems?.length
      ? resolution.singleItems.map((item) => ({ ...item }))
      : [createSingleExpenseItem({ itemName: resolution.operationExpenseDetail, quantity: "1", unitPrice: String(resolution.supplyAmount), vatAmount: resolution.vat })],
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
    memo: resolution.memo,
    operationExpenseDetail: resolution.operationExpenseDetail,
    paymentTargetId: "",
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
    vendorAddress: resolution.vendorAddress ?? "",
    vendorBusinessCategory: resolution.vendorBusinessCategory ?? "",
    vendorBusinessNumber: resolution.vendorBusinessNumber ?? "",
    vendorBusinessType: resolution.vendorBusinessType ?? "",
    vendorContact: resolution.vendorContact ?? "",
    vendorRepresentative: resolution.vendorRepresentative ?? "",
  };
}

function createFormState(nextNo: string, currentDate = getCurrentDateIso()): ResolutionFormState {
  return applyPaymentTarget({
    resolutionNo: nextNo,
    resolutionMode: "SINGLE",
    subject: "",
    resolutionType: "SINGLE",
    projectName: "",
    createdAt: currentDate,
    author: currentUserName,
    plannedPaymentDate: currentDate,
    paymentFlowType: "사전결의",
    expenseTiming: "ADVANCE",
    executionMethod: "VENDOR_DIRECT",
    expenseBurdenType: "EMPLOYEE_PREPAID",
    inputMethod: "MANUAL",
    expenseType: "운영비",
    operationExpenseDetail: "임대료",
    budgetPeriod: "2026-07",
    budgetItem: "운영비 > 임대료",
    budgetOverReason: "",
    batchItems: createDefaultBatchItems(),
    singleItems: [createSingleExpenseItem()],
    accountAllocations: [createAccountAllocation()],
    batchPaymentMode: "ITEM",
    voucherCreationMode: "ITEM_VOUCHER",
    vendorName: "",
    vendorAddress: "",
    vendorBusinessCategory: "",
    vendorBusinessNumber: "",
    vendorBusinessType: "",
    vendorContact: "",
    vendorRepresentative: "",
    paymentTargetId: "staff-oh",
    paymentBank: "",
    paymentAccountNo: "",
    accountHolder: "",
    supplyAmount: "0",
    vat: "0",
    advancePaidAt: currentDate,
    advancePayer: currentUserName,
    advancePaymentMethod: "계좌이체",
    advancePaidAmount: "0",
    actualUsedAmount: "0",
    settlementDifferenceAction: "차액없음",
    postApprovalReason: "",
    originalResolutionId: "",
    settlementDueDate: "",
    settlementManager: currentUserName,
    reason: "",
    relatedContract: "",
    relatedMeeting: "",
    evidenceFiles: [],
    evidenceType: "세금계산서",
    memo: "",
  }, "staff-oh");
}

function toNumber(value: string) {
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

function formatFileSize(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function OcrValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-[var(--color-stone)]">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
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

function Badge({ value }: { value: string }) {
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

function isCurrentUserApprover(resolution: ManagedExpenseResolution) {
  return resolution.currentApprover === currentUserName;
}

function getResolutionTabItems(resolutions: ManagedExpenseResolution[]) {
  return [
    {
      key: "all" as const,
      label: "전체",
      resolutions,
    },
    {
      key: "mine" as const,
      label: "내가 작성한 결의서",
      resolutions: resolutions.filter((resolution) => resolution.author === currentUserName),
    },
    {
      key: "approvalInbox" as const,
      label: "결재함",
      resolutions: resolutions.filter((resolution) => resolution.approvalStatus === "승인대기" && isCurrentUserApprover(resolution)),
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
  createEvidenceDownloadUrl,
  dataLoadError,
  deleteEvidence,
  getEvidenceOcrJob,
  initialResolutions,
  persistResolution,
  retryEvidenceOcrJob,
  transitionApproval,
  transitionDisbursement,
  uploadEvidence,
}: {
  createEvidenceDownloadUrl?: (storagePath: string) => Promise<string>;
  dataLoadError?: string;
  deleteEvidence?: (storagePath: string) => Promise<void>;
  getEvidenceOcrJob?: (id: string) => Promise<EvidenceOcrJobProgress>;
  initialResolutions?: ManagedExpenseResolution[];
  persistResolution?: (resolution: ManagedExpenseResolution) => Promise<ManagedExpenseResolution>;
  retryEvidenceOcrJob?: (id: string) => Promise<void>;
  transitionApproval?: (input: ApprovalTransitionRequest) => Promise<ManagedExpenseResolution>;
  transitionDisbursement?: (input: DisbursementTransitionRequest) => Promise<ManagedExpenseResolution>;
  uploadEvidence?: (formData: FormData) => Promise<ExpenseEvidenceAttachment>;
} = {}) {
  const [resolutions, setResolutions] = useState<ManagedExpenseResolution[]>(() =>
    initialResolutions ?? expenseResolutions.map(toManagedExpenseResolution),
  );
  const [isLocalStorageHydrated, setIsLocalStorageHydrated] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [batchImportResult, setBatchImportResult] = useState<ExpenseResolutionImportResult | null>(null);
  const [batchImportFileName, setBatchImportFileName] = useState("");
  const [batchImportError, setBatchImportError] = useState("");
  const [evidenceUploadError, setEvidenceUploadError] = useState("");
  const [isEvidenceUploading, setIsEvidenceUploading] = useState(false);
  const [evidenceOcrProgress, setEvidenceOcrProgress] = useState<Record<string, EvidenceOcrJobProgress>>({});
  const [activeTab, setActiveTab] = useState<ResolutionTabKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingResolutionId, setEditingResolutionId] = useState<string | null>(null);
  const [isOperatingBudgetPrintOpen, setIsOperatingBudgetPrintOpen] = useState(false);
  const [paymentTargetId, setPaymentTargetId] = useState<string | null>(null);
  const [printWarning, setPrintWarning] = useState<{ mode: PrintRecordItem["printPurpose"]; resolutionId: string; warnings: string[] } | null>(null);
  const [printPreviewTargetId, setPrintPreviewTargetId] = useState<string | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [rejectionForm, setRejectionForm] = useState<RejectionFormState | null>(null);
  const [formState, setFormState] = useState<ResolutionFormState>(() => createFormState(getNextResolutionNo(resolutions)));
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
  const formBudgetSnapshot = createBudgetSnapshot(formState.budgetItem, formTotalAmount);
  const settlementDifference = toNumber(formState.advancePaidAmount) - toNumber(formState.actualUsedAmount || String(formTotalAmount));
  const tabItems = getResolutionTabItems(resolutions);
  const activeTabItem = tabItems.find((item) => item.key === activeTab) ?? tabItems[0];
  const visibleResolutions = filterExpenseResolutions(activeTabItem.resolutions, {
    approvalStatus: approvalFilter,
    dateFrom: dateFromFilter,
    dateTo: dateToFilter,
    overdueOnly,
    paymentStatus: paymentFilter,
    query: searchQuery,
  });
  const dashboard = getExpenseResolutionDashboard(resolutions, getCurrentDateIso());
  const workflowAlerts = buildExpenseResolutionAlerts(resolutions, getCurrentDateIso());
  const pendingEvidenceJobIds = formState.evidenceFiles
    .filter((file) => file.ocrJobId && file.ocrStatus === "REVIEW_REQUIRED")
    .map((file) => file.ocrJobId)
    .join(",");

  useEffect(() => {
    let storedResolutions: ManagedExpenseResolution[] | undefined;
    if (initialResolutions?.length) {
      localStorage.setItem(expenseResolutionLocalStorageKey, JSON.stringify(initialResolutions));
    } else {
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
      if (storedResolutions) setResolutions(storedResolutions);
      setIsLocalStorageHydrated(true);
    }, 0);
    return () => {
      window.clearTimeout(restoreTimer);
    };
  }, [initialResolutions]);

  useEffect(() => {
    if (isLocalStorageHydrated) {
      localStorage.setItem(expenseResolutionLocalStorageKey, JSON.stringify(resolutions));
    }
  }, [isLocalStorageHydrated, resolutions]);

  function openCreateModal() {
    setBatchImportResult(null);
    setBatchImportFileName("");
    setBatchImportError("");
    setEvidenceUploadError("");
    setEditingResolutionId(null);
    setFormState(createFormState(getNextResolutionNo(resolutions)));
    setIsCreateModalOpen(true);
  }

  function openExcelImportModal() {
    setEditingResolutionId(null);
    setBatchImportResult(null);
    setBatchImportFileName("");
    setBatchImportError("");
    setEvidenceUploadError("");
    setFormState({
      ...createFormState(getNextResolutionNo(resolutions)),
      inputMethod: "EXCEL",
      resolutionMode: "PROJECT_BULK",
      resolutionType: "BATCH",
    });
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setEditingResolutionId(null);
  }

  function openEditModal(resolution: ManagedExpenseResolution) {
    setEvidenceUploadError("");
    setPrintWarning(null);
    setSelectedDetailId(null);
    setEditingResolutionId(resolution.id);
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
    setFormState((current) => {
      const nextState = { ...current, [key]: value };
      if (key === "createdAt" && typeof value === "string" && (!current.plannedPaymentDate || current.plannedPaymentDate === current.createdAt)) {
        nextState.plannedPaymentDate = value;
      }

      if (key === "paymentTargetId" && typeof value === "string") {
        return applyPaymentTarget(nextState, value);
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
        if (original) {
          nextState.advancePaidAt = original.paidAt ?? original.advancePaidAt ?? original.createdAt;
          nextState.advancePaidAmount = String(original.actualPaidAmount ?? original.advancePaidAmount ?? original.totalPaymentAmount);
          nextState.projectName = original.projectName;
        }
      }

      if (key === "projectName" && typeof value === "string" && (!current.subject.trim() || current.subject === current.projectName)) {
        nextState.subject = value;
      }

      return key === "projectName" || key === "resolutionMode" ? applyProjectExpensePreset(nextState) : nextState;
    });
  }

  function updateBatchItem(itemNo: number, key: keyof BatchExpenseItem, value: string) {
    setFormState((current) => ({
      ...current,
      batchItems: reindexBatchItems(
        current.batchItems.map((item) =>
          item.itemNo === itemNo
            ? calculateBatchExpenseItem({
                ...item,
                [key]: value,
              })
            : item,
        ),
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
        return calculateSingleExpenseItem(updated, key === "quantity" || key === "unitPrice");
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
    setFormState((current) => ({
      ...current,
      accountAllocations: current.accountAllocations.map((allocation) =>
        allocation.id === id ? { ...allocation, [key]: value } : allocation,
      ),
    }));
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

  function attachBatchEvidence(itemNo: number) {
    updateBatchItem(itemNo, "evidenceFileName", `증빙첨부-ui-${itemNo}.pdf`);
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

  async function uploadEvidenceFile(file: File) {
    setEvidenceUploadError("");
    if (!uploadEvidence) {
      setEvidenceUploadError("증빙 저장소가 연결되지 않았습니다.");
      return false;
    }
    setIsEvidenceUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("resolutionNo", formState.resolutionNo);
      formData.set("evidenceType", formState.evidenceType);
      const attachment = await uploadEvidence(formData);
      setFormState((current) => {
        const withAttachment = {
          ...current,
          evidenceFiles: [...current.evidenceFiles, attachment],
          evidenceType: attachment.evidenceType as EvidenceType,
        };
        return current.inputMethod === "EVIDENCE_OCR" && !attachment.ocrJobId && hasExtractedEvidenceData(attachment.ocrData)
          ? applyEvidenceOcrToFormState(withAttachment, attachment.id)
          : withAttachment;
      });
      return true;
    } catch (error) {
      setEvidenceUploadError(error instanceof Error ? error.message : "증빙파일 업로드에 실패했습니다.");
      return false;
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
      setFormState((current) => ({ ...current, evidenceFiles: current.evidenceFiles.filter((file) => file.id !== id) }));
    } catch (error) {
      setEvidenceUploadError(error instanceof Error ? error.message : "증빙파일을 삭제하지 못했습니다.");
    }
  }

  function applyEvidenceOcr(id: string) {
    setFormState((current) => applyEvidenceOcrToFormState(current, id));
  }

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
    const ocr = evidence.ocrData;
    const next = {
      ...current,
      plannedPaymentDate: ocr.documentDate ?? current.plannedPaymentDate,
      evidenceFiles: current.evidenceFiles.map((file) => file.id === id ? { ...file, ocrStatus: "CONFIRMED" as const } : file),
      vendorName: ocr.issuer ?? current.vendorName,
      vendorAddress: ocr.issuerAddress ?? current.vendorAddress,
      vendorBusinessCategory: ocr.issuerBusinessCategory ?? current.vendorBusinessCategory,
      vendorBusinessNumber: ocr.issuerBusinessNumber ?? current.vendorBusinessNumber,
      vendorBusinessType: ocr.issuerBusinessType ?? current.vendorBusinessType,
      vendorContact: ocr.issuerContact ?? current.vendorContact,
      vendorRepresentative: ocr.issuerRepresentative ?? current.vendorRepresentative,
    };
    if (current.resolutionType !== "SINGLE" || !current.singleItems.length) return next;

    const vatAmount = ocr.vatAmount ?? 0;
    const supplyAmount = ocr.supplyAmount ?? (ocr.totalAmount !== undefined ? Math.max(ocr.totalAmount - vatAmount, 0) : undefined);
    if (supplyAmount === undefined) return next;

    const items = current.singleItems.map((item, index) => index === 0
      ? calculateSingleExpenseItem({
          ...item,
          itemName: ocr.itemName ?? item.itemName,
          quantity: String(ocr.quantity ?? 1),
          unitPrice: String(supplyAmount),
          vatAmount,
        })
      : item);
    const summary = summarizeSingleExpenseItems(items);
    return {
      ...next,
      accountAllocations: next.accountAllocations.length === 1
        ? next.accountAllocations.map((allocation) => ({ ...allocation, amount: String(summary.totalAmount) }))
        : next.accountAllocations,
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
              const updated = {
                ...current,
                evidenceFiles: current.evidenceFiles.map((file) => file.ocrJobId === id ? {
                  ...file,
                  ocrData: progress.resultData,
                  ocrStatus: hasResult ? "EXTRACTED" as const : "FAILED" as const,
                } : file),
              };
              return hasResult && current.inputMethod === "EVIDENCE_OCR"
                ? applyEvidenceOcrToFormState(updated, id)
                : updated;
            });
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
  }, [getEvidenceOcrJob, isCreateModalOpen, pendingEvidenceJobIds]);

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
    const batchSummary = summarizeBatchItems(formState.batchItems);
    const isBatch = formState.resolutionType === "BATCH";
    const totalPaymentAmount = isBatch ? batchSummary.totalAmount : formTotalAmount;
    if (mode === "approval-request") {
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
    const approvalStatus: ApprovalStatus = mode === "draft" ? "작성중" : "승인대기";
    const firstApprover = buildApprovalLine()[0];
    const isAlreadyPaid = formState.expenseTiming === "REIMBURSEMENT" && (formState.expenseBurdenType === "CORPORATE_CARD" || formState.expenseBurdenType === "ORGANIZATION_PAID");
    const usesAdvanceFields = formState.expenseTiming === "SETTLEMENT" || (formState.expenseTiming === "ADVANCE" && formState.executionMethod === "EMPLOYEE_ADVANCE");
    const approvalLine = buildApprovalLine().map((step, index) =>
      mode === "approval-request" && index === 0 ? { ...step, status: "결재대기" as const } : step,
    );
    const nextResolution: ManagedExpenseResolution = {
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
      budgetItem: isBatch ? "프로젝트 일괄 예산" : formState.budgetItem,
      budgetOverReason: formState.budgetOverReason,
      vendorName: isBatch ? batchSummary.representativeVendorName : formState.vendorName || "거래처 미입력",
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
      paymentBank: formState.paymentBank,
      paymentAccountNo: formState.paymentAccountNo,
      accountHolder: formState.accountHolder,
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
      currentApprover: mode === "approval-request" ? getApproverLabel(firstApprover) : undefined,
      paymentStatus: isAlreadyPaid ? "지급완료" : "지급전",
      settlementStatus: formState.expenseTiming === "SETTLEMENT" ? "정산대기" : "정산없음",
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
      budgetSnapshot: isBatch ? createBudgetSnapshot("운영비 > 임대료", batchSummary.totalAmount) : formBudgetSnapshot,
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
                currentApprover: mode === "approval-request" ? getApproverLabel(firstApprover) : undefined,
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
      setSaveError("");
      const savedResolution = persistResolution ? await persistResolution(resolutionToSave) : resolutionToSave;
      setResolutions((current) =>
        editingResolutionId
          ? current.map((resolution) => (resolution.id === editingResolutionId ? savedResolution : resolution))
          : [savedResolution, ...current],
      );
      closeCreateModal();
    } catch (error) {
      setResolutions((current) =>
        editingResolutionId
          ? current.map((resolution) => (resolution.id === editingResolutionId ? resolutionToSave : resolution))
          : [resolutionToSave, ...current],
      );
      console.warn(`[expense-resolutions] remote save unavailable; saved locally: ${error instanceof Error ? error.message : String(error)}`);
      closeCreateModal();
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

  return (
    <ErpShell
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
              <label className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)] xl:w-[420px]">
                <Search className="size-4 shrink-0" />
                <input aria-label="지출결의서 검색" className="min-w-0 flex-1 bg-transparent text-[var(--color-midnight-ink)] outline-none" onChange={(event) => setSearchQuery(event.target.value)} placeholder="결의서번호, 건명, 거래처명 검색" value={searchQuery} />
              </label>
              <div className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-stone)]">
                현재 사용자: {currentUserName}
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
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
                  {item.label} {item.resolutions.length}
                </button>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-soft-border)] p-4">
              <div>
                <h2 className="text-lg font-bold">지출결의서 목록</h2>
                <p className="mt-1 text-sm text-[var(--color-stone)]">{activeTabItem.label} 기준 {visibleResolutions.length}건</p>
              </div>
              <Button className="rounded-full" onClick={exportAllExpenseResolutions} size="sm" variant="outline">
                <FileSpreadsheet className="size-4" />
                엑셀
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table aria-label="지출결의서 목록" className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
                  <tr>
                    <th className="w-[120px] px-4 py-3 text-center">작성일</th>
                    <th className="px-4 py-3 text-left">결의요약</th>
                    <th className="w-[150px] px-4 py-3 text-right">총지급액</th>
                    <th className="w-[120px] px-4 py-3 text-center">예산상태</th>
                    <th className="w-[210px] px-4 py-3 text-left">진행상태</th>
                    <th className="w-[110px] px-4 py-3 text-center">증빙</th>
                    <th className="w-[190px] px-4 py-3 text-left">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-soft-border)]">
                  {visibleResolutions.length === 0 ? (
                    <tr>
                      <td className="px-4 py-12 text-center text-sm text-[var(--color-stone)]" colSpan={7}>
                        등록된 지출결의서가 없습니다. 상단의 지출결의 작성 버튼으로 첫 결의서를 등록해주세요.
                      </td>
                    </tr>
                  ) : null}
                  {visibleResolutions.map((resolution) => {
                    const canApprove = resolution.approvalStatus === "승인대기" && isCurrentUserApprover(resolution);
                    const canPay = resolution.approvalStatus === "승인완료" && ["지급대기", "부분지급"].includes(resolution.paymentStatus);
                    const canCreateVoucher = resolution.paymentStatus === "지급완료" && !resolution.voucherNo;
                    const canConfirmVoucher = resolution.paymentStatus === "지급완료" && resolution.voucherStatus === "전표초안";

                    return (
                      <tr className="bg-white/70" key={resolution.id}>
                        <td className="px-4 py-4 text-center text-[var(--color-stone)]">
                          <span className="sr-only">{resolution.resolutionNo}</span>
                          {resolution.createdAt}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="font-bold text-[var(--color-midnight-ink)]">
                            {getResolutionSubject(resolution)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">{getResolutionTypeLabel(resolution.resolutionType)} · {resolution.projectName || "프로젝트 없음"}</p>
                          <span className="sr-only">{getResolutionTypeLabel(resolution.resolutionType)}</span>
                          <span className="sr-only">{resolution.projectName || "프로젝트 없음"}</span>
                          <p className="mt-1 text-sm font-semibold text-[var(--color-stone)]">
                            {resolution.representativeVendorName} / {resolution.representativeAccountTitle}
                          </p>
                          <span className="sr-only">{resolution.representativeVendorName}</span>
                          <span className="sr-only">{resolution.representativeAccountTitle}</span>
                        </td>
                        <td className="px-4 py-4 text-right font-bold">{formatExpenseResolutionAmount(resolution.totalPaymentAmount)}</td>
                        <td className="px-4 py-4 text-center">
                          <Badge value={getBudgetOverLabel(resolution.overBudgetItemCount)} />
                          {resolution.totalOverBudgetAmount > 0 ? <p className="mt-1 text-xs text-[var(--color-tangerine)]">{formatExpenseResolutionAmount(resolution.totalOverBudgetAmount)}</p> : null}
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-[var(--color-midnight-ink)]">
                            {resolution.approvalStatus} · {resolution.paymentStatus} · {getVoucherStatusLabel(resolution)}
                          </p>
                          <span className="sr-only">{resolution.approvalStatus}</span>
                          <span className="sr-only">{resolution.paymentStatus}</span>
                          <span className="sr-only">{getVoucherStatusLabel(resolution)}</span>
                          {resolution.currentApprover ? <span className="sr-only">{resolution.currentApprover}</span> : null}
                          {resolution.currentApprover ? <p className="mt-1 text-xs text-[var(--color-stone)]">현재결재자 {resolution.currentApprover}</p> : null}
                          {resolution.rejectionReason ? <p className="mt-1 text-xs text-[var(--color-tangerine)]">{resolution.rejectionReason}</p> : null}
                          {resolution.paidAt ? <p className="mt-1 text-xs text-[var(--color-stone)]">지급일 {resolution.paidAt}</p> : null}
                          {resolution.transferReceiptStatus ? (
                            <label className="mt-2 inline-flex cursor-pointer rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-stone)]">
                              이체확인증 첨부
                              <input className="sr-only" type="file" />
                            </label>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <Badge value={resolution.evidenceAttached ? "첨부완료" : "미첨부"} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-stone)]"
                              onClick={() => setSelectedDetailId(resolution.id)}
                              type="button"
                            >
                              상세보기
                            </button>
                            {resolution.approvalStatus === "작성중" ? (
                              <>
                                <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-stone)]" type="button">
                                  수정
                                </button>
                                <button
                                  className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]"
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
                                  onClick={() => approveResolution(resolution.id)}
                                  type="button"
                                >
                                  승인
                                </button>
                                <button
                                  className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-tangerine)]"
                                  onClick={() => rejectResolution(resolution.id)}
                                  type="button"
                                >
                                  반려
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
                    <td className="px-4 py-3 text-right" colSpan={2}>
                      {activeTabItem.label} 합계
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatExpenseResolutionAmount(visibleResolutions.reduce((sum, resolution) => sum + resolution.totalPaymentAmount, 0))}
                    </td>
                    <td className="px-4 py-3" colSpan={4}>
                      표시 건수 {visibleResolutions.length}건
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </section>
      </div>

      {isCreateModalOpen ? (
        <ExpenseResolutionCreateModal
          batchImportError={batchImportError}
          batchImportFileName={batchImportFileName}
          batchImportResult={batchImportResult}
          evidenceUploadError={evidenceUploadError}
          evidenceOcrProgress={evidenceOcrProgress}
          batchSummary={formBatchSummary}
          budgetSnapshot={formBudgetSnapshot}
          formState={formState}
          settlementCandidates={resolutions.filter((resolution) => normalizeExpenseTiming(resolution) === "ADVANCE" && resolution.paymentStatus === "지급완료")}
          isEditing={Boolean(editingResolutionId)}
          isEvidenceUploading={isEvidenceUploading}
          saveError={saveError}
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
          onRequestApproval={() => saveResolution("approval-request")}
          onSaveDraft={() => saveResolution("draft")}
          onUploadEvidenceFile={uploadEvidenceFile}
          settlementDifference={settlementDifference}
          totalAmount={effectiveFormTotalAmount}
          accountAllocationTotal={accountAllocationTotal}
        />
      ) : null}

      {selectedDetail ? (
        <ExpenseResolutionDetailModal
          canApprove={isCurrentUserApprover(selectedDetail)}
          onApprove={() => approveResolution(selectedDetail.id)}
          onClose={closeDetailModal}
          onConfirmVoucher={() => confirmVoucher(selectedDetail.id)}
          onCreateVoucher={() => createVoucher(selectedDetail.id)}
          onPrintArchive={() => openPrintWithValidation(selectedDetail, "보관용")}
          onPrintPreview={() => openPrintWithValidation(selectedDetail, "미리보기")}
          onProcessPayment={() => openPaymentModal(selectedDetail)}
          onReject={() => rejectResolution(selectedDetail.id)}
          onRequestApproval={() => requestApproval(selectedDetail.id)}
          resolution={selectedDetail}
        />
      ) : null}

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
          onClose={() => setPrintPreviewTargetId(null)}
          resolution={printPreviewTarget}
        />
      ) : null}

      {printWarning ? (
        <PrintValidationWarningModal
          onCancel={() => setPrintWarning(null)}
          onContinue={continuePrintAfterWarning}
          onEdit={editPrintWarningResolution}
          warnings={printWarning.warnings}
        />
      ) : null}

      {isOperatingBudgetPrintOpen ? <OperatingBudgetPrintModal onClose={() => setIsOperatingBudgetPrintOpen(false)} /> : null}
    </ErpShell>
  );
}

function ExpenseResolutionCreateModal({
  batchImportError,
  batchImportFileName,
  batchImportResult,
  evidenceOcrProgress,
  evidenceUploadError,
  batchSummary,
  budgetSnapshot,
  formState,
  settlementCandidates,
  isEditing,
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
  onUploadEvidenceFile,
  saveError,
  settlementDifference,
  totalAmount,
  accountAllocationTotal,
  onSingleItemChange,
  onAccountAllocationChange,
}: {
  batchImportError: string;
  batchImportFileName: string;
  batchImportResult: ExpenseResolutionImportResult | null;
  evidenceOcrProgress: Record<string, EvidenceOcrJobProgress>;
  evidenceUploadError: string;
  batchSummary: ReturnType<typeof summarizeBatchItems>;
  budgetSnapshot: BudgetSnapshot;
  formState: ResolutionFormState;
  settlementCandidates: ManagedExpenseResolution[];
  isEditing: boolean;
  isEvidenceUploading: boolean;
  onAddBatchItem: () => void;
  onAddSingleItem: () => void;
  onAddAccountAllocation: () => void;
  onAttachBatchEvidence: (itemNo: number) => void;
  onBatchItemChange: (itemNo: number, key: keyof BatchExpenseItem, value: string) => void;
  onCancel: () => void;
  onChange: <K extends keyof ResolutionFormState>(key: K, value: ResolutionFormState[K]) => void;
  onCopyBatchItem: (itemNo: number) => void;
  onDeleteBatchItem: (itemNo: number) => void;
  onDeleteSingleItem: (id: string) => void;
  onDeleteAccountAllocation: (id: string) => void;
  onDownloadBatchImportTemplate: () => void;
  onImportBatchExpenseFile: (file: File) => void | Promise<void>;
  onApplyEvidenceOcr: (id: string) => void;
  onOpenEvidenceOriginal: (storagePath: string) => void | Promise<void>;
  onRemoveEvidenceFile: (id: string) => void | Promise<void>;
  onRetryEvidenceFile: (id: string) => void | Promise<void>;
  onReviewBatchBudget: (itemNo: number) => void;
  onRequestApproval: () => void | Promise<void>;
  onSaveDraft: () => void | Promise<void>;
  onUploadEvidenceFile: (file: File) => boolean | Promise<boolean>;
  saveError: string;
  settlementDifference: number;
  totalAmount: number;
  accountAllocationTotal: number;
  onSingleItemChange: (id: string, key: keyof SingleExpenseItem, value: string) => void;
  onAccountAllocationChange: (id: string, key: keyof AccountAllocation, value: string) => void;
}) {
  const isBatch = formState.resolutionType === "BATCH";
  const presetApplied = Boolean(formState.projectName && hasProjectExpensePreset(formState.projectName));
  const [isExpenseDetailOpen, setIsExpenseDetailOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [evidenceProcessingFileName, setEvidenceProcessingFileName] = useState("");
  const [evidenceProcessingStartedAt, setEvidenceProcessingStartedAt] = useState<number | null>(null);
  const [ocrElapsedSeconds, setOcrElapsedSeconds] = useState(0);
  const evidenceFileInputRef = useRef<HTMLInputElement>(null);
  const selectedPaymentTarget = getPaymentTarget(formState.paymentTargetId);
  const latestEvidenceFile = formState.evidenceFiles.at(-1);
  const latestOcrProgress = latestEvidenceFile?.ocrJobId ? evidenceOcrProgress[latestEvidenceFile.ocrJobId] : undefined;
  const reviewItems = [
    { complete: Boolean(formState.subject.trim()), label: "건명 입력" },
    { complete: Boolean(formState.projectName.trim()), label: "프로젝트 선택" },
    { complete: Boolean(formState.plannedPaymentDate), label: getExpenseDateLabel(formState.expenseTiming) },
    { complete: Boolean(formState.paymentTargetId && formState.paymentBank && formState.paymentAccountNo && formState.accountHolder), label: "지급계좌 확인" },
    { complete: totalAmount > 0, label: "지급금액 입력" },
    { complete: budgetSnapshot.remainingBudgetAmount >= 0 || Boolean(formState.budgetOverReason.trim()), label: "예산 확인" },
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
  const stepItems = [
    { key: 1 as const, label: "지급·기본정보" },
    { key: 2 as const, label: "금액·증빙" },
    { key: 3 as const, label: "검토·승인" },
  ];
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
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setEvidenceProcessingFileName(file.name);
    setEvidenceProcessingStartedAt(Date.now());
    setOcrElapsedSeconds(0);
    const uploaded = await onUploadEvidenceFile(file);
    if (uploaded) setCurrentStep(2);
  }

  useEffect(() => {
    if (!evidenceProcessingStartedAt || latestOcrProgress?.status === "COMPLETED" || latestOcrProgress?.status === "FAILED") return;
    const timer = window.setInterval(() => setOcrElapsedSeconds(Math.floor((Date.now() - evidenceProcessingStartedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [evidenceProcessingStartedAt, latestOcrProgress?.status]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/88 px-4 py-8" onClick={onCancel}>
      <section
        aria-labelledby="expense-resolution-dialog-title"
        aria-modal="true"
        className="w-full max-w-7xl overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold" id="expense-resolution-dialog-title">
              {isEditing ? "지출결의서 수정" : "지출결의서 작성"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">
              {isEditing
                ? "누락된 결의 내용을 보완합니다. 승인대기 문서는 저장 시 결재 상태를 다시 시작합니다."
                : "조합 지출 전에 결의서를 작성하고 결재 승인 후 지급대기 및 지출전표 생성으로 연결합니다."}
            </p>
            <p className="mt-2 text-xs font-semibold text-[var(--color-green-ink)]">자동 저장 준비됨 · 변경사항은 임시저장으로 보관할 수 있습니다.</p>
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
            </button>
          ))}
        </nav>
        <input
          accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv"
          aria-label="증빙자료 파일 선택"
          className="sr-only"
          disabled={isEvidenceUploading}
          id="expense-evidence-file"
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
                <button className="mt-3 rounded-full border border-[var(--color-tangerine)]/40 bg-white px-4 py-2 text-sm font-bold" onClick={() => evidenceFileInputRef.current?.click()} type="button">다른 파일 선택</button>
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
                  onChange("inputMethod", value as ExpenseInputMethod);
                  if (value === "EVIDENCE_OCR") evidenceFileInputRef.current?.click();
                }}
                options={[
                  { label: "직접 입력", value: "MANUAL" },
                  ...(isBatch ? [{ label: "엑셀 일괄등록", value: "EXCEL" }] : []),
                  { label: "증빙자료 자동입력", value: "EVIDENCE_OCR" },
                ]}
                value={formState.inputMethod}
              />
            </section>
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
            <FormSection layout="compact" title={currentStep === 1 ? "기본정보" : "지출내역·금액"}>
              {currentStep === 1 ? <>
              <TextInput label="결의서번호" readOnly value={formState.resolutionNo} />
              <TextInput label="작성일" onChange={(value) => onChange("createdAt", value)} type="date" value={formState.createdAt} />
              <TextInput label="작성자" readOnly value={formState.author} />
              {formState.expenseTiming === "ADVANCE" ? <TextInput label={getExpenseDateLabel(formState.expenseTiming)} onChange={(value) => onChange("plannedPaymentDate", value)} type="date" value={formState.plannedPaymentDate} /> : null}
              <p className="rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-stone)] md:col-span-3 xl:col-span-4">
                작성자는 로그인 사용자 기준으로 자동 입력되며 결재선과 별도로 관리됩니다.
              </p>
              <label className="grid gap-1 text-sm font-semibold">
                <span>프로젝트/사업과제</span>
                <select
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
                    {settlementCandidates.map((resolution) => <option key={resolution.id} value={resolution.id}>{resolution.resolutionNo} · {getResolutionSubject(resolution)} · {formatExpenseResolutionAmount(resolution.actualPaidAmount ?? resolution.totalPaymentAmount)}</option>)}
                  </select>
                  {!settlementCandidates.length ? <span className="text-xs text-[var(--color-tangerine)]">지급완료된 사전 집행결의가 없습니다.</span> : null}
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
              {presetApplied ? (
                <div className="rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-deep-cobalt)] md:col-span-2">
                  {formState.projectName} 기준 추천값이 적용되었습니다.
                </div>
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
                        onChange={(event) => onChange("operationExpenseDetail", event.target.value)}
                        value={formState.operationExpenseDetail}
                      >
                        {operatingExpenseDetailOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
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
                    <AccountAllocationEditor allocations={formState.accountAllocations} allocationTotal={accountAllocationTotal} onAdd={onAddAccountAllocation} onChange={onAccountAllocationChange} onDelete={onDeleteAccountAllocation} totalAmount={totalAmount} />
                  </div>
                ) : null}

                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--color-stone)]">공급가액 합계</p>
                    <p className="mt-2 text-lg font-bold">{formatExpenseResolutionAmount(isBatch ? batchSummary.totalSupplyAmount : formState.singleItems.reduce((sum, item) => sum + item.supplyAmount, 0))}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--color-stone)]">부가세 합계</p>
                    <p className="mt-2 text-lg font-bold">{formatExpenseResolutionAmount(isBatch ? batchSummary.totalVatAmount : formState.singleItems.reduce((sum, item) => sum + item.vatAmount, 0))}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--color-stone)]">총지급액</p>
                    <p className="mt-2 text-xl font-bold">{formatExpenseResolutionAmount(totalAmount)}</p>
                  </div>
                </div>
                {budgetSnapshot.remainingBudgetAmount < 0 ? (
                  <div className="mt-3">
                    <TextareaInput label="예산초과 사유" onChange={(value) => onChange("budgetOverReason", value)} value={formState.budgetOverReason} />
                  </div>
                ) : null}
                <div className="mt-3">
                  <TextareaInput label="지출사유" onChange={(value) => onChange("reason", value)} value={formState.reason} />
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
                <TextInput label="실제 사용액" onChange={(value) => onChange("actualUsedAmount", value)} type="number" value={formState.actualUsedAmount} />
                <label className="grid gap-1 text-sm font-semibold">
                  <span>차액 처리</span>
                  <select
                    className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
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
                <TextareaInput label="정산사유" onChange={(value) => onChange("postApprovalReason", value)} value={formState.postApprovalReason} />
              </FormSection>
            ) : null}

            {currentStep === 2 ? <CollapsibleFormSection defaultOpen summary={`${formState.evidenceType} · ${formState.evidenceFiles.length}개 첨부`} title="증빙자료·OCR 결과">
              <label className="grid gap-1 text-sm font-semibold">
                <span>증빙유형</span>
                <select
                  className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                  onChange={(event) => onChange("evidenceType", event.target.value as EvidenceType)}
                  value={formState.evidenceType}
                >
                  {evidenceTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold md:col-span-2" htmlFor="expense-evidence-file">
                <span>증빙자료</span>
                <span className="flex min-h-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--color-soft-border)] bg-white px-4 text-center text-sm text-[var(--color-stone)]">
                  {isEvidenceUploading ? "안전한 저장소에 업로드 중입니다…" : "PDF, 이미지, TXT, CSV 증빙을 선택하세요. 최대 10MB"}
                </span>
              </label>
              {formState.evidenceFiles.length ? (
                <div className="grid gap-3 md:col-span-3" aria-label="첨부 증빙 목록">
                  {formState.evidenceFiles.map((file) => (
                    <article className="rounded-xl border border-[var(--color-soft-border)] bg-white p-4" key={file.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{file.fileName}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">{file.evidenceType} · {formatFileSize(file.fileSize)} · {file.ocrData.provider === "OPENAI" ? "OpenAI 비전" : file.ocrData.provider === "EMBEDDED_TEXT" ? "PDF 내장문자" : "로컬 OCR(Tesseract)"} · {file.ocrStatus === "EXTRACTED" ? "추출값 검토 필요" : file.ocrStatus === "CONFIRMED" ? "추출값 확인완료" : file.ocrStatus === "FAILED" ? "OCR 처리 실패 · 직접 입력 필요" : "OCR 검토 필요"}{file.ocrData.confidence !== undefined ? ` · 인식률 ${file.ocrData.confidence}%` : ""}</p>
                          {file.ocrData.processingNote ? <p className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800">{file.ocrData.processingNote}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => void onOpenEvidenceOriginal(file.storagePath)} size="sm" type="button" variant="outline">원본 열기</Button>
                          <Button onClick={() => onRemoveEvidenceFile(file.id)} size="sm" type="button" variant="outline">목록에서 제거</Button>
                          {file.ocrStatus === "FAILED" && file.ocrJobId ? <Button onClick={() => void onRetryEvidenceFile(file.id)} size="sm" type="button" variant="outline">다시 분석</Button> : null}
                        </div>
                      </div>
                      {Object.keys(file.ocrData).length ? (
                        <div className="mt-3 grid gap-2 rounded-lg bg-[var(--color-cloud-veil)] p-3 text-sm md:grid-cols-5">
                          <OcrValue label="거래처" value={file.ocrData.issuer ?? "-"} />
                          <OcrValue label="사업자등록번호" value={file.ocrData.issuerBusinessNumber ?? "-"} />
                          <OcrValue label="대표자" value={file.ocrData.issuerRepresentative ?? "-"} />
                          <OcrValue label="증빙일" value={file.ocrData.documentDate ?? "-"} />
                          <OcrValue label="공급가액" value={file.ocrData.supplyAmount === undefined ? "-" : formatExpenseResolutionAmount(file.ocrData.supplyAmount)} />
                          <OcrValue label="부가세" value={file.ocrData.vatAmount === undefined ? "-" : formatExpenseResolutionAmount(file.ocrData.vatAmount)} />
                          <OcrValue label="합계" value={file.ocrData.totalAmount === undefined ? "-" : formatExpenseResolutionAmount(file.ocrData.totalAmount)} />
                          <div className="md:col-span-5">
                            <Button disabled={file.ocrStatus === "CONFIRMED"} onClick={() => onApplyEvidenceOcr(file.id)} size="sm" type="button">
                              {file.ocrStatus === "CONFIRMED" ? "추출값 반영완료" : "추출값을 결의서에 반영"}
                            </Button>
                          </div>
                          {file.ocrData.recognizedText ? (
                            <details className="md:col-span-5 rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2">
                              <summary className="cursor-pointer font-bold">인식된 원문 확인</summary>
                              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[var(--color-stone)]">{file.ocrData.recognizedText}</pre>
                            </details>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </CollapsibleFormSection> : null}

            {currentStep === 1 ? <CollapsibleFormSection summary={getPaymentTargetHeaderSummary(selectedPaymentTarget)} title="지급정보">
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
                <p className="mt-2 text-base font-bold text-[var(--color-midnight-ink)]">{getPaymentTargetSummary(selectedPaymentTarget)}</p>
                <p className="mt-1 break-keep text-sm font-semibold text-[var(--color-stone)]">
                  등록된 기본 지급정보를 불러오며, 실제 지급 전 회계담당자가 최종 확인합니다.
                </p>
              </div>
              <TextInput label="지급은행" onChange={(value) => onChange("paymentBank", value)} value={formState.paymentBank} />
              <TextInput label="지급계좌번호" onChange={(value) => onChange("paymentAccountNo", value)} value={formState.paymentAccountNo} />
              <TextInput label="예금주" onChange={(value) => onChange("accountHolder", value)} value={formState.accountHolder} />
            </CollapsibleFormSection> : null}

            {currentStep === 3 ? <section className="grid gap-4 rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">기본·지급정보</h3><p className="mt-1 text-sm text-[var(--color-stone)]">{formState.projectName || "프로젝트 미선택"} · {formState.subject || "건명 미입력"} · {selectedPaymentTarget.label}</p></div><Button onClick={() => setCurrentStep(1)} size="sm" type="button" variant="outline">기본정보 수정</Button></div>
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
                <BudgetRow label="지급대상" value={selectedPaymentTarget.label} />
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
                    <span>{item.label}</span>
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
          {saveError ? <p className="w-full rounded-lg bg-[var(--color-sunset-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-tangerine)]">{saveError}</p> : null}
          <Button className="rounded-full" onClick={onCancel} variant="outline">
            취소
          </Button>
          <div className="flex gap-2">
            {currentStep > 1 ? <Button className="rounded-full" onClick={() => setCurrentStep((currentStep - 1) as 1 | 2)} variant="outline">이전</Button> : null}
            <Button className="rounded-full" onClick={onSaveDraft} variant="outline">{isEditing ? "수정사항 저장" : "임시저장"}</Button>
            {currentStep < 3 ? (
              <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={() => setCurrentStep((currentStep + 1) as 2 | 3)}>다음 단계</Button>
            ) : (
              <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={onRequestApproval}>승인요청</Button>
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
  onAttachBatchEvidence: (itemNo: number) => void;
  onBatchItemChange: (itemNo: number, key: keyof BatchExpenseItem, value: string) => void;
  onCopyBatchItem: (itemNo: number) => void;
  onDeleteBatchItem: (itemNo: number) => void;
  onReviewBatchBudget: (itemNo: number) => void;
}) {
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
              <BatchSelect ariaLabel={`${item.itemNo}행 계정항목`} label="계정항목" options={accountTitleOptions} value={item.accountTitle} onChange={(value) => onBatchItemChange(item.itemNo, "accountTitle", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 지급상태`} label="지급상태" options={["지급전", "지급대기", "지급완료", "보류"]} value={item.paymentStatus} onChange={(value) => onBatchItemChange(item.itemNo, "paymentStatus", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 지출구분`} label="지출구분" options={expenseResolutionTypeOptions} value={item.expenseType} onChange={(value) => onBatchItemChange(item.itemNo, "expenseType", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 예산항목`} label="예산항목" options={batchBudgetItemOptions} value={item.budgetItem} onChange={(value) => onBatchItemChange(item.itemNo, "budgetItem", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 지출항목명`} label="지출항목명" value={item.itemTitle} onChange={(value) => onBatchItemChange(item.itemNo, "itemTitle", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 지급방법`} label="지급방법" options={["계좌이체", "카드결제", "현금", "기타"]} value={item.paymentMethod} onChange={(value) => onBatchItemChange(item.itemNo, "paymentMethod", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 내역 및 산출근거`} className="xl:col-span-2" label="내역 및 산출근거" value={item.description} onChange={(value) => onBatchItemChange(item.itemNo, "description", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 공급가액`} label="공급가액" type="number" value={item.supplyAmount} onChange={(value) => onBatchItemChange(item.itemNo, "supplyAmount", value)} />
              <BatchInput ariaLabel={`${item.itemNo}행 부가세`} label="부가세" type="number" value={item.vatAmount} onChange={(value) => onBatchItemChange(item.itemNo, "vatAmount", value)} />
              <BatchSelect ariaLabel={`${item.itemNo}행 증빙유형`} label="증빙유형" options={batchEvidenceTypeOptions} value={item.evidenceType} onChange={(value) => onBatchItemChange(item.itemNo, "evidenceType", value)} />
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
              <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-deep-cobalt)]" onClick={() => onAttachBatchEvidence(item.itemNo)} type="button">
                {item.itemNo}행 증빙첨부
              </button>
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

export function ExpenseResolutionDetailModal({
  canApprove = false,
  onApprove,
  onClose,
  onConfirmVoucher,
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
  onClose: () => void;
  onConfirmVoucher: () => void;
  onCreateVoucher: () => void;
  onPrintArchive: () => void;
  onPrintPreview: () => void;
  onProcessPayment: () => void;
  onReject: () => void;
  onRequestApproval: () => void;
  resolution: ManagedExpenseResolution;
}) {
  const evidenceRows = getEvidenceRows(resolution);
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
                        {["순번", "지출예정일", "거래처", "지출항목명", "계정항목", "예산항목", "공급가액", "부가세", "합계", "예산상태", "지급상태", "증빙", "전표번호"].map((column) => (
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
                          <td className="px-3 py-3 font-semibold">{item.vendorName || "거래처 미입력"}</td>
                          <td className="px-3 py-3">{item.itemTitle}</td>
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
                          <td className="px-3 py-3 font-semibold text-[var(--color-deep-cobalt)]">{item.voucherNo ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DetailSection>
            </>
          ) : null}

          <DetailSection title="기본정보">
            <DetailItem label="결의서번호" value={resolution.resolutionNo} />
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
            <DetailItem label="부가세" value={formatExpenseResolutionAmount(resolution.vat)} />
            <DetailItem label="지출사유" value={resolution.reason || "-"} wide />
          </DetailSection>

          <DetailSection title="지급정보">
            <DetailItem label="지급은행" value={resolution.paymentBank || "-"} />
            <DetailItem label="지급계좌번호" value={resolution.paymentAccountNo || "-"} />
            <DetailItem label="예금주" value={resolution.accountHolder || "-"} />
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
              <Button className="rounded-full" variant="outline">
                수정
              </Button>
              <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={handleRequestApproval}>
                승인요청
              </Button>
            </>
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
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={handlePayment}>
              지급처리
            </Button>
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
            <Button className="rounded-full" variant="outline">
              전표보기
            </Button>
          ) : null}
          {resolution.approvalStatus === "반려" ? (
            <Button className="rounded-full" onClick={handleRequestApproval} variant="outline">
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

function ExpenseResolutionPrintPreviewModal({
  onClose,
  resolution,
}: {
  onClose: () => void;
  resolution: ManagedExpenseResolution;
}) {
  const vendorMissing = !resolution.vendorName.trim() || resolution.vendorName === "거래처 미입력";
  const reasonText = resolution.reason.trim() || "지출사유 미입력";
  const warningTextClass = "font-bold text-[var(--color-tangerine)]";
  const isBatchResolution = resolution.resolutionType === "BATCH";
  const printExpenseItems = isBatchResolution
    ? resolution.expenseItems
    : resolution.singleItems?.length
      ? resolution.singleItems.map((item, index) => ({
          description: item.itemName + (item.memo ? `\n${item.memo}` : ""),
          expenseDate: resolution.plannedPaymentDate,
          id: item.id,
          itemNo: index + 1,
          supplyAmount: String(item.supplyAmount),
          totalAmount: item.totalAmount,
          vatAmount: String(item.vatAmount),
          vendorName: resolution.vendorName,
        }))
      : [
        {
          id: `${resolution.id}-print-item`,
          itemNo: 1,
          expenseDate: resolution.plannedPaymentDate,
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
  const firstPageItems = printExpenseItems.slice(0, 4);
  const continuationPages = Array.from({ length: Math.ceil(Math.max(0, printExpenseItems.length - 4) / 12) }, (_, pageIndex) =>
    printExpenseItems.slice(4 + pageIndex * 12, 4 + (pageIndex + 1) * 12),
  );
  const totalPrintPages = 1 + continuationPages.length;
  const evidenceSummary = isBatchResolution
    ? Array.from(new Set(resolution.expenseItems.map((item) => item.evidenceType).filter(Boolean))).join(", ") || "증빙 미첨부"
    : resolution.evidenceType || resolution.evidenceMaterials.join(", ") || "증빙 미첨부";

  async function handleBrowserPrint() {
    const printShell = document.querySelector<HTMLElement>(".print-modal-shell");
    if (!printShell) return;

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
      return;
    }

    const styles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join("\n");

    printDocument.open();
    printDocument.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${resolution.resolutionNo} 지출결의서</title>${styles}</head><body>${printShell.outerHTML}</body></html>`);
    printDocument.close();

    await new Promise<void>((resolve) => {
      if (printDocument.readyState === "complete") {
        resolve();
        return;
      }
      frame.addEventListener("load", () => resolve(), { once: true });
    });
    await printDocument.fonts?.ready;

    const cleanup = () => frame.remove();
    printWindow.addEventListener("afterprint", cleanup, { once: true });
    printWindow.focus();
    printWindow.print();
    window.setTimeout(cleanup, 60_000);
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
          <article className="erp-print-page expense-resolution-print-page mx-auto rounded-sm bg-white p-8 text-sm shadow-sm">
            <header className="expense-resolution-print-header grid grid-cols-[1fr_1fr_1fr] items-stretch gap-4 border-b-2 border-[var(--color-midnight-ink)] pb-4 pt-7">
              <div className="flex flex-col justify-end text-xs leading-5">
                <p className="font-semibold">아래와 같이 지출을 결의하오니</p>
                <p className="font-semibold">승인하여 주시기 바랍니다.</p>
                <p className="mt-2"><span className="font-bold">문서번호</span> {resolution.resolutionNo}</p>
                <p><span className="font-bold">작성일</span> {resolution.createdAt}</p>
              </div>
              <div className="flex flex-col items-center justify-center text-center">
                <h3 className="text-[42px] font-black tracking-[0.18em]">지출결의서</h3>
                <p className="mt-2 text-[17.4px] text-[var(--color-stone)]">대방동 지역주택조합</p>
              </div>
              <ExpenseApprovalBox resolution={resolution} />
            </header>

            <section className="expense-resolution-print-section mt-6">
              <h4 className="mb-2 text-base font-bold">결의 기본정보</h4>
              <div className="grid grid-cols-2 border border-[var(--color-soft-border)]">
                <PrintCell label="결의서번호" value={resolution.resolutionNo} />
                <PrintCell label="작성일" value={resolution.createdAt} />
                <PrintCell label="작성자" value={resolution.author} />
                <PrintCell label="업무유형" value={getExpenseTimingLabel(normalizeExpenseTiming(resolution))} />
                <PrintCell label="작성방식" value={getResolutionTypeFullLabel(resolution.resolutionType)} />
                {isBatchResolution ? (
                  <PrintCell label="프로젝트명" value={<span className={resolution.projectName.trim() ? "" : warningTextClass}>{resolution.projectName.trim() || "프로젝트 미입력"}</span>} />
                ) : (
                  <PrintCell label="대표 지출항목" value={resolution.operationExpenseDetail || resolution.expenseType} />
                )}
                <PrintCell label="건명" value={getResolutionSubject(resolution)} wide />
              </div>
            </section>

            <section className="expense-resolution-print-section mt-5">
              <h4 className="mb-2 text-base font-bold">지출 정보</h4>
              <div className="grid grid-cols-2 border border-[var(--color-soft-border)]">
                <PrintCell label="지출구분" value={resolution.expenseType} />
                <PrintCell label="예산항목" value={resolution.budgetItem || "-"} />
                <PrintCell label="거래처" value={<span className={vendorMissing ? warningTextClass : ""}>{resolution.vendorName || "거래처 미입력"}</span>} />
                <PrintCell label="총지급액" value={formatExpenseResolutionAmount(resolution.totalPaymentAmount)} valueClassName="text-right" />
              </div>
            </section>

            <section className="expense-resolution-print-section mt-5 border-y-2 border-[var(--color-midnight-ink)] py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-[var(--color-stone)]">총 결의금액</p>
                  <p className="mt-1 text-sm font-semibold">{getResolutionSubject(resolution)}</p>
                </div>
                <p className="text-2xl font-black tracking-tight">{formatExpenseResolutionAmount(resolution.totalPaymentAmount)}</p>
              </div>
            </section>

            <section className="expense-resolution-print-section expense-resolution-print-items mt-5">
              <div className="mb-2 flex items-end justify-between gap-3">
                <h4 className="text-base font-bold">세부 지출내역</h4>
                {isBatchResolution ? <p className="text-xs font-semibold text-[var(--color-stone)]">{resolution.projectName.trim() || "프로젝트 미입력"} · {printExpenseItems.length}건</p> : null}
              </div>
              <ExpensePrintItemsTable items={firstPageItems} totalLabel={continuationPages.length ? "본지 소계" : "전체 합계"} />
            </section>

            <section className="expense-resolution-print-section expense-resolution-print-approval mt-5">
              <h4 className="mb-2 text-base font-bold">지출사유</h4>
              <div className={`min-h-24 whitespace-pre-wrap border border-[var(--color-soft-border)] p-3 leading-6 ${resolution.reason.trim() ? "" : warningTextClass}`}>{reasonText}</div>
            </section>

            <section className="expense-resolution-print-section mt-5">
              <h4 className="mb-2 text-base font-bold">증빙 요약</h4>
              <div className="grid grid-cols-2 border border-[var(--color-soft-border)]">
                <PrintCell label="증빙 유형" value={evidenceSummary} />
                <PrintCell label="첨부 현황" value={`${resolution.evidenceMaterials.length + resolution.expenseItems.filter((item) => item.evidenceFileName).length}건`} />
              </div>
            </section>
          </article>
          {continuationPages.map((items, pageIndex) => (
            <article className="erp-print-page expense-resolution-print-page expense-resolution-continuation-page mx-auto mt-6 rounded-sm bg-white p-8 text-sm shadow-sm" key={`continuation-${pageIndex + 1}`}>
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
            </article>
          ))}
        </div>

        <div className="expense-resolution-print-actions flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          <Button className="rounded-full" onClick={onClose} variant="outline">
            닫기
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={() => void handleBrowserPrint()}>
            브라우저 프린트
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
  totalAmount: number;
  vatAmount: string;
  vendorName: string;
};

function ExpenseApprovalBox({ resolution }: { resolution: ManagedExpenseResolution }) {
  const approvalLine = getDisplayApprovalLine(resolution);
  return (
    <section className="expense-resolution-print-approval min-w-0 self-end">
      <h4 className="sr-only">결재선</h4>
      <table className="w-full table-fixed border-collapse text-center text-[9px]">
        <tbody>
          <tr>
            <th className="expense-approval-vertical-label w-[18px] border border-[var(--color-midnight-ink)] font-black tracking-[0.1em]" rowSpan={2}>결재</th>
            {approvalLine.map((step) => (
              <th className="border border-[var(--color-midnight-ink)] bg-[var(--color-cloud-veil)] py-1 font-bold" key={`role-${step.order}`}>{step.role}</th>
            ))}
          </tr>
          <tr>
            {approvalLine.map((step) => {
              const processedAt = formatApprovalDateTime(getApprovalProcessedAt(resolution, step));
              return (
                <td className="h-14 border border-[var(--color-midnight-ink)] px-1 py-1" key={`approval-${step.order}`}>
                  <span className="block font-bold">{step.approver}</span>
                  <span className="mt-2 block whitespace-nowrap text-[var(--color-stone)]">{processedAt || "서명란"}</span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </section>
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

  return (
    <div className="overflow-x-auto border border-[var(--color-soft-border)]">
      <table className="w-full table-fixed border-collapse text-[11px]">
        <thead className="bg-[var(--color-cloud-veil)]">
          <tr>
            {["순번", "지출예정일", "거래처", "내역 및 산출근거", "공급가액", "부가세", "합계"].map((label) => (
              <th className="border-b border-r border-[var(--color-soft-border)] px-2 py-2 text-left last:border-r-0" key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr className="expense-resolution-print-item-row" key={item.id}>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-2 text-center">{item.itemNo}</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-2 whitespace-nowrap">{item.expenseDate || "-"}</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-2 font-semibold">{item.vendorName || "거래처 미입력"}</td>
              <td className="w-2/5 whitespace-pre-wrap break-words border-b border-r border-[var(--color-soft-border)] px-2 py-2">{item.description || "-"}</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-2 text-right whitespace-nowrap">{formatExpenseResolutionAmount(toNumber(item.supplyAmount))}</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-2 py-2 text-right whitespace-nowrap">{formatExpenseResolutionAmount(toNumber(item.vatAmount))}</td>
              <td className="border-b border-[var(--color-soft-border)] px-2 py-2 text-right font-bold whitespace-nowrap">{formatExpenseResolutionAmount(item.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-[var(--color-cloud-veil)] font-bold">
          <tr>
            <td className="px-2 py-2 text-right" colSpan={4}>{totalLabel}</td>
            <td className="px-2 py-2 text-right whitespace-nowrap">{formatExpenseResolutionAmount(totals?.supplyAmount ?? pageSupplyAmount)}</td>
            <td className="px-2 py-2 text-right whitespace-nowrap">{formatExpenseResolutionAmount(totals?.vatAmount ?? pageVatAmount)}</td>
            <td className="px-2 py-2 text-right whitespace-nowrap">{formatExpenseResolutionAmount(totals?.totalAmount ?? pageTotalAmount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function OperatingBudgetPrintModal({ onClose }: { onClose: () => void }) {
  const rows = getOperatingBudgetPrintRows();
  const monthlyTotals = Array.from({ length: 12 }, (_, monthIndex) => rows.reduce((sum, row) => sum + row.monthlyAmounts[monthIndex], 0));
  const quarterlyTotals = [0, 1, 2, 3].map((quarterIndex) => rows.reduce((sum, row) => sum + row.quarterlyAmounts[quarterIndex], 0));
  const previousAnnualTotal = rows.reduce((sum, row) => sum + row.previousAnnualAmount, 0);
  const annualTotal = rows.reduce((sum, row) => sum + row.annualAmount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/88 px-4 py-8" onClick={onClose}>
      <section
        aria-labelledby="operating-budget-print-title"
        aria-modal="true"
        className="w-full max-w-[1320px] overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold" id="operating-budget-print-title">
              운영비 예산표 출력
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">2026년 조합 운영비 예산을 월별·분기별 내역으로 출력합니다.</p>
          </div>
          <button aria-label="운영비 예산표 출력 닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6">
          <div className="erp-print-page rounded-xl border border-[var(--color-soft-border)] bg-white p-6">
            <header className="border-b-2 border-[var(--color-midnight-ink)] pb-5 text-center">
              <h3 className="text-3xl font-bold tracking-normal">2026년 운영비 예산표</h3>
              <p className="mt-2 font-semibold">당기: 2026/01/01 ~ 2026/12/31</p>
              <p className="mt-1 text-sm text-[var(--color-stone)]">전기: 2025/01/01 ~ 2025/12/31</p>
              <p className="mt-3 text-right text-sm text-[var(--color-stone)]">(단위: 원, VAT포함)</p>
            </header>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-bold">운영비 월별·분기별 내역</h4>
              <div className="flex gap-2 text-sm font-semibold text-[var(--color-stone)]">
                <span className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-1">월 예산 {formatExpenseResolutionAmount(monthlyTotals[0])}</span>
                <span className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-1">연간 {formatExpenseResolutionAmount(annualTotal)}</span>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table aria-label="운영비 월별 분기별 예산표" className="w-full min-w-[1680px] border-collapse text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs font-bold text-[var(--color-stone)]">
                  <tr>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" rowSpan={2}>
                      항목
                    </th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" rowSpan={2}>
                      월 예산
                    </th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" colSpan={12}>
                      월별 내역
                    </th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" colSpan={4}>
                      분기별 합계
                    </th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" rowSpan={2}>
                      2025년(전기)
                    </th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" rowSpan={2}>
                      2026년(당기)
                    </th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" rowSpan={2}>
                      내역 및 산출근거
                    </th>
                  </tr>
                  <tr>
                    {Array.from({ length: 12 }, (_, index) => (
                      <th className="border border-[var(--color-soft-border)] px-2 py-2 text-center" key={`month-head-${index + 1}`}>
                        {index + 1}월
                      </th>
                    ))}
                    {["1분기", "2분기", "3분기", "4분기"].map((quarter) => (
                      <th className="border border-[var(--color-soft-border)] px-2 py-2 text-center" key={quarter}>
                        {quarter}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className="bg-white" key={row.itemLabel}>
                      <th className="border border-[var(--color-soft-border)] px-3 py-2 text-left font-bold">{row.itemLabel}</th>
                      <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right font-semibold">{formatExpenseResolutionAmount(row.monthlyAmount)}</td>
                      {row.monthlyAmounts.map((amount, index) => (
                        <td className="border border-[var(--color-soft-border)] px-2 py-2 text-right" key={`${row.itemLabel}-${index + 1}`}>
                          {formatExpenseResolutionAmount(amount)}
                        </td>
                      ))}
                      {row.quarterlyAmounts.map((amount, index) => (
                        <td className="border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-2 py-2 text-right font-semibold" key={`${row.itemLabel}-q${index + 1}`}>
                          {formatExpenseResolutionAmount(amount)}
                        </td>
                      ))}
                      <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right font-semibold">{formatExpenseResolutionAmount(row.previousAnnualAmount)}</td>
                      <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right font-bold">{formatExpenseResolutionAmount(row.annualAmount)}</td>
                      <td className="border border-[var(--color-soft-border)] px-3 py-2 text-left text-[var(--color-stone)]">{row.calculationBasis}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[var(--color-cloud-veil)] font-bold">
                  <tr>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2 text-left">소계</th>
                    <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right">{formatExpenseResolutionAmount(monthlyTotals[0])}</td>
                    {monthlyTotals.map((amount, index) => (
                      <td className="border border-[var(--color-soft-border)] px-2 py-2 text-right" key={`total-month-${index + 1}`}>
                        {formatExpenseResolutionAmount(amount)}
                      </td>
                    ))}
                    {quarterlyTotals.map((amount, index) => (
                      <td className="border border-[var(--color-soft-border)] px-2 py-2 text-right" key={`total-quarter-${index + 1}`}>
                        {formatExpenseResolutionAmount(amount)}
                      </td>
                    ))}
                    <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right">{formatExpenseResolutionAmount(previousAnnualTotal)}</td>
                    <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right">{formatExpenseResolutionAmount(annualTotal)}</td>
                    <td className="border border-[var(--color-soft-border)] px-3 py-2 text-left">운영비 소계</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          <Button className="rounded-full" onClick={onClose} variant="outline">
            닫기
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={() => window.print()}>
            브라우저 프린트
          </Button>
        </div>
      </section>
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
  onEdit: () => void;
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
          <Button className="rounded-full" onClick={onEdit} variant="outline">
            수정하기
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={onContinue}>
            그래도 출력하기
          </Button>
        </div>
      </section>
    </div>
  );
}

function PrintCell({ label, value, valueClassName = "", wide }: { label: string; value: ReactNode; valueClassName?: string; wide?: boolean }) {
  return (
    <div className={`grid grid-cols-[110px_1fr] border-b border-r border-[var(--color-soft-border)] last:border-r-0 ${wide ? "col-span-2" : ""}`}>
      <span className="bg-[var(--color-cloud-veil)] px-3 py-2 font-bold text-[var(--color-stone)]">{label}</span>
      <span className={`whitespace-normal px-3 py-2 font-semibold ${valueClassName}`}>{value}</span>
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

function DetailItem({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 ${wide ? "md:col-span-2" : ""}`}>
      <p className="text-xs font-bold text-[var(--color-fog)]">{label}</p>
      <div className="mt-2 text-sm font-semibold leading-6 text-[var(--color-midnight-ink)]">{value}</div>
    </div>
  );
}

function SingleExpenseItemsEditor({ items, onAdd, onChange, onDelete }: { items: SingleExpenseItem[]; onAdd: () => void; onChange: (id: string, key: keyof SingleExpenseItem, value: string) => void; onDelete: (id: string) => void }) {
  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--color-soft-border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-sm font-black">품목/용역 내역</h3><p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">같은 거래처의 여러 품목을 입력하면 금액이 자동 합산됩니다.</p></div>
        <Button className="rounded-full" onClick={onAdd} type="button" variant="outline">품목 추가</Button>
      </div>
      <div className="mt-3 max-w-full overflow-x-auto">
        <table className="min-w-[900px] w-full border-collapse text-sm">
          <thead className="bg-[var(--color-cloud-veil)] text-left"><tr>{["품목명", "수량", "단가", "공급가액", "부가세", "합계", "비고", "관리"].map((label) => <th className="border border-[var(--color-soft-border)] px-2 py-2" key={label}>{label}</th>)}</tr></thead>
          <tbody>{items.map((item, index) => <tr key={item.id}>
            <td className="border border-[var(--color-soft-border)] p-1"><input aria-label={`품목명 ${index + 1}`} className="h-9 w-full px-2" onChange={(event) => onChange(item.id, "itemName", event.target.value)} value={item.itemName} /></td>
            <td className="border border-[var(--color-soft-border)] p-1"><input aria-label={`수량 ${index + 1}`} className="h-9 w-20 px-2 text-right" min="0" onChange={(event) => onChange(item.id, "quantity", event.target.value)} type="number" value={item.quantity} /></td>
            <td className="border border-[var(--color-soft-border)] p-1"><input aria-label={`단가 ${index + 1}`} className="h-9 w-28 px-2 text-right" min="0" onChange={(event) => onChange(item.id, "unitPrice", event.target.value)} type="number" value={item.unitPrice} /></td>
            <td className="border border-[var(--color-soft-border)] px-2 py-1 text-right">{formatExpenseResolutionAmount(item.supplyAmount)}</td>
            <td className="border border-[var(--color-soft-border)] p-1"><input aria-label={`부가세 ${index + 1}`} className="h-9 w-24 px-2 text-right" min="0" onChange={(event) => onChange(item.id, "vatAmount", event.target.value)} type="number" value={item.vatAmount} /></td>
            <td className="border border-[var(--color-soft-border)] px-2 py-1 text-right font-bold">{formatExpenseResolutionAmount(item.totalAmount)}</td>
            <td className="border border-[var(--color-soft-border)] p-1"><input aria-label={`품목 비고 ${index + 1}`} className="h-9 w-full px-2" onChange={(event) => onChange(item.id, "memo", event.target.value)} value={item.memo} /></td>
            <td className="border border-[var(--color-soft-border)] p-1"><Button disabled={items.length === 1} onClick={() => onDelete(item.id)} type="button" variant="outline">삭제</Button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function AccountAllocationEditor({ allocations, allocationTotal, onAdd, onChange, onDelete, totalAmount }: { allocations: AccountAllocation[]; allocationTotal: number; onAdd: () => void; onChange: (id: string, key: keyof AccountAllocation, value: string) => void; onDelete: (id: string) => void; totalAmount: number }) {
  const matches = Math.abs(allocationTotal - totalAmount) <= 0.5;
  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--color-soft-border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-sm font-black">계정과목 분할</h3><p className={`mt-1 text-xs font-semibold ${matches ? "text-[var(--color-green-ink)]" : "text-[var(--color-tangerine)]"}`}>분할 합계 {formatExpenseResolutionAmount(allocationTotal)} / 총지급액 {formatExpenseResolutionAmount(totalAmount)}</p></div>
        <Button className="rounded-full" onClick={onAdd} type="button" variant="outline">계정과목 추가</Button>
      </div>
      <div className="mt-3 grid gap-3">
        {allocations.map((allocation, index) => <div className="grid min-w-0 gap-2 rounded-lg bg-[var(--color-cloud-veil)] p-3 md:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_minmax(0,1fr)_auto]" key={allocation.id}>
          <label className="grid min-w-0 gap-1 text-xs font-bold">계정과목<select aria-label={`분할 계정과목 ${index + 1}`} className="h-9 min-w-0 w-full bg-white px-2" onChange={(event) => onChange(allocation.id, "accountTitle", event.target.value)} value={allocation.accountTitle}>{expenseResolutionTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="grid min-w-0 gap-1 text-xs font-bold">예산항목<select aria-label={`분할 예산항목 ${index + 1}`} className="h-9 min-w-0 w-full bg-white px-2" onChange={(event) => onChange(allocation.id, "budgetItem", event.target.value)} value={allocation.budgetItem}>{budgetItemOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="grid min-w-0 gap-1 text-xs font-bold">분할금액<input aria-label={`분할금액 ${index + 1}`} className="h-9 min-w-0 w-full bg-white px-2 text-right" min="0" onChange={(event) => onChange(allocation.id, "amount", event.target.value)} type="number" value={allocation.amount} /></label>
          <label className="grid min-w-0 gap-1 text-xs font-bold">적요<input aria-label={`분할 적요 ${index + 1}`} className="h-9 min-w-0 w-full bg-white px-2" onChange={(event) => onChange(allocation.id, "description", event.target.value)} value={allocation.description} /></label>
          <Button className="self-end" disabled={allocations.length === 1} onClick={() => onDelete(allocation.id)} type="button" variant="outline">삭제</Button>
        </div>)}
      </div>
      {!matches ? <p className="mt-3 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-bold text-[var(--color-tangerine)]">계정과목 분할금액 합계를 총지급액과 일치시켜주세요.</p> : null}
    </section>
  );
}

function QuestionChoiceGroup({
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

function FormSection({ children, layout = "default", title }: { children: ReactNode; layout?: "compact" | "default"; title: string }) {
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

function CollapsibleFormSection({ children, defaultOpen = false, summary, title }: { children: ReactNode; defaultOpen?: boolean; summary: string; title: string }) {
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

function TextInput({
  label,
  onChange,
  readOnly,
  type = "text",
  value,
}: {
  label: string;
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
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readOnly}
        type={type}
        value={value}
      />
    </label>
  );
}

function TextareaInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className={`${fieldWrapperClassName} md:col-span-2`}>
      <span className={fieldLabelClassName}>{label}</span>
      <textarea
        className="min-h-28 rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 text-base font-semibold leading-6 text-[var(--color-midnight-ink)] placeholder:text-[var(--color-fog)] focus:border-[var(--color-sky-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-morning-tint)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function BudgetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-[var(--color-cloud-veil)] px-3 py-2">
      <span className="font-semibold text-[var(--color-stone)]">{label}</span>
      <span className="text-right font-bold text-[var(--color-midnight-ink)]">{value}</span>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
      <p className="text-sm font-semibold text-[var(--color-stone)]">{label}</p>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </div>
  );
}
