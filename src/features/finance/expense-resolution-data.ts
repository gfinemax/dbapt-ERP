import {
  createDefaultApprovalLines,
  expenseResolutionApprovalStatuses,
  expenseResolutionPaymentStatuses,
  expenseResolutionTypes,
  formatCurrency,
  getApprovalStatusLabel,
  getPaymentStatusLabel,
} from "./finance-model";
import type { EvidenceType, ExpenseResolution, ExpenseResolutionApprovalStatus, ExpenseResolutionPaymentStatus, ExpenseResolutionType, ResolutionHistory } from "./finance-model";

export type { EvidenceType, ExpenseResolution, ExpenseResolutionApprovalStatus, ExpenseResolutionPaymentStatus, ExpenseResolutionType, ResolutionHistory };

export type ExpenseResolutionStatus = ExpenseResolutionApprovalStatus | ExpenseResolutionPaymentStatus;

export const expenseResolutionStatusValues: ExpenseResolutionStatus[] = [...expenseResolutionApprovalStatuses, ...expenseResolutionPaymentStatuses];

export const expenseResolutionTypeOptions: ExpenseResolutionType[] = [...expenseResolutionTypes];

export const expenseResolutionFields = [
  "결의서번호",
  "작성일",
  "작성자",
  "지출예정일",
  "결의서 유형",
  "프로젝트/사업과제",
  "지급유형",
  "지출정보 요약",
  "지출구분",
  "운영비 세부구분",
  "세부 지출내역",
  "예산기간",
  "예산항목",
  "거래처명",
  "지급대상",
  "지급은행",
  "지급계좌번호",
  "예금주",
  "공급가액",
  "부가세",
  "총지급액",
  "지출사유",
  "관련계약",
  "관련회의",
  "증빙자료",
  "승인상태",
  "지급상태",
  "정산상태",
  "출력보관",
  "메모",
];

function createHistory(id: string, actorName: string, actorTitle: string, actionAt: string, actionType: ResolutionHistory["actionType"], actionLabel: string, comment?: string): ResolutionHistory {
  return {
    id,
    actionType,
    actionLabel,
    actorName,
    actorTitle,
    actionAt,
    comment,
  };
}

function createEvidence(
  id: string,
  evidenceType: EvidenceType,
  evidenceTypeLabel: string,
  fileName: string,
  issuer: string,
  amount: number,
  uploadedAt: string,
  uploadedBy = "사무국 관리자",
) {
  return {
    id,
    evidenceType,
    evidenceTypeLabel,
    fileName,
    fileUrl: `/files/finance/${fileName}`,
    issuer,
    amount,
    uploadedAt,
    uploadedBy,
  };
}

function approvalLinesFor(status: ExpenseResolutionApprovalStatus, currentOrder = 1) {
  if (status === "DRAFT") {
    return createDefaultApprovalLines();
  }
  if (status === "APPROVED") {
    return createDefaultApprovalLines().map((line) => ({ ...line, status: "APPROVED" as const, approvedAt: "2026-07-02" }));
  }
  if (status === "REJECTED") {
    return createDefaultApprovalLines().map((line) => (line.order === 1 ? { ...line, status: "REJECTED" as const, approvedAt: "2026-07-02" } : line));
  }

  return createDefaultApprovalLines().map((line) =>
    line.order < currentOrder
      ? { ...line, status: "APPROVED" as const, approvedAt: "2026-07-02" }
      : line.order === currentOrder
        ? { ...line, status: "CURRENT" as const }
        : line,
  );
}

