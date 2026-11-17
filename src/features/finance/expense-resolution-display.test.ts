import { describe, expect, it } from "vitest";

import {
  getBudgetOverageAmount,
  getResolutionListSubject,
  getResolutionOverBudgetAmount,
  isPostApprovalResolution,
} from "./expense-resolution-display";

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

describe("expense resolution list display", () => {
  it("uses the canonical expense kind when an older JSON snapshot omits the post-approval flag", () => {
    expect(isPostApprovalResolution({
      expenseKind: "BANK_POST_APPROVAL",
      isPostApproval: undefined,
    })).toBe(true);
  });

  it("removes the duplicate post-approval suffix only from the list title", () => {
    expect(getResolutionListSubject({
      expenseKind: "BANK_POST_APPROVAL",
      isPostApproval: undefined,
      operationExpenseDetail: "업무추진비",
      projectName: "사무국 운영관리",
      resolutionType: "SINGLE",
      subject: "2026-10-31 축하화환 사후결의",
    })).toBe("2026-10-31 축하화환");
  });

  it("preserves a regular resolution title that happens to contain the same wording", () => {
    expect(getResolutionListSubject({
      expenseKind: "GENERAL",
      isPostApproval: false,
      operationExpenseDetail: "회의비",
      projectName: "사무국 운영관리",
      resolutionType: "SINGLE",
      subject: "사후결의 운영기준 검토",
    })).toBe("사후결의 운영기준 검토");
  });
});
