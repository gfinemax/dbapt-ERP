import { expenseBinding, expenseDb, requireExpenseActor } from "./expense-authorization";
import type { ManagedExpenseResolution } from "./expense-resolution-page";
import type { ExpenseEvidenceAttachment } from "./expense-evidence";
import type { QuickExpensePaymentMethod } from "./quick-expense-record";
import {
  mapExpenseAccountAllocationsToRows,
  mapExpenseEvidenceToRows,
  mapExpenseResolutionItemsToRows,
  mapExpenseResolutionToUpsert,
  stripExpenseAuthorization,
} from "./expense-resolution-repository";

type SnapshotRow = {
  source: {
    amount: number | string;
    approval_skip_reason: string;
    bank_transaction_id: string | null;
    budget_item: string;
    corporate_card_transaction_id: string | null;
    counterparty: string;
    evidence_kind: string | null;
    evidence_status: string;
    expense_detail_id: string | null;
    id: string;
    linked_resolution_id: string | null;
    occurred_at: string;
    payment_method: QuickExpensePaymentMethod;
    record_status: string;
    usage_description: string;
  };
  evidence: Array<{
    content_type: string;
    created_at: string;
    evidence_type: string;
    file_size: number | string;
    id: string;
    original_filename: string;
    result_data: ExpenseEvidenceAttachment["ocrData"];
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
    storage_bucket: string;
    storage_path: string;
    uploaded_by_label: string;
  }>;
};

export type QuickExpenseConversionDraft = {
  amount: number;
  approvalSkipReason: string;
  bankTransactionId?: string;
  budgetItem: string;
  cardTransactionId?: string;
  counterparty: string;
  evidenceFiles: ExpenseEvidenceAttachment[];
  evidenceKind?: string;
  evidenceStatus: string;
  expenseDetailId?: string;
  linkedResolutionId?: string;
  occurredDate: string;
  paymentMethod: QuickExpensePaymentMethod;
  recordStatus: string;
  sourceId: string;
  usageDescription: string;
};

function mapSnapshot(snapshot: SnapshotRow): QuickExpenseConversionDraft {
  const source = snapshot.source;
  return {
    amount: Number(source.amount) || 0,
    approvalSkipReason: source.approval_skip_reason,
    bankTransactionId: source.bank_transaction_id ?? undefined,
    budgetItem: source.budget_item,
    cardTransactionId: source.corporate_card_transaction_id ?? undefined,
    counterparty: source.counterparty,
    evidenceFiles: snapshot.evidence.map((evidence) => ({
      contentType: evidence.content_type,
      evidenceType: evidence.evidence_type,
      fileName: evidence.original_filename,
      fileSize: Number(evidence.file_size) || 0,
      id: `quick-${source.id}-${evidence.id}`,
      ocrData: evidence.result_data ?? {},
      ocrJobId: evidence.id,
      ocrStatus: evidence.status === "COMPLETED" ? "EXTRACTED" : evidence.status === "FAILED" ? "FAILED" : "REVIEW_REQUIRED",
      storageBucket: evidence.storage_bucket,
      storagePath: evidence.storage_path,
      uploadedAt: evidence.created_at,
      uploadedBy: evidence.uploaded_by_label,
    })),
    evidenceKind: source.evidence_kind ?? undefined,
    evidenceStatus: source.evidence_status,
    expenseDetailId: source.expense_detail_id ?? undefined,
    linkedResolutionId: source.linked_resolution_id ?? undefined,
    occurredDate: new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Seoul", year: "numeric" }).format(new Date(source.occurred_at)),
    paymentMethod: source.payment_method,
    recordStatus: source.record_status,
    sourceId: source.id,
    usageDescription: source.usage_description,
  };
}

async function loadSnapshot(sourceId: string) {
  const actor = await requireExpenseActor();
  const { data, error } = await expenseDb().schema("finance").rpc("quick_expense_conversion_snapshot", {
    p_org: actor.organization_id, p_actor: actor.user_id, p_id: sourceId,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("간편지출 전환 원본을 확인하지 못했습니다.");
  return { actor, snapshot: data as SnapshotRow };
}

export async function loadQuickExpenseConversionDraft(sourceId: string) {
  const { snapshot } = await loadSnapshot(sourceId);
  return mapSnapshot(snapshot);
}

export async function convertQuickExpenseToResolution(sourceId: string, resolution: ManagedExpenseResolution) {
  const { actor, snapshot } = await loadSnapshot(sourceId);
  if (snapshot.source.record_status !== "NEEDS_RESOLUTION" || snapshot.source.linked_resolution_id)
    throw new Error("정식결의가 필요한 미전환 간편지출만 전환할 수 있습니다.");
  const clean = stripExpenseAuthorization(resolution);
  const payload = {
    row: mapExpenseResolutionToUpsert(clean, actor.organization_id),
    items: mapExpenseResolutionItemsToRows(clean),
    allocations: mapExpenseAccountAllocationsToRows(clean),
    evidence: mapExpenseEvidenceToRows(clean),
    details: [],
    expected_binding_version: 0,
  };
  const operationKey = `quick-resolution:${sourceId}:${resolution.id}`;
  const { data, error } = await expenseDb().schema("finance").rpc("quick_expense_convert_resolution", {
    p_org: actor.organization_id, p_actor: actor.user_id, p_id: sourceId,
    p_expected: snapshot, p_payload: payload, p_key: operationKey,
  });
  if (error) throw new Error(error.message);
  const saved = data && typeof data === "object" ? (data as { resolution?: ManagedExpenseResolution }).resolution : undefined;
  if (!saved || saved.id !== resolution.id) throw new Error("지출결의 전환 저장 결과를 확인하지 못했습니다.");
  return { ...saved, authorization: await expenseBinding(saved.id, actor) };
}
