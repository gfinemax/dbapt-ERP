import { getSupabaseServerClient } from "@/lib/supabase/server";
import { expenseBinding, isMissingExpenseBinding, requireExpenseActor, requireExpenseRecord } from "./expense-authorization";
import type { ExpenseAuthorization } from "./expense-authorization";
import type { AccountAllocation, BatchExpenseItem, ManagedExpenseResolution, SingleExpenseItem } from "./expense-resolution-page";
import type { ExpenseEvidenceAttachment } from "./expense-evidence";
import { normalizeExpenseTiming, normalizeInputMethod, normalizeResolutionMode } from "./expense-resolution-domain";
import { getExpenseResolutionSearchPattern, nextFinanceMonth, type ExpenseResolutionListPage, type ExpenseResolutionListRequest } from "./expense-resolution-list";
import type { ReimbursementMember } from "./reimbursement-domain";
import { isActionableExpenseResolution } from "./expense-resolution-insights";

export const expenseResolutionRepositorySchema = "finance";

export type ExpenseBankDraftReviewContract = {
  accountSubjectId: string;
  approvalBasisKey: string;
  budgetId: string;
  duplicateResolutionId?: string;
  duplicateResolutionReviewed?: boolean;
  evidencePolicyKey: string;
  expenseDetailId: string;
  purposeKey: string;
  taxPolicyKey: string;
};

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
    creation_source: resolution.creationSource ?? (resolution.approvalDocumentId ? "APPROVAL_LINKED" : "DIRECT"),
    direct_expense_decision: resolution.directExpenseDecision ?? "ALLOWED",
    direct_expense_reasons: resolution.directExpenseReasons ?? [],
    approval_skip_reason: resolution.approvalSkipReason ?? null,
    approval_document_id: resolution.approvalDocumentId || null,
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
    original_resolution_id: resolution.originalResolutionId || null,
    settlement_due_date: resolution.settlementDueDate || null,
    settlement_manager_label: resolution.settlementManager ?? null,
    project_name: resolution.projectName || null,
    subject: resolution.subject || null,
    total_payment_amount: resolution.totalPaymentAmount,
    actual_paid_amount: resolution.actualPaidAmount ?? null,
    settlement_status: resolution.settlementStatus,
    voucher_no: resolution.voucherNo ?? null,
    voucher_status: resolution.voucherStatus ?? null,
    expense_kind: resolution.expenseKind ?? "GENERAL",
    expense_detail_id: resolution.expenseDetailId || null,
    accounting_date: resolution.accountingDate || null,
    actual_expense_date: resolution.actualExpenseDate || null,
    drafted_at: resolution.draftedAt || resolution.createdAt,
    approved_at: resolution.approvedAt || null,
    disbursed_at: resolution.disbursedAt || resolution.paidAt || null,
    is_post_approval: resolution.isPostApproval ?? resolution.expenseKind === "BANK_POST_APPROVAL",
    post_approval_reason: resolution.postApprovalReason ?? null,
    evidence_kind: resolution.evidenceKind ?? "NONE",
    evidence_status: resolution.evidenceStatus ?? "NONE",
    missing_evidence_reason: resolution.missingEvidenceReason ?? null,
    actual_spender_label: resolution.advancePayer ?? null,
    settlement_recipient_label: resolution.settlementRecipient ?? null,
    settlement_amount: resolution.settlementAmount ?? (resolution.expenseKind === "PERSONAL_REIMBURSEMENT" ? resolution.totalPaymentAmount : null),
    settlement_completed_at: resolution.settlementCompletedAt || null,
    bank_transaction_id: resolution.bankTransactionId || null,
    budget_id: resolution.budgetId || null,
    budget_month: resolution.budgetMonth || null,
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
  const itemRowsByResolution = groupRowsByResolution(itemRows);
  const allocationRowsByResolution = groupRowsByResolution(allocationRows);
  const evidenceRowsByResolution = groupRowsByResolution(evidenceRows);

  return resolutions.map((resolution) => {
    const matchingItems = (itemRowsByResolution.get(resolution.id) ?? [])
      .sort((first, second) => first.item_no - second.item_no);
    const batchItems = matchingItems.filter((row) => row.item_kind === "BATCH").map((row) => row.item_data as BatchExpenseItem);
    const singleItems = matchingItems.filter((row) => row.item_kind === "SINGLE").map((row) => row.item_data as SingleExpenseItem);
    const accountAllocations = (allocationRowsByResolution.get(resolution.id) ?? [])
      .map((row) => row.allocation_data);
    const evidenceFiles = (evidenceRowsByResolution.get(resolution.id) ?? [])
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

function groupRowsByResolution<Row extends { resolution_id: string }>(rows: Row[]) {
  const groupedRows = new Map<string, Row[]>();
  for (const row of rows) {
    const matchingRows = groupedRows.get(row.resolution_id);
    if (matchingRows) matchingRows.push(row);
    else groupedRows.set(row.resolution_id, [row]);
  }
  return groupedRows;
}

export async function listExpenseResolutionsFromSupabase(verifiedActor?: ReimbursementMember): Promise<ManagedExpenseResolution[] | null> {
  const actor = verifiedActor ?? await requireExpenseActor();
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolutions")
    .select(expenseResolutionSelect)
    .eq("organization_id", actor.organization_id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to list expense resolutions: ${error.message}`);
  const sourceRows = (data ?? []) as ExpenseResolutionRow[];
  if (!sourceRows.length) return [];
  return hydrateExpenseResolutionRows(supabase, actor, sourceRows);
}

export async function listExpenseApprovalInboxCandidatesFromSupabase(
  verifiedActor?: ReimbursementMember,
): Promise<ManagedExpenseResolution[] | null> {
  const actor = verifiedActor ?? await requireExpenseActor();
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolutions")
    .select(expenseResolutionSelect)
    .eq("organization_id", actor.organization_id)
    .eq("approval_status", "승인대기")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to list pending expense approvals: ${error.message}`);

  const sourceRows = (data ?? []) as ExpenseResolutionRow[];
  if (!sourceRows.length) return [];
  return hydrateExpenseAuthorizationRows(supabase, actor, sourceRows);
}

export async function listExpenseResolutionPageFromSupabase(
  request: ExpenseResolutionListRequest & { includeId?: string },
  verifiedActor?: ReimbursementMember,
): Promise<{ items: ManagedExpenseResolution[]; pagination: ExpenseResolutionListPage } | null> {
  const actor = verifiedActor ?? await requireExpenseActor();
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const offset = (request.page - 1) * request.pageSize;
  let query = supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolutions")
    .select(expenseResolutionSelect, { count: "exact" })
    .eq("organization_id", actor.organization_id)
    .is("deleted_at", null);
  const searchPattern = getExpenseResolutionSearchPattern(request.query);
  if (searchPattern) {
    const pattern = `%${searchPattern}%`;
    query = query.or([
      `resolution_no.ilike.${pattern}`,
      `subject.ilike.${pattern}`,
      `project_name.ilike.${pattern}`,
      `author_label.ilike.${pattern}`,
      `current_approver_label.ilike.${pattern}`,
      `resolution_data->>vendorName.ilike.${pattern}`,
      `resolution_data->>representativeVendorName.ilike.${pattern}`,
    ].join(","));
  }
  if (request.month) {
    query = query
      .gte("actual_expense_date", `${request.month}-01`)
      .lt("actual_expense_date", `${nextFinanceMonth(request.month)}-01`);
  }
  if (request.scope === "actionable") {
    query = query.or("approval_status.in.(작성중,반려,승인대기),and(approval_status.eq.승인완료,payment_status.in.(지급대기,부분지급))");
  }
  const orderedQuery = request.sort === "expense_date_asc"
    ? query
      .order("actual_expense_date", { ascending: true, nullsFirst: false })
      .order("resolution_no", { ascending: true })
      .order("id", { ascending: true })
    : request.sort === "expense_date_desc"
      ? query
        .order("actual_expense_date", { ascending: false, nullsFirst: false })
        .order("resolution_no", { ascending: false })
        .order("id", { ascending: false })
      : query
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false });
  async function readRange(from: number, size: number) {
    const { data, error, count } = await orderedQuery.range(from, from + size - 1);
    if (error) throw new Error(`Failed to list expense resolutions: ${error.message}`);
    const rows = (data ?? []) as ExpenseResolutionRow[];
    return {
      count: count ?? rows.length,
      candidates: rows.length ? await hydrateExpenseResolutionListRows(supabase!, actor, rows) : [],
    };
  }
  let items: ManagedExpenseResolution[];
  let total: number;
  if (request.scope === "actionable") {
    const matches: ManagedExpenseResolution[] = [];
    const batchSize = 150;
    for (let from = 0; ; from += batchSize) {
      const { candidates, count } = await readRange(from, batchSize);
      matches.push(...candidates.filter((resolution) => isActionableExpenseResolution(resolution, actor)));
      if (candidates.length < batchSize || from + batchSize >= count) break;
    }
    total = matches.length;
    items = matches.slice(offset, offset + request.pageSize);
  } else {
    const { candidates, count } = await readRange(offset, request.pageSize);
    items = candidates;
    total = count;
  }
  if (request.includeId) {
    try {
      const detail = await getExpenseResolutionDetailFromSupabase(request.includeId, actor);
      const existingIndex = items.findIndex((item) => item.id === request.includeId);
      if (existingIndex >= 0) items = items.map((item, index) => index === existingIndex ? detail : item);
      else items = [detail, ...items];
    } catch {
      // The page renders its existing not-found guidance for missing or unauthorized deep links.
    }
  }
  return {
    items,
    pagination: {
      page: request.page,
      pageSize: request.pageSize,
      month: request.month,
      query: request.query,
      sort: request.sort,
      ...(request.scope ? { scope: request.scope } : {}),
      total,
      totalPages: Math.max(1, Math.ceil(total / request.pageSize)),
    },
  };
}

