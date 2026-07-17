import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AccountAllocation, BatchExpenseItem, ManagedExpenseResolution, SingleExpenseItem } from "./expense-resolution-page";
import type { ExpenseEvidenceAttachment } from "./expense-evidence";
import { normalizeExpenseTiming, normalizeInputMethod, normalizeResolutionMode } from "./expense-resolution-domain";

export const expenseResolutionRepositorySchema = "finance";

type ExpenseResolutionRow = {
  resolution_data: ManagedExpenseResolution;
};

type ExpenseResolutionItemRow = {
  item_data: BatchExpenseItem | SingleExpenseItem;
  item_kind: "BATCH" | "SINGLE";
  item_no: number;
  resolution_id: string;
};

type ExpenseAccountAllocationRow = {
  allocation_data: AccountAllocation;
  resolution_id: string;
};

type ExpenseEvidenceRow = {
  attachment_data?: ExpenseEvidenceAttachment;
  content_type: string;
  evidence_type: string;
  file_size: number;
  id: string;
  item_id: string | null;
  ocr_data: ExpenseEvidenceAttachment["ocrData"];
  ocr_status: ExpenseEvidenceAttachment["ocrStatus"];
  original_filename: string;
  resolution_id: string;
  storage_bucket: string;
  storage_path: string;
  uploaded_at: string;
  uploaded_by_label: string;
};

const expenseResolutionSelect = "resolution_data";

export function mapExpenseResolutionToUpsert(resolution: ManagedExpenseResolution, organizationId?: string) {
  return {
    ...(organizationId ? { organization_id: organizationId } : {}),
    id: resolution.id,
    resolution_no: resolution.resolutionNo,
    author_label: resolution.author,
    current_approver_label: resolution.currentApprover ?? null,
    approval_status: resolution.approvalStatus,
    payment_status: resolution.paymentStatus,
    resolution_mode: normalizeResolutionMode(resolution),
    expense_timing: normalizeExpenseTiming(resolution),
    input_method: normalizeInputMethod(resolution),
    execution_method: resolution.executionMethod ?? null,
    expense_burden_type: resolution.expenseBurdenType ?? null,
    original_resolution_id: resolution.originalResolutionId ?? null,
    settlement_due_date: resolution.settlementDueDate ?? null,
    settlement_manager_label: resolution.settlementManager ?? null,
    project_name: resolution.projectName || null,
    subject: resolution.subject || null,
    total_payment_amount: resolution.totalPaymentAmount,
    actual_paid_amount: resolution.actualPaidAmount ?? null,
    settlement_status: resolution.settlementStatus,
    voucher_no: resolution.voucherNo ?? null,
    voucher_status: resolution.voucherStatus ?? null,
    expense_kind: resolution.expenseKind ?? "GENERAL",
    accounting_date: resolution.accountingDate ?? null,
    actual_expense_date: resolution.actualExpenseDate ?? null,
    drafted_at: resolution.draftedAt ?? resolution.createdAt,
    approved_at: resolution.approvedAt ?? null,
    disbursed_at: resolution.disbursedAt ?? resolution.paidAt ?? null,
    is_post_approval: resolution.isPostApproval ?? resolution.expenseKind === "BANK_POST_APPROVAL",
    post_approval_reason: resolution.postApprovalReason ?? null,
    evidence_kind: resolution.evidenceKind ?? "NONE",
    evidence_status: resolution.evidenceStatus ?? "NONE",
    missing_evidence_reason: resolution.missingEvidenceReason ?? null,
    actual_spender_label: resolution.advancePayer ?? null,
    settlement_recipient_label: resolution.settlementRecipient ?? null,
    settlement_amount: resolution.settlementAmount ?? (resolution.expenseKind === "PERSONAL_REIMBURSEMENT" ? resolution.totalPaymentAmount : null),
    settlement_completed_at: resolution.settlementCompletedAt ?? null,
    bank_transaction_id: resolution.bankTransactionId ?? null,
    resolution_data: resolution,
    updated_at: new Date().toISOString(),
  };
}

export function mapExpenseResolutionItemsToRows(resolution: ManagedExpenseResolution) {
  const batchRows = resolution.expenseItems.map((item, index) => ({
    id: item.id,
    item_data: item,
    item_kind: "BATCH" as const,
    item_no: item.itemNo || index + 1,
    resolution_id: resolution.id,
    supply_amount: Number(item.supplyAmount) || 0,
    total_amount: item.totalAmount,
    updated_at: new Date().toISOString(),
    vat_amount: Number(item.vatAmount) || 0,
  }));
  const singleRows = (resolution.singleItems ?? []).map((item, index) => ({
    id: item.id,
    item_data: item,
    item_kind: "SINGLE" as const,
    item_no: index + 1,
    resolution_id: resolution.id,
    supply_amount: item.supplyAmount,
    total_amount: item.totalAmount,
    updated_at: new Date().toISOString(),
    vat_amount: item.vatAmount,
  }));
  return [...batchRows, ...singleRows];
}

