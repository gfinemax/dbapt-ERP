export type FinanceNavigationItem = {
  group?: string;
  href: string;
  label: string;
};

export type FinanceWorkspaceMenu = {
  defaultDetailLabel: string;
  href: string;
  items: FinanceNavigationItem[];
  label: string;
  section: "오늘 할 일" | "핵심 회계 업무" | "전문 업무" | "관리";
};

export const financeWorkspaceMenus: FinanceWorkspaceMenu[] = [
  {
    section: "오늘 할 일",
    label: "업무 홈",
    href: "/finance/workspace",
    defaultDetailLabel: "업무현황",
    items: [
      { label: "업무현황", href: "/finance/workspace" },
      { label: "통합 결재함", href: "/approval/inbox?type=expense" },
    ],
  },
  {
    section: "핵심 회계 업무",
    label: "수납·지급",
    href: "/finance?workspace=cash",
    defaultDetailLabel: "분담금 수납관리",
    items: [
      { group: "수납·환급", label: "분담금 수납관리", href: "/finance/collections" },
      { group: "수납·환급", label: "환급관리", href: "/finance/refunds" },
      { group: "지급", label: "조합 지급대기", href: "/finance/payments?tab=UNPAID" },
      { group: "지급", label: "전체 지급내역", href: "/finance/payments?tab=ALL" },
      { group: "신탁 집행", label: "월 운영비 요청·수령", href: "/finance/trust?view=operating-funds" },
      { group: "신탁 집행", label: "운영비 사용정산", href: "/finance/trust?view=operating-settlement" },
      { group: "신탁 집행", label: "사업비 집행요청·현황", href: "/finance/trust?view=business" },
    ],
  },
  {
    section: "핵심 회계 업무",
    label: "거래·대사",
    href: "/finance/bank-transactions",
    defaultDetailLabel: "전체 거래내역",
    items: [
      { label: "전체 거래내역", href: "/finance/bank-transactions" },
      { label: "미매칭 거래 검토", href: "/finance/bank-unmatched" },
    ],
  },
  {
    section: "핵심 회계 업무",
    label: "전표·증빙",
    href: "/finance",
    defaultDetailLabel: "수입·지출 전표관리",
    items: [
      { group: "지출결의", label: "전체 지출", href: "/finance/expenses" },
      { group: "지출결의", label: "지출 등록·신청", href: "/finance/expense-entry" },
      { group: "지출결의", label: "선지급 사용정산", href: "/finance/advance-settlements" },
      { group: "회계·증빙", label: "수입·지출 전표관리", href: "/finance" },
      { group: "회계·증빙", label: "증빙자료 관리", href: "/finance/evidence" },
      { group: "회계·증빙", label: "세금계산서·계산서", href: "/finance/tax-documents" },
    ],
  },
  {
    section: "핵심 회계 업무",
    label: "예산·결산",
    href: "/finance?workspace=budget",
    defaultDetailLabel: "예산집행 현황",
    items: [
      { label: "예산집행 현황", href: "/finance/reimbursements?tab=budgets" },
      { label: "월 마감", href: "/finance/month-close" },
    ],
  },
  {
    section: "핵심 회계 업무",
    label: "보고서·공시",
    href: "/finance/reports",
    defaultDetailLabel: "보고서 현황",
    items: [
      { label: "보고서 현황", href: "/finance/reports" },
      { label: "사업실적보고서", href: "/finance/reports?section=performance" },
      { label: "자금 입출금 명세서", href: "/finance/reports?section=cash-flow" },
      { label: "운영비 예산", href: "/finance/reports?section=budget" },
    ],
  },
  {
    section: "전문 업무",
    label: "채권·채무",
    href: "/finance?workspace=receivables",
    defaultDetailLabel: "채권·채무 현황",
    items: [
      { label: "채권·채무 현황", href: "/finance?workspace=receivables" },
    ],
  },
  {
    section: "전문 업무",
    label: "인사·급여",
    href: "/hr-payroll",
    defaultDetailLabel: "사원 관리",
    items: [
      { label: "사원 관리", href: "/hr-payroll?section=employees" },
      { label: "급여 계산", href: "/hr-payroll?section=payroll-entry" },
      { label: "급여대장", href: "/hr-payroll?section=payroll-ledger" },
    ],
  },
  {
    section: "전문 업무",
    label: "세무 자료",
    href: "/finance?workspace=tax",
    defaultDetailLabel: "세무 자료 현황",
    items: [
      { label: "세무 자료 현황", href: "/finance?workspace=tax" },
      { label: "전자세금계산서", href: "/finance/tax-documents" },
      { label: "신고자료 내보내기", href: "/finance/tax-documents" },
    ],
  },
  {
    section: "관리",
    label: "기준정보",
    href: "/basic-info",
    defaultDetailLabel: "거래처 관리",
    items: [
      { label: "거래처 관리", href: "/basic-info?section=partners" },
      { label: "품목 관리", href: "/basic-info?section=items" },
      { label: "은행계좌 관리", href: "/basic-info?section=bank-accounts" },
      { label: "법인카드 관리", href: "/basic-info?section=cards" },
      { label: "계정과목 관리", href: "/basic-info?section=account-subjects" },
    ],
  },
  {
    section: "관리",
    label: "연동·설정",
    href: "/finance?workspace=settings",
    defaultDetailLabel: "은행 거래 업로드",
    items: [
      { group: "데이터 연동", label: "은행 거래 업로드", href: "/finance/bank-transactions/upload" },
      { group: "데이터 연동", label: "은행계좌 연동", href: "/finance/bank-account-links" },
      { group: "데이터 연동", label: "Ledger 원장 연동", href: "/finance/bank-auto-matching" },
      { group: "업무 설정", label: "지출 처리 기준", href: "/finance/expense-settings" },
      { group: "업무 설정", label: "신탁 집행 기준", href: "/finance/workflow-settings" },
      { group: "업무 설정", label: "운영 준비 점검", href: "/finance/readiness" },
      { group: "업무 설정", label: "시스템 속도", href: "/finance/performance" },
      { group: "업무 설정", label: "기존 자료 정리", href: "/finance/data-cleanup" },
    ],
  },
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
  "통합 거래내역": "전체 거래내역",
  "미매칭 내역": "미매칭 거래 검토",
  "계좌 연동 설정": "은행계좌 연동",
  "거래처등록": "거래처 관리",
  "품목등록": "품목 관리",
  "은행통장 등록": "은행계좌 관리",
  "신용카드 등록": "법인카드 관리",
  "사원정보등록": "사원 관리",
  "급여입력": "급여 계산",
  "보고서 목록": "보고서 현황",
  "실적보고서": "사업실적보고서",
  "자금입출금명세서": "자금 입출금 명세서",
};

const legacyWorkspaceLabels: Record<string, string> = {
  "기초정보": "기준정보",
  "입출금": "수납·지급",
  "통합 거래관리": "거래·대사",
  "전표·증빙관리": "전표·증빙",
  "보고서": "보고서·공시",
  "세무신고": "세무 자료",
  "부가서비스": "연동·설정",
};

export function normalizeFinanceDetailLabel(label: string) {
  return legacyLabels[label] ?? label;
}

export function normalizeFinanceWorkspaceLabel(label: string) {
  return legacyWorkspaceLabels[label] ?? label;
}
