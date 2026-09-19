import { describe, expect, it } from "vitest";
import { parseQuickExpenseEntry, quickExpenseEntryHref } from "./quick-expense-entry";
describe("quick expense entry", () => {
  it("round trips a transaction-specific corporate-card shortcut", () => {
    const href = quickExpenseEntryHref("CORPORATE_CARD", "card & 1");
    const params = Object.fromEntries(new URL(href, "https://example.test").searchParams);
    expect(parseQuickExpenseEntry(params)).toEqual({ method: "CORPORATE_CARD", sourceId: "card & 1" });
  });
  it("rejects arrays and unknown or inherited method keys", () => {
    expect(parseQuickExpenseEntry({ method: ["corporate-card"], sourceId: ["id"] })).toEqual({ method: "BANK_TRANSFER", sourceId: "" });
    expect(parseQuickExpenseEntry({ method: "constructor" }).method).toBe("BANK_TRANSFER");
    expect(parseQuickExpenseEntry({ sourceId: "x".repeat(101) }).sourceId).toBe("");
  });
});
