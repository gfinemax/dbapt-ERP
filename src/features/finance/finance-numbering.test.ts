import { describe, expect, it } from "vitest";
import { createDocumentNo, documentNumberPrefixes, getNextDocumentNo } from "./finance-numbering";

describe("finance numbering", () => {
  it("creates regional housing cooperative document numbers by kind", () => {
    expect(documentNumberPrefixes).toEqual({
      EXPENSE_RESOLUTION: "지결",
      EXPENSE_VOUCHER: "지출",
      REFUND_RESOLUTION: "환결",
      INCOME_VOUCHER: "수입",
    });
    expect(createDocumentNo("EXPENSE_RESOLUTION", 1, 2026)).toBe("지결-2026-0001");
    expect(createDocumentNo("EXPENSE_VOUCHER", 1, 2026)).toBe("지출-2026-0001");
    expect(createDocumentNo("REFUND_RESOLUTION", 1, 2026)).toBe("환결-2026-0001");
    expect(createDocumentNo("INCOME_VOUCHER", 1, 2026)).toBe("수입-2026-0001");
  });

  it("finds the next document number from existing numbers in the same year", () => {
    expect(getNextDocumentNo("EXPENSE_VOUCHER", ["지출-2026-0001", "지출-2026-0002-01", "지출-2025-0099"], 2026)).toBe("지출-2026-0003");
    expect(getNextDocumentNo("REFUND_RESOLUTION", [], 2027)).toBe("환결-2027-0001");
  });
});
