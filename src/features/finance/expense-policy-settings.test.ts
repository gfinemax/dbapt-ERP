import { describe, expect, it } from "vitest";
import { normalizeExpensePolicyValues, recommendedExpensePolicyValues, validateExpensePolicy } from "./expense-policy-settings";

describe("expense policy settings", () => {
  it("provides the approved recommended starting values", () => {
    expect(recommendedExpensePolicyValues).toMatchObject({
      delayedDays: 60,
      generalApprovalMax: 3_000_000,
      longDelayDays: 180,
      materialityAmount: 1_000_000,
      materialityMonthlyBudgetPercent: 1,
      normalDays: 30,
      rejectAfterDays: 180,
      simpleApprovalMax: 500_000,
    });
  });

  it("rejects overlapping deadlines and approval bands", () => {
    expect(validateExpensePolicy({ ...recommendedExpensePolicyValues, delayedDays: 20, generalApprovalMax: 100_000 }))
      .toEqual(expect.arrayContaining([expect.stringContaining("지연 접수 기한"), expect.stringContaining("일반 승인 한도")]));
  });

  it("fills missing legacy values without mutating the recommendation", () => {
    const normalized = normalizeExpensePolicyValues({ normalDays: 45 });
    expect(normalized.normalDays).toBe(45);
    expect(normalized.requireAccountingReview).toBe(true);
    expect(recommendedExpensePolicyValues.normalDays).toBe(30);
  });
});
