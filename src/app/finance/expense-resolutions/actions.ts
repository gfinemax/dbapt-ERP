"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { inferEvidenceType, type EvidenceOcrJobProgress, type EvidenceOcrJobStage, type ExpenseEvidenceAttachment } from "@/features/finance/expense-evidence";
import { extractExpenseEvidenceFile } from "@/features/finance/expense-evidence-ocr.server";
import { extractExpenseEvidenceWithOpenAI } from "@/features/finance/expense-evidence-openai.server";
import { compressExpenseEvidenceFile } from "@/features/finance/expense-evidence-compression.server";
import { buildExpenseEvidenceStoragePath } from "@/features/finance/expense-evidence-storage";
import { getExpenseResolutionSnapshotFromSupabase, updateExpenseDisbursementInSupabase, updateExpenseResolutionWorkflowInSupabase, upsertExpenseResolutionInSupabase } from "@/features/finance/expense-resolution-repository";
import { transitionExpenseApproval, type ApprovalTransitionRequest } from "@/features/finance/expense-approval-workflow";
import { transitionExpenseDisbursement, type DisbursementTransitionRequest } from "@/features/finance/expense-disbursement-workflow";
import { validateExpenseResolutionWorkflow } from "@/features/finance/expense-resolution-domain";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";

const expenseEvidenceBucket = "expense-evidence";
const maxEvidenceFileSize = 10 * 1024 * 1024;
const acceptedEvidenceTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv"]);

export async function uploadExpenseEvidenceAction(formData: FormData): Promise<ExpenseEvidenceAttachment> {
  const file = formData.get("file");
  const resolutionNo = String(formData.get("resolutionNo") ?? "").trim();
  const requestedEvidenceType = String(formData.get("evidenceType") ?? "기타");
  if (!(file instanceof File) || !file.size) throw new Error("증빙파일을 선택해 주세요.");
  if (!resolutionNo) throw new Error("결의서번호가 필요합니다.");
  if (file.size > maxEvidenceFileSize) throw new Error("증빙파일은 10MB 이하만 업로드할 수 있습니다.");
  if (!acceptedEvidenceTypes.has(file.type)) throw new Error("PDF, JPG, PNG, WEBP, TXT, CSV 파일만 업로드할 수 있습니다.");

  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const compression = await compressExpenseEvidenceFile(file);
  const storedFile = compression.file;
  if (compression.savedBytes > 0) {
    console.info(`[expense-evidence] compressed ${file.name}: ${compression.originalSize} -> ${storedFile.size} bytes`);
  }
  const id = randomUUID();
  const storagePath = buildExpenseEvidenceStoragePath(resolutionNo, id, storedFile.type);
  const { error } = await supabase.storage.from(expenseEvidenceBucket).upload(storagePath, storedFile, {
    cacheControl: "3600",
    contentType: storedFile.type,
    upsert: false,
  });
  if (error) throw new Error(`증빙파일 저장 실패: ${error.message}`);
  const evidenceType = inferEvidenceType(file.name, requestedEvidenceType);
  const { error: jobError } = await supabase.schema("finance").from("expense_evidence_ocr_jobs").insert({
    content_type: storedFile.type,
    evidence_type: evidenceType,
    id,
    original_filename: file.name,
    resolution_no: resolutionNo,
    storage_bucket: expenseEvidenceBucket,
    storage_path: storagePath,
  });
  if (jobError) {
    await supabase.storage.from(expenseEvidenceBucket).remove([storagePath]);
    throw new Error(`OCR 작업 등록 실패: ${jobError.message}`);
  }
  after(() => processExpenseEvidenceOcrJob(id));
  return {
    contentType: file.type,
    evidenceType,
    fileName: file.name,
    fileSize: storedFile.size,
    id,
    ocrData: {},
    ocrJobId: id,
    ocrStatus: "REVIEW_REQUIRED",
    storageBucket: expenseEvidenceBucket,
    storagePath,
    uploadedAt: new Date().toISOString(),
    uploadedBy: "오학동 사무장",
  };
}

export async function getExpenseEvidenceOcrJobAction(id: string): Promise<EvidenceOcrJobProgress> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { data, error } = await supabase.schema("finance").from("expense_evidence_ocr_jobs")
    .select("id,status,stage,progress,result_data,error_message")
    .eq("id", id)
    .single();
  if (error) throw new Error(`OCR 작업 조회 실패: ${error.message}`);
  return {
    errorMessage: data.error_message ?? undefined,
    id: data.id,
    progress: data.progress,
    resultData: data.result_data ?? {},
    stage: data.stage,
    status: data.status,
  } as EvidenceOcrJobProgress;
}