export function mapExpenseAccountAllocationsToRows(resolution: ManagedExpenseResolution) {
  return (resolution.accountAllocations ?? []).map((allocation) => ({
    account_title: allocation.accountTitle,
    allocation_data: allocation,
    amount: Number(allocation.amount) || 0,
    budget_item: allocation.budgetItem || null,
    description: allocation.description || null,
    id: allocation.id,
    item_id: null,
    resolution_id: resolution.id,
    updated_at: new Date().toISOString(),
  }));
}

export function mapExpenseEvidenceToRows(resolution: ManagedExpenseResolution) {
  return (resolution.evidenceFiles ?? []).map((attachment) => ({
    content_type: attachment.contentType,
    evidence_type: attachment.evidenceType,
    file_size: attachment.fileSize,
    id: attachment.id,
    item_id: attachment.itemId ?? null,
    ocr_data: attachment.ocrData,
    ocr_status: attachment.ocrStatus,
    original_filename: attachment.fileName,
    resolution_id: resolution.id,
    storage_bucket: attachment.storageBucket,
    storage_path: attachment.storagePath,
    uploaded_at: attachment.uploadedAt,
    uploaded_by_label: attachment.uploadedBy,
    updated_at: new Date().toISOString(),
  }));
}

export function hydrateExpenseResolutionChildren(
  resolutions: ManagedExpenseResolution[],
  itemRows: ExpenseResolutionItemRow[],
  allocationRows: ExpenseAccountAllocationRow[],
  evidenceRows: ExpenseEvidenceRow[] = [],
) {
  return resolutions.map((resolution) => {
    const matchingItems = itemRows
      .filter((row) => row.resolution_id === resolution.id)
      .sort((first, second) => first.item_no - second.item_no);
    const batchItems = matchingItems.filter((row) => row.item_kind === "BATCH").map((row) => row.item_data as BatchExpenseItem);
    const singleItems = matchingItems.filter((row) => row.item_kind === "SINGLE").map((row) => row.item_data as SingleExpenseItem);
    const accountAllocations = allocationRows
      .filter((row) => row.resolution_id === resolution.id)
      .map((row) => row.allocation_data);
    const evidenceFiles = evidenceRows
      .filter((row) => row.resolution_id === resolution.id)
      .map((row) => ({
        contentType: row.content_type,
        evidenceType: row.evidence_type,
        fileName: row.original_filename,
        fileSize: row.file_size,
        id: row.id,
        itemId: row.item_id ?? undefined,
        ocrData: row.ocr_data,
        ocrStatus: row.ocr_status,
        storageBucket: row.storage_bucket,
        storagePath: row.storage_path,
        uploadedAt: row.uploaded_at,
        uploadedBy: row.uploaded_by_label,
      } satisfies ExpenseEvidenceAttachment));

    return {
      ...resolution,
      accountAllocations: accountAllocations.length ? accountAllocations : resolution.accountAllocations,
      expenseItems: batchItems.length ? batchItems : resolution.expenseItems,
      evidenceAttached: evidenceFiles.length > 0 || resolution.evidenceAttached,
      evidenceFiles: evidenceFiles.length ? evidenceFiles : resolution.evidenceFiles,
      evidenceMaterials: evidenceFiles.length ? evidenceFiles.map((file) => file.fileName) : resolution.evidenceMaterials,
      singleItems: singleItems.length ? singleItems : resolution.singleItems,
    };
  });
}

