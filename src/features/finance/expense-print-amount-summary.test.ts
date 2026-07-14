import { describe, expect, it } from "vitest";
import { getExpensePrintAmountSummary } from "./expense-resolution-page";

describe("expense print amount summary", () => {
  it("uses the approval amount for an advance resolution", () => {
    expect(getExpensePrintAmountSummary({ timing: "ADVANCE", totalPaymentAmount: 5000 })).toMatchObject({
      items: [],
      primaryLabel: "총 결의금액",
      primaryValue: 5000,
    });
  });

  it("uses the actual expense label for a reimbursement", () => {
    expect(getExpensePrintAmountSummary({ timing: "REIMBURSEMENT", totalPaymentAmount: 5000 })).toMatchObject({
      items: [],
      primaryLabel: "총 지출액",
      primaryValue: 5000,
    });
  });

  it("shows advance, expense, and settlement difference separately", () => {
    expect(getExpensePrintAmountSummary({
      actualUsedAmount: 83000,
      advancePaidAmount: 100000,
      settlementDifference: 17000,
      timing: "SETTLEMENT",
      totalPaymentAmount: 83000,
    }).items).toEqual([
      { label: "선지급액", value: 100000 },
      { label: "총 지출액", value: 83000 },
      { label: "반납액", value: 17000 },
    ]);
  });
});
