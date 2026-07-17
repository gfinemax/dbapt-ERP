"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ensureBusinessPartnerFromOcrInSupabase } from "@/features/basic-info/business-partner-repository";
import type { BusinessPartnerOcrInput } from "@/features/basic-info/business-partner-data";
import { inferEvidenceType, type EvidenceOcrJobProgress, type EvidenceOcrJobStage, type ExpenseEvidenceAttachment } from "@/features/finance/expense-evidence";
import { extractExpenseEvidenceFile } from "@/features/finance/expense-evidence-ocr.server";
import { extractExpenseEvidenceWithOpenAI } from "@/features/finance/expense-evidence-openai.server";
import { compressExpenseEvidenceFile } from "@/features/finance/expense-evidence-compression.server";
import { buildExpenseEvidenceOcrSourcePath, buildExpenseEvidenceStoragePath } from "@/features/finance/expense-evidence-storage";
import { getExpenseResolutionSnapshotFromSupabase, updateExpenseDisbursementInSupabase, updateExpenseResolutionWorkflowInSupabase, upsertExpenseResolutionInSupabase } from "@/features/finance/expense-resolution-repository";
import { transitionExpenseApproval, type ApprovalTransitionRequest } from "@/features/finance/expense-approval-workflow";
import { transitionExpenseDisbursement, type DisbursementTransitionRequest } from "@/features/finance/expense-disbursement-workflow";
import { validateExpenseResolutionWorkflow } from "@/features/finance/expense-resolution-domain";
import { normalizeEvidenceStatus, validateExpenseCompliance } from "@/features/finance/expense-compliance";
import { deleteExpenseFactConfirmation, getDefaultOrganizationId, getExpenseComplianceSettings, linkBankTransactionToResolution, listExpenseFactConfirmations, saveExpenseComplianceSettings, saveExpenseFactConfirmation, type ExpenseFactConfirmationInput } from "@/features/finance/expense-compliance-repository";
import type { ExpenseComplianceSettings } from "@/features/finance/expense-compliance";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";

const expenseEvidenceBucket = "expense-evidence";
const currentUserLabel = "오학동 사무장";
const maxEvidenceFileSize = 10 * 1024 * 1024;
const acceptedEvidenceTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv"]);

export async function ensureBusinessPartnerFromOcrAction(input: BusinessPartnerOcrInput) {
  const result = await ensureBusinessPartnerFromOcrInSupabase(input);
  revalidatePath("/basic-info");
  revalidatePath("/finance/expense-resolutions");
  return result;
}

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
  const ocrSourcePath = buildExpenseEvidenceOcrSourcePath(storagePath);
  const { error } = await supabase.storage.from(expenseEvidenceBucket).upload(storagePath, storedFile, {
    cacheControl: "3600",
    contentType: storedFile.type,
    upsert: false,
  });
  if (error) throw new Error(`증빙파일 저장 실패: ${error.message}`);
  const usesVisionOcr = file.type === "application/pdf" || file.type.startsWith("image/");
  if (usesVisionOcr) {
    const { error: sourceError } = await supabase.storage.from(expenseEvidenceBucket).upload(ocrSourcePath, file, {
      cacheControl: "60",
      contentType: file.type,
      upsert: false,
    });
    if (sourceError) {
      await supabase.storage.from(expenseEvidenceBucket).remove([storagePath]);
      throw new Error(`OCR 원본 준비 실패: ${sourceError.message}`);
    }
  }
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
    await supabase.storage.from(expenseEvidenceBucket).remove(usesVisionOcr ? [storagePath, ocrSourcePath] : [storagePath]);
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
    const sourcePath = buildExpenseEvidenceOcrSourcePath(job.storage_path);
    let { data: blob, error: downloadError } = await supabase.storage.from(job.storage_bucket).download(sourcePath);
    const usedOriginalSource = !downloadError && Boolean(blob);
    if (downloadError || !blob) {
      ({ data: blob, error: downloadError } = await supabase.storage.from(job.storage_bucket).download(job.storage_path));
    }
    if (downloadError || !blob) throw new Error(`증빙파일 읽기 실패: ${downloadError?.message ?? "파일이 없습니다."}`);
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
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { data, error } = await supabase.storage.from(expenseEvidenceBucket).createSignedUrl(storagePath, 60);
  if (error) throw new Error(`증빙 원본 열기 실패: ${error.message}`);
  return data.signedUrl;
}