export async function retryExpenseEvidenceOcrJobAction(id: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { error } = await supabase.schema("finance").from("expense_evidence_ocr_jobs").update({
    completed_at: null,
    error_message: null,
    progress: 20,
    result_data: {},
    stage: "UPLOADED",
    status: "PENDING",
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`OCR 재분석 등록 실패: ${error.message}`);
  after(() => processExpenseEvidenceOcrJob(id));
}

async function processExpenseEvidenceOcrJob(id: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;
  const { data: job, error: jobError } = await supabase.schema("finance").from("expense_evidence_ocr_jobs")
    .select("id,storage_bucket,storage_path,original_filename,content_type,attempt_count")
    .eq("id", id)
    .single();
  if (jobError || !job) return;
  try {
    await updateOcrJob(id, "RENDERING", 30, { attempt_count: job.attempt_count + 1, started_at: new Date().toISOString(), status: "PROCESSING" });
    const { data: blob, error: downloadError } = await supabase.storage.from(job.storage_bucket).download(job.storage_path);
    if (downloadError) throw new Error(`증빙파일 읽기 실패: ${downloadError.message}`);
    const file = new File([blob], job.original_filename, { type: job.content_type });
    let result;
    if (process.env.OPENAI_API_KEY && (file.type === "application/pdf" || file.type.startsWith("image/"))) {
      try {
        result = await extractExpenseEvidenceWithOpenAI(file, {
          onStage: async (stage) => updateOcrJob(id, stage, stage === "PREPROCESSING" ? 45 : stage === "RECOGNIZING" ? 65 : 85),
        });
      } catch (openAiError) {
        const openAiFailureMessage = openAiError instanceof Error ? openAiError.message : String(openAiError);
        console.warn(`[expense-evidence] OpenAI vision unavailable; falling back to Tesseract for ${file.name}: ${openAiFailureMessage}`);
        await updateOcrJob(id, "RECOGNIZING", 65, { provider: "TESSERACT" });
        result = { ...await extractExpenseEvidenceFile(file), processingNote: `OpenAI 분석 실패 후 로컬 OCR로 처리됨: ${openAiFailureMessage}` };
      }
    } else {
      await updateOcrJob(id, "RECOGNIZING", 65, { provider: "TESSERACT" });
      result = { ...await extractExpenseEvidenceFile(file), processingNote: "OpenAI API 키가 없어 로컬 OCR로 처리됨" };
    }
    await updateOcrJob(id, "COMPLETED", 100, {
      completed_at: new Date().toISOString(),
      provider: result.provider ?? "TESSERACT",
      result_data: result,
      status: "COMPLETED",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[expense-evidence] background OCR failed for ${id}: ${message}`);
    await updateOcrJob(id, "FAILED", 100, { completed_at: new Date().toISOString(), error_message: message, status: "FAILED" });
  }
}

async function updateOcrJob(id: string, stage: EvidenceOcrJobStage, progress: number, values: Record<string, unknown> = {}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;
  const { error } = await supabase.schema("finance").from("expense_evidence_ocr_jobs").update({
    ...values,
    progress,
    stage,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`OCR 상태 저장 실패: ${error.message}`);
}

export async function createExpenseEvidenceDownloadUrlAction(storagePath: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { data, error } = await supabase.storage.from(expenseEvidenceBucket).createSignedUrl(storagePath, 60);
  if (error) throw new Error(`증빙 원본 열기 실패: ${error.message}`);
  return data.signedUrl;
}

export async function deleteExpenseEvidenceAction(storagePath: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { error } = await supabase.storage.from(expenseEvidenceBucket).remove([storagePath]);
  if (error) throw new Error(`증빙파일 삭제 실패: ${error.message}`);
}

export async function saveExpenseResolutionAction(resolution: ManagedExpenseResolution) {
  if (resolution.approvalStatus === "승인대기") {
    const validation = validateExpenseResolutionWorkflow({
      ...resolution,
      accountAllocationTotal: resolution.resolutionType === "BATCH" ? undefined : resolution.accountAllocations?.reduce((sum, allocation) => sum + (Number(allocation.amount) || 0), 0),
      evidenceCount: resolution.evidenceFiles?.length ?? 0,
      invalidItemCount: resolution.resolutionType === "BATCH" ? undefined : resolution.singleItems?.filter((item) => !item.itemName.trim() || Number(item.quantity) <= 0 || Number(item.unitPrice) < 0).length,
      itemCount: resolution.resolutionType === "BATCH" ? resolution.expenseItems.length : resolution.singleItems?.length ?? 0,
    });
    if (validation.errors.length) throw new Error(validation.errors.join(" "));
  }
  const saved = await upsertExpenseResolutionInSupabase(resolution);
  revalidatePath("/finance/expense-resolutions");
  revalidatePath("/finance/approval-inbox");
  return saved;
}

export async function transitionExpenseApprovalAction(input: ApprovalTransitionRequest) {
  const current = await getExpenseResolutionSnapshotFromSupabase(input.resolutionId);
  if (current.approvalStatus !== input.expectedStatus || current.currentApprover !== input.expectedCurrentApprover) {
    throw new Error("다른 사용자가 먼저 결재 상태를 변경했습니다. 목록을 새로고침해주세요.");
  }
  const transitioned = transitionExpenseApproval({
    actorLabel: input.actorLabel,
    command: input.command,
    reason: input.reason,
    resolution: current,
  });
  const saved = await updateExpenseResolutionWorkflowInSupabase(transitioned, {
    approvalStatus: input.expectedStatus,
    currentApprover: input.expectedCurrentApprover,
  });
  revalidatePath("/finance/expense-resolutions");
  revalidatePath("/finance/approval-inbox");
  revalidatePath("/finance/payment-waiting");
  return saved;
}

export async function transitionExpenseDisbursementAction(input: DisbursementTransitionRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  if (!input.idempotencyKey.trim()) throw new Error("지급 처리키가 필요합니다.");

  const operation = {
    command: input.command,
    idempotency_key: input.idempotencyKey,
    request_data: input,
    resolution_id: input.resolutionId,
    status: "PROCESSING",
  };
  const { data: inserted, error: insertError } = await supabase
    .schema("finance")
    .from("expense_workflow_operations")
    .insert(operation)
    .select("id")
    .maybeSingle();
  if (insertError) {
    const { data: existing, error: existingError } = await supabase
      .schema("finance")
      .from("expense_workflow_operations")
      .select("status,result_data,error_message")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existingError || !existing) throw new Error(`지급 처리 등록 실패: ${insertError.message}`);
    if (existing.status === "COMPLETED" && existing.result_data) return existing.result_data as ManagedExpenseResolution;
    if (existing.status === "FAILED") throw new Error(existing.error_message || "이전 지급 처리가 실패했습니다.");
    throw new Error("동일한 지급 처리가 진행 중입니다. 잠시 후 새로고침해주세요.");
  }
  if (!inserted) throw new Error("지급 처리 등록 결과를 확인할 수 없습니다.");

  try {
    const current = await getExpenseResolutionSnapshotFromSupabase(input.resolutionId);
    if (current.paymentStatus !== input.expectedPaymentStatus || current.voucherStatus !== input.expectedVoucherStatus) {
      throw new Error("다른 사용자가 먼저 지급 또는 전표 상태를 변경했습니다. 목록을 새로고침해주세요.");
    }
    const transitioned = transitionExpenseDisbursement({
      ...input,
      resolution: current,
      voucherNo: input.command === "VOUCHER_CREATE" ? await getNextVoucherNo() : undefined,
    });
    const saved = await updateExpenseDisbursementInSupabase(transitioned, {
      paymentStatus: input.expectedPaymentStatus,
      voucherStatus: input.expectedVoucherStatus,
    });
    const { error: auditError } = await supabase.schema("finance").from("expense_workflow_audit_logs").insert({
      action: input.command,
      actor_label: input.actorLabel,
      after_data: saved,
      before_data: current,
      operation_id: inserted.id,
      resolution_id: input.resolutionId,
    });
    if (auditError) throw new Error(`감사로그 저장 실패: ${auditError.message}`);
    const { error: completionError } = await supabase
      .schema("finance")
      .from("expense_workflow_operations")
      .update({ completed_at: new Date().toISOString(), result_data: saved, status: "COMPLETED" })
      .eq("id", inserted.id);
    if (completionError) throw new Error(`처리결과 저장 실패: ${completionError.message}`);
    revalidatePath("/finance/expense-resolutions");
    revalidatePath("/finance/payment-waiting");
    revalidatePath("/finance/payment-completed");
    return saved;
  } catch (error) {
    await supabase
      .schema("finance")
      .from("expense_workflow_operations")
      .update({ completed_at: new Date().toISOString(), error_message: error instanceof Error ? error.message : String(error), status: "FAILED" })
      .eq("id", inserted.id);
    throw error;
  }
}

async function getNextVoucherNo() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const year = new Date().getFullYear();
  const prefix = `지출-${year}-`;
  const { data, error } = await supabase
    .schema("finance")
    .from("expense_resolutions")
    .select("voucher_no")
    .like("voucher_no", `${prefix}%`)
    .order("voucher_no", { ascending: false })
    .limit(1);
  if (error) throw new Error(`전표번호 생성 실패: ${error.message}`);
  const last = Number(data?.[0]?.voucher_no?.slice(prefix.length)) || 0;
  return `${prefix}${String(last + 1).padStart(4, "0")}`;
}
