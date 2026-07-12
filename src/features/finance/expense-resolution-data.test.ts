import { describe, expect, it } from "vitest";
import {
  expenseResolutionFields,
  expenseResolutionStatusValues,
  expenseResolutionTypeOptions,
  expenseResolutions,
  getExpenseResolutionSummary,
} from "./expense-resolution-data";

describe("expense resolution data", () => {
  it("defines the supported statuses and expense types", () => {
    expect(expenseResolutionStatusValues).toEqual(["DRAFT", "PENDING", "APPROVED", "REJECTED", "BEFORE_PAYMENT", "PAYMENT_PENDING", "PARTIAL_PAID", "PAID", "HOLD"]);
    expect(expenseResolutionTypeOptions).toContain("운영비");
    expect(expenseResolutionTypeOptions).toContain("토지매입비");
    expect(expenseResolutionTypeOptions).toContain("환불금");
  });

  it("keeps the creation field definition without shipping sample records", () => {
    expect(expenseResolutionFields).toContain("결의서번호");
    expect(expenseResolutionFields).toContain("지출정보 요약");
    expect(expenseResolutionFields).toContain("증빙자료");
    expect(expenseResolutions).toEqual([]);
    expect(getExpenseResolutionSummary()).toEqual({
      pendingApprovalCount: 0,
      waitingPaymentCount: 0,
      totalPendingAmount: 0,
    });
  });
});
