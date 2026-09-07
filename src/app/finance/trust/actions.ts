"use server";

import { revalidatePath } from "next/cache";
import { runFundTrust, type TrustCommand } from "@/features/finance/fund-trust-repository";
import { uploadTrustFile, trustFileDownload } from "@/features/finance/fund-trust-files";

function refreshTrust() {
  for (const path of ["/finance/trust", "/finance/workflow-settings", "/finance/payments", "/finance/workspace", "/finance/expenses"]) revalidatePath(path);
}

export async function executeTrustCommand(command: Exclude<TrustCommand, "FILE_REGISTER">, input: Record<string, unknown>, operationKey: string) {
  // FILE_REGISTER is only reached through the byte-verifying upload handler.
  if ((command as TrustCommand) === "FILE_REGISTER") throw new Error("파일 업로드를 통해 증빙을 등록해주세요.");
  const result = await runFundTrust(command, input, operationKey);
  refreshTrust();
  return result;
}

export async function attachTrustFile(form: FormData) {
  const result = await uploadTrustFile(form);
  refreshTrust();
  return result;
}

export async function downloadTrustFile(id: string) {
  return trustFileDownload(id);
}
