import { describe, expect, it } from "vitest";
import { assertLegacySmallExpenseReadOnly, isLegacySmallExpenseResolution } from "./legacy-small-expense";

describe("legacy small expense resolution", () => {
  it("recognizes both historical storage shapes", () => {
    expect(isLegacySmallExpenseResolution({ expenseKind: "PETTY_CASH_BATCH" })).toBe(true);
    expect(isLegacySmallExpenseResolution({ creationSource: "SMALL_EXPENSE" })).toBe(true);
    expect(isLegacySmallExpenseResolution({ approvalSkipReason: "소액경비 일괄결의" })).toBe(true);
    expect(isLegacySmallExpenseResolution({ expenseKind: "GENERAL", creationSource: "DIRECT" })).toBe(false);
  });

  it("blocks new legacy creation and edits while leaving normal resolutions writable", () => {
    expect(() => assertLegacySmallExpenseReadOnly({ expenseKind: "PETTY_CASH_BATCH" })).toThrow("소액지출은 지출관리");
    expect(() => assertLegacySmallExpenseReadOnly(
      { expenseKind: "GENERAL" },
      { creationSource: "SMALL_EXPENSE" },
    )).toThrow("조회·출력과 후속 처리만 가능");
    expect(() => assertLegacySmallExpenseReadOnly(
      { expenseKind: "GENERAL", creationSource: "DIRECT" },
      { expenseKind: "GENERAL", creationSource: "DIRECT" },
    )).not.toThrow();
  });
});
