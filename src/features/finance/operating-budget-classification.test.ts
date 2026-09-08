import { describe, expect, it } from "vitest";
import { operatingExpenseDetailFallback } from "./operating-budget-classification";

describe("operating budget classification", () => {
  it("uses stable unique detail codes and a single approved budget link", () => {
    expect(new Set(operatingExpenseDetailFallback.map((item) => item.code)).size).toBe(operatingExpenseDetailFallback.length);
    expect(operatingExpenseDetailFallback.every((item) => item.budgetItem.length > 0)).toBe(true);
  });

  it("blocks policy review items from quick expense", () => {
    expect(operatingExpenseDetailFallback.filter((item) => item.status === "POLICY_REVIEW").every((item) => !item.quickExpenseEligible)).toBe(true);
  });

  it("separates office supplies and consumables", () => {
    expect(operatingExpenseDetailFallback.find((item) => item.code === "GENERAL-SUPPLIES")?.budgetItem).toBe("일반운영비>사무용품비");
    expect(operatingExpenseDetailFallback.find((item) => item.code === "GENERAL-CONSUMABLE")?.budgetItem).toBe("일반운영비>소모품비");
  });
});
