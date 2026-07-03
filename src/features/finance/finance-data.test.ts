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
      "지결-2026-0001",
      "수입-2026-0001",
      "지출-2026-0001",
      "지출-2026-0002",
      "지출-2026-0003",
      "환결-2026-0001",
    ]);
  });

  it("uses cooperative accounting examples instead of product purchase examples", () => {
    expect(financeTransactions.map((transaction) => transaction.accountTitle)).toEqual(
      expect.arrayContaining(["법무비", "조합원 분담금", "토지매입비", "세무비", "감정평가비", "조합원 환불금"]),
    );
    expect(financeTransactions.map((transaction) => transaction.description).join(" ")).not.toMatch(/상품|컴퓨터|외상 매입/);
  });

  it("defines finance filters for voucher and payment workflows", () => {
    expect(financeFilters).toEqual(["전체", "수입", "지출", "지출결의", "승인대기", "지급대기", "증빙미첨부", "입금미매칭"]);
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
    expect(findFinanceTransactionById("finance-0411")?.accountTitle).toBe("토지매입비");
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