async function getNextExpenseResolutionNo(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  organizationId: string,
) {
  const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date());
  const prefix = `지결-${year}-`;
  const { data, error } = await supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolutions")
    .select("resolution_no")
    .eq("organization_id", organizationId)
    .like("resolution_no", `${prefix}%`)
    .order("resolution_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to determine the next expense resolution number: ${error.message}`);
  const latestSequence = Number(data?.resolution_no?.slice(prefix.length));
  return `${prefix}${String(Number.isSafeInteger(latestSequence) ? latestSequence + 1 : 1).padStart(4, "0")}`;
}

export async function getNextExpenseResolutionNoFromSupabase(verifiedActor?: ReimbursementMember) {
  const actor = verifiedActor ?? await requireExpenseActor();
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return getNextExpenseResolutionNo(supabase, actor.organization_id);
}

async function hydrateExpenseResolutionRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  actor: ReimbursementMember,
  sourceRows: ExpenseResolutionRow[],
) {
  const resolutionIds = sourceRows.map((row) => row.resolution_data.id);
  const [
    { data: bindingRows, error: bindingError },
    { data: itemData, error: itemError },
    { data: allocationData, error: allocationError },
    { data: evidenceData, error: evidenceError },
    { data: workflowData, error: workflowError },
  ] = await Promise.all([
    supabase.schema("finance").from("expense_authorization_bindings")
      .select("resolution_id,author_user_id,steps,version")
      .eq("organization_id", actor.organization_id)
      .in("resolution_id", resolutionIds),
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
    supabase
      .schema("finance")
      .from("workflow_transactions")
      .select("id,source_id")
      .eq("organization_id", actor.organization_id)
      .eq("source_kind", "RESOLUTION")
      .in("source_id", resolutionIds),
  ]);
  if (bindingError && !isMissingExpenseBinding(bindingError)) throw new Error("지출결의 계정 연결을 확인하지 못했습니다.");
  if (itemError) throw new Error(`Failed to list expense resolution items: ${itemError.message}`);
  if (allocationError) throw new Error(`Failed to list expense account allocations: ${allocationError.message}`);
  if (evidenceError) throw new Error(`Failed to list expense evidence: ${evidenceError.message}`);
  if (workflowError) throw new Error(`Failed to list integrated expense links: ${workflowError.message}`);
  const bindingMap = new Map(((bindingRows ?? []) as (ExpenseAuthorization & { resolution_id: string })[]).map(binding => [binding.resolution_id, binding]));
  const workflowMap = new Map(((workflowData ?? []) as { id: string; source_id: string }[]).map(item => [item.source_id, item.id]));
  const resolutions = sourceRows.map(row => ({
    ...row.resolution_data,
    authorization: bindingMap.get(row.resolution_data.id) ?? null,
    workflowTransactionId: workflowMap.get(row.resolution_data.id),
  }));
  return hydrateExpenseResolutionChildren(
    resolutions,
    (itemData ?? []) as ExpenseResolutionItemRow[],
    (allocationData ?? []) as ExpenseAccountAllocationRow[],
    (evidenceData ?? []) as ExpenseEvidenceRow[],
  );
}

async function hydrateExpenseResolutionListRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  actor: ReimbursementMember,
  sourceRows: ExpenseResolutionRow[],
) {
  const resolutionIds = sourceRows.map((row) => row.resolution_data.id);
  const [
    { data: bindingRows, error: bindingError },
    { data: workflowData, error: workflowError },
  ] = await Promise.all([
    supabase.schema("finance").from("expense_authorization_bindings")
      .select("resolution_id,author_user_id,steps,version")
      .eq("organization_id", actor.organization_id)
      .in("resolution_id", resolutionIds),
    supabase.schema("finance").from("workflow_transactions")
      .select("id,source_id")
      .eq("organization_id", actor.organization_id)
      .eq("source_kind", "RESOLUTION")
      .in("source_id", resolutionIds),
  ]);
  if (bindingError && !isMissingExpenseBinding(bindingError)) throw new Error("지출결의 계정 연결을 확인하지 못했습니다.");
  if (workflowError) throw new Error(`Failed to list integrated expense links: ${workflowError.message}`);
  const bindingMap = new Map(((bindingRows ?? []) as (ExpenseAuthorization & { resolution_id: string })[]).map(binding => [binding.resolution_id, binding]));
  const workflowMap = new Map(((workflowData ?? []) as { id: string; source_id: string }[]).map(item => [item.source_id, item.id]));
  return sourceRows.map((row) => ({
    ...row.resolution_data,
    authorization: bindingMap.get(row.resolution_data.id) ?? null,
    workflowTransactionId: workflowMap.get(row.resolution_data.id),
  }));
}

async function hydrateExpenseAuthorizationRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  actor: ReimbursementMember,
  sourceRows: ExpenseResolutionRow[],
) {
  const resolutionIds = sourceRows.map((row) => row.resolution_data.id);
  const { data: bindingRows, error: bindingError } = await supabase.schema("finance")
    .from("expense_authorization_bindings")
    .select("resolution_id,author_user_id,steps,version")
    .eq("organization_id", actor.organization_id)
    .in("resolution_id", resolutionIds);
  if (bindingError && !isMissingExpenseBinding(bindingError)) {
    throw new Error("지출결의 계정 연결을 확인하지 못했습니다.");
  }
  const bindingMap = new Map(((bindingRows ?? []) as (ExpenseAuthorization & { resolution_id: string })[])
    .map((binding) => [binding.resolution_id, binding]));
  return sourceRows.map((row) => ({
    ...row.resolution_data,
    authorization: bindingMap.get(row.resolution_data.id) ?? null,
  }));
}

export async function getExpenseResolutionDetailFromSupabase(id: string, verifiedActor?: ReimbursementMember) {
  const actor = verifiedActor ?? await requireExpenseActor();
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.schema(expenseResolutionRepositorySchema).from("expense_resolutions")
    .select(expenseResolutionSelect)
    .eq("id", id)
    .eq("organization_id", actor.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) throw new Error("조회 권한이 있는 지출결의서를 찾을 수 없습니다.");
  const [resolution] = await hydrateExpenseResolutionRows(supabase, actor, [data as ExpenseResolutionRow]);
  return resolution;
}

export async function getExpenseResolutionSnapshotFromSupabase(id: string, verifiedActor?: ReimbursementMember) {
  const { resolution, binding } = await requireExpenseRecord(id, false, verifiedActor);
  return { ...resolution, authorization: binding };
}

export async function commitExpenseCommand(command: string, id: string, expected: ManagedExpenseResolution | null, payload: Record<string, unknown>, key: string) {
  const actor = await requireExpenseActor();
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("지출 저장소가 설정되지 않았습니다.");
  const { data, error } = await supabase.schema("finance").rpc("legacy_expense_command", {
    p_org: actor.organization_id, p_actor: actor.user_id, p_command: command, p_id: id,
    p_expected: expected ? stripExpenseAuthorization(expected) : null, p_payload: payload, p_key: key,
  });
  if (error) throw new Error(error.message);
  if (command === "BIND" || command.startsWith("FACT_")) return data;
  return { ...data, authorization: await expenseBinding(id, actor) } as ManagedExpenseResolution;
}

