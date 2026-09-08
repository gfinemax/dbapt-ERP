"use server";

import { assertExpenseRelatedRow, requireExpenseActor, requireExpenseRecord, requireExpenseFile, requireExpenseOcrJob, requireExpenseFact } from "@/features/finance/expense-authorization";
import { assertLegacyVoucherEditable } from "@/features/finance/accounting-workspace-repository";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ensureBusinessPartnerFromOcrInSupabase } from "@/features/basic-info/business-partner-repository";
import type { BusinessPartnerOcrInput } from "@/features/basic-info/business-partner-data";
import { inferEvidenceType, type EvidenceOcrJobProgress, type EvidenceOcrJobStage, type ExpenseEvidenceAttachment, type ExpenseEvidenceUploadResult } from "@/features/finance/expense-evidence";
import { extractExpenseEvidenceFile } from "@/features/finance/expense-evidence-ocr.server";
import { extractExpenseEvidenceWithOpenAI } from "@/features/finance/expense-evidence-openai.server";
import { compressExpenseEvidenceFile } from "@/features/finance/expense-evidence-compression.server";
import { buildExpenseEvidenceOcrSourcePath, buildExpenseEvidenceStoragePath } from "@/features/finance/expense-evidence-storage";
import { getExpenseResolutionSnapshotFromSupabase, updateExpenseDisbursementInSupabase, commitExpenseCommand, upsertExpenseResolutionInSupabase } from "@/features/finance/expense-resolution-repository";
import { transitionExpenseApproval, type ApprovalTransitionRequest } from "@/features/finance/expense-approval-workflow";
import { transitionExpenseDisbursement, type DisbursementTransitionRequest } from "@/features/finance/expense-disbursement-workflow";
import { validateExpenseResolutionWorkflow } from "@/features/finance/expense-resolution-domain";
import { normalizeEvidenceStatus } from "@/features/finance/expense-compliance";
import { getExpenseComplianceSettings, listExpenseFactConfirmations, saveExpenseComplianceSettings, type ExpenseFactConfirmationInput } from "@/features/finance/expense-compliance-repository";
import type { ExpenseComplianceSettings } from "@/features/finance/expense-compliance";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";
import { evaluateDirectExpensePolicy } from "@/features/finance/direct-expense-policy";

const expenseEvidenceBucket = "expense-evidence";

const maxEvidenceFileSize = 10 * 1024 * 1024;
const acceptedEvidenceTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv"]);

async function validateDirectExpenseGovernance(resolution: ManagedExpenseResolution, settings?: ExpenseComplianceSettings | null) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  // Documents created before this policy was introduced keep their existing
  // workflow. New and explicitly linked documents are governed end to end.
  if (!resolution.creationSource && !resolution.approvalDocumentId && !resolution.directExpenseDecision) return resolution;
  const source = resolution.creationSource ?? (resolution.approvalDocumentId ? "APPROVAL_LINKED" : "DIRECT");
  const result = evaluateDirectExpensePolicy({ amount: resolution.totalPaymentAmount, budgetItem: resolution.budgetItem, budgetOverReason: resolution.budgetOverReason, expenseKind: resolution.expenseKind, relatedContract: resolution.relatedContract, relatedMeeting: resolution.relatedMeeting, subject: resolution.subject, reason: resolution.reason, memo: resolution.memo, source }, settings ?? undefined);
  let linked: { amount: number | string; approval_status: string; document_no: string } | null = null;
  if (resolution.approvalDocumentId) {
    const lookup = await supabase.schema("approval").from("documents").select("document_no,approval_status,amount").eq("id", resolution.approvalDocumentId).is("deleted_at", null).maybeSingle();
    if (lookup.error) throw new Error(`연결 기안 확인 실패: ${lookup.error.message}`);
    linked = lookup.data;
    if (!linked || linked.approval_status !== "APPROVED") throw new Error("승인 완료된 기안만 지출결의에 연결할 수 있습니다.");
    if (resolution.totalPaymentAmount > Number(linked.amount)) throw new Error(`지출금액이 기안 승인금액 ${Number(linked.amount).toLocaleString("ko-KR")}원을 초과했습니다.`);
  }
  if (result.decision === "REQUIRED" && !linked) throw new Error(`승인된 기안을 연결해야 합니다. ${result.reasons.join(" ")}`);
  if (source === "APPROVAL_LINKED" && !linked) throw new Error("승인 완료된 기안을 선택해주세요.");
  if (source === "DIRECT" && !resolution.approvalSkipReason?.trim()) throw new Error("기안 생략 사유가 필요합니다.");
  return { ...resolution, creationSource: source, directExpenseDecision: result.decision, directExpenseReasons: result.reasons, approvalDocumentNo: linked?.document_no ?? resolution.approvalDocumentNo };
}

