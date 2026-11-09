"use server";

import { revalidatePath } from "next/cache";

import { inferTransactionKind } from "@/features/finance/bank-transaction-import";
import type { ParsedBankTransactionRow } from "@/features/finance/bank-transaction-import";
import { applyBankTransactionReplacement, loadBankTransactionReplacementPreview } from "@/features/finance/bank-transaction-replacement";
import {
  applyBankTransactionSheetEnrichment,
  previewBankTransactionSheetEnrichment,
  type ApplyBankSheetEnrichmentInput,
} from "@/features/finance/bank-transaction-sheet-enrichment-repository";
import type { BankSheetSourceRow } from "@/features/finance/bank-transaction-sheet-enrichment";
import type { BankTransactionDetailOverrideInput, BankTransactionReviewInput, BankTransactionSubjectAssignment } from "@/features/finance/bank-transaction-repository";
import { confirmBankTransactionSubjects, createBankTransactionsInSupabase, saveBankTransactionDetailOverrides, saveBankTransactionReview } from "@/features/finance/bank-transaction-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { requireReimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { setLedgerBankAccountMapping, syncLedgerBankTransactions } from "@/features/finance/ledger-bank-transaction-backfill";
import {
  loadLedgerBankSubjectTransactions,
  saveLedgerBankSubjectRules,
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

export async function previewBankTransactionSheetEnrichmentAction(input: {
  bankAccountId: string;
  sourceRows: BankSheetSourceRow[];
}) {
  const actor = await requireExpenseActor("READ");
  return previewBankTransactionSheetEnrichment(actor.organization_id, input.bankAccountId, input.sourceRows);
}

export async function applyBankTransactionSheetEnrichmentAction(input: ApplyBankSheetEnrichmentInput) {
  const actor = await requireReimbursementIdentity();
  if (!actor.permissions.some((permission) => ["ADMIN", "CLOSE"].includes(permission))) {
    throw new Error("은행 원장 보정은 관리자 또는 마감 담당자만 할 수 있어.");
  }
  const result = await applyBankTransactionSheetEnrichment(actor.organization_id, actor.user_id, input);
  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/bank-transactions/upload");
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

export async function saveBankTransactionReviewAction(input: BankTransactionReviewInput) {
  const actor = await requireExpenseActor("ADMIN");
  const saved = await saveBankTransactionReview(actor.organization_id, actor.user_id, input);
  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/bank-unmatched");
  revalidatePath("/finance/reports");
  revalidatePath("/finance/exp");
  return saved;
}

export async function saveBankTransactionDetailOverridesAction(input: BankTransactionDetailOverrideInput) {
  const actor = await requireExpenseActor("ADMIN");
  const saved = await saveBankTransactionDetailOverrides(actor.organization_id, actor.user_id, input);
  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/reports");
  revalidatePath("/finance/exp");
  return saved;
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
