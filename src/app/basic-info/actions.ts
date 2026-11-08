"use server";

import { revalidatePath } from "next/cache";

import { createAccountSubjectsInSupabase, manageAccountSubjectInSupabase } from "@/features/basic-info/account-subject-repository";
import type { AccountSubjectManagementInput, AccountSubjectRegistrationInput } from "@/features/basic-info/account-subject-data";
import { createBankAccountInSupabase, updateBankAccountInSupabase } from "@/features/basic-info/bank-account-repository";
import type { BankAccountInput } from "@/features/basic-info/business-partner-data";
import type { BusinessPartnerOcrInput } from "@/features/basic-info/business-partner-data";
import { ensureBusinessPartnerFromOcrInSupabase } from "@/features/basic-info/business-partner-repository";
import { createBusinessPartnerInSupabase, updateBusinessPartnerInSupabase } from "@/features/basic-info/business-partner-repository";
import type { BusinessPartnerInput, CreditCardInput, ItemInput } from "@/features/basic-info/business-partner-data";
import { createCreditCardInSupabase } from "@/features/basic-info/credit-card-repository";
import { createItemInSupabase } from "@/features/basic-info/item-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";

export async function createBusinessPartnerAction(input: BusinessPartnerOcrInput) {
  const result = await ensureBusinessPartnerFromOcrInSupabase(input);
  revalidatePath("/basic-info");
  return result;
}

export async function createManualBusinessPartnerAction(input: BusinessPartnerInput) {
  const partner = await createBusinessPartnerInSupabase(input);
  revalidatePath("/basic-info");
  return partner;
}

export async function updateBusinessPartnerAction(id: string, input: BusinessPartnerInput) {
  const partner = await updateBusinessPartnerInSupabase(id, input);
  revalidatePath("/basic-info");
  return partner;
}

export async function createItemAction(input: ItemInput) {
  const item = await createItemInSupabase(input);
  revalidatePath("/basic-info");
  return item;
}

export async function createCreditCardAction(input: CreditCardInput) {
  const card = await createCreditCardInSupabase(input);
  revalidatePath("/basic-info");
  return card;
}

export async function createBankAccountAction(input: BankAccountInput) {
  const actor = await requireExpenseActor("ADMIN");
  const account = await createBankAccountInSupabase(input, actor.organization_id);

  revalidatePath("/basic-info");

  return account;
}

export async function updateBankAccountAction(id: string, input: BankAccountInput) {
  const actor = await requireExpenseActor("ADMIN");
  const account = await updateBankAccountInSupabase(id, input, actor.organization_id);

  revalidatePath("/basic-info");

  return account;
}

export async function createAccountSubjectsAction(input: AccountSubjectRegistrationInput[]) {
  const actor = await requireExpenseActor("ADMIN");
  const subjects = await createAccountSubjectsInSupabase(input, actor.organization_id, actor.user_id);

  revalidatePath("/basic-info");

  return subjects;
}

export async function manageAccountSubjectAction(subjectId: string | null, input: AccountSubjectManagementInput) {
  const actor = await requireExpenseActor("ADMIN");
  const subject = await manageAccountSubjectInSupabase(subjectId, input, actor.organization_id, actor.user_id);
  revalidatePath("/basic-info");
  revalidatePath("/finance/bank-transactions");
  revalidatePath("/finance/bank-unmatched");
  revalidatePath("/finance/bank-auto-matching");
  return subject;
}
