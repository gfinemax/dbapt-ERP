import { describe, expect, it } from "vitest";
import { getBudgetSourcePresentation } from "./expense-budget-inspector";

describe("getBudgetSourcePresentation", () => {
  it("separates reservation, unbudgeted, and out-of-budget sources", () => {
    expect(getBudgetSourcePresentation({ budgetLinked: true, hasApproval: true, isOutOfBudget: false, reservedAmount: 650_000 })[0]).toBe("기안예약 연계");
    expect(getBudgetSourcePresentation({ budgetLinked: false, hasApproval: true, isOutOfBudget: false, reservedAmount: 0 })[0]).toBe("예산 미편성");
    expect(getBudgetSourcePresentation({ budgetLinked: false, hasApproval: true, isOutOfBudget: true, reservedAmount: 0 })[0]).toBe("예산 외 집행");
  });
});