export async function ensureBusinessPartnerFromOcrAction(input: BusinessPartnerOcrInput) {
  const actor = await requireExpenseActor();
  const result = await ensureBusinessPartnerFromOcrInSupabase(input, actor.organization_id);
  revalidatePath("/basic-info");
  revalidatePath("/finance/expense-resolutions");
  return result;
}

export async function uploadExpenseEvidenceAction(formData: FormData): Promise<ExpenseEvidenceUploadResult> {
  const actor = await requireExpenseActor();
  const currentUserLabel = actor.display_name;
  const startedAt = Date.now();
  const file = formData.get("file");
  const resolutionNo = String(formData.get("resolutionNo") ?? "").trim();
  const requestedEvidenceType = String(formData.get("evidenceType") ?? "기타");
  if (!(file instanceof File) || !file.size) return uploadFailure("INVALID_FILE", "증빙파일을 선택해 주세요.");
  if (!resolutionNo) return uploadFailure("INVALID_FILE", "결의서번호가 필요합니다.");
  if (file.size > maxEvidenceFileSize) return uploadFailure("INVALID_FILE", "증빙파일은 10MB 이하만 업로드할 수 있습니다.");
  if (!acceptedEvidenceTypes.has(file.type)) return uploadFailure("INVALID_FILE", "PDF, JPG, PNG, WEBP, TXT, CSV 파일만 업로드할 수 있습니다.");

  const supabase = getSupabaseServerClient();
  if (!supabase) return uploadFailure("SERVER_CONFIG", "증빙 저장소 연결 설정을 확인해 주세요.");
  const id = randomUUID();
  let stage = "COMPRESSING";
  let storagePath: string | undefined;
  let ocrSourcePath: string | undefined;
  let originalOcrSourceStored = false;
  try {
    const compression = await compressExpenseEvidenceFile(file);
    const storedFile = compression.file;
    if (compression.fallbackReason) {
      console.warn(JSON.stringify({ error: compression.fallbackReason, fileName: file.name, fileSize: file.size, id, level: "warning", message: "expense evidence compression failed; using original", resolutionNo, stage }));
    } else if (compression.savedBytes > 0) {
      console.info(JSON.stringify({ compressedSize: storedFile.size, fileName: file.name, fileSize: file.size, id, level: "info", message: "expense evidence compressed", resolutionNo, stage }));
    }
    storagePath = `${actor.organization_id}/${actor.user_id}/${buildExpenseEvidenceStoragePath(resolutionNo, id, storedFile.type)}`;
    ocrSourcePath = buildExpenseEvidenceOcrSourcePath(storagePath);
    stage = "STORING";
    const { error } = await supabase.storage.from(expenseEvidenceBucket).upload(storagePath, storedFile, {
      cacheControl: "3600",
      contentType: storedFile.type,
      upsert: false,
    });
    if (error) {
      logEvidenceUploadFailure({ error, file, id, resolutionNo, stage, startedAt });
      return uploadFailure("STORAGE_FAILED", "증빙파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    const usesVisionOcr = file.type === "application/pdf" || file.type.startsWith("image/");
    if (usesVisionOcr) {
      stage = "STORING_OCR_SOURCE";
      const { error: sourceError } = await supabase.storage.from(expenseEvidenceBucket).upload(ocrSourcePath, file, {
        cacheControl: "60",
        contentType: file.type,
        upsert: false,
      });
      if (sourceError) {
        console.warn(JSON.stringify({ error: sourceError.message, fileName: file.name, fileSize: file.size, id, level: "warning", message: "expense evidence OCR source upload failed; using stored evidence", resolutionNo, stage }));
      } else {
        originalOcrSourceStored = true;
      }
    }
    stage = "REGISTERING_JOB";
    const evidenceType = inferEvidenceType(file.name, requestedEvidenceType);
    const { error: jobError } = await supabase.schema("finance").from("expense_evidence_ocr_jobs").insert({
      organization_id: actor.organization_id,
      created_by: actor.user_id,
      content_type: storedFile.type,
      evidence_type: evidenceType,
      id,
      original_filename: file.name,
      resolution_no: resolutionNo,
      storage_bucket: expenseEvidenceBucket,
      storage_path: storagePath,
    });
    if (jobError) {
      await supabase.storage.from(expenseEvidenceBucket).remove(originalOcrSourceStored ? [storagePath, ocrSourcePath!] : [storagePath]);
      logEvidenceUploadFailure({ error: jobError, file, id, resolutionNo, stage, startedAt });
      return uploadFailure("JOB_REGISTRATION_FAILED", "증빙파일은 전송됐지만 자동입력 작업을 시작하지 못했습니다. 다시 업로드해 주세요.");
    }
    after(() => processExpenseEvidenceOcrJob(id));
    const attachment: ExpenseEvidenceAttachment = {
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
      uploadedBy: currentUserLabel,
    };
    console.info(JSON.stringify({ durationMs: Date.now() - startedAt, fileName: file.name, fileSize: file.size, id, level: "info", message: "expense evidence upload completed", resolutionNo, stage: "COMPLETED" }));
    return { attachment, ok: true };
  } catch (error) {
    if (storagePath) await supabase.storage.from(expenseEvidenceBucket).remove(originalOcrSourceStored && ocrSourcePath ? [storagePath, ocrSourcePath] : [storagePath]);
    logEvidenceUploadFailure({ error, file, id, resolutionNo, stage, startedAt });
    return uploadFailure("UNEXPECTED", "증빙자료 처리 중 일시적인 오류가 발생했습니다. 파일은 등록되지 않았으니 다시 시도해 주세요.");
  }
}

function uploadFailure(code: Extract<ExpenseEvidenceUploadResult, { ok: false }>["code"], message: string): ExpenseEvidenceUploadResult {
  return { code, message, ok: false };
}

function logEvidenceUploadFailure({ error, file, id, resolutionNo, stage, startedAt }: { error: unknown; file: File; id: string; resolutionNo: string; stage: string; startedAt: number }) {
  console.error(JSON.stringify({ durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error), fileName: file.name, fileSize: file.size, id, level: "error", message: "expense evidence upload failed", resolutionNo, stage }));
}

export async function getExpenseEvidenceOcrJobAction(id: string): Promise<EvidenceOcrJobProgress> {
  await requireExpenseOcrJob(id);
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
  await requireExpenseOcrJob(id, true);
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
    const sourcePath = buildExpenseEvidenceOcrSourcePath(job.storage_path);
    let { data: blob, error: downloadError } = await supabase.storage.from(job.storage_bucket).download(sourcePath);
    const usedOriginalSource = !downloadError && Boolean(blob);
    if (downloadError || !blob) {
      ({ data: blob, error: downloadError } = await supabase.storage.from(job.storage_bucket).download(job.storage_path));
    }
    if (downloadError || !blob) throw new Error(`증빙파일 읽기 실패: ${downloadError?.message ?? "파일이 없습니다."}`);
    const file = new File([blob], job.original_filename, { type: job.content_type });
    let result;
    const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
    if (openAiApiKey && (file.type === "application/pdf" || file.type.startsWith("image/"))) {
      await updateOcrJob(id, "PREPROCESSING", 45, { provider: "OPENAI" });
      try {
        result = await extractExpenseEvidenceWithOpenAI(file, {
          apiKey: openAiApiKey,
          onStage: async (stage) => updateOcrJob(id, stage, stage === "PREPROCESSING" ? 45 : stage === "RECOGNIZING" ? 65 : 85),
        });
      } catch (openAiError) {
        const openAiFailureMessage = openAiError instanceof Error ? openAiError.message : String(openAiError);
        console.error(`[expense-evidence] OpenAI vision failed for ${file.name}: ${openAiFailureMessage}`);
        throw new Error("자동인식 서비스에 연결하지 못했습니다. 잠시 후 다시 분석해 주세요.");
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
    if (usedOriginalSource) await supabase.storage.from(job.storage_bucket).remove([sourcePath]);
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
  await requireExpenseFile(storagePath);
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { data, error } = await supabase.storage.from(expenseEvidenceBucket).createSignedUrl(storagePath, 60);
  if (error) throw new Error(`증빙 원본 열기 실패: ${error.message}`);
  return data.signedUrl;
}

export async function deleteExpenseEvidenceAction(storagePath: string) {
  const access = await requireExpenseFile(storagePath, true);
  // A saved attachment is historical evidence. Detach its reference on save; retain its bytes.
  if (access.attached) return;
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { error } = await supabase.storage.from(expenseEvidenceBucket).remove([storagePath, buildExpenseEvidenceOcrSourcePath(storagePath)]);
  if (error) throw new Error(`증빙파일 삭제 실패: ${error.message}`);
}

export async function saveExpenseResolutionAction(resolution: ManagedExpenseResolution) {
  const actor = await requireExpenseActor();
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  if (resolution.approvalStatus !== "작성중") throw new Error("먼저 초안을 저장하고 계정·결재선 연결을 확인한 뒤 승인요청해주세요.");
  const { data: row, error: existingError } = await supabase.schema("finance").from("expense_resolutions").select("id,organization_id,deleted_at").eq("id", resolution.id).maybeSingle();
  if (existingError) throw new Error("기존 결의서를 확인하지 못했습니다.");
  const access = row ? await requireExpenseRecord(resolution.id, true, actor) : null;
  const existingResolution = access?.resolution;
  if (existingResolution?.approvalStatus === "승인완료") throw new Error("승인 완료 문서는 직접 수정할 수 없습니다.");
  if (existingResolution?.createdAt && existingResolution.createdAt !== resolution.createdAt) throw new Error("작성일은 임의로 변경할 수 없습니다.");
  resolution = { ...resolution, author: existingResolution?.author ?? actor.display_name };
  if (!row) resolution = { ...resolution, createdAt: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }) };
  if (resolution.bankTransactionId) await assertExpenseRelatedRow("bank_transactions", resolution.bankTransactionId, actor);
  if (resolution.cardTransactionId) await assertExpenseRelatedRow("corporate_card_transactions", resolution.cardTransactionId, actor);
  if (resolution.approvalDocumentId) await assertExpenseRelatedRow("documents", resolution.approvalDocumentId, actor, "approval");
  if (resolution.vendorId) await assertExpenseRelatedRow("business_partners", resolution.vendorId, actor);
  if (resolution.originalResolutionId) await requireExpenseRecord(resolution.originalResolutionId, false, actor);
  for (const file of resolution.evidenceFiles ?? []) {
    if (file.storageBucket !== expenseEvidenceBucket) throw new Error("지출 증빙 저장소가 일치하지 않습니다.");
    await requireExpenseFile(file.storagePath);
  }
  if (resolution.bankTransactionId) {
    const { data: linked, error: linkedError } = await supabase.schema("finance").from("expense_resolutions").select("id,resolution_no").eq("bank_transaction_id", resolution.bankTransactionId).neq("id", resolution.id).is("deleted_at", null).maybeSingle();
    if (linkedError) throw new Error(`통장거래 중복연결 확인 실패: ${linkedError.message}`);
    if (linked) throw new Error(`이미 ${linked.resolution_no} 결의서에 연결된 통장거래입니다.`);
  }
  if (resolution.cardTransactionId) {
    const { data: linkedCard, error: linkedCardError } = await supabase.schema("finance").from("corporate_card_transactions").select("linked_resolution_id").eq("id", resolution.cardTransactionId).maybeSingle();
    if (linkedCardError) throw new Error(`법인카드 거래 중복연결 확인 실패: ${linkedCardError.message}`);
    if (linkedCard?.linked_resolution_id && linkedCard.linked_resolution_id !== resolution.id) throw new Error("이미 다른 지출결의서에 연결된 법인카드 거래입니다.");
  }
  if (resolution.expenseKind) {
    resolution = { ...resolution, evidenceStatus: normalizeEvidenceStatus(resolution.evidenceKind ?? "NONE", resolution.evidenceStatus ?? "NONE") };
  }
  const saved = await upsertExpenseResolutionInSupabase(resolution, existingResolution ?? null, randomUUID());
  revalidatePath("/finance/expense-resolutions");
  revalidatePath("/finance/exp");
  revalidatePath("/finance/approval-inbox");
  return saved;
}

export async function deleteExpenseResolutionAction(resolutionId: string, _actorLabel: string) {
  void _actorLabel;
  const { resolution, binding } = await requireExpenseRecord(resolutionId, true);
  await commitExpenseCommand("DELETE", resolutionId, resolution, { reason: "작성자 요청 삭제", expected_binding_version: binding?.version ?? 0 }, randomUUID());
  revalidatePath("/finance/expense-resolutions");
}

export async function saveExpenseFactConfirmationAction(input: ExpenseFactConfirmationInput) {
  const { actor, resolution, binding } = await requireExpenseRecord(input.resolutionId, true);
  if (input.id) await requireExpenseFact(input.id, input.resolutionId, true);
  if (input.detailTransactionId) {
    const { data, error } = await getSupabaseServerClient()!.schema("finance").from("expense_detail_transactions").select("id").eq("id", input.detailTransactionId).eq("resolution_id", input.resolutionId).is("deleted_at", null).maybeSingle();
    if (error || !data) throw new Error("해당 결의서의 상세 거래가 아닙니다.");
  }
  if (input.confirmerLabel || input.electronicConfirmation && Object.keys(input.electronicConfirmation).length) throw new Error("사실확인 서명은 계정 기반 확인 절차가 연결된 후 사용할 수 있습니다. 초안은 저장할 수 있습니다.");
  const draft = { ...input, authorLabel: actor.display_name };
  delete draft.confirmerLabel;
  delete draft.electronicConfirmation;
  const { id } = await commitExpenseCommand("FACT_SAVE", input.resolutionId, resolution, { input: draft, expected_binding_version: binding?.version ?? 0 }, randomUUID()) as { id: string };
  revalidatePath("/finance/expense-resolutions");
  return id;
}

export async function listExpenseFactConfirmationsAction(resolutionId: string) {
  await requireExpenseRecord(resolutionId);
  return listExpenseFactConfirmations(resolutionId);
}

export async function deleteExpenseFactConfirmationAction(id: string, resolutionId: string, _actorLabel: string) {
  void _actorLabel;
  const { resolution, binding } = await requireExpenseFact(id, resolutionId, true);
  await commitExpenseCommand("FACT_DELETE", resolutionId, resolution, { input: { id, resolutionId }, expected_binding_version: binding?.version ?? 0 }, randomUUID());
  revalidatePath("/finance/expense-resolutions");
}

export async function uploadExpenseFactSupportingFileAction(formData: FormData) {
  const file = formData.get("file");
  const factConfirmationId = String(formData.get("factConfirmationId") ?? "");
  const resolutionId = String(formData.get("resolutionId") ?? "");
  const { actor } = await requireExpenseFact(factConfirmationId, resolutionId, true);
  const currentUserLabel = actor.display_name;
  if (!(file instanceof File) || !file.size) throw new Error("보완자료 파일을 선택해주세요.");
  if (!factConfirmationId || !resolutionId) throw new Error("지출사실확인서를 먼저 저장해주세요.");
  if (file.size > maxEvidenceFileSize) throw new Error("보완자료는 10MB 이하만 업로드할 수 있습니다.");
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const id = randomUUID();
  const storagePath = `fact-confirmations/${resolutionId}/${factConfirmationId}/${id}-${file.name.replace(/[^\dA-Za-z가-힣._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from(expenseEvidenceBucket).upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(`보완자료 저장 실패: ${uploadError.message}`);
  const { error: rowError } = await supabase.schema("finance").from("expense_supporting_files").insert({ fact_confirmation_id: factConfirmationId, id, original_filename: file.name, resolution_id: resolutionId, storage_bucket: expenseEvidenceBucket, storage_path: storagePath, uploaded_by_label: currentUserLabel });
  if (rowError) { await supabase.storage.from(expenseEvidenceBucket).remove([storagePath]); throw new Error(`보완자료 연결 실패: ${rowError.message}`); }
  const { error: auditError } = await supabase.schema("finance").from("expense_workflow_audit_logs").insert({ action: "FACT_SUPPORTING_FILE_ATTACHED", actor_label: currentUserLabel, after_data: { factConfirmationId, fileName: file.name, storagePath }, resolution_id: resolutionId });
  if (auditError) throw new Error(`감사로그 저장 실패: ${auditError.message}`);
  revalidatePath("/finance/expense-resolutions");
  return { fileName: file.name, id };
}

export async function linkBankTransactionAction(input: { bankTransactionId: string; resolutionId: string; actorLabel: string }) {
  const { actor, resolution, binding } = await requireExpenseRecord(input.resolutionId, true);
  await assertExpenseRelatedRow("bank_transactions", input.bankTransactionId, actor);
  const { data: transaction, error } = await getSupabaseServerClient()!.schema("finance").from("bank_transactions").select("transacted_at,withdrawal_amount").eq("id", input.bankTransactionId).eq("organization_id", actor.organization_id).single();
  if (error || !transaction || Number(transaction.withdrawal_amount) <= 0) throw new Error("연결할 통장 출금거래를 찾을 수 없습니다.");
  const actualExpenseDate = new Date(transaction.transacted_at).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  await upsertExpenseResolutionInSupabase({ ...resolution, authorization: binding, actualExpenseDate, bankTransactionId: input.bankTransactionId, expenseKind: "BANK_POST_APPROVAL", isPostApproval: true, approvalStatus: "작성중", currentApprover: undefined, approvedAt: undefined, approvalLine: resolution.approvalLine.map((step) => ({ ...step, status: "대기", processedAt: undefined })) }, resolution, randomUUID());
  revalidatePath("/finance/expense-resolutions");
  revalidatePath("/finance/bank-transactions");
  return { actualExpenseDate, withdrawalAmount: Number(transaction.withdrawal_amount) };
}

export async function saveExpenseComplianceSettingsAction(organizationId: string, settings: ExpenseComplianceSettings) {
  const actor = await requireExpenseActor("ADMIN");
  if (organizationId !== actor.organization_id) throw new Error("다른 조합의 설정은 변경할 수 없습니다.");
  await saveExpenseComplianceSettings(actor.organization_id, settings);
  revalidatePath("/finance/expense-resolutions");
}

export async function transitionExpenseApprovalAction(input: ApprovalTransitionRequest) {
  const { actor, resolution: current, binding } = await requireExpenseRecord(input.resolutionId);
  if (current.approvalStatus !== input.expectedStatus || current.currentApprover !== input.expectedCurrentApprover)
    throw new Error("다른 사용자가 먼저 결재 상태를 변경했습니다. 목록을 새로고침해주세요.");
  if (!binding?.author_user_id || binding.steps.length !== current.approvalLine.length)
    throw new Error("작성자와 결재선의 로그인 계정 연결을 먼저 확인해주세요.");
  if (input.expectedAuthorizationVersion !== binding.version) throw new Error("계정 연결 또는 결의 내용이 변경되었습니다. 다시 조회해주세요.");
  const index = current.approvalLine.findIndex(step => step.status === "결재대기");
  const assigned = binding.steps.find(step => step.order === index + 1);
  if (input.command === "REQUEST" && binding.author_user_id !== actor.user_id) throw new Error("연결된 작성자만 승인요청할 수 있습니다.");
  if (["APPROVE", "REJECT"].includes(input.command) && assigned?.approver_user_id !== actor.user_id) throw new Error("현재 순서에 연결된 결재자만 처리할 수 있습니다.");
  if (input.command === "CANCEL" && !actor.permissions.includes("ADMIN")) throw new Error("승인취소는 관리자만 처리할 수 있습니다.");
  const settings = await getExpenseComplianceSettings(actor.organization_id);
  const isFinal = index === current.approvalLine.length - 1;
  const workflowCurrent = current;
  if (input.command === "REQUEST" || input.command === "APPROVE" && isFinal) {
    if (input.command === "REQUEST") {
      const validation = validateExpenseResolutionWorkflow({ ...current,
        accountAllocationTotal: current.resolutionType === "BATCH" ? undefined : current.accountAllocations?.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
        evidenceCount: current.evidenceFiles?.length ?? 0,
        invalidItemCount: current.resolutionType === "BATCH" ? undefined : current.singleItems?.filter(item => !item.itemName.trim() || Number(item.quantity) <= 0 || Number(item.unitPrice) < 0).length,
        itemCount: current.resolutionType === "BATCH" ? current.expenseItems.length : current.singleItems?.length ?? 0 });
      if (validation.errors.length) throw new Error(validation.errors.join(" "));
    }
    if (current.cardReconciliationStatus === "PENDING" && !current.cardTransactionId) throw new Error("실제 법인카드 승인내역을 연결한 후 승인요청할 수 있습니다.");
    if (current.approvalDocumentId) await assertExpenseRelatedRow("documents", current.approvalDocumentId, actor, "approval");
    await validateDirectExpenseGovernance(current, settings);
  }
  if (input.command === "APPROVE" && isFinal && current.evidenceStatus === "NONE") {
    if (settings && !settings.allowNoEvidenceApproval) throw new Error("설정에 따라 증빙 없는 지출은 승인할 수 없습니다.");
    if (settings?.noEvidenceApproverRole && assigned?.legacy_step.role !== settings.noEvidenceApproverRole) throw new Error("증빙 없는 지출의 지정 결재 역할을 확인해주세요.");
  }
  // UUID authorizes execution. Legacy labels are used only by the compatibility state calculator.
  const legacyLabel = input.command === "REQUEST" ? current.author : input.command === "CANCEL" ? actor.display_name : current.currentApprover!;
  const transitioned = transitionExpenseApproval({ actorLabel: legacyLabel, command: input.command, reason: input.reason, resolution: workflowCurrent });
  const history = transitioned.history.map((item, i) => i < current.history.length ? item : { ...item, actorName: actor.display_name, actorTitle: "" });
  const saved = await commitExpenseCommand("APPROVAL", input.resolutionId, current, {
    command: input.command, after: { ...transitioned, history }, reason: input.reason,
    expected_binding_version: binding.version,
  }, randomUUID());
  revalidatePath("/finance/expense-resolutions");
  revalidatePath("/finance/approval-inbox");
  revalidatePath("/finance/workspace");
  return saved as ManagedExpenseResolution;
}

export async function transitionExpenseDisbursementAction(input: DisbursementTransitionRequest) {
  const actor = await requireExpenseActor("PAY");
  await requireExpenseRecord(input.resolutionId, false, actor);
  input = { ...input, actorLabel: actor.display_name };
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  if (!input.idempotencyKey.trim()) throw new Error("지급 처리키가 필요합니다.");

  if (["VOUCHER_CREATE", "VOUCHER_CONFIRM", "VOUCHER_CANCEL"].includes(input.command)) {
    // Check before legacy operation/source writes; managed drafts have one atomic owner.
    await assertLegacyVoucherEditable(input.resolutionId);
  }

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
      .eq("resolution_id", input.resolutionId)
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
    const governedCurrent = ["PAYMENT_COMPLETE", "ITEM_PAYMENT_COMPLETE"].includes(input.command) ? await validateDirectExpenseGovernance(current) : current;
    const transitioned = transitionExpenseDisbursement({
      ...input,
      resolution: governedCurrent,
      voucherNo: input.command === "VOUCHER_CREATE" ? await getNextVoucherNo() : undefined,
    });
    const saved = await updateExpenseDisbursementInSupabase(transitioned, {
      paymentStatus: input.expectedPaymentStatus,
      voucherStatus: input.expectedVoucherStatus,
    });
    if (input.command === "VOUCHER_CREATE" || input.command === "VOUCHER_CONFIRM" || input.command === "VOUCHER_CANCEL") await syncExpenseVoucherRecords(supabase, current, saved, input.command);
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

async function syncExpenseVoucherRecords(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>, before: ManagedExpenseResolution, afterResolution: ManagedExpenseResolution, command: "VOUCHER_CREATE" | "VOUCHER_CONFIRM" | "VOUCHER_CANCEL") {
  const targets = afterResolution.resolutionType === "BATCH" && afterResolution.voucherCreationMode === "ITEM_VOUCHER"
    ? afterResolution.expenseItems.filter((item) => item.voucherNo).map((item) => ({ amount: item.totalAmount, detailTransactionId: item.id, description: item.itemTitle, voucherNo: item.voucherNo! }))
    : afterResolution.voucherNo ? [{ amount: afterResolution.totalPaymentAmount, detailTransactionId: null, description: afterResolution.subject || afterResolution.reason, voucherNo: afterResolution.voucherNo }] : [];
  if (!targets.length) throw new Error("동기화할 지출전표 번호가 없습니다.");
  const voucherNumbers = [...new Set(targets.map((target) => target.voucherNo))];
  if (command !== "VOUCHER_CREATE") {
    const approvalStatus = command === "VOUCHER_CONFIRM" ? "승인완료" : "취소";
    const { error } = await supabase.schema("finance").from("vouchers").update({ approval_status: approvalStatus, updated_at: new Date().toISOString() }).eq("expense_resolution_id", afterResolution.id).in("voucher_no", voucherNumbers);
    if (error) throw new Error(`지출전표 상태 동기화 실패: ${error.message}`);
    return;
  }
  const { data: resolutionRow, error: resolutionError } = await supabase.schema("finance").from("expense_resolutions").select("organization_id").eq("id", afterResolution.id).single();
  if (resolutionError) throw new Error(`전표 조직정보 조회 실패: ${resolutionError.message}`);
  for (const [index, target] of targets.entries()) {
    const { data: voucher, error: voucherError } = await supabase.schema("finance").from("vouchers").upsert({
      approval_status: "승인대기",
      bank_transaction_id: index === 0 ? afterResolution.bankTransactionId ?? null : null,
      detail_transaction_id: target.detailTransactionId,
      expense_resolution_id: afterResolution.id,
      memo: `${afterResolution.resolutionNo} · ${target.description}`,
      organization_id: resolutionRow.organization_id,
      updated_at: new Date().toISOString(),
      voucher_date: afterResolution.accountingDate ?? afterResolution.actualExpenseDate ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }),
      voucher_no: target.voucherNo,
    }, { onConflict: "organization_id,voucher_no" }).select("id").single();
    if (voucherError) throw new Error(`지출전표 헤더 저장 실패: ${voucherError.message}`);
    const { error: removeLineError } = await supabase.schema("finance").from("voucher_lines").delete().eq("voucher_id", voucher.id);
    if (removeLineError) throw new Error(`기존 분개행 정리 실패: ${removeLineError.message}`);
    const { error: lineError } = await supabase.schema("finance").from("voucher_lines").insert([
      { account_subject_id: null, credit_amount: 0, debit_amount: target.amount, description: target.description, sort_order: 1, voucher_id: voucher.id },
      { account_subject_id: null, credit_amount: target.amount, debit_amount: 0, description: afterResolution.expenseKind === "BANK_POST_APPROVAL" ? "연결 통장 출금" : before.paymentAccountNo || "지급계정", sort_order: 2, voucher_id: voucher.id },
    ]);
    if (lineError) throw new Error(`지출전표 분개행 저장 실패: ${lineError.message}`);
  }
}

async function getNextVoucherNo() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const year = new Date().getFullYear();
  const prefix = `지출-${year}-`;
  const [voucherResult, resolutionResult] = await Promise.all([
    supabase.schema("finance").from("vouchers").select("voucher_no").like("voucher_no", `${prefix}%`).limit(2000),
    supabase.schema("finance").from("expense_resolutions").select("voucher_no").like("voucher_no", `${prefix}%`).limit(2000),
  ]);
  if (voucherResult.error || resolutionResult.error) throw new Error(`전표번호 생성 실패: ${voucherResult.error?.message ?? resolutionResult.error?.message}`);
  const last = [...(voucherResult.data ?? []), ...(resolutionResult.data ?? [])].reduce((max, row) => {
    const sequence = Number(row.voucher_no?.match(new RegExp(`^${prefix}(\\d{4})`))?.[1] ?? 0);
    return Math.max(max, sequence);
  }, 0);
  return `${prefix}${String(last + 1).padStart(4, "0")}`;
}
