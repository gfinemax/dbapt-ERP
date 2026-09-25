import { describe, expect, it } from "vitest";

import type { BudgetProfile } from "./expense-resolution-page";
import { getOperatingBudgetPrintRows } from "./operating-budget-print-modal";

describe("operating budget print rows", () => {
  it("keeps monthly, quarterly, and annual budget amounts aligned", () => {
    const profile = {
      calculationBasis: "월 100만원",
      currentAnnualBudgetAmount: 12_000_000,
      monthlyBudgetAmount: 1_000_000,
      previousAnnualBudgetAmount: 9_000_000,
    } as BudgetProfile;

    expect(getOperatingBudgetPrintRows({ "운영비 > 사무용품비": profile })).toEqual([
      expect.objectContaining({
        annualAmount: 12_000_000,
        itemLabel: "사무용품비",
        monthlyAmounts: Array.from({ length: 12 }, () => 1_000_000),
        previousAnnualAmount: 9_000_000,
        quarterlyAmounts: [3_000_000, 3_000_000, 3_000_000, 3_000_000],
      }),
    ]);
  });
});
