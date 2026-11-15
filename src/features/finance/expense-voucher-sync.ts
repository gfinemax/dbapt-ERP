import type { ManagedExpenseResolution } from "./expense-resolution-page";

export type ExpenseVoucherSyncTarget = {
  amount: number;
  bankTransactionId: string | null;
  description: string;
  voucherNo: string;
};

export function getExpenseVoucherSyncTargets(resolution: ManagedExpenseResolution): ExpenseVoucherSyncTarget[] {
  if (resolution.resolutionType === "BATCH" && resolution.voucherCreationMode === "ITEM_VOUCHER") {
    return resolution.expenseItems.flatMap((item) => item.voucherNo ? [{
      amount: item.totalAmount,
      bankTransactionId: item.bankTransactionId ?? null,
      description: item.itemTitle,
      voucherNo: item.voucherNo,
    }] : []);
  }

  return resolution.voucherNo ? [{
    amount: resolution.totalPaymentAmount,
    bankTransactionId: resolution.bankTransactionId ?? null,
    description: resolution.subject || resolution.reason,
    voucherNo: resolution.voucherNo,
  }] : [];
}
