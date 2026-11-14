import { describe, expect, it } from "vitest";
import { getExpenseVoucherSyncTargets } from "./expense-voucher-sync";
import { expenseResolutionFixture } from "./expense-resolution-test-fixture";

describe("expense voucher sync", () => {
  it("keeps each item voucher linked to its own bank transaction", () => {
    const resolution = expenseResolutionFixture({
      expenseItems: [
        { bankTransactionId: "bank-1", id: "item-1", itemNo: 1, itemTitle: "첫째 식대", totalAmount: 18_000, voucherNo: "지출-2026-0001-01" },
        { bankTransactionId: "bank-2", id: "item-2", itemNo: 2, itemTitle: "둘째 식대", totalAmount: 36_000, voucherNo: "지출-2026-0001-02" },
      ],
      resolutionType: "BATCH",
      voucherCreationMode: "ITEM_VOUCHER",
    });

    expect(getExpenseVoucherSyncTargets(resolution)).toEqual([
      { amount: 18_000, bankTransactionId: "bank-1", description: "첫째 식대", voucherNo: "지출-2026-0001-01" },
      { amount: 36_000, bankTransactionId: "bank-2", description: "둘째 식대", voucherNo: "지출-2026-0001-02" },
    ]);
  });

  it("creates one target for a grouped voucher", () => {
    const resolution = expenseResolutionFixture({
      bankTransactionId: "bank-1",
      reason: "업무식대",
      resolutionType: "BATCH",
      totalPaymentAmount: 54_000,
      voucherCreationMode: "GROUP_VOUCHER",
      voucherNo: "지출-2026-0001",
    });

    expect(getExpenseVoucherSyncTargets(resolution)).toEqual([
      { amount: 54_000, bankTransactionId: "bank-1", description: resolution.subject || "업무식대", voucherNo: "지출-2026-0001" },
    ]);
  });
});
