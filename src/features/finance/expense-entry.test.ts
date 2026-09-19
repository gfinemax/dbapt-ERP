import { describe, expect, it } from "vitest";
import { expenseResolutionHref, parseExpenseEntry } from "./expense-entry";

describe("expense resolution entry", () => {
  it("prefers an existing resolution over all draft intents", () => {
    expect(parseExpenseEntry({ resolutionId: "existing", quickExpenseId: "quick", start: "advance" }))
      .toEqual({ resolutionId: "existing", quickExpenseId: undefined, start: undefined });
  });
  it("accepts one scalar quick original and suppresses a competing new-start intent", () => {
    expect(parseExpenseEntry({ quickExpenseId: " quick-one ", start: "reimbursement" }))
      .toEqual({ resolutionId: undefined, quickExpenseId: "quick-one", start: undefined });
    expect(parseExpenseEntry({ quickExpenseId: ["one", "two"] })).toEqual({ resolutionId: undefined, quickExpenseId: undefined, start: undefined });
  });
  it("encodes the source identifier", () => {
    expect(expenseResolutionHref({ quickExpenseId: "quick&one" })).toBe("/finance/expense-resolutions?quickExpenseId=quick%26one");
  });
});
