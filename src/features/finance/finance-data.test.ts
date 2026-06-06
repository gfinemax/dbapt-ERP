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
  it("keeps regional housing association accounting rows in display order", () => {
    expect(financeTransactions.map((transaction) => transaction.voucherNo)).toEqual([
      "PV-2025-0002",
      "JV-2026-0412",
      "JV-2026-0411",
      "JV-2026-0410",
      "JV-2026-0409",
    ]);
  });

  it("defines finance filters for voucher and payment workflows", () => {
    expect(financeFilters).toEqual(["전체", "매입", "입금", "출금", "승인대기", "증빙미첨부", "연동미매칭"]);
  });

  it("summarizes inflow, outflow, pending approvals, and unmatched integrations", () => {
    expect(getFinanceSummary()).toEqual({
      totalInflow: 380000000,
      totalOutflow: 1447610000,
      pendingApprovals: 3,
      unmatchedIntegrations: 9,
    });
  });

  it("finds a transaction detail and formats Korean won", () => {
    expect(findFinanceTransactionById("finance-0411")?.accountTitle).toBe("토지계약금");
    expect(formatKrw(1447500000)).toBe("1,447,500,000원");
  });

  it("tracks bank account and card sync status", () => {
    expect(bankCardConnections.map((connection) => connection.name)).toEqual([
      "국민은행 신탁계좌",
      "국민은행 운영계좌",
      "법인카드",
    ]);
  });
});
