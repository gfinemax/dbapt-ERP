"use server";

import { revalidatePath } from "next/cache";
import { runFundWorkflow } from "@/features/finance/fund-workflow-repository";

export async function connectTrustSource(sourceKind: "RESOLUTION" | "QUICK" | "PERSONAL", sourceId: string, operationKey: string) {
  const result = await runFundWorkflow("ENROLL", { source_kind: sourceKind, source_id: sourceId }, operationKey);
  revalidatePath("/finance/trust");
  revalidatePath("/finance/expenses");
  return result;
}

export async function refreshTrustSource(id: string, reason: string, operationKey: string) {
  const result = await runFundWorkflow("REFRESH", { id, reason }, operationKey);
  revalidatePath("/finance/trust");
  revalidatePath("/finance/expenses");
  return result;
}
