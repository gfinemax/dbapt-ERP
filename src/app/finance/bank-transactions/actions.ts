"use server";

import { revalidatePath } from "next/cache";

import { inferTransactionKind } from "@/features/finance/bank-transaction-import";
import type { ParsedBankTransactionRow } from "@/features/finance/bank-transaction-import";
import { applyBankTransactionReplacement, loadBankTransactionReplacementPreview } from "@/features/finance/bank-transaction-replacement";
import type { BankTransactionSubjectAssignment } from "@/features/finance/bank-transaction-repository";
import { confirmBankTransactionSubjects, createBankTransactionsInSupabase } from "@/features/finance/bank-transaction-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { setLedgerBankAccountMapping, syncLedgerBankTransactions } from "@/features/finance/ledger-bank-transaction-backfill";
import {
  loadLedgerBankSubjectTransactions,
  saveLedgerBankSubjectRules,
  syncLedgerAccountSubjects,
  type LedgerAccountSubjectSyncInput,
  type LedgerBankSubjectRuleInput,
  type LedgerBankSubjectTransactionQuery,
} from "@/features/finance/ledger-bank-subject-rules";

export async function createBankTransactionsAction(rows: ParsedBankTransactionRow[]) {
  const actor = await requireExpenseActor("PAY");
  const result = await createBankTransactionsInSupabase(rows, actor.organization_id);

  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/bank-transactions/upload");
  revalidatePath("/finance/bank-unmatched");
  revalidatePath("/finance/exp");

  return {
    duplicateCount: result.duplicateCount,
    importedCount: result.transactions.length,
    transactions: result.transactions.map((transaction) => ({ id: transaction.id, isWithdrawal: inferTransactionKind(transaction.transaction_kind, Number(transaction.deposit_amount), Number(transaction.withdrawal_amount)) === "출금" })),
  };
}

export async function loadBankTransactionReplacementPreviewAction(bankAccountId: string) {
  return loadBankTransactionReplacementPreview(bankAccountId);
}

export async function applyBankTransactionReplacementAction(input: {
  bankAccountId: string;
  expectedOldCount: number;
  reason: string;
  rows: ParsedBankTransactionRow[];
}) {
  const result = await applyBankTransactionReplacement(input);
  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/bank-transactions/upload");
  revalidatePath("/finance/bank-account-links");
  revalidatePath("/finance/bank-unmatched");
  revalidatePath("/finance/reports");
  return result;
}

export async function confirmBankTransactionSubjectsAction(assignments: BankTransactionSubjectAssignment[]) {
  const actor = await requireExpenseActor("ADMIN");
  const confirmed = await confirmBankTransactionSubjects(actor.organization_id, actor.user_id, assignments);
  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/bank-unmatched");
  revalidatePath("/finance/exp");
  return confirmed;
}

export async function saveLedgerBankSubjectRulesAction(rules: LedgerBankSubjectRuleInput[]) {
  const actor = await requireExpenseActor("ADMIN");
  const result = await saveLedgerBankSubjectRules(actor.organization_id, actor.user_id, rules);
  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/bank-auto-matching");
  revalidatePath("/finance/reports");
  return result;
}

export async function loadLedgerBankSubjectTransactionsAction(query: LedgerBankSubjectTransactionQuery) {
  const actor = await requireExpenseActor("READ");
  return loadLedgerBankSubjectTransactions(actor.organization_id, query);
}

export async function syncLedgerAccountSubjectsAction(items: LedgerAccountSubjectSyncInput[]) {
  const actor = await requireExpenseActor("ADMIN");
  const result = await syncLedgerAccountSubjects(actor.organization_id, actor.user_id, items);
  revalidatePath("/basic-info");
  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/bank-auto-matching");
  return result;
}

export async function syncLedgerBankTransactionsAction() {
  try {
    const result = await syncLedgerBankTransactions();
    revalidatePath("/finance/bank-transactions");
    revalidatePath("/finance/bank-account-links");
    revalidatePath("/finance/reports");
    return { data: result, ok: true } as const;
  } catch (error) {
    console.error("[ledger-bank-backfill] sync failed", error);
    return {
      error: "Ledger 거래를 불러오지 못했어. 로그인 상태와 연동 설정을 확인해줘.",
      ok: false,
    } as const;
  }
}

export async function setLedgerBankAccountMappingAction(input: {
  bankAccountId: string;
  ledgerAccountId: string;
  note?: string;
}) {
  try {
    const status = await setLedgerBankAccountMapping(input);
    revalidatePath("/finance/bank-transactions");
    revalidatePath("/finance/bank-account-links");
    revalidatePath("/finance/reports");
    return { data: status, ok: true } as const;
  } catch (error) {
    console.error("[ledger-bank-backfill] mapping failed", error);
    return {
      error: "Ledger 계좌를 연결하지 못했어. 로그인 상태와 이관 권한을 확인해줘.",
      ok: false,
    } as const;
  }
}
