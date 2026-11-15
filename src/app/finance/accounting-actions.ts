"use server";

import { revalidatePath } from "next/cache";
import { confirmAccountingDrafts, correctAccountingVoucherAccounts, createAccountingBankAccountSubject, runAccountingCommand, type AccountingAccountCorrectionInput, type AccountingBatchConfirmationInput } from "@/features/finance/accounting-workspace-repository";

export async function saveAccountingDraft(command: "DRAFT_CREATE" | "DRAFT_SAVE", input: Record<string, unknown>, key: string) {
  const result = await runAccountingCommand(command, input, key);
  for (const path of ["/finance", "/finance/payments", "/finance/expenses", "/finance/workspace", "/finance/month-close"]) revalidatePath(path);
  return result;
}

export async function confirmAccountingDraftBatch(input: AccountingBatchConfirmationInput, key: string) {
  const result = await confirmAccountingDrafts(input, key);
  for (const path of ["/finance", "/finance/expenses", "/finance/workspace", "/finance/month-close"]) revalidatePath(path);
  return result;
}

export async function createAccountingBankSubject(bankAccountId: string, name: string, key: string) {
  const result = await createAccountingBankAccountSubject(bankAccountId, name, key);
  for (const path of ["/finance", "/basic-info"]) revalidatePath(path);
  return result;
}

export async function correctAccountingAccounts(input: AccountingAccountCorrectionInput, key: string) {
  const result = await correctAccountingVoucherAccounts(input, key);
  for (const path of ["/finance", "/finance/expenses", "/finance/reports", "/finance/month-close"]) revalidatePath(path);
  return result;
}
