"use server";

import { revalidatePath } from "next/cache";
import type { ExpenseSourceKind } from "@/features/finance/expense-workspace-repository";
import { runFundWorkflow } from "@/features/finance/fund-workflow-repository";

export async function connectExpenseOriginal(sourceKind: ExpenseSourceKind, sourceId: string, operationKey: string) {
  if (!["RESOLUTION", "QUICK", "PERSONAL"].includes(sourceKind) || !sourceId.trim()) throw new Error("연결할 지출 원본을 확인해주세요.");
  const result = await runFundWorkflow("ENROLL", { source_kind: sourceKind, source_id: sourceId }, operationKey);
  for (const path of ["/finance/expenses", "/finance/trust", "/finance/payments", "/finance"]) revalidatePath(path);
  return result;
}
