"use server";

import { revalidatePath } from "next/cache";
import { runAccountingCommand } from "@/features/finance/accounting-workspace-repository";

export async function saveAccountingDraft(command: "DRAFT_CREATE" | "DRAFT_SAVE", input: Record<string, unknown>, key: string) {
  const result = await runAccountingCommand(command, input, key);
  for (const path of ["/finance", "/finance/payments", "/finance/expenses", "/finance/workspace", "/finance/month-close"]) revalidatePath(path);
  return result;
}
