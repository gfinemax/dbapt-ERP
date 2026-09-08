import { describe, expect, it } from "vitest";
import { createFormState } from "./expense-resolution-page";

describe("new expense factual defaults", () => {
  it("does not turn creation date into actual payment or select a staff recipient", () => {
    const form = createFormState("지결-2026-0009", "2026-09-08");
    expect(form.createdAt).toBe("2026-09-08");
    expect(form.actualExpenseDate).toBe("");
    expect(form.advancePaidAt).toBe("");
    expect(form.plannedPaymentDate).toBe("");
    expect(form.paymentTargetId).toBe("manual");
    expect(form.paymentAccountNo).toBe("");
    expect(form.accountHolder).toBe("");
    expect(form.advancePayer).toBe("");
  });
  it("does not assert an approved budget exemption before a basis is chosen", () => {
    const form = createFormState("지결-2026-0009", "2026-09-08");
    expect(form.budgetItem).toBe("");
    expect(form.approvalSkipReason).toBe("");
  });
});