export async function commitExpenseApprovalBatch(
  items: Array<{ id: string; expected: ManagedExpenseResolution; payload: Record<string, unknown> }>,
  key: string,
) {
  const actor = await requireExpenseActor();
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("지출 저장소가 설정되지 않았습니다.");
  const { data, error } = await supabase.schema("finance").rpc("legacy_expense_approval_batch", {
    p_org: actor.organization_id,
    p_actor: actor.user_id,
    p_items: items.map((item) => ({
      id: item.id,
      expected: stripExpenseAuthorization(item.expected),
      payload: item.payload,
    })),
    p_key: key,
  });
  if (error) throw new Error(error.message);
  const results = (data as { results?: ManagedExpenseResolution[] } | null)?.results;
  if (!Array.isArray(results) || results.length !== items.length) {
    throw new Error("일괄 결재 처리 결과를 확인하지 못했습니다.");
  }
  return Promise.all(results.map(async (resolution) => ({
    ...resolution,
    authorization: await expenseBinding(resolution.id, actor),
  } as ManagedExpenseResolution)));
}

export async function commitExpenseSaveBatch(
  items: Array<{ resolution: ManagedExpenseResolution; reviewContract: ExpenseBankDraftReviewContract }>,
  month: string,
  key: string,
) {
  validateExpenseSaveBatchInput(items, month);
  const actor = await requireExpenseActor();
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("지출 저장소가 설정되지 않았습니다.");
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new Error("월별 초안 기준은 월의 첫날이어야 합니다.");
  const payloadItems = items.map(({ resolution, reviewContract }) => {
    const draft = stripExpenseAuthorization(resolution);
    return {
      expected: null,
      id: draft.id,
      payload: mapExpenseResolutionSavePayload(draft, actor.organization_id),
      review_contract: reviewContract,
    };
  });
  const { data, error } = await supabase.schema("finance").rpc("legacy_expense_save_batch", {
    p_actor: actor.user_id,
    p_items: payloadItems,
    p_key: key,
    p_month: month,
    p_org: actor.organization_id,
  });
  if (error) throw new Error(error.message);
  const results = (data as { results?: ManagedExpenseResolution[] } | null)?.results;
  if (!Array.isArray(results) || results.length !== items.length) throw new Error("월별 초안 저장 결과를 확인하지 못했습니다.");
  return results;
}

export function validateExpenseSaveBatchInput(
  items: Array<{ resolution: ManagedExpenseResolution; reviewContract: ExpenseBankDraftReviewContract }>,
  month: string,
  today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }),
) {
  if (!items.length || items.length > 200) throw new Error("월별 초안은 1건 이상 200건 이하만 저장할 수 있습니다.");
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new Error("월별 초안 기준은 월의 첫날이어야 합니다.");
  for (const { resolution } of items) {
    if (resolution.approvalStatus !== "작성중" || resolution.paymentStatus !== "지급전" || resolution.expenseKind !== "BANK_POST_APPROVAL" || !resolution.isPostApproval) {
      throw new Error(`${resolution.resolutionNo}: 작성중·지급전·통장 선출금 사후결의 초안만 월별 저장할 수 있습니다.`);
    }
    if (resolution.createdAt.slice(0, 10) !== today || (resolution.draftedAt && resolution.draftedAt.slice(0, 10) !== today)) {
      throw new Error(`${resolution.resolutionNo}: 작성일은 실제 저장일을 사용해야 합니다.`);
    }
    if (resolution.approvedAt || resolution.disbursedAt || resolution.voucherNo || resolution.voucherGenerated) {
      throw new Error(`${resolution.resolutionNo}: 승인·지급·전표 결과가 없는 초안만 저장할 수 있습니다.`);
    }
    if (!resolution.bankTransactions?.length) throw new Error(`${resolution.resolutionNo}: 원천 통장거래가 필요합니다.`);
    const sourceDates = resolution.bankTransactions.map((transaction) => transaction.transactionDate).toSorted();
    if (sourceDates.some((date) => `${date.slice(0, 7)}-01` !== month)) throw new Error(`${resolution.resolutionNo}: 한 회계월의 통장거래만 함께 저장할 수 있습니다.`);
    if (resolution.actualExpenseDate !== sourceDates.at(-1)) throw new Error(`${resolution.resolutionNo}: 실제 지출일은 묶음의 마지막 원천 거래일이어야 합니다.`);
    if (resolution.budgetMonth !== month) throw new Error(`${resolution.resolutionNo}: 예산 귀속월이 월별 저장 기준과 다릅니다.`);
  }
}

