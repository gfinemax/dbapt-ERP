"use server";

import { revalidatePath } from "next/cache";

import { createAccountSubjectsInSupabase } from "@/features/basic-info/account-subject-repository";
import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import { createBankAccountInSupabase, updateBankAccountInSupabase } from "@/features/basic-info/bank-account-repository";
import type { BankAccountInput } from "@/features/basic-info/business-partner-data";
import type { BusinessPartnerOcrInput } from "@/features/basic-info/business-partner-data";
import { ensureBusinessPartnerFromOcrInSupabase } from "@/features/basic-info/business-partner-repository";

export async function createBusinessPartnerAction(input: BusinessPartnerOcrInput) {
  const result = await ensureBusinessPartnerFromOcrInSupabase(input);
  revalidatePath("/basic-info");
  return result;
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
