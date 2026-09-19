import { loadFinanceReadiness } from "./finance-readiness";

export type FinanceNavigationBadges = Record<string, number>;

export async function loadFinanceNavigationBadges(): Promise<FinanceNavigationBadges> {
  const readiness = await loadFinanceReadiness();
  const q = readiness.queues;
  const configurationPending = Number(readiness.configuration.missingRoles.length > 0)
    + Number(readiness.configuration.verifiedTrustContracts === 0)
    + Number(readiness.configuration.operatingFundContracts === 0)
    + Number(readiness.configuration.currentYearBudgets === 0);
  const cleanupPending = q.cardLinkPending + q.evidencePending + q.resolutionRequired + q.routeUnclassified + q.budgetReviewPending;
  return {
    "전체 지출": q.resolutionRequired + q.routeUnclassified,
    "지출 등록·신청": q.routeUnclassified,
    "법인카드 내역 연결": q.cardLinkPending,
    "선지급 사용정산": q.advanceSettlementOpen,
    "운영비 사용정산": q.operatingPeriodOpen,
    "조합 지급대기": q.personalPaymentPending,
    "증빙자료 관리": q.evidencePending,
    "분담금 수납관리": q.collectionPending,
    "환급관리": q.refundPending,
    "운영 준비 점검": configurationPending,
    "기존 자료 정리": cleanupPending,
  };
}
