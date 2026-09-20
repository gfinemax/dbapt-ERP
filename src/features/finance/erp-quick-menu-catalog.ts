export const quickMenuEntries = [
  { id: "members", label: "조합원 등록", href: "/members" },
  { id: "collections", label: "분담금 수납처리", href: "/finance/collections", badgeLabel: "분담금 수납관리" },
  { id: "refunds", label: "환급관리", href: "/finance/refunds", badgeLabel: "환급관리" },
  { id: "bank", label: "은행거래 업로드", href: "/finance/bank-transactions" },
  { id: "cards", label: "법인카드 내역 연결", href: "/finance/quick-expenses?method=corporate-card", badgeLabel: "법인카드 내역 연결" },
  { id: "resolution", label: "지출결의 작성", href: "/finance/expense-entry?flow=before" },
  { id: "payments", label: "지급대기", href: "/finance/payments?tab=UNPAID", badgeLabel: "조합 지급대기" },
  { id: "evidence", label: "증빙 보완", href: "/finance/evidence", badgeLabel: "증빙자료 관리" },
  { id: "arrears", label: "미납 조합원" },
  { id: "advance", label: "받은 선지급금 정산", href: "/finance/advance-settlements", badgeLabel: "선지급 사용정산" },
  { id: "expenses", label: "전체 지출", href: "/finance/expenses", badgeLabel: "전체 지출" },
  { id: "corporate-use", label: "법인카드 간편처리", href: "/finance/expense-entry?flow=organization&method=corporate-card" },
  { id: "expense-entry", label: "지출 등록·신청", href: "/finance/expense-entry", badgeLabel: "지출 등록·신청" },
  { id: "personal-refund", label: "개인 선지출 정산", href: "/finance/expense-entry?flow=personal", badgeLabel: "조합 지급대기" },
  { id: "trust-operating", label: "월 운영비 정산", href: "/finance/trust?view=operating-funds", badgeLabel: "운영비 사용정산" },
  { id: "trust-business", label: "사업비 신탁 요청", href: "/finance/trust?view=business" },
  { id: "readiness", label: "운영 준비 점검", href: "/finance/readiness", badgeLabel: "운영 준비 점검" },
] as const;

export type QuickMenuId = (typeof quickMenuEntries)[number]["id"];
export const defaultQuickMenuIds: QuickMenuId[] = [
  "expense-entry", "corporate-use", "resolution", "personal-refund",
  "payments", "trust-business", "trust-operating", "bank",
];

export function validQuickMenuIds(value: unknown): QuickMenuId[] {
  if (!Array.isArray(value)) return defaultQuickMenuIds;
  return [...new Set(value.filter((id): id is QuickMenuId =>
    typeof id === "string" && quickMenuEntries.some((entry) => entry.id === id),
  ))];
}