export async function listExpenseResolutionsFromSupabase(): Promise<ManagedExpenseResolution[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolutions")
    .select(expenseResolutionSelect)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to list expense resolutions: ${error.message}`);
  const resolutions = (data as ExpenseResolutionRow[]).map((row) => row.resolution_data);
  if (!resolutions.length) return [];

  const resolutionIds = resolutions.map((resolution) => resolution.id);
  const [{ data: itemData, error: itemError }, { data: allocationData, error: allocationError }, { data: evidenceData, error: evidenceError }] = await Promise.all([
    supabase
      .schema(expenseResolutionRepositorySchema)
      .from("expense_resolution_items")
      .select("resolution_id,item_kind,item_no,item_data")
      .in("resolution_id", resolutionIds)
      .order("item_no", { ascending: true }),
    supabase
      .schema(expenseResolutionRepositorySchema)
      .from("expense_account_allocations")
      .select("resolution_id,allocation_data")
      .in("resolution_id", resolutionIds)
      .order("created_at", { ascending: true }),
    supabase
      .schema(expenseResolutionRepositorySchema)
      .from("expense_resolution_evidence")
      .select("id,resolution_id,item_id,evidence_type,storage_bucket,storage_path,original_filename,content_type,file_size,ocr_status,ocr_data,uploaded_by_label,uploaded_at")
      .in("resolution_id", resolutionIds)
      .order("uploaded_at", { ascending: true }),
  ]);
  if (itemError) throw new Error(`Failed to list expense resolution items: ${itemError.message}`);
  if (allocationError) throw new Error(`Failed to list expense account allocations: ${allocationError.message}`);
  if (evidenceError) throw new Error(`Failed to list expense evidence: ${evidenceError.message}`);
  return hydrateExpenseResolutionChildren(
    resolutions,
    (itemData ?? []) as ExpenseResolutionItemRow[],
    (allocationData ?? []) as ExpenseAccountAllocationRow[],
    (evidenceData ?? []) as ExpenseEvidenceRow[],
  );
}

export async function getExpenseResolutionSnapshotFromSupabase(id: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolutions")
    .select(expenseResolutionSelect)
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw new Error(`Failed to load expense resolution: ${error.message}`);
  return (data as ExpenseResolutionRow).resolution_data;
}

export async function updateExpenseResolutionWorkflowInSupabase(
  resolution: ManagedExpenseResolution,
  expected: { approvalStatus: ManagedExpenseResolution["approvalStatus"]; currentApprover?: string },
) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  let query = supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolutions")
    .update(mapExpenseResolutionToUpsert(resolution))
    .eq("id", resolution.id)
    .eq("approval_status", expected.approvalStatus);
  query = expected.currentApprover
    ? query.eq("current_approver_label", expected.currentApprover)
    : query.is("current_approver_label", null);
  const { data, error } = await query.select(expenseResolutionSelect).maybeSingle();
  if (error) throw new Error(`Failed to transition expense resolution: ${error.message}`);
  if (!data) throw new Error("다른 사용자가 먼저 결재 상태를 변경했습니다. 목록을 새로고침해주세요.");
  return (data as ExpenseResolutionRow).resolution_data;
}

export async function updateExpenseDisbursementInSupabase(
  resolution: ManagedExpenseResolution,
  expected: { paymentStatus: ManagedExpenseResolution["paymentStatus"]; voucherStatus?: ManagedExpenseResolution["voucherStatus"] },
) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  let query = supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolutions")
    .update(mapExpenseResolutionToUpsert(resolution))
    .eq("id", resolution.id)
    .eq("payment_status", expected.paymentStatus);
  query = expected.voucherStatus ? query.eq("voucher_status", expected.voucherStatus) : query.is("voucher_status", null);
  const { data, error } = await query.select(expenseResolutionSelect).maybeSingle();
  if (error) throw new Error(`Failed to transition expense disbursement: ${error.message}`);
  if (!data) throw new Error("다른 사용자가 먼저 지급 또는 전표 상태를 변경했습니다. 목록을 새로고침해주세요.");
  return (data as ExpenseResolutionRow).resolution_data;
}

export async function upsertExpenseResolutionInSupabase(resolution: ManagedExpenseResolution) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: organization, error: organizationError } = await supabase.schema("finance").from("expense_compliance_settings").select("organization_id").limit(1).maybeSingle();
  if (organizationError) throw new Error(`Failed to resolve expense organization: ${organizationError.message}`);
  if (!organization?.organization_id) throw new Error("지출결의서를 귀속할 활성 조합이 없습니다.");
  const { data, error } = await supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolutions")
    .upsert(mapExpenseResolutionToUpsert(resolution, organization.organization_id), { onConflict: "id" })
    .select(expenseResolutionSelect)
    .single();

  if (error) throw new Error(error.code === "23505" && resolution.bankTransactionId ? "이미 다른 결의서에 연결된 통장거래입니다." : `Failed to save expense resolution: ${error.message}`);

  const itemRows = mapExpenseResolutionItemsToRows(resolution);
  const allocationRows = mapExpenseAccountAllocationsToRows(resolution);
  const evidenceRows = mapExpenseEvidenceToRows(resolution);
  const detailRows = (resolution.pettyCashTransactions ?? []).map((item, index) => {
    const source = resolution.expenseItems.find((expenseItem) => expenseItem.id === item.id) ?? resolution.expenseItems[index];
    return { account_title: item.accountTitle, actual_spender_label: item.spender, amount: item.amount, business_purpose: item.businessPurpose, deleted_at: null, evidence_kind: item.evidenceKind ?? mapDetailEvidenceKind(source?.evidenceType), evidence_status: item.evidenceStatus ?? (source?.evidenceFileName ? "GENERAL" : "NONE"), fact_confirmation_id: item.factConfirmationId ?? null, id: item.id, item_name: item.item, line_no: index + 1, memo: source?.memo || null, payment_method: source?.paymentMethod ?? resolution.advancePaymentMethod ?? resolution.paymentMethod ?? "기타", resolution_id: resolution.id, transaction_date: item.transactionDate, updated_at: new Date().toISOString(), vendor_name: item.vendor };
  });
  const { error: deleteEvidenceError } = await supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolution_evidence")
    .delete()
    .eq("resolution_id", resolution.id);
  if (deleteEvidenceError) throw new Error(`Failed to replace expense evidence: ${deleteEvidenceError.message}`);
  const { error: deleteAllocationError } = await supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_account_allocations")
    .delete()
    .eq("resolution_id", resolution.id);
  if (deleteAllocationError) throw new Error(`Failed to replace expense account allocations: ${deleteAllocationError.message}`);

  const { error: deleteItemError } = await supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolution_items")
    .delete()
    .eq("resolution_id", resolution.id);
  if (deleteItemError) throw new Error(`Failed to replace expense resolution items: ${deleteItemError.message}`);
  const { data: existingDetails, error: existingDetailError } = await supabase.schema(expenseResolutionRepositorySchema).from("expense_detail_transactions").select("id").eq("resolution_id", resolution.id).is("deleted_at", null);
  if (existingDetailError) throw new Error(`소액경비 상세거래 조회 실패: ${existingDetailError.message}`);
  for (const [index, detail] of (existingDetails ?? []).entries()) {
    const { error: parkError } = await supabase.schema(expenseResolutionRepositorySchema).from("expense_detail_transactions").update({ line_no: 100_000 + index, updated_at: new Date().toISOString() }).eq("id", detail.id);
    if (parkError) throw new Error(`소액경비 상세거래 순번 준비 실패: ${parkError.message}`);
  }
  const currentDetailIds = new Set(detailRows.map((row) => row.id));
  const removedDetailIds = (existingDetails ?? []).map((row) => row.id).filter((id) => !currentDetailIds.has(id));
  if (removedDetailIds.length) {
    const { error: deleteDetailError } = await supabase.schema(expenseResolutionRepositorySchema).from("expense_detail_transactions").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in("id", removedDetailIds);
    if (deleteDetailError) throw new Error(`소액경비 상세거래 삭제 실패: ${deleteDetailError.message}`);
  }

  if (itemRows.length) {
    const { error: itemError } = await supabase.schema(expenseResolutionRepositorySchema).from("expense_resolution_items").insert(itemRows);
    if (itemError) throw new Error(`Failed to save expense resolution items: ${itemError.message}`);
  }
  if (allocationRows.length) {
    const { error: allocationError } = await supabase
      .schema(expenseResolutionRepositorySchema)
      .from("expense_account_allocations")
      .insert(allocationRows);
    if (allocationError) throw new Error(`Failed to save expense account allocations: ${allocationError.message}`);
  }
  if (evidenceRows.length) {
    const { error: evidenceError } = await supabase
      .schema(expenseResolutionRepositorySchema)
      .from("expense_resolution_evidence")
      .insert(evidenceRows);
    if (evidenceError) throw new Error(`Failed to save expense evidence: ${evidenceError.message}`);
  }
  if (detailRows.length) {
    const { error: detailError } = await supabase.schema(expenseResolutionRepositorySchema).from("expense_detail_transactions").upsert(detailRows, { onConflict: "id" });
    if (detailError) throw new Error(`소액경비 상세거래 저장 실패: ${detailError.message}`);
  }
  return (data as ExpenseResolutionRow).resolution_data;
}

function mapDetailEvidenceKind(value?: string) {
  if (!value) return "NONE";
  if (value.includes("세금계산서")) return "E_TAX_INVOICE";
  if (value.includes("계산서")) return "INVOICE";
  if (value.includes("카드")) return "CARD_RECEIPT";
  if (value.includes("현금영수증")) return "CASH_RECEIPT";
  if (value.includes("이체")) return "BANK_TRANSFER";
  return "OTHER_ALTERNATIVE";
}
