import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import { hasReimbursementPermission, type ReimbursementPermission } from "./reimbursement-domain";
import type { CollectionAssessmentImportInput } from "./collection-assessment-csv";
import { loadLedgerContributionSyncStatus, type LedgerContributionSyncStatus } from "./ledger-contribution-sync";
import { loadLedgerExternalRecognitionSyncStatus, type LedgerExternalRecognitionSyncStatus } from "./ledger-external-recognition-sync";

export const collectionLedgerCommands = [
  "ASSESSMENT_SAVE",
  "ASSESSMENT_CANCEL",
  "RECEIPT_ALLOCATE",
  "RECEIPT_REVERSE",
  "REFUND_SAVE",
  "REFUND_APPROVE",
  "REFUND_PAY",
  "REFUND_CANCEL",
] as const;
export type CollectionLedgerCommand = (typeof collectionLedgerCommands)[number];
export type CollectionAssessment = {
  id: string;
  external_member_id: string;
  member_no: string | null;
  member_name_snapshot: string;
  assessment_code: string;
  due_date: string | null;
  assessed_amount: number;
  allocated_amount: number;
  cash_allocated_amount: number;
  external_recognized_amount: number;
  satisfied_amount: number;
  status: "ACTIVE" | "CANCELLED";
  lock_version: number;
  source_system?: string | null;
  source_assessment_id?: string | null;
};
export type CollectionExternalRecognition = {
  id: string;
  assessment_id: string | null;
  source_recognition_id: string;
  source_root_recognition_id: string;
  source_current_recognition_id: string;
  source_assessment_id: string | null;
  external_member_id: string | null;
  member_name_snapshot: string | null;
  recognized_on: string;
  recognized_amount: number;
  claimed_amount: number;
  recognition_type: string;
  reason: string;
  status: "ACTIVE" | "CANCELLED";
  source_kind: "application_certificate" | "dongil_fixed_certificate" | "dongil_other" | "trust_account" | "other";
  accounting_treatment: "confirmed_loss" | "trust_receipt" | "pending_review";
  actual_fund_amount: number;
  loss_amount: number;
  linkage_status: "LINKED" | "MEMBER_LEVEL" | "UNLINKED" | "ASSESSMENT_MISSING" | "MEMBER_MISMATCH" | "EXCEEDS_ASSESSMENT";
  linkage_issue_detail: string | null;
  governance_status: string | null;
  sync_reason: string | null;
  source_version: number;
  source_updated_at: string;
  source_payload: Record<string, unknown>;
};
export type CollectionAllocation = {
  id: string;
  assessment_id: string;
  bank_transaction_id: string;
  amount: number;
  reason: string;
  created_at: string;
  reversed: boolean;
  reversal_reason: string | null;
  bank_date: string;
  bank_description: string;
};
export type CollectionRefund = {
  id: string;
  source_allocation_id: string;
  external_member_id: string;
  member_name_snapshot: string;
  reason: string;
  requested_amount: number;
  status: "DRAFT" | "APPROVED" | "PAID" | "CANCELLED";
  bank_transaction_id: string | null;
  lock_version: number;
  created_by: string;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
};
export type CollectionBankCandidate = {
  id: string;
  transacted_at: string;
  description: string;
  counterparty: string | null;
  amount: number;
  available_amount?: number;
};
export type FixedCertificateAssignmentBatch = {
  id: string;
  status: "PREVIEW" | "APPLIED" | "CANCELLED";
  source_document_id: string;
  source_sheet_id: number;
  source_sheet_name: string;
  source_range: string;
  source_hash: string;
  source_signature: string;
  reference_count: number;
  contribution_account_subject_id: string;
  suspense_account_subject_id: string;
  created_by_label: string;
  created_at: string;
  applied_at: string | null;
  apply_reason: string | null;
  lock_version: number;
};
export type FixedCertificateAssignmentRow = {
  sheet_row_number: number;
  sheet_name_snapshot: string;
  source_root_recognition_id: string | null;
  external_member_id: string | null;
  erp_name_snapshot: string | null;
  source_version: number | null;
  match_status: "EXACT" | "MANUAL" | "UNRESOLVED";
};
export type FixedCertificateAssignmentCandidate = {
  source_root_recognition_id: string;
  external_member_id: string;
  member_name_snapshot: string;
  source_version: number;
  status: "ACTIVE" | "CANCELLED";
  member_group: string | null;
  member_status: string | null;
};
export type FixedCertificateAccountAssignment = {
  source_root_recognition_id: string;
  external_member_id: string;
  member_name_snapshot: string;
  source_version: number;
  source_status: "ACTIVE" | "CANCELLED";
  assignment_category: "CONTRIBUTION" | "SUSPENSE";
  account_subject_id: string;
  assignment_basis: "GOOGLE_SHEET_EXACT" | "GOOGLE_SHEET_MANUAL" | "NOT_IN_GOOGLE_SHEET";
};
export type FixedCertificateAssignmentWorkspace = {
  batch: FixedCertificateAssignmentBatch;
  summary: {
    fixed_count: number;
    exact_count: number;
    manual_count: number;
    unresolved_count: number;
    contribution_count: number;
    suspense_count: number;
    active_contribution_count: number;
    active_suspense_count: number;
    contribution_amount: number;
    suspense_amount: number;
    is_stale: boolean;
  };
  rows: FixedCertificateAssignmentRow[];
  candidates: FixedCertificateAssignmentCandidate[];
  assignments: FixedCertificateAccountAssignment[];
};
export type CollectionLedgerWorkspace = {
  assessments: CollectionAssessment[];
  allocations: CollectionAllocation[];
  external_recognitions: CollectionExternalRecognition[];
  refunds: CollectionRefund[];
  deposit_candidates: CollectionBankCandidate[];
  withdrawal_candidates: CollectionBankCandidate[];
  import_batches: CollectionAssessmentImportSummary[];
  ledger_sync?: LedgerContributionSyncStatus;
  ledger_external_recognition_sync?: LedgerExternalRecognitionSyncStatus;
  fixed_certificate_assignment?: FixedCertificateAssignmentWorkspace | null;
  viewer: { user_id: string; permissions: ReimbursementPermission[] };
};
export type CollectionLedgerResult = { id: string; status: string; lock_version: number };
export type CollectionAssessmentImportRow = CollectionAssessmentImportInput & {
  action: "CREATE" | "UPDATE" | "UNCHANGED" | "ERROR";
  issue: string | null;
};
export type CollectionAssessmentImportPreview = {
  batch_id: string;
  file_name: string;
  content_hash: string;
  status: "PREVIEW" | "APPLIED" | "CANCELLED";
  created_at: string;
  applied_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  row_count: number;
  create_count: number;
  update_count: number;
  unchanged_count: number;
  error_count: number;
  rows: CollectionAssessmentImportRow[];
};
export type CollectionAssessmentImportSummary = Omit<CollectionAssessmentImportPreview, "content_hash" | "rows">;