export async function deleteExpenseEvidenceAction(storagePath: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { error } = await supabase.storage.from(expenseEvidenceBucket).remove([storagePath, buildExpenseEvidenceOcrSourcePath(storagePath)]);
  if (error) throw new Error(`증빙파일 삭제 실패: ${error.message}`);
}

export async function saveExpenseResolutionAction(resolution: ManagedExpenseResolution) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { data: existing, error: existingError } = await supabase.schema("finance").from("expense_resolutions").select("approval_status,resolution_data").eq("id", resolution.id).is("deleted_at", null).maybeSingle();
  if (existingError) throw new Error(`기존 결의서 확인 실패: ${existingError.message}`);
  if (existing?.approval_status === "승인완료") throw new Error("승인 완료 문서는 직접 수정할 수 없습니다. 승인취소 또는 정정결의를 진행해주세요.");
  const existingResolution = existing?.resolution_data as ManagedExpenseResolution | undefined;
  if (existingResolution?.createdAt && existingResolution.createdAt !== resolution.createdAt) throw new Error("작성일은 임의로 변경할 수 없습니다.");
  if (!existing) resolution = { ...resolution, createdAt: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }), draftedAt: new Date().toISOString() };
  if (resolution.bankTransactionId) {
    const { data: linked, error: linkedError } = await supabase.schema("finance").from("expense_resolutions").select("id,resolution_no").eq("bank_transaction_id", resolution.bankTransactionId).neq("id", resolution.id).is("deleted_at", null).maybeSingle();
    if (linkedError) throw new Error(`통장거래 중복연결 확인 실패: ${linkedError.message}`);
    if (linked) throw new Error(`이미 ${linked.resolution_no} 결의서에 연결된 통장거래입니다.`);
  }
  if (resolution.expenseKind) {
    let settings: ExpenseComplianceSettings | undefined;
    try {
      const organizationId = await getDefaultOrganizationId();
      settings = organizationId ? await getExpenseComplianceSettings(organizationId) ?? undefined : undefined;
    } catch (error) {
      console.warn(`[expense-compliance] Settings unavailable; defaults applied: ${error instanceof Error ? error.message : String(error)}`);
    }
    const compliance = validateExpenseCompliance({ actualExpenseDate: resolution.actualExpenseDate, bankTransactionId: resolution.bankTransactionId, evidenceKind: resolution.evidenceKind ?? "NONE", evidenceStatus: resolution.evidenceStatus ?? "NONE", expenseKind: resolution.expenseKind, missingEvidenceReason: resolution.missingEvidenceReason, pettyCashItems: resolution.pettyCashTransactions, postApprovalReason: resolution.postApprovalReason, settings });
    if (resolution.approvalStatus === "승인대기" && compliance.errors.length) throw new Error(compliance.errors.join(" "));
    resolution = { ...resolution, evidenceStatus: normalizeEvidenceStatus(resolution.evidenceKind ?? "NONE", resolution.evidenceStatus ?? "NONE") };
  }
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
  if (existingResolution?.bankTransactionId && existingResolution.bankTransactionId !== resolution.bankTransactionId) {
    const { error: unlinkError } = await supabase.schema("finance").from("bank_transactions").update({ resolution_status: "UNRESOLVED" }).eq("id", existingResolution.bankTransactionId);
    if (unlinkError) throw new Error(`기존 통장거래 연결해제 실패: ${unlinkError.message}`);
    const { error: unlinkAuditError } = await supabase.schema("finance").from("expense_workflow_audit_logs").insert({ action: "BANK_TRANSACTION_UNLINKED", actor_label: resolution.author, before_data: { bankTransactionId: existingResolution.bankTransactionId }, after_data: { bankTransactionId: resolution.bankTransactionId ?? null }, resolution_id: resolution.id });
    if (unlinkAuditError) throw new Error(`통장거래 연결해제 감사로그 저장 실패: ${unlinkAuditError.message}`);
  }
  if (resolution.bankTransactionId) {
    const bankResolutionStatus = resolution.approvalStatus === "승인완료" ? "APPROVED" : resolution.evidenceStatus === "NONE" || resolution.evidenceStatus === "DEFICIENT" ? "EVIDENCE_MISSING" : "DRAFTING";
    const { error: bankStatusError } = await supabase.schema("finance").from("bank_transactions").update({ resolution_status: bankResolutionStatus }).eq("id", resolution.bankTransactionId);
    if (bankStatusError) throw new Error(`통장거래 상태 저장 실패: ${bankStatusError.message}`);
  }
  const { error: auditError } = await supabase.schema("finance").from("expense_workflow_audit_logs").insert({ action: existing ? "RESOLUTION_UPDATED" : "RESOLUTION_CREATED", actor_label: resolution.author, before_data: existing?.resolution_data ?? null, after_data: saved, resolution_id: resolution.id });
  if (auditError) throw new Error(`감사로그 저장 실패: ${auditError.message}`);
  const focusedAuditRows: Array<Record<string, unknown>> = [];
  if (existingResolution?.actualExpenseDate !== resolution.actualExpenseDate) focusedAuditRows.push({ action: "ACTUAL_EXPENSE_DATE_CHANGED", actor_label: resolution.author, before_data: { actualExpenseDate: existingResolution?.actualExpenseDate ?? null }, after_data: { actualExpenseDate: resolution.actualExpenseDate ?? null }, resolution_id: resolution.id });
  if (existingResolution?.evidenceStatus !== resolution.evidenceStatus) focusedAuditRows.push({ action: "EVIDENCE_STATUS_CHANGED", actor_label: resolution.author, before_data: { evidenceStatus: existingResolution?.evidenceStatus ?? null }, after_data: { evidenceStatus: resolution.evidenceStatus ?? null }, resolution_id: resolution.id });
  const beforeDetails = new Map((existingResolution?.pettyCashTransactions ?? []).map((item) => [item.id, item]));
  const afterDetails = new Map((resolution.pettyCashTransactions ?? []).map((item) => [item.id, item]));
  for (const [id, item] of afterDetails) {
    const before = beforeDetails.get(id);
    if (!before) focusedAuditRows.push({ action: "PETTY_CASH_DETAIL_CREATED", actor_label: resolution.author, before_data: null, after_data: item, resolution_id: resolution.id });
    else if (JSON.stringify(before) !== JSON.stringify(item)) focusedAuditRows.push({ action: "PETTY_CASH_DETAIL_UPDATED", actor_label: resolution.author, before_data: before, after_data: item, resolution_id: resolution.id });
  }
  for (const [id, item] of beforeDetails) if (!afterDetails.has(id)) focusedAuditRows.push({ action: "PETTY_CASH_DETAIL_DELETED", actor_label: resolution.author, before_data: item, after_data: null, resolution_id: resolution.id });
  if (focusedAuditRows.length) {
    const { error: focusedAuditError } = await supabase.schema("finance").from("expense_workflow_audit_logs").insert(focusedAuditRows);
    if (focusedAuditError) throw new Error(`상세 변경 감사로그 저장 실패: ${focusedAuditError.message}`);
  }
  revalidatePath("/finance/expense-resolutions");
  revalidatePath("/finance/exp");
  revalidatePath("/finance/approval-inbox");
  return saved;
}

