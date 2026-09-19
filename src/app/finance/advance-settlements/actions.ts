"use server";
import { revalidatePath } from "next/cache";
import {
  saveAdvanceSettlement,
  transitionAdvanceSettlement,
  type AdvanceTransition,
} from "@/features/finance/advance-settlement-repository";
export async function saveAdvanceSettlementDraft(
  input: Record<string, unknown>,
  operationKey: string,
) {
  const result = await saveAdvanceSettlement(input, operationKey);
  revalidatePath("/finance/advance-settlements");
  return result;
}
export async function transitionAdvanceSettlementAction(
  command: AdvanceTransition,
  input: Record<string, unknown>,
  operationKey: string,
) {
  const result = await transitionAdvanceSettlement(
    command,
    input,
    operationKey,
  );
  for (const path of [
    "/finance/advance-settlements",
    "/finance/workspace",
    "/finance/expenses",
    "/finance/payments",
  ])
    revalidatePath(path);
  return result;
}
