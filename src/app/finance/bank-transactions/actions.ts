"use server";

import { revalidatePath } from "next/cache";

import { inferTransactionKind } from "@/features/finance/bank-transaction-import";
import type { ParsedBankTransactionRow } from "@/features/finance/bank-transaction-import";
import { createBankTransactionsInSupabase } from "@/features/finance/bank-transaction-repository";

export async function createBankTransactionsAction(rows: ParsedBankTransactionRow[]) {
  const result = await createBankTransactionsInSupabase(rows);

  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/exp");

  return {
    duplicateCount: result.duplicateCount,
    importedCount: result.transactions.length,
    transactions: result.transactions.map((transaction) => ({ id: transaction.id, isWithdrawal: inferTransactionKind(transaction.transaction_kind, Number(transaction.deposit_amount), Number(transaction.withdrawal_amount)) === "출금" })),
  };
}