export const expenseResolutions: ExpenseResolution[] = [
  {
    id: "expense-resolution-0001",
    resolutionNo: "지결-2026-0001",
    createdAt: "2026-06-07",
    createdBy: "오학동",
    createdByTitle: "사무장",
    plannedPaymentDate: "2026-06-14",
    expenseType: "법무비",
    budgetItem: "운영비 > 법무자문",
    vendorName: "법무법인 ○○",
    bankName: "국민은행",
    accountNumber: "123456-78-901234",
    accountHolder: "법무법인 ○○",
    supplyAmount: 3000000,
    vatAmount: 300000,
    totalAmount: 3300000,
    reason: "동작구청 대응 및 업무대행계약 검토 관련 법률자문료 지급",
    relatedContract: "업무대행계약 검토 용역",
    relatedMeeting: "제12차 이사회 의결",
    approvalStatus: "PENDING",
    paymentStatus: "PAYMENT_PENDING",
    paymentFlowType: "PRE_APPROVAL",
    settlementStatus: "NOT_REQUIRED",
    budgetPeriod: "2026-07",
    calculationBasis: "기존 지출결의서 법무비 예산 연계",
    currentAnnualBudgetAmount: 51600000,
    monthlyBudgetAmount: 50000000,
    previousAnnualBudgetAmount: 51600000,
    usedAmount: 3300000,
    pendingApprovalAmount: 0,
    paymentWaitingAmount: 3300000,
    currentRequestAmount: 3300000,
    expectedUsedAmount: 6600000,
    remainingBudgetAmount: 43400000,
    budgetUsageRate: 13.2,
    budgetCheckStatus: "NORMAL",
    currentApprover: "오학동",
    currentApproverTitle: "사무장",
    approvalLines: approvalLinesFor("PENDING", 2),
    evidenceFiles: [
      createEvidence("evidence-0001-tax", "TAX_INVOICE", "세금계산서", "jigyeol-2026-0001-tax-invoice.pdf", "법무법인 ○○", 3300000, "2026-06-07"),
      createEvidence("evidence-0001-contract", "CONTRACT", "계약서", "jigyeol-2026-0001-contract.pdf", "법무법인 ○○", 3300000, "2026-06-07"),
      createEvidence("evidence-0001-meeting", "MEETING_RESOLUTION", "의결서", "jigyeol-2026-0001-board-resolution.pdf", "대방지역주택조합", 3300000, "2026-06-07"),
    ],
    history: [
      createHistory("history-0001-created", "오학동", "사무장", "2026-07-02 10:30", "CREATED", "지출결의서 작성"),
      createHistory("history-0001-requested", "오학동", "사무장", "2026-07-02 10:35", "REQUESTED_APPROVAL", "승인요청"),
      createHistory("history-0001-evidence", "오학동", "사무장", "2026-07-02 10:40", "EVIDENCE_ATTACHED", "증빙자료 첨부", "세금계산서, 계약서, 이사회 의결서"),
    ],
    printRecords: [
      {
        id: "print-0001",
        printNo: "PRINT-2026-0001",
        printedAt: "2026-07-03 10:10",
        printedBy: "오학동 사무장",
        printPurpose: "보관용",
        copyKind: "원본",
        storageLocation: "2026년 운영비 지출결의서 / 7월 / 001",
      },
    ],
    memo: "승인 후 운영계좌에서 이체 예정",
  },
  {
    id: "expense-resolution-0002",
    resolutionNo: "지결-2026-0002",
    createdAt: "2026-06-06",
    createdBy: "회계",
    createdByTitle: "담당자",
    plannedPaymentDate: "2026-06-18",
    expenseType: "토지매입비",
    budgetItem: "사업비 > 토지비",
    vendorName: "대방개발 주식회사",
    bankName: "신한은행",
    accountNumber: "110-123-456789",
    accountHolder: "대방개발 주식회사",
    supplyAmount: 950000000,
    vatAmount: 0,
    totalAmount: 950000000,
    reason: "사업부지 3필지 매매대금 중도금 지급",
    relatedContract: "토지매매계약 DBL-2026-03",
    relatedMeeting: "제11차 이사회 의결",
    approvalStatus: "PENDING",
    paymentStatus: "PAYMENT_PENDING",
    currentApprover: "오학동",
    currentApproverTitle: "사무장",
    approvalLines: approvalLinesFor("PENDING", 2),
    evidenceFiles: [
      createEvidence("evidence-0002-contract", "CONTRACT", "계약서", "jigyeol-2026-0002-land-contract.pdf", "대방개발 주식회사", 950000000, "2026-06-06"),
      createEvidence("evidence-0002-meeting", "MEETING_RESOLUTION", "의결서", "jigyeol-2026-0002-board-resolution.pdf", "대방지역주택조합", 950000000, "2026-06-06"),
    ],
    history: [
      createHistory("history-0002-created", "회계", "담당자", "2026-07-02 10:30", "CREATED", "지출결의서 작성"),
      createHistory("history-0002-requested", "회계", "담당자", "2026-07-02 10:35", "REQUESTED_APPROVAL", "승인요청"),
    ],
    memo: "신탁 지급요청서와 함께 처리",
  },
  {
    id: "expense-resolution-0003",
    resolutionNo: "지결-2026-0003",
    createdAt: "2026-06-05",
    createdBy: "사무국",
    createdByTitle: "관리자",
    plannedPaymentDate: "2026-06-20",
    expenseType: "감정평가비",
    budgetItem: "사업비 > 감정평가",
    vendorName: "미래감정평가법인",
    bankName: "하나은행",
    accountNumber: "555-910022-10004",
    accountHolder: "미래감정평가법인",
    supplyAmount: 286363637,
    vatAmount: 28636363,
    totalAmount: 315000000,
    reason: "사업부지 감정평가 용역비 지급",
    relatedContract: "감정평가 용역계약",
    relatedMeeting: "제10차 이사회 의결",
    approvalStatus: "APPROVED",
    paymentStatus: "PAYMENT_PENDING",
    approvalLines: approvalLinesFor("APPROVED"),
    evidenceFiles: [],
    history: [
      createHistory("history-0003-created", "사무국", "관리자", "2026-07-02 10:30", "CREATED", "지출결의서 작성"),
      createHistory("history-0003-pending", "시스템", "", "2026-07-03 09:31", "PAYMENT_PENDING", "지급대기 전환"),
    ],
    memo: "세금계산서 수취 후 지급 재검토",
  },
  {
    id: "expense-resolution-0004",
    resolutionNo: "지결-2026-0004",
    createdAt: "2026-06-03",
    createdBy: "회계",
    createdByTitle: "담당자",
    plannedPaymentDate: "2026-06-10",
    expenseType: "세무비",
    budgetItem: "운영비 > 세무자문",
    vendorName: "한빛세무회계",
    bankName: "우리은행",
    accountNumber: "1002-333-444555",
    accountHolder: "한빛세무회계",
    supplyAmount: 30000000,
    vatAmount: 3000000,
    totalAmount: 33000000,
    reason: "조합 법인세 및 부가세 검토 세무자문료 지급",
    relatedContract: "세무자문 용역계약",
    relatedMeeting: "월간 운영회의",
    approvalStatus: "APPROVED",
    paymentStatus: "PAID",
    paidAt: "2026-06-10",
    paymentMethod: "BANK_TRANSFER",
    actualPaidAmount: 33000000,
    approvalLines: approvalLinesFor("APPROVED"),
    evidenceFiles: [
      createEvidence("evidence-0004-tax", "TAX_INVOICE", "세금계산서", "jigyeol-2026-0004-tax-invoice.pdf", "한빛세무회계", 33000000, "2026-06-03"),
      createEvidence("evidence-0004-transfer", "TRANSFER_CONFIRMATION", "이체확인증", "jigyeol-2026-0004-transfer.pdf", "우리은행", 33000000, "2026-06-10"),
    ],
    history: [
      createHistory("history-0004-created", "회계", "담당자", "2026-07-02 10:30", "CREATED", "지출결의서 작성"),
      createHistory("history-0004-approved", "안동연", "조합장", "2026-07-03 09:30", "APPROVED", "결재승인", "안동연 조합장 승인"),
      createHistory("history-0004-paid", "시스템", "", "2026-06-10 15:00", "PAYMENT_COMPLETED", "지급완료"),
    ],
    memo: "지출전표 생성 전",
  },
  {
    id: "expense-resolution-0005",
    resolutionNo: "지결-2026-0005",
    createdAt: "2026-06-02",
    createdBy: "사무국",
    createdByTitle: "관리자",
    plannedPaymentDate: "2026-06-12",
    expenseType: "환불금",
    budgetItem: "조합원 정산 > 환불금",
    vendorName: "박서연 조합원",
    bankName: "국민은행",
    accountNumber: "987654-32-100000",
    accountHolder: "박서연",
    supplyAmount: 203310000,
    vatAmount: 0,
    totalAmount: 203310000,
    reason: "계약 해지 조합원 납입금 환불 처리",
    relatedContract: "조합가입계약 해지 합의서",
    relatedMeeting: "제9차 이사회 의결",
    approvalStatus: "DRAFT",
    paymentStatus: "BEFORE_PAYMENT",
    approvalLines: approvalLinesFor("DRAFT"),
    evidenceFiles: [],
    history: [
      createHistory("history-0005-created", "사무국", "관리자", "2026-07-02 10:30", "CREATED", "지출결의서 작성"),
      createHistory("history-0005-draft", "사무국", "관리자", "2026-07-02 10:32", "SAVED_DRAFT", "임시저장"),
    ],
    memo: "대표자 승인 전 검토",
  },
];

export function formatExpenseResolutionAmount(amount: number) {
  return formatCurrency(amount);
}

export { getApprovalStatusLabel, getPaymentStatusLabel };

export function getExpenseResolutionSummary() {
  const pendingApprovalItems = expenseResolutions.filter((resolution) => resolution.approvalStatus === "PENDING");

  return {
    pendingApprovalCount: pendingApprovalItems.length,
    waitingPaymentCount: expenseResolutions.filter((resolution) => resolution.approvalStatus === "APPROVED" && resolution.paymentStatus === "PAYMENT_PENDING").length,
    totalPendingAmount: pendingApprovalItems.reduce((sum, resolution) => sum + resolution.totalAmount, 0),
  };
}
