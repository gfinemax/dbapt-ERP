import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExpenseBudgetInspector, getBudgetSourcePresentation } from "./expense-budget-inspector";

describe("getBudgetSourcePresentation", () => {
  it("separates reservation, unbudgeted, and out-of-budget sources", () => {
    expect(getBudgetSourcePresentation({ budgetLinked: true, hasApproval: true, isOutOfBudget: false, reservedAmount: 650_000 })[0]).toBe("기안예약 연계");
    expect(getBudgetSourcePresentation({ budgetLinked: false, hasApproval: true, isOutOfBudget: false, reservedAmount: 0 })[0]).toBe("예산 미편성");
    expect(getBudgetSourcePresentation({ budgetLinked: false, hasApproval: true, isOutOfBudget: true, reservedAmount: 0 })[0]).toBe("예산 외 집행");
  });

  it("shows a lookup failure instead of mislabeling it as unbudgeted", () => {
    render(ExpenseBudgetInspector({
      budget: { budgetCheckStatus: "예산항목 선택 필요", budgetPeriod: "2026-01", budgetUsageRate: 0, calculationBasis: "", currentAnnualBudgetAmount: 0, currentRequestAmount: 252_000, expectedUsedAmount: 252_000, monthlyBudgetAmount: 0, paymentWaitingAmount: 0, pendingApprovalAmount: 0, previousAnnualBudgetAmount: 0, remainingBudgetAmount: 0, usedAmount: 0 },
      budgetDataError: "공식 예산을 불러오지 못했습니다.",
      budgetItem: "운영비 > 복리후생비(식대)",
    }));
    expect(screen.getByText("예산 조회 실패")).toBeInTheDocument();
    expect(screen.queryByText("예산 미편성")).not.toBeInTheDocument();
  });
});
