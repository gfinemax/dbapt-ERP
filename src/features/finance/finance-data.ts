export type FinanceTransactionType = "수입" | "지출" | "지출결의" | "환불";
export type FinanceApprovalStatus = "승인완료" | "승인대기" | "검토중" | "작성중" | "반려";
export type FinanceEvidenceStatus = "첨부완료" | "증빙미첨부" | "검토필요";
export type IntegrationMatchStatus = "매칭완료" | "입금미매칭" | "수기입력";

export type FinanceTransaction = {
  id: string;
  voucherNo: string;
  date: string;
  type: FinanceTransactionType;
  vendor: string;
  accountTitle: string;
  description: string;
  supplyAmount: number;
  vat: number;
  totalAmount: number;
  paymentBook: string;
  paymentMethod: string;
  evidenceStatus: FinanceEvidenceStatus;
  approvalStatus: FinanceApprovalStatus;
  integrationStatus: IntegrationMatchStatus;
  linkedModule: string;
};

export type BankCardConnection = {
  id: string;
  name: string;
  kind: "은행계좌" | "카드";
  provider: string;
  accountNo: string;
  status: "정상" | "확인필요";
  lastSyncedAt: string;
  unmatchedCount: number;
  balance: number;
};

export const financeFilters = ["전체", "수입", "지출", "지출결의", "승인대기", "지급대기", "증빙미첨부", "입금미매칭"];

export const financeTransactions: FinanceTransaction[] = [
  {
    id: "finance-0401",
    voucherNo: "지결-2026-0001",
    date: "2026-06-07",
    type: "지출결의",
    vendor: "법무법인 ○○",
    accountTitle: "법무비",
    description: "동작구청 대응 및 업무대행계약 검토 법무비 지급",
    supplyAmount: 3000000,
    vat: 300000,
    totalAmount: 3300000,
    paymentBook: "국민은행 운영계좌",
    paymentMethod: "계좌이체 예정",
    evidenceStatus: "첨부완료",
    approvalStatus: "검토중",
    integrationStatus: "수기입력",
    linkedModule: "지출결의서 관리",
  },
  {
    id: "finance-0412",
    voucherNo: "수입-2026-0001",
    date: "2026-06-05",
    type: "수입",
    vendor: "김민준 외 8명",
    accountTitle: "조합원 분담금",
    description: "6월 1차 조합원 분담금 수납",
    supplyAmount: 380000000,
    vat: 0,
    totalAmount: 380000000,
    paymentBook: "국민은행 신탁계좌",
    paymentMethod: "계좌이체",
    evidenceStatus: "첨부완료",
    approvalStatus: "승인완료",
    integrationStatus: "매칭완료",
    linkedModule: "조합원관리",
  },
  {
    id: "finance-0411",
    voucherNo: "지출-2026-0001",
    date: "2026-06-04",
    type: "지출",
    vendor: "대방개발 주식회사",
    accountTitle: "토지매입비",
    description: "사업부지 3필지 토지매입비 지급",
    supplyAmount: 950000000,
    vat: 0,
    totalAmount: 950000000,
    paymentBook: "국민은행 신탁계좌",
    paymentMethod: "신탁 지급요청",
    evidenceStatus: "검토필요",
    approvalStatus: "승인대기",
    integrationStatus: "입금미매칭",
    linkedModule: "토지관리",
  },
  {
    id: "finance-0410",
    voucherNo: "지출-2026-0002",
    date: "2026-06-03",
    type: "지출",
    vendor: "한빛세무회계",
    accountTitle: "세무비",
    description: "조합 법인세 및 부가세 검토 세무자문료 지급",
    supplyAmount: 30000000,
    vat: 3000000,
    totalAmount: 33000000,
    paymentBook: "국민은행 운영계좌",
    paymentMethod: "계좌이체",
    evidenceStatus: "첨부완료",
    approvalStatus: "승인완료",
    integrationStatus: "매칭완료",
    linkedModule: "세무신고",
  },
  {
    id: "finance-0409",
    voucherNo: "지출-2026-0003",
    date: "2026-06-02",
    type: "지출",
    vendor: "미래감정평가법인",
    accountTitle: "감정평가비",
    description: "사업부지 감정평가 용역비 지급",
    supplyAmount: 100000000,
    vat: 10000000,
    totalAmount: 110000000,
    paymentBook: "국민은행 신탁계좌",
    paymentMethod: "계좌이체",
    evidenceStatus: "증빙미첨부",
    approvalStatus: "승인대기",
    integrationStatus: "수기입력",
    linkedModule: "토지관리",
  },
  {
    id: "finance-0408",
    voucherNo: "환결-2026-0001",
    date: "2026-06-01",
    type: "환불",
    vendor: "박서연 조합원",
    accountTitle: "조합원 환불금",
    description: "계약 해지 조합원 납입금 환불 처리",
    supplyAmount: 203310000,
    vat: 0,
    totalAmount: 203310000,
    paymentBook: "국민은행 운영계좌",
    paymentMethod: "계좌이체",
    evidenceStatus: "검토필요",
    approvalStatus: "승인대기",
    integrationStatus: "수기입력",
    linkedModule: "조합원관리",
  },
];

export const bankCardConnections: BankCardConnection[] = [
  {
    id: "bank-trust",
    name: "국민은행 신탁계좌",
    kind: "은행계좌",
    provider: "KB국민은행",
    accountNo: "123456-78-901234",
    status: "정상",
    lastSyncedAt: "2026-06-06 08:10",
    unmatchedCount: 5,
    balance: 1845000000,
  },
  {
    id: "bank-operation",
    name: "국민은행 운영계좌",
    kind: "은행계좌",
    provider: "KB국민은행",
    accountNo: "987654-32-100000",
    status: "정상",
    lastSyncedAt: "2026-06-06 08:08",
    unmatchedCount: 3,
    balance: 432000000,
  },
  {
    id: "corp-card",
    name: "법인카드",
    kind: "카드",
    provider: "KB국민카드",
    accountNo: "****-****-****-5521",
    status: "확인필요",
    lastSyncedAt: "2026-06-05 18:30",
    unmatchedCount: 1,
    balance: -18700000,
  },
];

const selectedPeriodExecutedOutflowTotal = 1447610000;

export function formatKrw(amount: number) {
  return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

export function getFinanceSummary() {
  return {
    totalInflow: financeTransactions
      .filter((transaction) => transaction.type === "수입")
      .reduce((sum, transaction) => sum + transaction.totalAmount, 0),
    totalOutflow: selectedPeriodExecutedOutflowTotal,
    pendingApprovals: financeTransactions.filter((transaction) => transaction.approvalStatus === "승인대기").length,
    unmatchedIntegrations: bankCardConnections.reduce((sum, connection) => sum + connection.unmatchedCount, 0),
  };
}

export function findFinanceTransactionById(id: string) {
  return financeTransactions.find((transaction) => transaction.id === id);
}
