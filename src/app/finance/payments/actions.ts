"use server";

import { revalidatePath } from "next/cache";
import { runFundWorkflow, type WorkflowCommand } from "@/features/finance/fund-workflow-repository";
import { uploadTrustFile } from "@/features/finance/fund-trust-files";

function refresh() {
  for (const path of ["/finance/payments", "/finance/trust", "/finance/expenses", "/finance/workspace"]) revalidatePath(path);
}
export async function executePaymentCommand(command: Extract<WorkflowCommand, "PAYMENT_RECORD" | "PAYMENT_ALLOCATE" | "ALLOCATION_REVERSE" | "TRANSFER">, input: Record<string, unknown>, key: string) {
  if (!["PAYMENT_RECORD", "PAYMENT_ALLOCATE", "ALLOCATION_REVERSE", "TRANSFER"].includes(command)) throw new Error("지원하지 않는 지급 처리입니다.");
  const result = await runFundWorkflow(command, input, key);
  refresh();
  return result;
}
export async function attachPaymentEvidence(form: FormData) {
  form.set("purpose", "PAYMENT");
  const result = await uploadTrustFile(form);
  refresh();
  return result;
}
