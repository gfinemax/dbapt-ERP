import type { BankTransactionListFilters } from "./bank-transaction-repository";

export const bankTransactionStatusLabels = {
  CONFIRMED: "확정",
  DEFERRED: "검토 보류",
  EXCLUDED: "제외",
  RECOMMENDED: "추천 있음",
  UNREVIEWED: "미확인",
} as const;

export function bankTransactionFilterSummary(filters: BankTransactionListFilters) {
  const parts = [
    filters.query ? `검색어 ${filters.query}` : "",
    filters.bankAccountId ? `계좌 ID ${filters.bankAccountId}` : "전체 계좌",
    filters.originType ? `원본 ${filters.originType === "BANK_TRANSACTION" ? "은행 통장거래" : "외부납입 인정"}` : "전체 원본",
    filters.externalRecognitionKind ? `외부납입 구분 ${filters.externalRecognitionKind === "FIXED_CERTIFICATE" ? "동일건설 정액 필증 3천만원" : "일반 외부납입"}` : "",
    filters.dateFrom ? `시작일 ${filters.dateFrom}` : "",
    filters.dateTo ? `종료일 ${filters.dateTo}` : "",
    filters.classificationStatus ? `상태 ${bankTransactionStatusLabels[filters.classificationStatus]}` : "",
    filters.sourceReconciliationStatus ? "원본 확인 필요" : "",
  ].filter(Boolean);
  return parts.join(" · ") || "전체 거래";
}
