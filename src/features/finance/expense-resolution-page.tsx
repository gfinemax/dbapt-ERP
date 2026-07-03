"use client";

import { CheckCircle2, FilePlus2, FileSpreadsheet, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import {
  expenseResolutionFields,
  expenseResolutionTypeOptions,
  expenseResolutions,
  formatExpenseResolutionAmount,
} from "./expense-resolution-data";
import type { ExpenseResolution, ExpenseResolutionType, ResolutionHistory } from "./expense-resolution-data";
import { getNextDocumentNo } from "./finance-numbering";

export type ApprovalStepStatus = "대기" | "결재대기" | "승인완료" | "반려";
export type ApprovalStatus = "작성중" | "승인대기" | "승인완료" | "반려";
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
  voucherNo?: string;
  voucherStatus?: VoucherStatus;
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
  evidenceType?: EvidenceType;
  expenseItems: BatchExpenseItem[];
  expenseType: ExpenseResolutionType;
  holdReason?: string;
  id: string;
  memo: string;
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
  supplyAmount: number;
  totalPaymentAmount: number;
  totalOverBudgetAmount: number;
  resolutionType: ResolutionDocumentType;
  voucherCreationMode: VoucherCreationMode;
  transferReceiptStatus?: string;
  vat: number;
  vendorName: string;
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
  batchPaymentMode: BatchPaymentMode;
  createdAt: string;
  evidenceType: EvidenceType;
  expenseType: ExpenseResolutionType;
  memo: string;
  operationExpenseDetail: string;
  paymentTargetId: string;
  paymentAccountNo: string;
  paymentBank: string;
  paymentFlowType: PaymentFlowType;
  plannedPaymentDate: string;
  postApprovalReason: string;
  reason: string;
  relatedContract: string;
  relatedMeeting: string;
  resolutionNo: string;
  resolutionType: ResolutionDocumentType;
  projectName: string;
  voucherCreationMode: VoucherCreationMode;
  settlementDifferenceAction: "차액없음" | "추가지급" | "환급필요";
  supplyAmount: string;
  vat: string;
  vendorName: string;
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
const paymentFlowOptions: PaymentFlowType[] = ["사전결의", "선지급", "사후정산"];
const resolutionTypeOptions: Array<{ label: string; value: ResolutionDocumentType }> = [
  { label: "단일 지출결의", value: "SINGLE" },
  { label: "프로젝트 일괄 지출결의", value: "BATCH" },
];
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
type PaymentMethod = "계좌이체" | "카드결제" | "현금" | "기타";

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

function getPaymentTargetSummary(target: PaymentTarget) {
  if (target.id === "manual") {
    return "이번 결의서에서 직접 지급정보를 입력합니다.";
  }

  return `${target.bankName} ${maskAccountNumber(target.accountNumber)} · 예금주 ${target.accountHolder}`;
}

function getExpenseInfoSummary(formState: ResolutionFormState) {
  const [year, month] = (formState.budgetPeriod || formState.createdAt.slice(0, 7)).split("-");
  return `${formState.expenseType} > ${formState.operationExpenseDetail} · ${year}년 ${month}월 예산`;
}

function calculateBatchExpenseItem(item: BatchExpenseItem): BatchExpenseItem {
  const supplyAmount = toNumber(item.supplyAmount);
  const vatAmount = toNumber(item.vatAmount);
  const totalAmount = supplyAmount + vatAmount;
  const profile = batchBudgetProfiles[item.budgetItem] ?? { allocatedBudget: 0, executedAmount: 0 };
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

function createFormState(nextNo: string, currentDate = getCurrentDateIso()): ResolutionFormState {
  return applyPaymentTarget({
    resolutionNo: nextNo,
    resolutionType: "SINGLE",
    projectName: "",
    createdAt: currentDate,
    author: currentUserName,
    plannedPaymentDate: currentDate,
    paymentFlowType: "사전결의",
    expenseType: "운영비",
    operationExpenseDetail: "임대료",
    budgetPeriod: "2026-07",
    budgetItem: "운영비 > 임대료",
    budgetOverReason: "",
    batchItems: createDefaultBatchItems(),
    batchPaymentMode: "ITEM",
    voucherCreationMode: "ITEM_VOUCHER",
    vendorName: "",
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
    reason: "",
    relatedContract: "",
    relatedMeeting: "",
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

export function ExpenseResolutionPage() {
  const [resolutions, setResolutions] = useState<ManagedExpenseResolution[]>(() =>
    expenseResolutions.map(toManagedExpenseResolution),
  );
  const [activeTab, setActiveTab] = useState<ResolutionTabKey>("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
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
  const formTotalAmount = toNumber(formState.supplyAmount) + toNumber(formState.vat);
  const formBatchSummary = summarizeBatchItems(formState.batchItems);
  const effectiveFormTotalAmount = formState.resolutionType === "BATCH" ? formBatchSummary.totalAmount : formTotalAmount;
  const formBudgetSnapshot = createBudgetSnapshot(formState.budgetItem, formTotalAmount);
  const settlementDifference = toNumber(formState.advancePaidAmount) - toNumber(formState.actualUsedAmount || String(formTotalAmount));
  const tabItems = getResolutionTabItems(resolutions);
  const activeTabItem = tabItems.find((item) => item.key === activeTab) ?? tabItems[0];
  const visibleResolutions = activeTabItem.resolutions;

  function openCreateModal() {
    setFormState(createFormState(getNextResolutionNo(resolutions)));
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
  }

  function closeDetailModal() {
    setSelectedDetailId(null);
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

      return key === "projectName" || key === "resolutionType" ? applyProjectExpensePreset(nextState) : nextState;
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

  function saveResolution(mode: "draft" | "approval-request") {
    const approvalStatus: ApprovalStatus = mode === "draft" ? "작성중" : "승인대기";
    const firstApprover = buildApprovalLine()[0];
    const isAfterPaymentFlow = formState.paymentFlowType !== "사전결의";
    const batchSummary = summarizeBatchItems(formState.batchItems);
    const isBatch = formState.resolutionType === "BATCH";
    const approvalLine = buildApprovalLine().map((step, index) =>
      mode === "approval-request" && index === 0 ? { ...step, status: "결재대기" as const } : step,
    );
    const nextResolution: ManagedExpenseResolution = {
      id: createExpenseResolutionInternalId(formState.resolutionNo),
      resolutionNo: formState.resolutionNo,
      resolutionType: formState.resolutionType,
      projectName: formState.projectName,
      createdAt: formState.createdAt,
      author: formState.author,
      plannedPaymentDate: formState.plannedPaymentDate,
      paymentFlowType: formState.paymentFlowType,
      expenseType: isBatch ? batchSummary.representativeExpenseType : formState.expenseType,
      operationExpenseDetail: formState.operationExpenseDetail,
      budgetItem: isBatch ? "프로젝트 일괄 예산" : formState.budgetItem,
      budgetOverReason: formState.budgetOverReason,
      vendorName: isBatch ? batchSummary.representativeVendorName : formState.vendorName || "거래처 미입력",
      representativeVendorName: isBatch ? batchSummary.representativeVendorName : formState.vendorName || "거래처 미입력",
      representativeAccountTitle: isBatch ? batchSummary.representativeAccountTitle : formState.expenseType,
      itemCount: isBatch ? batchSummary.itemCount : 1,
      overBudgetItemCount: isBatch ? batchSummary.overBudgetItemCount : formBudgetSnapshot.remainingBudgetAmount < 0 ? 1 : 0,
      totalOverBudgetAmount: isBatch ? batchSummary.totalOverBudgetAmount : Math.max(0, Math.abs(formBudgetSnapshot.remainingBudgetAmount)),
      batchPaymentMode: formState.batchPaymentMode,
      voucherCreationMode: formState.voucherCreationMode,
      expenseItems: isBatch ? batchSummary.items : [],
      paymentBank: formState.paymentBank,
      paymentAccountNo: formState.paymentAccountNo,
      accountHolder: formState.accountHolder,
      supplyAmount: isBatch ? batchSummary.totalSupplyAmount : toNumber(formState.supplyAmount),
      vat: isBatch ? batchSummary.totalVatAmount : toNumber(formState.vat),
      totalPaymentAmount: isBatch ? batchSummary.totalAmount : formTotalAmount,
      reason: formState.reason,
      relatedContract: formState.relatedContract,
      relatedMeeting: formState.relatedMeeting,
      evidenceMaterials: [],
      evidenceAttached: false,
      evidenceType: formState.evidenceType,
      approvalLine,
      approvalStatus,
      currentApprover: mode === "approval-request" ? getApproverLabel(firstApprover) : undefined,
      paymentStatus: isAfterPaymentFlow ? "지급완료" : "지급전",
      settlementStatus: isAfterPaymentFlow ? "정산대기" : "정산없음",
      advancePaidAt: isAfterPaymentFlow ? formState.advancePaidAt : undefined,
      advancePayer: isAfterPaymentFlow ? formState.advancePayer : undefined,
      advancePaymentMethod: isAfterPaymentFlow ? formState.advancePaymentMethod : undefined,
      advancePaidAmount: isAfterPaymentFlow ? toNumber(formState.advancePaidAmount) : undefined,
      actualUsedAmount: isAfterPaymentFlow ? toNumber(formState.actualUsedAmount || String(formTotalAmount)) : undefined,
      settlementDifference: isAfterPaymentFlow ? settlementDifference : undefined,
      settlementDifferenceAction: isAfterPaymentFlow ? formState.settlementDifferenceAction : "차액없음",
      postApprovalReason: isAfterPaymentFlow ? formState.postApprovalReason : undefined,
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

    setResolutions((current) => [nextResolution, ...current]);
    closeCreateModal();
  }

  function approveResolution(id: string) {
    setResolutions((current) =>
      current.map((resolution) => {
        if (resolution.id !== id || resolution.approvalStatus !== "승인대기" || !resolution.currentApprover) {
          return resolution;
        }

        const currentStepIndex = resolution.approvalLine.findIndex((step) => getApproverLabel(step) === resolution.currentApprover);
        if (currentStepIndex < 0) {
          return resolution;
        }

        const approvedStep = resolution.approvalLine[currentStepIndex];
        const approvedActorLabel = getApproverLabel(approvedStep);
        const approvalHistory = createHistoryItem({
          actionAt: getApprovalActionAt(approvedStep.order),
          actionLabel: "결재승인",
          actionType: "APPROVED",
          actorLabel: approvedActorLabel,
          comment: `${approvedActorLabel} 승인`,
        });
        const approvalLine = resolution.approvalLine.map((step, index) => {
          if (index === currentStepIndex) {
            return { ...step, status: "승인완료" as const, processedAt: getCurrentDateIso() };
          }
          if (index === currentStepIndex + 1) {
            return { ...step, status: "결재대기" as const };
          }
          return step;
        });
        const nextStep = approvalLine[currentStepIndex + 1];

        if (!nextStep) {
          const isAfterPaymentFlow = resolution.paymentFlowType !== "사전결의";
          const nextPaymentStatus: PaymentStatus = isAfterPaymentFlow ? "지급완료" : "지급대기";
          const approvedResolution: ManagedExpenseResolution = {
            ...resolution,
            approvalLine,
            approvalStatus: "승인완료",
            currentApprover: undefined,
            expenseItems: resolution.resolutionType === "BATCH" ? resolution.expenseItems.map((item) => ({ ...item, paymentStatus: nextPaymentStatus })) : resolution.expenseItems,
            history: [
              ...resolution.history,
              approvalHistory,
              createHistoryItem({
                actionAt: "2026-07-03 09:31",
                actionLabel: "지급대기 전환",
                actionType: "PAYMENT_PENDING",
                actorLabel: "시스템",
              }),
            ],
            paymentStatus: nextPaymentStatus,
            settlementStatus: isAfterPaymentFlow ? "정산완료" : resolution.settlementStatus,
          };

          return applyVoucherDraft(approvedResolution, getNextExpenseVoucherNo(current));
        }

        return {
          ...resolution,
          approvalLine,
          currentApprover: getApproverLabel(nextStep),
          history: [...resolution.history, approvalHistory],
        };
      }),
    );
  }

  function requestApproval(id: string) {
    const firstApprover = buildApprovalLine()[0];

    setResolutions((current) =>
      current.map((resolution) =>
        resolution.id === id && resolution.approvalStatus === "작성중"
          ? {
              ...resolution,
              approvalLine: buildApprovalLine().map((step, index) => (index === 0 ? { ...step, status: "결재대기" as const } : step)),
              approvalStatus: "승인대기",
              currentApprover: getApproverLabel(firstApprover),
              history: [
                ...resolution.history,
                createHistoryItem({
                  actionAt: "2026-07-02 10:35",
                  actionLabel: "승인요청",
                  actionType: "REQUESTED_APPROVAL",
                  actorLabel: resolution.author,
                }),
              ],
              paymentStatus: resolution.paymentFlowType === "사전결의" ? "지급전" : "지급완료",
            }
          : resolution,
      ),
    );
  }

  function rejectResolution(id: string) {
    setRejectionForm({
      error: "",
      reason: "",
      resolutionId: id,
    });
  }

  function submitRejection() {
    if (!rejectionForm) {
      return;
    }

    const reason = rejectionForm.reason.trim();
    if (!reason) {
      setRejectionForm((current) => (current ? { ...current, error: "반려사유를 입력해주세요." } : current));
      return;
    }

    setResolutions((current) =>
      current.map((resolution) => {
        if (resolution.id !== rejectionForm.resolutionId) {
          return resolution;
        }

        return {
          ...resolution,
          approvalLine: resolution.approvalLine.map((step) =>
            getApproverLabel(step) === resolution.currentApprover ? { ...step, status: "반려" as const, processedAt: getCurrentDateIso() } : step,
          ),
          approvalStatus: "반려",
          currentApprover: undefined,
          expenseItems: resolution.expenseItems.map((item) => ({ ...item, paymentStatus: "지급전" as const })),
          history: [
            ...resolution.history,
            createHistoryItem({
              actionAt: "2026-07-02 16:20",
              actionLabel: "반려",
              actionType: "REJECTED",
              actorLabel: resolution.currentApprover ?? currentUserName,
              comment: reason,
            }),
          ],
          paymentStatus: "지급전",
          rejectionReason: reason,
        };
      }),
    );
    setRejectionForm(null);
    setActiveTab("rejected");
  }

  function completePayment() {
    if (!paymentTargetId) {
      return;
    }

    setResolutions((current) =>
      current.map((resolution) =>
        resolution.id === paymentTargetId && resolution.approvalStatus === "승인완료" && ["지급대기", "부분지급"].includes(resolution.paymentStatus)
          ? {
              ...resolution,
              actualPaidAmount: Number(paymentForm.actualPaidAmount) || resolution.totalPaymentAmount,
              accountHolder: paymentForm.accountHolder,
              paidAt: paymentForm.paidAt,
              paymentBank: paymentForm.paymentBank,
              paymentAccountNo: paymentForm.paymentAccountNo,
              paymentMemo: paymentForm.paymentMemo,
              paymentMethod: paymentForm.paymentMethod,
              paymentStatus: "지급완료",
              expenseItems:
                resolution.resolutionType === "BATCH"
                  ? resolution.expenseItems.map((item) => ({
                      ...item,
                      actualPaidAmount: item.totalAmount,
                      paidAt: paymentForm.paidAt,
                      paymentMethod: paymentForm.paymentMethod,
                      paymentStatus: "지급완료" as const,
                    }))
                  : resolution.expenseItems,
              history: [
                ...resolution.history,
                createHistoryItem({
                  actionAt: `${paymentForm.paidAt} 15:00`,
                  actionLabel: "지급완료",
                  actionType: "PAYMENT_COMPLETED",
                  actorLabel: currentUserName,
                  comment: paymentForm.paymentMemo || `${paymentForm.paymentMethod} 지급완료`,
                }),
              ],
              transferReceiptStatus: "이체확인증 첨부 대기",
            }
          : resolution,
      ),
    );
    setPaymentTargetId(null);
    setActiveTab("paid");
  }

  function completeBatchItemPayment(itemNo: number) {
    if (!paymentTargetId) {
      return;
    }

    let nextTab: ResolutionTabKey = "partialPaid";

    setResolutions((current) =>
      current.map((resolution) => {
        if (
          resolution.id !== paymentTargetId ||
          resolution.resolutionType !== "BATCH" ||
          resolution.approvalStatus !== "승인완료" ||
          !["지급대기", "부분지급"].includes(resolution.paymentStatus)
        ) {
          return resolution;
        }

        const paidItems = resolution.expenseItems.map((item) =>
          item.itemNo === itemNo
            ? {
                ...item,
                actualPaidAmount: item.totalAmount,
                paidAt: paymentForm.paidAt,
                paymentMethod: paymentForm.paymentMethod,
                paymentStatus: "지급완료" as const,
              }
            : item,
        );
        const allPaid = paidItems.every((item) => item.paymentStatus === "지급완료");
        nextTab = allPaid ? "paid" : "partialPaid";

        return {
          ...resolution,
          actualPaidAmount: paidItems.filter((item) => item.paymentStatus === "지급완료").reduce((sum, item) => sum + (item.actualPaidAmount ?? item.totalAmount), 0),
          accountHolder: paymentForm.accountHolder,
          paidAt: allPaid ? paymentForm.paidAt : resolution.paidAt,
          paymentBank: paymentForm.paymentBank,
          paymentAccountNo: paymentForm.paymentAccountNo,
          paymentMemo: paymentForm.paymentMemo,
          paymentMethod: paymentForm.paymentMethod,
          paymentStatus: allPaid ? "지급완료" : "부분지급",
          expenseItems: paidItems,
          history: [
            ...resolution.history,
            createHistoryItem({
              actionAt: `${paymentForm.paidAt} 15:00`,
              actionLabel: allPaid ? "지급완료" : "부분지급",
              actionType: "PAYMENT_COMPLETED",
              actorLabel: currentUserName,
              comment: `${itemNo}행 ${paymentForm.paymentMethod} 지급완료${paymentForm.paymentMemo ? ` · ${paymentForm.paymentMemo}` : ""}`,
            }),
          ],
          transferReceiptStatus: "이체확인증 첨부 대기",
        };
      }),
    );
    setPaymentTargetId(null);
    setActiveTab(nextTab);
  }

  function createVoucher(id: string) {
    setResolutions((current) => {
      const voucherNo = getNextExpenseVoucherNo(current);

      return current.map((resolution) => {
        if (resolution.id !== id || resolution.paymentStatus !== "지급완료" || resolution.voucherNo) {
          return resolution;
        }

        return applyVoucherDraft(resolution, voucherNo, "2026-07-03 16:45");
      });
    });
  }

  function confirmVoucher(id: string) {
    setResolutions((current) => current.map((resolution) => (resolution.id === id ? applyVoucherConfirmation(resolution) : resolution)));
    setActiveTab("voucherCreated");
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
            <Button className="rounded-full" size="lg" variant="outline">
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

        <section className="grid gap-4 lg:grid-cols-3">
          <SummaryTile label="지출결의 승인대기" value={`${summary.pendingApprovalCount}건`} />
          <SummaryTile label="지급대기" value={`${summary.waitingPaymentCount}건`} />
          <SummaryTile label="승인대기 금액" value={formatExpenseResolutionAmount(summary.totalPendingAmount)} />
        </section>

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

        <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)] xl:w-[420px]">
                  <Search className="size-4 shrink-0" />
                  <span>결의서번호, 거래처명, 지출구분, 승인상태, 지급상태 검색</span>
                </div>
                <div className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-stone)]">
                  현재 사용자: {currentUserName}
                </div>
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
                <Button className="rounded-full" size="sm" variant="outline">
                  <FileSpreadsheet className="size-4" />
                  엑셀
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table aria-label="지출결의서 목록" className="w-full min-w-[1760px] border-collapse text-left text-sm">
                  <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
                    <tr>
                      <th className="px-4 py-3 text-center">결의서번호</th>
                      <th className="px-4 py-3 text-center">결의서유형</th>
                      <th className="px-4 py-3 text-center">프로젝트/사업과제</th>
                      <th className="px-4 py-3 text-center">작성일</th>
                      <th className="px-4 py-3 text-center">작성자</th>
                      <th className="px-4 py-3 text-center">대표 거래처</th>
                      <th className="px-4 py-3 text-center">대표 계정항목</th>
                      <th className="px-4 py-3 text-center">총지급액</th>
                      <th className="px-4 py-3 text-center">항목수</th>
                      <th className="px-4 py-3 text-center">예산초과</th>
                      <th className="px-4 py-3 text-center">현재결재자</th>
                      <th className="px-4 py-3 text-center">승인상태</th>
                      <th className="px-4 py-3 text-center">지급상태</th>
                      <th className="px-4 py-3 text-center">전표상태</th>
                      <th className="px-4 py-3 text-center">전표번호</th>
                      <th className="px-4 py-3 text-center">증빙여부</th>
                      <th className="px-4 py-3 text-center">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-soft-border)]">
                    {visibleResolutions.map((resolution) => {
                      const canApprove = resolution.approvalStatus === "승인대기" && isCurrentUserApprover(resolution);
                      const canPay = resolution.approvalStatus === "승인완료" && ["지급대기", "부분지급"].includes(resolution.paymentStatus);
                      const canCreateVoucher = resolution.paymentStatus === "지급완료" && !resolution.voucherNo;
                      const canConfirmVoucher = resolution.paymentStatus === "지급완료" && resolution.voucherStatus === "전표초안";

                      return (
                        <tr className="bg-white/70" key={resolution.id}>
                          <td className="px-4 py-4 font-bold text-[var(--color-deep-cobalt)]">{resolution.resolutionNo}</td>
                          <td className="px-4 py-4 text-center">
                            <Badge value={getResolutionTypeLabel(resolution.resolutionType)} />
                          </td>
                          <td className="px-4 py-4 font-semibold">{resolution.projectName || "-"}</td>
                          <td className="px-4 py-4 text-[var(--color-stone)]">{resolution.createdAt}</td>
                          <td className="px-4 py-4 text-[var(--color-stone)]">{resolution.author}</td>
                          <td className="px-4 py-4 font-semibold">{resolution.representativeVendorName}</td>
                          <td className="px-4 py-4">{resolution.representativeAccountTitle}</td>
                          <td className="px-4 py-4 text-right font-bold">{formatExpenseResolutionAmount(resolution.totalPaymentAmount)}</td>
                          <td className="px-4 py-4 text-center font-semibold">{resolution.itemCount}건</td>
                          <td className="px-4 py-4">
                            <Badge value={getBudgetOverLabel(resolution.overBudgetItemCount)} />
                            {resolution.totalOverBudgetAmount > 0 ? <p className="mt-1 text-xs text-[var(--color-tangerine)]">{formatExpenseResolutionAmount(resolution.totalOverBudgetAmount)}</p> : null}
                          </td>
                          <td className="px-4 py-4 text-[var(--color-stone)]">{resolution.currentApprover ?? "없음"}</td>
                          <td className="px-4 py-4">
                            <Badge value={resolution.approvalStatus} />
                            {resolution.rejectionReason ? <p className="mt-1 text-xs text-[var(--color-tangerine)]">{resolution.rejectionReason}</p> : null}
                          </td>
                          <td className="px-4 py-4">
                            <Badge value={resolution.paymentStatus} />
                            {resolution.paidAt ? <p className="mt-1 text-xs text-[var(--color-stone)]">지급일 {resolution.paidAt}</p> : null}
                            {resolution.transferReceiptStatus ? (
                              <label className="mt-2 inline-flex cursor-pointer rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-stone)]">
                                이체확인증 첨부
                                <input className="sr-only" type="file" />
                              </label>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <Badge value={getVoucherStatusLabel(resolution)} />
                          </td>
                          <td className="px-4 py-4 font-semibold text-[var(--color-deep-cobalt)]">{getRelatedVoucherNo(resolution)}</td>
                          <td className="px-4 py-4">
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
                      <td className="px-4 py-3 text-right" colSpan={7}>
                        {activeTabItem.label} 합계
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatExpenseResolutionAmount(visibleResolutions.reduce((sum, resolution) => sum + resolution.totalPaymentAmount, 0))}
                      </td>
                      <td className="px-4 py-3" colSpan={9}>
                        표시 건수 {visibleResolutions.length}건
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </div>

          <aside className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-lg font-bold">작성 양식</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">
              지출 전 결의서에 필요한 입력 항목입니다.
            </p>
            <div className="mt-5 grid gap-2">
              {expenseResolutionFields.map((field) => (
                <label className="grid gap-1 text-sm font-semibold" key={field}>
                  <span>{field}</span>
                  <span className="min-h-9 rounded-md border border-[var(--color-soft-border)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-fog)]">
                    {field} 입력
                  </span>
                </label>
              ))}
            </div>
          </aside>
        </section>
      </div>

      {isCreateModalOpen ? (
        <ExpenseResolutionCreateModal
          batchSummary={formBatchSummary}
          budgetSnapshot={formBudgetSnapshot}
          formState={formState}
          onAddBatchItem={addBatchItem}
          onAttachBatchEvidence={attachBatchEvidence}
          onCancel={closeCreateModal}
          onChange={updateFormValue}
          onCopyBatchItem={copyBatchItem}
          onDeleteBatchItem={deleteBatchItem}
          onReviewBatchBudget={reviewBatchBudget}
          onBatchItemChange={updateBatchItem}
          onRequestApproval={() => saveResolution("approval-request")}
          onSaveDraft={() => saveResolution("draft")}
          settlementDifference={settlementDifference}
          totalAmount={effectiveFormTotalAmount}
        />
      ) : null}

      {selectedDetail ? (
        <ExpenseResolutionDetailModal
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
          warnings={printWarning.warnings}
        />
      ) : null}

      {isOperatingBudgetPrintOpen ? <OperatingBudgetPrintModal onClose={() => setIsOperatingBudgetPrintOpen(false)} /> : null}
    </ErpShell>
  );
}

function ExpenseResolutionCreateModal({
  batchSummary,
  budgetSnapshot,
  formState,
  onAddBatchItem,
  onAttachBatchEvidence,
  onBatchItemChange,
  onCancel,
  onChange,
  onCopyBatchItem,
  onDeleteBatchItem,
  onReviewBatchBudget,
  onRequestApproval,
  onSaveDraft,
  settlementDifference,
  totalAmount,
}: {
  batchSummary: ReturnType<typeof summarizeBatchItems>;
  budgetSnapshot: BudgetSnapshot;
  formState: ResolutionFormState;
  onAddBatchItem: () => void;
  onAttachBatchEvidence: (itemNo: number) => void;
  onBatchItemChange: (itemNo: number, key: keyof BatchExpenseItem, value: string) => void;
  onCancel: () => void;
  onChange: <K extends keyof ResolutionFormState>(key: K, value: ResolutionFormState[K]) => void;
  onCopyBatchItem: (itemNo: number) => void;
  onDeleteBatchItem: (itemNo: number) => void;
  onReviewBatchBudget: (itemNo: number) => void;
  onRequestApproval: () => void;
  onSaveDraft: () => void;
  settlementDifference: number;
  totalAmount: number;
}) {
  const isAfterPaymentFlow = formState.paymentFlowType !== "사전결의";
  const isBatch = formState.resolutionType === "BATCH";
  const presetApplied = Boolean(formState.projectName && hasProjectExpensePreset(formState.projectName));
  const [isExpenseDetailOpen, setIsExpenseDetailOpen] = useState(false);
  const selectedPaymentTarget = getPaymentTarget(formState.paymentTargetId);

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
              지출결의서 작성
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">
              조합 지출 전에 결의서를 작성하고 결재 승인 후 지급대기 및 지출전표 생성으로 연결합니다.
            </p>
          </div>
          <button aria-label="닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onCancel} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-[1fr_320px]">
          <div className="grid gap-4">
            <FormSection layout="compact" title="기본정보">
              <TextInput label="결의서번호" readOnly value={formState.resolutionNo} />
              <TextInput label="작성일" onChange={(value) => onChange("createdAt", value)} type="date" value={formState.createdAt} />
              <TextInput label="작성자" readOnly value={formState.author} />
              <TextInput label="지출예정일" onChange={(value) => onChange("plannedPaymentDate", value)} type="date" value={formState.plannedPaymentDate} />
              <p className="rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-stone)] md:col-span-3 xl:col-span-4">
                작성자는 로그인 사용자 기준으로 자동 입력되며 결재선과 별도로 관리됩니다.
              </p>
              <label className="grid gap-1 text-sm font-semibold">
                <span>결의서 유형</span>
                <select
                  className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                  onChange={(event) => onChange("resolutionType", event.target.value as ResolutionDocumentType)}
                  value={formState.resolutionType}
                >
                  {resolutionTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
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
              <label className="grid gap-1 text-sm font-semibold">
                <span>지급유형</span>
                <select
                  className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm"
                  onChange={(event) => onChange("paymentFlowType", event.target.value as PaymentFlowType)}
                  value={formState.paymentFlowType}
                >
                  {paymentFlowOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
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
              <div className="rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 md:col-span-3 xl:col-span-4">
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
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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

                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {isBatch ? (
                    <>
                      <div className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3">
                        <p className="text-sm font-semibold text-[var(--color-stone)]">공급가액 합계</p>
                        <p className="mt-2 text-lg font-bold">{formatExpenseResolutionAmount(batchSummary.totalSupplyAmount)}</p>
                      </div>
                      <div className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3">
                        <p className="text-sm font-semibold text-[var(--color-stone)]">부가세 합계</p>
                        <p className="mt-2 text-lg font-bold">{formatExpenseResolutionAmount(batchSummary.totalVatAmount)}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <TextInput label="공급가액" onChange={(value) => onChange("supplyAmount", value)} type="number" value={formState.supplyAmount} />
                      <TextInput label="부가세" onChange={(value) => onChange("vat", value)} type="number" value={formState.vat} />
                    </>
                  )}
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
            </FormSection>

            {isBatch ? (
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

            {isAfterPaymentFlow ? (
              <FormSection title="선지급/사후정산 정보">
                <TextInput label="선지급일" onChange={(value) => onChange("advancePaidAt", value)} type="date" value={formState.advancePaidAt} />
                <TextInput label="선지급자" onChange={(value) => onChange("advancePayer", value)} value={formState.advancePayer} />
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
                <TextInput label="실제 사용금액" onChange={(value) => onChange("actualUsedAmount", value)} type="number" value={formState.actualUsedAmount} />
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
                  <p className="mt-2 text-lg font-bold">차액 {formatExpenseResolutionAmount(settlementDifference)}</p>
                </div>
                <TextareaInput label="사후승인 사유" onChange={(value) => onChange("postApprovalReason", value)} value={formState.postApprovalReason} />
              </FormSection>
            ) : null}

            <FormSection title="지급정보">
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
            </FormSection>

            <FormSection title="연결정보">
              <TextInput label="관련계약" onChange={(value) => onChange("relatedContract", value)} value={formState.relatedContract} />
              <TextInput label="관련회의/의결" onChange={(value) => onChange("relatedMeeting", value)} value={formState.relatedMeeting} />
            </FormSection>

            <FormSection title="증빙자료">
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
              <label className="grid gap-1 text-sm font-semibold md:col-span-2">
                <span>증빙자료</span>
                <span className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-[var(--color-soft-border)] bg-white px-4 text-sm text-[var(--color-stone)]">
                  파일을 선택하거나 여기에 첨부하세요.
                </span>
                <input className="sr-only" type="file" />
              </label>
            </FormSection>

            <FormSection title="기타">
              <TextareaInput label="내부메모" onChange={(value) => onChange("memo", value)} value={formState.memo} />
            </FormSection>
          </div>

          <aside className="rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] p-3">
            <section className="mb-3 rounded-lg bg-white p-3">
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
          </aside>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          <Button className="rounded-full" onClick={onCancel} variant="outline">
            취소
          </Button>
          <Button className="rounded-full" onClick={onSaveDraft} variant="outline">
            임시저장
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={onRequestApproval}>
            승인요청
          </Button>
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

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-soft-border)] bg-white">
        <table aria-label="세부 지출내역" className="w-full min-w-[2200px] border-collapse text-left text-xs">
          <thead className="bg-[var(--color-cloud-veil)] text-[var(--color-stone)]">
            <tr>
              {[
                "순번",
                "지출예정일",
                "거래처",
                "계정항목",
                "지출구분",
                "예산항목",
                "지출항목명",
                "내역 및 산출근거",
                "공급가액",
                "부가세",
                "합계",
                "증빙유형",
                "증빙파일명",
                "지급방법",
                "지급상태",
                "예산상태",
                "액션",
              ].map((column) => (
                <th className="px-3 py-2" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-soft-border)]">
            {items.map((item) => (
              <tr className={item.budgetStatus === "OVER_BUDGET" ? "bg-[var(--color-sunset-soft)]/25" : "bg-white"} key={item.id}>
                <td className="px-3 py-3 font-bold">{item.itemNo}</td>
                <td className="px-3 py-3">
                  <BatchInput ariaLabel={`${item.itemNo}행 지출예정일`} type="date" value={item.expenseDate} onChange={(value) => onBatchItemChange(item.itemNo, "expenseDate", value)} />
                </td>
                <td className="px-3 py-3">
                  <BatchInput ariaLabel={`${item.itemNo}행 거래처`} value={item.vendorName} onChange={(value) => onBatchItemChange(item.itemNo, "vendorName", value)} />
                </td>
                <td className="px-3 py-3">
                  <BatchSelect ariaLabel={`${item.itemNo}행 계정항목`} options={accountTitleOptions} value={item.accountTitle} onChange={(value) => onBatchItemChange(item.itemNo, "accountTitle", value)} />
                </td>
                <td className="px-3 py-3">
                  <BatchSelect ariaLabel={`${item.itemNo}행 지출구분`} options={expenseResolutionTypeOptions} value={item.expenseType} onChange={(value) => onBatchItemChange(item.itemNo, "expenseType", value)} />
                </td>
                <td className="px-3 py-3">
                  <BatchSelect ariaLabel={`${item.itemNo}행 예산항목`} options={batchBudgetItemOptions} value={item.budgetItem} onChange={(value) => onBatchItemChange(item.itemNo, "budgetItem", value)} />
                </td>
                <td className="px-3 py-3">
                  <BatchInput ariaLabel={`${item.itemNo}행 지출항목명`} value={item.itemTitle} onChange={(value) => onBatchItemChange(item.itemNo, "itemTitle", value)} />
                </td>
                <td className="px-3 py-3">
                  <BatchInput ariaLabel={`${item.itemNo}행 내역 및 산출근거`} value={item.description} onChange={(value) => onBatchItemChange(item.itemNo, "description", value)} />
                </td>
                <td className="px-3 py-3">
                  <BatchInput ariaLabel={`${item.itemNo}행 공급가액`} type="number" value={item.supplyAmount} onChange={(value) => onBatchItemChange(item.itemNo, "supplyAmount", value)} />
                </td>
                <td className="px-3 py-3">
                  <BatchInput ariaLabel={`${item.itemNo}행 부가세`} type="number" value={item.vatAmount} onChange={(value) => onBatchItemChange(item.itemNo, "vatAmount", value)} />
                </td>
                <td className="px-3 py-3 text-right font-bold">{formatExpenseResolutionAmount(item.totalAmount)}</td>
                <td className="px-3 py-3">
                  <BatchSelect ariaLabel={`${item.itemNo}행 증빙유형`} options={batchEvidenceTypeOptions} value={item.evidenceType} onChange={(value) => onBatchItemChange(item.itemNo, "evidenceType", value)} />
                </td>
                <td className="px-3 py-3">
                  <BatchInput ariaLabel={`${item.itemNo}행 증빙파일명`} value={item.evidenceFileName} onChange={(value) => onBatchItemChange(item.itemNo, "evidenceFileName", value)} />
                </td>
                <td className="px-3 py-3">
                  <BatchSelect ariaLabel={`${item.itemNo}행 지급방법`} options={["계좌이체", "카드결제", "현금", "기타"]} value={item.paymentMethod} onChange={(value) => onBatchItemChange(item.itemNo, "paymentMethod", value)} />
                </td>
                <td className="px-3 py-3">
                  <BatchSelect ariaLabel={`${item.itemNo}행 지급상태`} options={["지급전", "지급대기", "지급완료", "보류"]} value={item.paymentStatus} onChange={(value) => onBatchItemChange(item.itemNo, "paymentStatus", value)} />
                </td>
                <td className="px-3 py-3">
                  <Badge value={item.budgetStatus === "OVER_BUDGET" ? "예산초과" : "정상"} />
                  <p className="mt-1 whitespace-nowrap text-[var(--color-stone)]">잔여 {formatExpenseResolutionAmount(item.remainingBudget)}</p>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2 py-1 font-semibold text-[var(--color-stone)]" onClick={() => onCopyBatchItem(item.itemNo)} type="button">
                      {item.itemNo}행 행 복사
                    </button>
                    <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2 py-1 font-semibold text-[var(--color-tangerine)]" onClick={() => onDeleteBatchItem(item.itemNo)} type="button">
                      {item.itemNo}행 행 삭제
                    </button>
                    <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2 py-1 font-semibold text-[var(--color-deep-cobalt)]" onClick={() => onAttachBatchEvidence(item.itemNo)} type="button">
                      {item.itemNo}행 증빙첨부
                    </button>
                    <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2 py-1 font-semibold text-[var(--color-green-ink)]" onClick={() => onReviewBatchBudget(item.itemNo)} type="button">
                      {item.itemNo}행 예산검토
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BatchInput({ ariaLabel, onChange, type = "text", value }: { ariaLabel: string; onChange: (value: string) => void; type?: "date" | "number" | "text"; value: string }) {
  return (
    <input
      aria-label={ariaLabel}
      className="h-9 w-full min-w-32 rounded-md border border-[var(--color-soft-border)] bg-white px-2 text-xs"
      onChange={(event) => onChange(event.target.value)}
      type={type}
      value={value}
    />
  );
}

function BatchSelect({ ariaLabel, onChange, options, value }: { ariaLabel: string; onChange: (value: string) => void; options: readonly string[]; value: string }) {
  return (
    <select aria-label={ariaLabel} className="h-9 w-full min-w-36 rounded-md border border-[var(--color-soft-border)] bg-white px-2 text-xs" onChange={(event) => onChange(event.target.value)} value={value}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export function ExpenseResolutionDetailModal({
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
                <DetailItem label="결의서 유형" value={getResolutionTypeFullLabel(resolution.resolutionType)} />
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
            <DetailItem label="결의서 유형" value={getResolutionTypeFullLabel(resolution.resolutionType)} />
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
            <DetailItem label="지급유형" value={resolution.paymentFlowType} />
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
          <Button className="rounded-full" onClick={onPrintPreview} variant="outline">
            출력 미리보기
          </Button>
          <Button className="rounded-full" onClick={onPrintArchive} variant="outline">
            보관용 PDF 생성
          </Button>
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
          {resolution.approvalStatus === "승인대기" ? (
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
  const latestPrintRecord = resolution.printRecords.at(-1);
  const isBudgetExceeded = resolution.budgetSnapshot.remainingBudgetAmount < 0 || resolution.budgetSnapshot.budgetCheckStatus === "예산초과";
  const budgetStatusLabel = isBudgetExceeded ? "예산초과" : resolution.budgetSnapshot.budgetCheckStatus;
  const vendorMissing = !resolution.vendorName.trim() || resolution.vendorName === "거래처 미입력";
  const reasonText = resolution.reason.trim() || "지출사유 미입력";
  const budgetOverReason = isBudgetExceeded ? resolution.budgetOverReason.trim() || "예산초과 사유 미입력" : resolution.budgetOverReason.trim() || "-";
  const warningTextClass = "font-bold text-[var(--color-tangerine)]";
  const usageRateClass = resolution.budgetSnapshot.budgetUsageRate > 100 ? warningTextClass : "";

  return (
    <div className="print-modal-shell fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/88 px-4 py-8" onClick={onClose}>
      <section
        aria-labelledby="expense-resolution-print-title"
        aria-modal="true"
        className="w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold" id="expense-resolution-print-title">
              지출결의서 출력 미리보기
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">보관철에 출력 보관할 지출결의서 문서 형태를 확인합니다.</p>
          </div>
          <button aria-label="출력 미리보기 닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="print-expense-resolution bg-[var(--color-cloud-veil)] p-6">
          <article className="erp-print-page expense-resolution-print-page mx-auto rounded-sm bg-white p-8 text-sm shadow-sm">
            <header className="expense-resolution-print-header border-b-2 border-[var(--color-midnight-ink)] pb-5 text-center">
              <h3 className="text-3xl font-bold tracking-normal">지출결의서</h3>
              <p className="mt-2 text-[var(--color-stone)]">대방지역주택조합 사무국 회계 보관용</p>
            </header>

            <section className="expense-resolution-print-section mt-6">
              <h4 className="mb-2 text-base font-bold">결의 기본정보</h4>
              <div className="grid grid-cols-2 border border-[var(--color-soft-border)]">
                <PrintCell label="결의서번호" value={resolution.resolutionNo} />
                <PrintCell label="작성일" value={resolution.createdAt} />
                <PrintCell label="작성자" value={resolution.author} />
                <PrintCell label="지급유형" value={resolution.paymentFlowType} />
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

            <section className="expense-resolution-print-section mt-5">
              <h4 className="mb-2 text-base font-bold">예산 확인</h4>
              <div className="grid grid-cols-2 border border-[var(--color-soft-border)]">
                <PrintCell label="예산기간" value={resolution.budgetSnapshot.budgetPeriod} />
                <PrintCell label="예산항목" value={resolution.budgetItem || "-"} />
                <PrintCell label="기집행액" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.usedAmount)} valueClassName="text-right" />
                <PrintCell label="이번 결의금액" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.currentRequestAmount)} valueClassName="text-right" />
                <PrintCell
                  label="잔여예산"
                  value={formatExpenseResolutionAmount(resolution.budgetSnapshot.remainingBudgetAmount)}
                  valueClassName={`text-right ${isBudgetExceeded ? warningTextClass : ""}`}
                />
                <PrintCell
                  label="집행상태"
                  value={<span className={`rounded-full px-2 py-1 text-xs ${statusClasses[budgetStatusLabel] ?? statusClasses.정상}`}>{budgetStatusLabel}</span>}
                />
                <PrintCell label="월 예산" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.monthlyBudgetAmount)} valueClassName="text-right" />
                <PrintCell label="집행률" value={`${resolution.budgetSnapshot.budgetUsageRate}%`} valueClassName={`text-right ${usageRateClass}`} />
                {isBudgetExceeded ? <PrintCell label="예산초과 사유" value={<span className={resolution.budgetOverReason.trim() ? "" : warningTextClass}>{budgetOverReason}</span>} wide /> : null}
              </div>
            </section>

            <section className="expense-resolution-print-section mt-5">
              <h4 className="mb-2 text-base font-bold">내역 및 산출근거</h4>
              <div className="min-h-16 whitespace-pre-wrap border border-[var(--color-soft-border)] p-3 leading-6">{resolution.budgetSnapshot.calculationBasis || "-"}</div>
            </section>

            <section className="expense-resolution-print-section mt-5">
              <h4 className="mb-2 text-base font-bold">지출사유</h4>
              <div className={`min-h-24 whitespace-pre-wrap border border-[var(--color-soft-border)] p-3 leading-6 ${resolution.reason.trim() ? "" : warningTextClass}`}>{reasonText}</div>
            </section>

            <section className="expense-resolution-print-section mt-5">
              <h4 className="mb-2 text-base font-bold">결재선</h4>
              <div className="grid grid-cols-3 border border-[var(--color-soft-border)] text-center">
                {getDisplayApprovalLine(resolution).map((step) => (
                  <div className="border-r border-[var(--color-soft-border)] last:border-r-0" key={step.order}>
                    <p className="border-b border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] py-2 font-bold">{step.role}</p>
                    <p className="py-4 font-semibold">{step.approver}</p>
                    <p className="border-t border-[var(--color-soft-border)] py-2 text-xs font-semibold text-[var(--color-stone)]">{step.status}</p>
                    <p className="border-t border-[var(--color-soft-border)] py-2 text-xs text-[var(--color-stone)]">{step.processedAt ?? "서명란"}</p>
                  </div>
                ))}
              </div>
            </section>

            <footer className="expense-resolution-print-section mt-7">
              <h4 className="mb-2 text-base font-bold">출력 및 보관정보</h4>
              <div className="grid grid-cols-2 border border-[var(--color-soft-border)]">
                <PrintCell label="출력일시" value={latestPrintRecord?.printedAt ?? "2026-07-03 10:10"} />
                <PrintCell label="출력자" value={latestPrintRecord?.printedBy ?? currentUserName} />
                <PrintCell label="출력번호" value={latestPrintRecord?.printNo ?? "-"} />
                <PrintCell label="보관위치" value={latestPrintRecord?.storageLocation ?? "보관위치 미등록"} />
              </div>
            </footer>
          </article>
        </div>

        <div className="expense-resolution-print-actions flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
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
  warnings,
}: {
  onCancel: () => void;
  onContinue: () => void;
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
          <Button className="rounded-full" onClick={onCancel} variant="outline">
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
