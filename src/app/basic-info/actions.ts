"use server";

import { revalidatePath } from "next/cache";

import { createAccountSubjectsInSupabase } from "@/features/basic-info/account-subject-repository";
import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import { createBankAccountInSupabase, updateBankAccountInSupabase } from "@/features/basic-info/bank-account-repository";
import type { BankAccountInput } from "@/features/basic-info/business-partner-data";
import type { BusinessPartnerOcrInput } from "@/features/basic-info/business-partner-data";
import { ensureBusinessPartnerFromOcrInSupabase } from "@/features/basic-info/business-partner-repository";
import { createBusinessPartnerInSupabase, updateBusinessPartnerInSupabase } from "@/features/basic-info/business-partner-repository";
import type { BusinessPartnerInput, CreditCardInput, ItemInput } from "@/features/basic-info/business-partner-data";
import { createCreditCardInSupabase } from "@/features/basic-info/credit-card-repository";
import { createItemInSupabase } from "@/features/basic-info/item-repository";

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
  const account = await createBankAccountInSupabase(input);

  revalidatePath("/basic-info");

  return account;
}

export async function updateBankAccountAction(id: string, input: BankAccountInput) {
  const account = await updateBankAccountInSupabase(id, input);

  revalidatePath("/basic-info");

  return account;
}

export async function createAccountSubjectsAction(input: RegisteredAccountSubject[]) {
  const subjects = await createAccountSubjectsInSupabase(input);

  revalidatePath("/basic-info");

  return subjects;
}
