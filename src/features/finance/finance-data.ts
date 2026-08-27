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

export const financeTransactions: FinanceTransaction[] = [];

export const bankCardConnections: BankCardConnection[] = [];

export function formatKrw(amount: number) {
  return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

export function getFinanceSummary() {
  return {
    totalInflow: financeTransactions
      .filter((transaction) => transaction.type === "수입")
      .reduce((sum, transaction) => sum + transaction.totalAmount, 0),
    totalOutflow: 0,
    pendingApprovals: financeTransactions.filter((transaction) => transaction.approvalStatus === "승인대기").length,
    unmatchedIntegrations: bankCardConnections.reduce((sum, connection) => sum + connection.unmatchedCount, 0),
  };
}

export function findFinanceTransactionById(id: string) {
  return financeTransactions.find((transaction) => transaction.id === id);
}
