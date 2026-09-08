export const financeNavigation = [
  { group: "처리할 업무", label: "업무현황", href: "/finance/workspace" },
  { group: "처리할 업무", label: "결재함", href: "/finance/approval-inbox" },
  { group: "지출·지급", label: "지출관리", href: "/finance/expenses" },
  { group: "지출·지급", label: "신탁 집행관리", href: "/finance/trust" },
  { group: "지출·지급", label: "지급관리", href: "/finance/payments" },
  { group: "지출·지급", label: "대납·선지급 정산", href: "/finance/reimbursements" },
  { group: "수납·환급", label: "분담금 수납관리", href: "/finance/collections" },
  { group: "수납·환급", label: "환급관리", href: "/finance/refunds" },
  { group: "회계·증빙", label: "수입·지출 전표관리", href: "/finance" },
  { group: "회계·증빙", label: "계좌거래 매칭", href: "/finance/bank-transactions" },
  { group: "회계·증빙", label: "증빙자료 관리", href: "/finance/evidence" },
  { group: "회계·증빙", label: "세금계산서·계산서", href: "/finance/tax-documents" },
  { group: "예산·마감", label: "예산집행 현황", href: "/finance/reimbursements?tab=budgets" },
  { group: "예산·마감", label: "월 마감", href: "/finance/month-close" },
  { group: "설정", label: "지출·신탁 설정", href: "/finance/workflow-settings" },
];

const legacyLabels: Record<string, string> = {
  "지출결의서 관리": "지출관리",
  "간편지출": "지출관리",
  "간편지출 관리": "지출관리",
  "지급대기": "지급관리",
  "지급완료 내역": "지급관리",
  "개인 지출 정산·월 마감": "대납·선지급 정산",
  "환불금 지급관리": "환급관리",
  "지출 관리설정": "지출·신탁 설정",
};

export function normalizeFinanceDetailLabel(label: string) {
  return legacyLabels[label] ?? label;
}
