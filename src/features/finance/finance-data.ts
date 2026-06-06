export type FinanceTransactionType = "입금" | "출금" | "매입";
export type FinanceApprovalStatus = "승인완료" | "승인대기" | "검토중";
export type FinanceEvidenceStatus = "첨부완료" | "증빙미첨부" | "검토필요";
export type IntegrationMatchStatus = "매칭완료" | "연동미매칭" | "수기입력";

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

export const financeFilters = ["전체", "매입", "입금", "출금", "승인대기", "증빙미첨부", "연동미매칭"];

export const financeTransactions: FinanceTransaction[] = [
  {
    id: "finance-0401",
    voucherNo: "PV-2025-0002",
    date: "2025-04-01",
    type: "매입",
    vendor: "주식회사 흥부상사",
    accountTitle: "비품",
    description: "컴퓨터 2대 외상 매입",
    supplyAmount: 100000,
    vat: 10000,
    totalAmount: 110000,
    paymentBook: "거래처 외상",
    paymentMethod: "외상",
    evidenceStatus: "첨부완료",
    approvalStatus: "승인대기",
    integrationStatus: "수기입력",
    linkedModule: "거래전표증빙문서",
  },
  {
    id: "finance-0412",
    voucherNo: "JV-2026-0412",
    date: "2026-06-05",
    type: "입금",
    vendor: "김민준 외 8명",
    accountTitle: "조합원 분담금",
    description: "6월 1차 조합원 분담금 입금",
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
    voucherNo: "JV-2026-0411",
    date: "2026-06-04",
    type: "출금",
    vendor: "대방개발 주식회사",
    accountTitle: "토지계약금",
    description: "사업부지 3필지 토지 계약금 지급",
    supplyAmount: 950000000,
    vat: 0,
    totalAmount: 950000000,
    paymentBook: "국민은행 신탁계좌",
    paymentMethod: "신탁 지급요청",
    evidenceStatus: "검토필요",
    approvalStatus: "승인대기",
    integrationStatus: "연동미매칭",
    linkedModule: "토지관리",
  },
  {
    id: "finance-0410",
    voucherNo: "JV-2026-0410",
    date: "2026-06-03",
    type: "출금",
    vendor: "파인맥스 업무대행",
    accountTitle: "업무대행비",
    description: "6월 업무대행 용역비 지급",
    supplyAmount: 200000000,
    vat: 20000000,
    totalAmount: 220000000,
    paymentBook: "국민은행 운영계좌",
    paymentMethod: "계좌이체",
    evidenceStatus: "첨부완료",
    approvalStatus: "승인완료",
    integrationStatus: "매칭완료",
    linkedModule: "수지분석",
  },
  {
    id: "finance-0409",
    voucherNo: "JV-2026-0409",
    date: "2026-06-02",
    type: "출금",
    vendor: "대한토지신탁",
    accountTitle: "신탁수수료",
    description: "분기 신탁 관리 수수료 지급",
    supplyAmount: 250000000,
    vat: 27500000,
    totalAmount: 277500000,
    paymentBook: "국민은행 신탁계좌",
    paymentMethod: "법인카드/계좌",
    evidenceStatus: "증빙미첨부",
    approvalStatus: "승인대기",
    integrationStatus: "수기입력",
    linkedModule: "회계/결산",
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

export function formatKrw(amount: number) {
  return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

export function getFinanceSummary() {
  return {
    totalInflow: financeTransactions
      .filter((transaction) => transaction.type === "입금")
      .reduce((sum, transaction) => sum + transaction.totalAmount, 0),
    totalOutflow: financeTransactions
      .filter((transaction) => transaction.type === "출금" || transaction.type === "매입")
      .reduce((sum, transaction) => sum + transaction.totalAmount, 0),
    pendingApprovals: financeTransactions.filter((transaction) => transaction.approvalStatus === "승인대기").length,
    unmatchedIntegrations: bankCardConnections.reduce((sum, connection) => sum + connection.unmatchedCount, 0),
  };
}

export function findFinanceTransactionById(id: string) {
  return financeTransactions.find((transaction) => transaction.id === id);
}
