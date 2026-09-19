"use server";

import { revalidatePath } from "next/cache";
import { runCollectionLedger, type CollectionLedgerCommand } from "@/features/finance/collection-ledger-repository";

export async function executeCollectionLedger(command: CollectionLedgerCommand, input: Record<string, unknown>, operationKey: string) {
  const result = await runCollectionLedger(command, input, operationKey);
  for (const path of ["/finance/collections", "/finance/refunds", "/finance/month-close", "/finance/workspace"]) revalidatePath(path);
  return result;
}
