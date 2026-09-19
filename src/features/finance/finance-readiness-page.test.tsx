import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceReadinessPage } from "./finance-readiness-page";

describe("FinanceReadinessPage", () => {
  it("separates missing configuration from operational queues", () => {
    render(<FinanceReadinessPage readiness={{ fiscalYear: 2026, configuration: { activeStaff: 2, missingRoles: ["마감"], verifiedTrustContracts: 1, operatingFundContracts: 0, currentYearBudgets: 3 }, queues: { cardLinkPending: 4, evidencePending: 2, resolutionRequired: 1, personalPaymentPending: 0, advanceSettlementOpen: 1, operatingPeriodOpen: 0, routeUnclassified: 3, budgetReviewPending: 2, collectionPending: 1, refundPending: 1 } }} />);
    expect(screen.getByRole("heading", { name: "필수 설정" })).toBeInTheDocument();
    expect(screen.getByText("2명 활성 · 마감 역할 없음")).toBeInTheDocument();
    expect(screen.getByText("운영비 사용 가능 계약 0건")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /카드내역 연결 대기.*4건/ })).toHaveAttribute("href", "/finance/quick-expenses?method=corporate-card");
    expect(screen.getByRole("link", { name: /예산 귀속 확인.*2건/ })).toHaveAttribute("href", "/finance/data-cleanup");
    expect(screen.getByText(/대기 건수는 오류가 아니라 담당자가 이어서 처리할 업무야/)).toBeInTheDocument();
  });
});
