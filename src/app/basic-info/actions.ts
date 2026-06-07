"use server";

import { revalidatePath } from "next/cache";

import { createBankAccountInSupabase } from "@/features/basic-info/bank-account-repository";
import type { BankAccountInput } from "@/features/basic-info/business-partner-data";

export async function createBankAccountAction(input: BankAccountInput) {
  const account = await createBankAccountInSupabase(input);

  revalidatePath("/basic-info");

  return account;
}