export async function deleteExpenseResolutionAction(resolutionId: string, actorLabel: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { data: current, error: loadError } = await supabase.schema("finance").from("expense_resolutions").select("approval_status,bank_transaction_id,resolution_data").eq("id", resolutionId).is("deleted_at", null).single();
  if (loadError || !current) throw new Error("삭제할 지출결의서를 찾을 수 없습니다.");
  if (!["작성중", "반려"].includes(current.approval_status)) throw new Error("작성중 또는 반려 문서만 삭제할 수 있습니다.");
  const deletedAt = new Date().toISOString();
  const { error } = await supabase.schema("finance").from("expense_resolutions").update({ deleted_at: deletedAt }).eq("id", resolutionId);
  if (error) throw new Error(`지출결의서 삭제 실패: ${error.message}`);
  if (current.bank_transaction_id) await supabase.schema("finance").from("bank_transactions").update({ resolution_status: "UNRESOLVED" }).eq("id", current.bank_transaction_id);
  const { error: auditError } = await supabase.schema("finance").from("expense_workflow_audit_logs").insert({ action: "RESOLUTION_DELETED", actor_label: actorLabel, before_data: current.resolution_data, after_data: { deletedAt }, resolution_id: resolutionId });
  if (auditError) throw new Error(`삭제 감사로그 저장 실패: ${auditError.message}`);
  revalidatePath("/finance/expense-resolutions");
  revalidatePath("/finance/exp");
}

