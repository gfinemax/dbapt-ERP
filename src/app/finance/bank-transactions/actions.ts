"use server";

import { revalidatePath } from "next/cache";

import { inferTransactionKind } from "@/features/finance/bank-transaction-import";
import type { ParsedBankTransactionRow } from "@/features/finance/bank-transaction-import";
import type { BankTransactionSubjectAssignment } from "@/features/finance/bank-transaction-repository";
import { confirmBankTransactionSubjects, createBankTransactionsInSupabase } from "@/features/finance/bank-transaction-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";

export async function createBankTransactionsAction(rows: ParsedBankTransactionRow[]) {
  const actor = await requireExpenseActor("PAY");
  const result = await createBankTransactionsInSupabase(rows, actor.organization_id);

  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/exp");

  return {
    duplicateCount: result.duplicateCount,
    importedCount: result.transactions.length,
    transactions: result.transactions.map((transaction) => ({ id: transaction.id, isWithdrawal: inferTransactionKind(transaction.transaction_kind, Number(transaction.deposit_amount), Number(transaction.withdrawal_amount)) === "출금" })),
  };
}

export async function confirmBankTransactionSubjectsAction(assignments: BankTransactionSubjectAssignment[]) {
  const actor = await requireExpenseActor("ADMIN");
  const confirmed = await confirmBankTransactionSubjects(actor.organization_id, actor.user_id, assignments);
  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/exp");
  return confirmed;
}
