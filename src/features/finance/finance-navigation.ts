export const financeNavigation = [
  { group: "업무", label: "업무현황", href: "/finance/workspace" },
  { group: "업무", label: "통합 결재함", href: "/approval/inbox?type=expense" },
  { group: "지출관리", label: "전체 지출", href: "/finance/expenses" },
  { group: "지출관리", label: "지출 등록·신청", href: "/finance/expense-entry" },
  { group: "지출관리", label: "선지급 사용정산", href: "/finance/advance-settlements" },
  { group: "신탁 집행관리", label: "월 운영비 요청·수령", href: "/finance/trust?view=operating-funds" },
  { group: "신탁 집행관리", label: "운영비 사용정산", href: "/finance/trust?view=operating-settlement" },
  { group: "신탁 집행관리", label: "사업비 집행요청·현황", href: "/finance/trust?view=business" },
  { group: "지급관리", label: "조합 지급대기", href: "/finance/payments?tab=UNPAID" },
  { group: "지급관리", label: "전체 지급내역", href: "/finance/payments?tab=ALL" },
  { group: "수납·환급", label: "분담금 수납관리", href: "/finance/collections" },
  { group: "수납·환급", label: "환급관리", href: "/finance/refunds" },
  { group: "회계·증빙", label: "수입·지출 전표관리", href: "/finance" },
  { group: "회계·증빙", label: "계좌거래 매칭", href: "/finance/bank-transactions" },
  { group: "회계·증빙", label: "증빙자료 관리", href: "/finance/evidence" },
  { group: "회계·증빙", label: "세금계산서·계산서", href: "/finance/tax-documents" },
  { group: "예산·마감", label: "예산집행 현황", href: "/finance/reimbursements?tab=budgets" },
  { group: "예산·마감", label: "월 마감", href: "/finance/month-close" },
  { group: "설정", label: "지출 처리 기준", href: "/finance/expense-settings" },
  { group: "설정", label: "신탁 집행 기준", href: "/finance/workflow-settings" },
  { group: "설정", label: "운영 준비 점검", href: "/finance/readiness" },
  { group: "설정", label: "기존 자료 정리", href: "/finance/data-cleanup" },
];

const legacyLabels: Record<string, string> = {
  "결재함": "통합 결재함",
  "지출 승인함": "통합 결재함",
  "지출관리": "전체 지출",
  "지출결의서 관리": "전체 지출",
  "간편지출": "전체 지출",
  "간편지출 관리": "전체 지출",
  "예산 내 간편지출": "전체 지출",
  "신탁 집행관리": "사업비 집행요청·현황",
  "지급관리": "전체 지급내역",
  "지급대기": "조합 지급대기",
  "지급완료 내역": "전체 지급내역",
  "대납·선지급 정산": "지출 등록·신청",
  "개인 지출 정산·월 마감": "지출 등록·신청",
  "환불금 지급관리": "환급관리",
  "지출 관리설정": "지출 처리 기준",
  "지출·신탁 설정": "신탁 집행 기준",
};

export function normalizeFinanceDetailLabel(label: string) {
  return legacyLabels[label] ?? label;
}