export function stripExpenseAuthorization(resolution: ManagedExpenseResolution) {
  const result = { ...resolution };
  delete result.authorization;
  return result;
}

export function mapExpenseDisbursementUpdate(
  resolution: ManagedExpenseResolution,
  expected: { paymentStatus: ManagedExpenseResolution["paymentStatus"] },
) {
  const snapshot = stripExpenseAuthorization(resolution);
  if (resolution.paymentStatus === expected.paymentStatus) {
    return {
      resolution_data: snapshot,
      updated_at: new Date().toISOString(),
      voucher_no: resolution.voucherNo ?? null,
      voucher_status: resolution.voucherStatus ?? null,
    };
  }
  return mapExpenseResolutionToUpsert(snapshot);
}

export async function updateExpenseDisbursementInSupabase(
  resolution: ManagedExpenseResolution,
  expected: { paymentStatus: ManagedExpenseResolution["paymentStatus"]; voucherStatus?: ManagedExpenseResolution["voucherStatus"] },
) {
  const { actor } = await requireExpenseRecord(resolution.id);
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  let query = supabase
    .schema(expenseResolutionRepositorySchema)
    .from("expense_resolutions")
    .update(mapExpenseDisbursementUpdate(resolution, expected))
    .eq("id", resolution.id)
    .eq("organization_id", actor.organization_id)
    .eq("payment_status", expected.paymentStatus);
  query = expected.voucherStatus ? query.eq("voucher_status", expected.voucherStatus) : query.is("voucher_status", null);
  const { data, error } = await query.select(expenseResolutionSelect).maybeSingle();
  if (error) throw new Error(`Failed to transition expense disbursement: ${error.message}`);
  if (!data) throw new Error("다른 사용자가 먼저 지급 또는 전표 상태를 변경했습니다. 목록을 새로고침해주세요.");
  return (data as ExpenseResolutionRow).resolution_data;
}

export async function upsertExpenseResolutionInSupabase(resolution: ManagedExpenseResolution, expected: ManagedExpenseResolution | null, key: string) {
  const actor = await requireExpenseActor();
  const version = resolution.authorization?.version ?? 0;
  resolution = stripExpenseAuthorization(resolution);
  return commitExpenseCommand("SAVE", resolution.id, expected, {
    ...mapExpenseResolutionSavePayload(resolution, actor.organization_id),
    expected_binding_version: version,
  }, key);
}

export function mapExpenseResolutionSavePayload(resolution: ManagedExpenseResolution, organizationId: string) {
  const itemRows = mapExpenseResolutionItemsToRows(resolution);
  const allocationRows = mapExpenseAccountAllocationsToRows(resolution);
  const evidenceRows = mapExpenseEvidenceToRows(resolution);
  const detailRows = (resolution.pettyCashTransactions ?? []).map((item, index) => {
    const source = resolution.expenseItems.find((expenseItem) => expenseItem.id === item.id) ?? resolution.expenseItems[index];
    return { account_title: item.accountTitle, actual_spender_label: item.spender, amount: item.amount, business_purpose: item.businessPurpose, deleted_at: null, evidence_kind: item.evidenceKind ?? mapDetailEvidenceKind(source?.evidenceType), evidence_status: item.evidenceStatus ?? (source?.evidenceFileName ? "GENERAL" : "NONE"), fact_confirmation_id: item.factConfirmationId ?? null, id: item.id, item_name: item.item, line_no: index + 1, memo: source?.memo || null, payment_method: source?.paymentMethod ?? resolution.advancePaymentMethod ?? resolution.paymentMethod ?? "기타", resolution_id: resolution.id, transaction_date: item.transactionDate, updated_at: new Date().toISOString(), vendor_name: item.vendor };
  });
  return {
    allocations: allocationRows,
    details: detailRows,
    evidence: evidenceRows,
    items: itemRows,
    row: mapExpenseResolutionToUpsert(resolution, organizationId),
  };
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
