import { loadFinanceReadiness } from "./finance-readiness";
import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";

export type FinanceNavigationBadges = Record<string, number>;

type FinanceNavigationBadgeSnapshot = {
  advance_settlement_open: number;
  budget_review_pending: number;
  card_link_pending: number;
  collection_pending: number;
  current_budget_count: number;
  evidence_pending: number;
  missing_role_count: number;
  operating_contract_count: number;
  operating_period_open: number;
  personal_payment_pending: number;
  refund_pending: number;
  resolution_required: number;
  route_unclassified: number;
  verified_contract_count: number;
};

const snapshotKeys = [
  "advance_settlement_open",
  "budget_review_pending",
  "card_link_pending",
  "collection_pending",
  "current_budget_count",
  "evidence_pending",
  "missing_role_count",
  "operating_contract_count",
  "operating_period_open",
  "personal_payment_pending",
  "refund_pending",
  "resolution_required",
  "route_unclassified",
  "verified_contract_count",
] as const satisfies readonly (keyof FinanceNavigationBadgeSnapshot)[];

function parseSnapshot(value: unknown): FinanceNavigationBadgeSnapshot {
  if (!value || typeof value !== "object") throw new Error("회계·자금 메뉴 현황 응답이 올바르지 않습니다.");
  const record = value as Record<string, unknown>;
  const snapshot = {} as FinanceNavigationBadgeSnapshot;
  for (const key of snapshotKeys) {
    const count = Number(record[key]);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("회계·자금 메뉴 현황 응답이 올바르지 않습니다.");
    snapshot[key] = count;
  }
  return snapshot;
}

function mapSnapshot(snapshot: FinanceNavigationBadgeSnapshot): FinanceNavigationBadges {
  const configurationPending = Number(snapshot.missing_role_count > 0)
    + Number(snapshot.verified_contract_count === 0)
    + Number(snapshot.operating_contract_count === 0)
    + Number(snapshot.current_budget_count === 0);
  const cleanupPending = snapshot.card_link_pending + snapshot.evidence_pending + snapshot.resolution_required
    + snapshot.route_unclassified + snapshot.budget_review_pending;
  return {
    "전체 지출": snapshot.resolution_required + snapshot.route_unclassified,
    "지출 등록·신청": snapshot.route_unclassified,
    "법인카드 내역 연결": snapshot.card_link_pending,
    "선지급 사용정산": snapshot.advance_settlement_open,
    "운영비 사용정산": snapshot.operating_period_open,
    "조합 지급대기": snapshot.personal_payment_pending,
    "증빙자료 관리": snapshot.evidence_pending,
    "분담금 수납관리": snapshot.collection_pending,
    "환급관리": snapshot.refund_pending,
    "운영 준비 점검": configurationPending,
    "기존 자료 정리": cleanupPending,
  };
}

function isMissingAggregateRpc(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || /finance_navigation_badges/i.test(error.message ?? "") && /schema cache|not find|could not find/i.test(error.message ?? "");
}

async function loadLegacyBadges(): Promise<FinanceNavigationBadges> {
  const readiness = await loadFinanceReadiness();
  return mapSnapshot({
    advance_settlement_open: readiness.queues.advanceSettlementOpen,
    budget_review_pending: readiness.queues.budgetReviewPending,
    card_link_pending: readiness.queues.cardLinkPending,
    collection_pending: readiness.queues.collectionPending,
    current_budget_count: readiness.configuration.currentYearBudgets,
    evidence_pending: readiness.queues.evidencePending,
    missing_role_count: readiness.configuration.missingRoles.length,
    operating_contract_count: readiness.configuration.operatingFundContracts,
    operating_period_open: readiness.queues.operatingPeriodOpen,
    personal_payment_pending: readiness.queues.personalPaymentPending,
    refund_pending: readiness.queues.refundPending,
    resolution_required: readiness.queues.resolutionRequired,
    route_unclassified: readiness.queues.routeUnclassified,
    verified_contract_count: readiness.configuration.verifiedTrustContracts,
  });
}

export async function loadFinanceNavigationBadges(): Promise<FinanceNavigationBadges> {
  const member = await requireReimbursementIdentity();
  if (member.permissions.length === 0) throw new Error("운영 준비 점검은 회계·자금 담당자만 볼 수 있어.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("finance_navigation_badges", {
    p_actor: member.user_id,
    p_org: member.organization_id,
  });
  if (error) {
    // Keep rolling deployments usable until the matching migration reaches the database.
    if (isMissingAggregateRpc(error)) return loadLegacyBadges();
    throw new Error(`회계·자금 메뉴 현황 조회 실패: ${error.message}`);
  }
  return mapSnapshot(parseSnapshot(data));
}
