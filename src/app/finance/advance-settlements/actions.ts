"use server";
import { revalidatePath } from "next/cache";
import { saveAdvanceSettlement } from "@/features/finance/advance-settlement-repository";
export async function saveAdvanceSettlementDraft(input: Record<string, unknown>, operationKey: string) {
  const result = await saveAdvanceSettlement(input, operationKey);
  revalidatePath("/finance/advance-settlements");
  return result;
}
