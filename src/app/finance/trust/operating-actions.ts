"use server";

import { revalidatePath } from "next/cache";
import { runTrustOperating, type TrustOperatingCommand } from "@/features/finance/trust-operating-repository";

export async function executeTrustOperating(command: TrustOperatingCommand, input: Record<string, unknown>, operationKey: string) {
  const result = await runTrustOperating(command, input, operationKey);
  for (const path of ["/finance/trust", "/finance/workspace", "/finance/payments", "/finance/expenses"]) revalidatePath(path);
  return result;
}
