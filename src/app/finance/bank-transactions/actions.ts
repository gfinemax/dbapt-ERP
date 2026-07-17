"use server";

import { revalidatePath } from "next/cache";

import type { ParsedBankTransactionRow } from "@/features/finance/bank-transaction-import";
import { createBankTransactionsInSupabase } from "@/features/finance/bank-transaction-repository";

export async function createBankTransactionsAction(rows: ParsedBankTransactionRow[]) {
  const transactions = await createBankTransactionsInSupabase(rows);

  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/exp");

  return transactions.map((transaction) => ({ id: transaction.id }));
}