const staffPermissions: readonly ReimbursementPermission[] = ["ADMIN", "CLOSE", "PAY", "APPROVE", "SENIOR"];
const decisionCommands = new Set<CollectionLedgerCommand>(["ASSESSMENT_SAVE", "ASSESSMENT_CANCEL", "REFUND_SAVE", "REFUND_APPROVE", "REFUND_CANCEL"]);
const forbidden = new Set(["organization_id", "organizationId", "p_org", "p_actor", "actor_id", "actorId", "permissions", "viewer"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function importResult(value: unknown): CollectionAssessmentImportPreview {
  if (!record(value) || typeof value.batch_id !== "string" || typeof value.file_name !== "string" || !Array.isArray(value.rows))
    throw new Error("부과자료 일괄 처리 결과를 확인하지 못했어.");
  for (const key of ["row_count", "create_count", "update_count", "unchanged_count", "error_count"])
    if (!Number.isSafeInteger(Number(value[key]))) throw new Error("부과자료 집계 결과를 확인하지 못했어.");
  return value as CollectionAssessmentImportPreview;
}

function fixedCertificateAssignmentResult(value: unknown): FixedCertificateAssignmentWorkspace {
  if (!record(value) || !record(value.batch) || !record(value.summary)
    || typeof value.batch.id !== "string" || !Array.isArray(value.rows)
    || !Array.isArray(value.candidates) || !Array.isArray(value.assignments)) {
    throw new Error("정액 필증 계정과목 대조 결과를 확인하지 못했어.");
  }
  const summary = value.summary;
  const countKeys = ["fixed_count", "exact_count", "manual_count", "unresolved_count", "contribution_count", "suspense_count"];
  if (countKeys.some((key) => !Number.isSafeInteger(Number(summary[key])))) {
    throw new Error("정액 필증 계정과목 대조 집계를 확인하지 못했어.");
  }
  return value as FixedCertificateAssignmentWorkspace;
}

async function requireFixedCertificateActor() {
  const member = await requireReimbursementIdentity();
  if (!member.active || !["ADMIN", "APPROVE", "CLOSE"].some((permission) => hasReimbursementPermission(member, permission as ReimbursementPermission))) {
    throw new Error("정액 필증 계정과목 대조 권한이 필요합니다.");
  }
  return member;
}

export async function previewFixedCertificateAssignment(input: {
  sourceDocumentId: string;
  sourceSheetId: number;
  sourceSheetName: string;
  sourceRange: string;
  sourceHash: string;
  names: Array<{ row_number: number; name: string }>;
}) {
  const member = await requireFixedCertificateActor();
  const { data, error } = await reimbursementDb().schema("finance").rpc("fixed_certificate_assignment_preview", {
    p_org: member.organization_id,
    p_actor: member.user_id,
    p_source_document_id: input.sourceDocumentId,
    p_source_sheet_id: input.sourceSheetId,
    p_source_sheet_name: input.sourceSheetName,
    p_source_range: input.sourceRange,
    p_source_hash: input.sourceHash,
    p_names: input.names,
  });
  if (error) throw new Error(error.message);
  return fixedCertificateAssignmentResult(data);
}

export async function mapFixedCertificateAssignment(batchId: string, sheetRowNumber: number, sourceRootRecognitionId: string | null) {
  const member = await requireFixedCertificateActor();
  if (!batchId || !Number.isInteger(sheetRowNumber) || sheetRowNumber < 4 || sheetRowNumber > 119) {
    throw new Error("대조할 116명 명단 행을 확인해줘.");
  }
  const { data, error } = await reimbursementDb().schema("finance").rpc("fixed_certificate_assignment_map", {
    p_org: member.organization_id,
    p_actor: member.user_id,
    p_batch: batchId,
    p_sheet_row_number: sheetRowNumber,
    p_source_root_recognition_id: sourceRootRecognitionId?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return fixedCertificateAssignmentResult(data);
}

export async function applyFixedCertificateAssignment(batchId: string, reason: string, operationKey: string) {
  const member = await requireFixedCertificateActor();
  if (!batchId || reason.trim().length < 2 || reason.trim().length > 500 || !operationKey.trim() || operationKey.length > 200) {
    throw new Error("적용할 미리보기와 사유를 확인해줘.");
  }
  const { data, error } = await reimbursementDb().schema("finance").rpc("fixed_certificate_assignment_apply", {
    p_org: member.organization_id,
    p_actor: member.user_id,
    p_batch: batchId,
    p_reason: reason.trim(),
    p_operation_key: operationKey,
  });
  if (error) throw new Error(error.message);
  return fixedCertificateAssignmentResult(data);
}

async function requireAssessmentImportActor() {
  const member = await requireReimbursementIdentity();
  if (!member.active || !["ADMIN", "APPROVE", "CLOSE"].some((permission) => hasReimbursementPermission(member, permission as ReimbursementPermission)))
    throw new Error("분담금 부과자료 등록 권한이 필요합니다.");
  return member;
}

export async function previewCollectionAssessmentImport(input: { fileName: string; contentHash: string; rows: CollectionAssessmentImportInput[] }) {
  const member = await requireAssessmentImportActor();
  const { data, error } = await reimbursementDb().schema("finance").rpc("collection_assessment_import_preview", {
    p_org: member.organization_id,
    p_actor: member.user_id,
    p_file_name: input.fileName,
    p_content_hash: input.contentHash,
    p_rows: input.rows,
  });
  if (error) throw new Error(error.message);
  return importResult(data);
}

export async function applyCollectionAssessmentImport(batchId: string, operationKey: string) {
  const member = await requireAssessmentImportActor();
  if (!batchId || !operationKey.trim() || operationKey.length > 200) throw new Error("적용할 미리보기와 처리키를 확인해줘.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("collection_assessment_import_apply", {
    p_org: member.organization_id,
    p_actor: member.user_id,
    p_batch: batchId,
    p_key: operationKey,
  });
  if (error) throw new Error(error.message);
  return importResult(data);
}

function importHistory(value: unknown): { batches: CollectionAssessmentImportSummary[]; selected: CollectionAssessmentImportPreview | null } {
  if (!record(value) || !Array.isArray(value.batches)) throw new Error("부과자료 가져오기 이력을 확인하지 못했어.");
  return { batches: value.batches as CollectionAssessmentImportSummary[], selected: value.selected ? importResult(value.selected) : null };
}

export async function loadCollectionAssessmentImport(batchId?: string) {
  const member = await requireAssessmentImportActor();
  const { data, error } = await reimbursementDb().schema("finance").rpc("collection_assessment_import_history", {
    p_org: member.organization_id,
    p_actor: member.user_id,
    p_batch: batchId || null,
  });
  if (error) throw new Error(error.message);
  return importHistory(data);
}

export async function cancelCollectionAssessmentImport(batchId: string, reason: string, operationKey: string) {
  const member = await requireAssessmentImportActor();
  if (!batchId || !reason.trim() || reason.trim().length > 500 || !operationKey.trim() || operationKey.length > 200)
    throw new Error("취소할 미리보기와 사유를 확인해줘.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("collection_assessment_import_cancel", {
    p_org: member.organization_id,
    p_actor: member.user_id,
    p_batch: batchId,
    p_reason: reason.trim(),
    p_key: operationKey,
  });
  if (error) throw new Error(error.message);
  return importResult(data);
}

export async function loadCollectionLedger(): Promise<CollectionLedgerWorkspace> {
  const member = await requireReimbursementIdentity();
  if (!member.active || !staffPermissions.some((permission) => hasReimbursementPermission(member, permission)))
    throw new Error("수납·환급 원장 조회 권한이 필요합니다.");
  const canImport = ["ADMIN", "APPROVE", "CLOSE"].some((permission) => hasReimbursementPermission(member, permission as ReimbursementPermission));
  const [ledgerResponse, historyResponse, syncStatus, externalRecognitionSyncStatus, fixedCertificateResponse] = await Promise.all([
    reimbursementDb().schema("finance").rpc("collection_ledger_read", { p_org: member.organization_id, p_actor: member.user_id }),
    canImport
      ? reimbursementDb().schema("finance").rpc("collection_assessment_import_history", { p_org: member.organization_id, p_actor: member.user_id, p_batch: null })
      : Promise.resolve({ data: { batches: [], selected: null }, error: null }),
    loadLedgerContributionSyncStatus(),
    loadLedgerExternalRecognitionSyncStatus(),
    canImport
      ? reimbursementDb().schema("finance").rpc("fixed_certificate_assignment_read", { p_org: member.organization_id, p_actor: member.user_id })
      : Promise.resolve({ data: null, error: null }),
  ]);
  const { data, error } = ledgerResponse;
  if (error) throw new Error(error.message);
  if (historyResponse.error) throw new Error(historyResponse.error.message);
  if (fixedCertificateResponse.error && !["PGRST202", "42883"].includes(fixedCertificateResponse.error.code ?? "")) {
    throw new Error(fixedCertificateResponse.error.message);
  }
  const keys = ["assessments", "allocations", "external_recognitions", "refunds", "deposit_candidates", "withdrawal_candidates"] as const;
  if (!record(data) || keys.some((key) => !Array.isArray(data[key]))) throw new Error("수납·환급 원장 조회 결과를 확인해주세요.");
  const sourceById = new Map(syncStatus.sources.map((source) => [source.id, source]));
  return {
    assessments: (data.assessments as CollectionAssessment[]).map((assessment) => ({
      ...assessment, ...sourceById.get(assessment.id),
    })),
    allocations: data.allocations as CollectionAllocation[],
    external_recognitions: data.external_recognitions as CollectionExternalRecognition[],
    refunds: data.refunds as CollectionRefund[],
    deposit_candidates: data.deposit_candidates as CollectionBankCandidate[],
    withdrawal_candidates: data.withdrawal_candidates as CollectionBankCandidate[],
    import_batches: importHistory(historyResponse.data).batches,
    ledger_sync: syncStatus,
    ledger_external_recognition_sync: externalRecognitionSyncStatus,
    fixed_certificate_assignment: fixedCertificateResponse.data
      ? fixedCertificateAssignmentResult(fixedCertificateResponse.data)
      : null,
    viewer: { user_id: member.user_id, permissions: [...member.permissions] },
  };
}

export async function runCollectionLedger(
  command: CollectionLedgerCommand,
  input: Record<string, unknown>,
  operationKey: string,
): Promise<CollectionLedgerResult> {
  const member = await requireReimbursementIdentity();
  if (!collectionLedgerCommands.includes(command)) throw new Error("지원하지 않는 수납·환급 처리입니다.");
  const allowed = decisionCommands.has(command)
    ? ["APPROVE", "CLOSE"].some((permission) => hasReimbursementPermission(member, permission as ReimbursementPermission))
    : hasReimbursementPermission(member, "PAY");
  if (!member.active || !allowed) throw new Error("이 수납·환급 업무를 처리할 권한이 없습니다.");
  if (!record(input) || Object.keys(input).some((key) => forbidden.has(key))) throw new Error("조직과 처리자 정보는 서버에서 확인합니다.");
  if (!operationKey.trim() || operationKey.length > 200) throw new Error("처리키를 확인해주세요.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("collection_ledger_command", {
    p_org: member.organization_id,
    p_actor: member.user_id,
    p_command: command,
    p_data: input,
    p_key: operationKey,
  });
  if (error) throw new Error(error.message);
  if (!record(data) || typeof data.id !== "string" || typeof data.status !== "string" || !Number.isSafeInteger(data.lock_version))
    throw new Error("수납·환급 처리 결과를 확인하지 못했어. 같은 처리키로 다시 확인해줘.");
  return data as CollectionLedgerResult;
}
