import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readiness: vi.fn() }));
vi.mock("./finance-readiness", () => ({ loadFinanceReadiness: mocks.readiness }));
import { loadFinanceNavigationBadges } from "./finance-navigation-badges";

describe("finance navigation badges", () => {
  it("maps only authoritative queue and configuration counts", async () => {
    mocks.readiness.mockResolvedValue({ fiscalYear: 2026, configuration: { missingRoles: ["마감"], verifiedTrustContracts: 1, operatingFundContracts: 0, currentYearBudgets: 2 }, queues: { cardLinkPending: 2, evidencePending: 3, resolutionRequired: 1, personalPaymentPending: 4, advanceSettlementOpen: 5, operatingPeriodOpen: 6, routeUnclassified: 7, budgetReviewPending: 8, collectionPending: 9, refundPending: 10 } });
    await expect(loadFinanceNavigationBadges()).resolves.toEqual({ "전체 지출": 8, "선지급 사용정산": 5, "운영비 사용정산": 6, "조합 지급대기": 4, "증빙자료 관리": 3, "분담금 수납관리": 9, "환급관리": 10, "운영 준비 점검": 2, "기존 자료 정리": 21 });
  });
});