export async function saveExpenseFactConfirmationAction(input: ExpenseFactConfirmationInput) {
  if (input.confirmerLabel?.trim()) {
    const organizationId = await getDefaultOrganizationId();
    const settings = organizationId ? await getExpenseComplianceSettings(organizationId) : null;
    if (settings?.factConfirmerRoles?.length && !settings.factConfirmerRoles.some((role) => input.confirmerLabel!.includes(role))) throw new Error(`사실 확인자는 ${settings.factConfirmerRoles.join(", ")} 권한자만 지정할 수 있습니다.`);
  }
  const id = await saveExpenseFactConfirmation(input);
  revalidatePath("/finance/expense-resolutions");
  return id;
}

export async function listExpenseFactConfirmationsAction(resolutionId: string) {
  return listExpenseFactConfirmations(resolutionId);
}

export async function deleteExpenseFactConfirmationAction(id: string, resolutionId: string, actorLabel: string) {
  await deleteExpenseFactConfirmation(id, resolutionId, actorLabel);
  revalidatePath("/finance/expense-resolutions");
}

export async function uploadExpenseFactSupportingFileAction(formData: FormData) {
  const file = formData.get("file");
  const factConfirmationId = String(formData.get("factConfirmationId") ?? "");
  const resolutionId = String(formData.get("resolutionId") ?? "");
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
  const result = await linkBankTransactionToResolution(input);
  revalidatePath("/finance/expense-resolutions");
  revalidatePath("/finance/bank-transactions");
  return result;
}

export async function saveExpenseComplianceSettingsAction(organizationId: string, settings: ExpenseComplianceSettings) {
  await saveExpenseComplianceSettings(organizationId, settings);
  revalidatePath("/finance/expense-resolutions");
}

export async function transitionExpenseApprovalAction(input: ApprovalTransitionRequest) {
  const current = await getExpenseResolutionSnapshotFromSupabase(input.resolutionId);
  if (current.approvalStatus !== input.expectedStatus || current.currentApprover !== input.expectedCurrentApprover) {
    throw new Error("다른 사용자가 먼저 결재 상태를 변경했습니다. 목록을 새로고침해주세요.");
  }
  let workflowCurrent = current;
  let settings: ExpenseComplianceSettings | null = null;
  try {
    const organizationId = await getDefaultOrganizationId();
    settings = organizationId ? await getExpenseComplianceSettings(organizationId) : null;
  } catch (error) {
    console.warn(`[expense-approval] Settings unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (input.command === "REQUEST") {
    const configuredLine = settings?.approvalLine?.map((role) => current.approvalLine.find((step) => step.role === role)).filter((step): step is NonNullable<typeof step> => Boolean(step));
    if (configuredLine?.length) workflowCurrent = { ...current, approvalLine: configuredLine.map((step, index) => ({ ...step, order: index + 1, status: "대기" as const })) };
  }
  const isFinalApprovalStep = workflowCurrent.approvalLine.findIndex((step) => `${step.approver} ${step.role}` === input.actorLabel) === workflowCurrent.approvalLine.length - 1;
  if (input.command === "APPROVE" && workflowCurrent.evidenceStatus === "NONE" && isFinalApprovalStep) {
    if (settings && !settings.allowNoEvidenceApproval) throw new Error("관리자 설정에 따라 증빙 없는 지출은 승인할 수 없습니다.");
    if (settings?.noEvidenceApproverRole && !input.actorLabel.includes(settings.noEvidenceApproverRole)) throw new Error(`증빙 없는 지출은 ${settings.noEvidenceApproverRole} 권한자만 승인할 수 있습니다.`);
  }
  const transitioned = transitionExpenseApproval({
    actorLabel: input.actorLabel,
    command: input.command,
    reason: input.reason,
    resolution: workflowCurrent,
  });
  const saved = await updateExpenseResolutionWorkflowInSupabase(transitioned, {
    approvalStatus: input.expectedStatus,
    currentApprover: input.expectedCurrentApprover,
  });
  const approvalSupabase = getSupabaseServerClient();
  if (!approvalSupabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { error: approvalAuditError } = await approvalSupabase.schema("finance").from("expense_workflow_audit_logs").insert({ action: `APPROVAL_${input.command}`, actor_label: input.actorLabel, before_data: current, after_data: saved, resolution_id: input.resolutionId });
  if (approvalAuditError) throw new Error(`결재 감사로그 저장 실패: ${approvalAuditError.message}`);
  if (saved.approvalStatus === "승인완료" && saved.bankTransactionId) {
    const { error } = await approvalSupabase.schema("finance").from("bank_transactions").update({ resolution_status: "APPROVED" }).eq("id", saved.bankTransactionId);
    if (error) throw new Error(`통장거래 결재상태 저장 실패: ${error.message}`);
  }
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
