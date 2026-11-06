"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { parseCollectionAssessmentCsv } from "@/features/finance/collection-assessment-csv";
import { applyCollectionAssessmentImport, cancelCollectionAssessmentImport, loadCollectionAssessmentImport, previewCollectionAssessmentImport, runCollectionLedger, type CollectionLedgerCommand } from "@/features/finance/collection-ledger-repository";
import { syncLedgerContributionAssessments } from "@/features/finance/ledger-contribution-sync";
import { syncLedgerExternalContributionRecognitions } from "@/features/finance/ledger-external-recognition-sync";
import { pushLedgerAllocationFeedback } from "@/features/finance/ledger-allocation-feedback";

export async function syncLedgerContributions() {
  const result = await syncLedgerContributionAssessments();
  const feedback = await pushLedgerAllocationFeedback();
  for (const path of ["/finance/collections", "/finance/month-close", "/finance/workspace", "/reports"]) revalidatePath(path);
  return { ...result, feedback_sent_count: feedback.sent_count };
}

export async function syncLedgerExternalRecognitions() {
  const result = await syncLedgerExternalContributionRecognitions();
  for (const path of ["/finance/collections", "/finance/month-close", "/finance/workspace", "/reports"]) revalidatePath(path);
  return result;
}

export async function executeCollectionLedger(command: CollectionLedgerCommand, input: Record<string, unknown>, operationKey: string) {
  const result = await runCollectionLedger(command, input, operationKey);
  let feedbackPending = false;
  if (command === "RECEIPT_ALLOCATE" || command === "RECEIPT_REVERSE") {
    try { await pushLedgerAllocationFeedback(); } catch { feedbackPending = true; }
  }
  for (const path of ["/finance/collections", "/finance/refunds", "/finance/month-close", "/finance/workspace"]) revalidatePath(path);
  return { ...result, feedback_pending: feedbackPending };
}

export async function previewCollectionAssessmentCsv(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) throw new Error("UTF-8 CSV 파일을 선택해줘.");
  if (file.size <= 0 || file.size > 1024 * 1024) throw new Error("CSV 파일은 1MB 이하만 등록할 수 있어.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("CSV를 UTF-8 형식으로 다시 저장해줘."); }
  const rows = parseCollectionAssessmentCsv(text);
  return previewCollectionAssessmentImport({ fileName: file.name, contentHash: createHash("sha256").update(bytes).digest("hex"), rows });
}

export async function applyCollectionAssessmentCsv(batchId: string, operationKey: string) {
  const result = await applyCollectionAssessmentImport(batchId, operationKey);
  for (const path of ["/finance/collections", "/finance/month-close", "/finance/workspace"]) revalidatePath(path);
  return result;
}

export async function loadCollectionAssessmentCsv(batchId: string) {
  return loadCollectionAssessmentImport(batchId);
}

export async function cancelCollectionAssessmentCsv(batchId: string, reason: string, operationKey: string) {
  const result = await cancelCollectionAssessmentImport(batchId, reason, operationKey);
  revalidatePath("/finance/collections");
  return result;
}
