import { describe, expect, it } from "vitest";
import {
  bankCardConnections,
  financeFilters,
  findFinanceTransactionById,
  financeTransactions,
  formatKrw,
  getFinanceSummary,
} from "./finance-data";

describe("finance data", () => {
  it("does not expose sample transactions as operational data", () => {
    expect(financeTransactions).toEqual([]);
    expect(bankCardConnections).toEqual([]);
  });

  it("defines finance filters for voucher and payment workflows", () => {
    expect(financeFilters).toEqual(["전체", "수입", "지출", "지출결의", "승인대기", "지급대기", "증빙미첨부", "입금미매칭"]);
  });

  it("summarizes inflow, outflow, pending approvals, and unmatched integrations", () => {
    expect(getFinanceSummary()).toEqual({
      totalInflow: 0,
      totalOutflow: 0,
      pendingApprovals: 0,
      unmatchedIntegrations: 0,
    });
  });

  it("finds a transaction detail and formats Korean won", () => {
    expect(findFinanceTransactionById("missing")).toBeUndefined();
    expect(formatKrw(1447500000)).toBe("1,447,500,000원");
  });

});
