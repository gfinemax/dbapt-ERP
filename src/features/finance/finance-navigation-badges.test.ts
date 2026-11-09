import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), readiness: vi.fn(), rpc: vi.fn() }));
vi.mock("./finance-readiness", () => ({ loadFinanceReadiness: mocks.readiness }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: () => ({ schema: () => ({ rpc: mocks.rpc }) }) }));
import { loadFinanceNavigationBadges } from "./finance-navigation-badges";

describe("finance navigation badges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.identity.mockResolvedValue({ organization_id: "org", user_id: "actor", permissions: ["ADMIN"] });
  });

  it("loads every shell badge through one aggregate database call", async () => {
    mocks.rpc.mockResolvedValue({ data: { advance_settlement_open: 5, budget_review_pending: 8, card_link_pending: 2, collection_pending: 9, current_budget_count: 2, evidence_pending: 3, missing_role_count: 1, operating_contract_count: 0, operating_period_open: 6, personal_payment_pending: 4, refund_pending: 10, resolution_required: 1, route_unclassified: 7, verified_contract_count: 1 }, error: null });
    await expect(loadFinanceNavigationBadges()).resolves.toEqual({ "전체 지출": 8, "지출 등록·신청": 7, "법인카드 내역 연결": 2, "선지급 사용정산": 5, "운영비 사용정산": 6, "조합 지급대기": 4, "증빙자료 관리": 3, "분담금 수납관리": 9, "환급관리": 10, "운영 준비 점검": 2, "기존 자료 정리": 21 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("finance_navigation_badges", { p_actor: "actor", p_org: "org" });
    expect(mocks.readiness).not.toHaveBeenCalled();
  });

  it("uses the legacy reader only while a rolling migration is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function in the schema cache" } });
    mocks.readiness.mockResolvedValue({ fiscalYear: 2026, configuration: { missingRoles: ["마감"], verifiedTrustContracts: 1, operatingFundContracts: 0, currentYearBudgets: 2 }, queues: { cardLinkPending: 2, evidencePending: 3, resolutionRequired: 1, personalPaymentPending: 4, advanceSettlementOpen: 5, operatingPeriodOpen: 6, routeUnclassified: 7, budgetReviewPending: 8, collectionPending: 9, refundPending: 10 } });
    await expect(loadFinanceNavigationBadges()).resolves.toEqual({ "전체 지출": 8, "지출 등록·신청": 7, "법인카드 내역 연결": 2, "선지급 사용정산": 5, "운영비 사용정산": 6, "조합 지급대기": 4, "증빙자료 관리": 3, "분담금 수납관리": 9, "환급관리": 10, "운영 준비 점검": 2, "기존 자료 정리": 21 });
    expect(mocks.readiness).toHaveBeenCalledTimes(1);
  });
});
