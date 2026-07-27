import { describe, expect, it } from "vitest";
import { evaluateDirectExpensePolicy } from "./direct-expense-policy";

describe("direct expense governance", () => {
  it("allows routine expenses within the configured limit", () => {
    expect(evaluateDirectExpensePolicy({ amount: 300_000, budgetItem: "사무용품비", reason: "정기 사무용품", source: "DIRECT" }).decision).toBe("ALLOWED");
  });

  it("requires an approval document for contracts, out-of-budget expenses, and high amounts", () => {
    expect(evaluateDirectExpensePolicy({ amount: 100_000, budgetItem: "용역비", reason: "신규 계약 용역비", source: "DIRECT" }).decision).toBe("REQUIRED");
    expect(evaluateDirectExpensePolicy({ amount: 100_000, budgetItem: "운영비", budgetOverReason: "예산 부족", source: "DIRECT" }).decision).toBe("REQUIRED");
    expect(evaluateDirectExpensePolicy({ amount: 5_000_001, budgetItem: "운영비", source: "DIRECT" }).decision).toBe("REQUIRED");
  });

  it("recognizes approval-linked and small-expense flows as already governed", () => {
    expect(evaluateDirectExpensePolicy({ amount: 30_000_000, source: "APPROVAL_LINKED" }).decision).toBe("ALLOWED");
    expect(evaluateDirectExpensePolicy({ amount: 200_000, source: "SMALL_EXPENSE" }).decision).toBe("ALLOWED");
  });

  it("recommends linking a draft for configured advisory work", () => {
    expect(evaluateDirectExpensePolicy({ amount: 300_000, budgetItem: "운영비", reason: "신규 거래처 등록비", source: "DIRECT" }).decision).toBe("RECOMMENDED");
  });
});
