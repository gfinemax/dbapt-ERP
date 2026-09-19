import { quickExpenseEntryHref } from "./quick-expense-entry";

export const quickMenuEntries = [
  { id: "members", label: "조합원 등록", href: "/members" },
  { id: "collections", label: "분담금 수납처리", href: "/finance/collections" },
  { id: "bank", label: "은행거래 업로드", href: "/finance/bank-transactions" },
  { id: "cards", label: "카드내역", href: "/finance/quick-expenses?method=corporate-card" },
  { id: "resolution", label: "지출결의 작성", href: "/finance/expense-resolutions?start=advance" },
  { id: "payments", label: "지급대기", href: "/finance/payments?tab=UNPAID" },
  { id: "evidence", label: "증빙 미첨부", href: "/finance/evidence" },
  { id: "arrears", label: "미납 조합원" },
  { id: "advance", label: "받은 선지급금 정산", href: "/finance/advance-settlements" },
  { id: "expenses", label: "전체 지출", href: "/finance/expenses" },
  { id: "corporate-use", label: "법인카드 사용 등록", href: quickExpenseEntryHref("CORPORATE_CARD") },
  { id: "expense-entry", label: "지출 등록·신청", href: "/finance/expense-entry" },
  { id: "personal-refund", label: "개인 선지출 환급", href: "/finance/reimbursements" },
  { id: "trust-operating", label: "월 운영비 요청", href: "/finance/trust?view=operating-funds" },
  { id: "trust-business", label: "사업비 신탁 요청", href: "/finance/trust?view=business" },
  { id: "readiness", label: "운영 준비 점검", href: "/finance/readiness" },
] as const;

export type QuickMenuId = (typeof quickMenuEntries)[number]["id"];
export const defaultQuickMenuIds: QuickMenuId[] = quickMenuEntries.slice(0, 8).map((entry) => entry.id);

export function validQuickMenuIds(value: unknown): QuickMenuId[] {
  if (!Array.isArray(value)) return defaultQuickMenuIds;
  return [...new Set(value.filter((id): id is QuickMenuId =>
    typeof id === "string" && quickMenuEntries.some((entry) => entry.id === id),
  ))];
}
