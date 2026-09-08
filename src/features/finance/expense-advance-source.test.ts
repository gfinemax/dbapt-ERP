import { describe, expect, it } from "vitest";
import { getEmployeeAdvanceSourceFacts, isEmployeeAdvanceSettlementSource, validateEmployeeAdvanceSelection, type ExpenseAdvanceSource } from "./expense-advance-source";

const source: ExpenseAdvanceSource = { expenseTiming: "ADVANCE", executionMethod: "EMPLOYEE_ADVANCE", paymentStatus: "지급완료", actualPaidAmount: 600, paidAt: "2026-06-15" };

describe("employee advance actual payment evidence", () => {
  it("selects only paid employee advances and keeps legacy timing normalization", () => {
    expect(isEmployeeAdvanceSettlementSource(source)).toBe(true);
    expect(isEmployeeAdvanceSettlementSource({ ...source, expenseTiming: undefined, paymentFlowType: "사전결의" })).toBe(true);
    for (const change of [{ executionMethod: "VENDOR_DIRECT" as const }, { executionMethod: "CORPORATE_CARD" as const }, { executionMethod: undefined }, { expenseTiming: "REIMBURSEMENT" as const }, { expenseTiming: "SETTLEMENT" as const }, { paymentStatus: "부분지급" }, { paymentStatus: "지급대기" }]) {
      expect(isEmployeeAdvanceSettlementSource({ ...source, ...change })).toBe(false);
    }
  });
  it("copies the confirmed actual amount and date without mutating the source", () => {
    const original = { ...source, totalPaymentAmount: 1000, advancePaidAmount: 900, createdAt: "2026-03-01" };
    const before = structuredClone(original);
    expect(getEmployeeAdvanceSourceFacts(original)).toEqual({ advancePaidAmount: "600", advancePaidAt: "2026-06-15", blockedReason: null });
    expect(original).toEqual(before);
    expect(validateEmployeeAdvanceSelection(original, { advancePaidAmount: 600, advancePaidAt: "2026-06-15" })).toBeNull();
  });
  it("leaves missing actual values empty even when approval and manual advance fields exist", () => {
    const result = getEmployeeAdvanceSourceFacts({ ...source, actualPaidAmount: null, paidAt: null, ...{ totalPaymentAmount: 1000, advancePaidAmount: 900, advancePaidAt: "2026-03-02", createdAt: "2026-03-01" } });
    expect(result.advancePaidAmount).toBe(""); expect(result.advancePaidAt).toBe("");
    expect(result.blockedReason).toContain("실제 지급액");
    expect(validateEmployeeAdvanceSelection({ ...source, actualPaidAmount: null }, { advancePaidAmount: 1000, advancePaidAt: "2026-06-15" })).not.toBeNull();
  });
  it.each([0, -1, Number.NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])("does not accept invalid actual amount %s", actualPaidAmount => {
    expect(getEmployeeAdvanceSourceFacts({ ...source, actualPaidAmount })).toMatchObject({ advancePaidAmount: "", advancePaidAt: "2026-06-15" });
  });
  it.each(["", "2026-02-30", "2026-13-01", "2999-01-01", "not a date"])("does not substitute an invalid paid date %s", paidAt => {
    expect(getEmployeeAdvanceSourceFacts({ ...source, paidAt })).toMatchObject({ advancePaidAmount: "600", advancePaidAt: "" });
  });
  it("rejects stale manual overrides and clearing the original clears prior facts", () => {
    expect(validateEmployeeAdvanceSelection(source, { advancePaidAmount: 1000, advancePaidAt: "2026-06-15" })).toContain("일치");
    expect(validateEmployeeAdvanceSelection(source, { advancePaidAmount: 600, advancePaidAt: "2026-03-01" })).toContain("일치");
    expect(getEmployeeAdvanceSourceFacts()).toMatchObject({ advancePaidAmount: "", advancePaidAt: "" });
  });
});
