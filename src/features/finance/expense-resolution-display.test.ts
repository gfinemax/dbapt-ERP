import { describe, expect, it } from "vitest";

import { getBudgetOverageAmount, getResolutionOverBudgetAmount } from "./expense-resolution-display";

describe("expense resolution budget overage display", () => {
  it("treats a positive remaining budget as available balance, not an overage", () => {
    expect(getBudgetOverageAmount(470_000)).toBe(0);
    expect(getResolutionOverBudgetAmount({
      budgetSnapshot: { remainingBudgetAmount: 470_000 },
      resolutionType: "SINGLE",
      totalOverBudgetAmount: 470_000,
    })).toBe(0);
  });

  it("converts only a negative remaining budget to a positive overage amount", () => {
    expect(getBudgetOverageAmount(-70_000)).toBe(70_000);
    expect(getResolutionOverBudgetAmount({
      budgetSnapshot: { remainingBudgetAmount: -70_000 },
      resolutionType: "SINGLE",
      totalOverBudgetAmount: 0,
    })).toBe(70_000);
  });

  it("preserves the summed overage amount for batch resolutions", () => {
    expect(getResolutionOverBudgetAmount({
      budgetSnapshot: { remainingBudgetAmount: 470_000 },
      resolutionType: "BATCH",
      totalOverBudgetAmount: 125_000,
    })).toBe(125_000);
  });
});
