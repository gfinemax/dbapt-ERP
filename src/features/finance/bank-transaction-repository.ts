import { getSupabaseServerClient } from "@/lib/supabase/server";
import { inferTransactionKind, readSuppliedBankTransactionId } from "./bank-transaction-import";
import type { ParsedBankTransactionRow } from "./bank-transaction-import";

export const bankTransactionRepositorySchema = "finance";

export type SupabaseBankTransactionInsert = {
  balance_amount: number | null;
  bank_account_id: string;
  bank_transaction_uid: string;
  branch_name: string | null;
  classification_status: "UNREVIEWED" | "RECOMMENDED";
  counterparty: string | null;
  deposit_amount: number;
  description: string;
  match_status: ParsedBankTransactionRow["matchStatus"];
  raw_payload: Record<string, string>;
  recommendation_reason: string | null;
  recommended_account_subject_id: string | null;
  recommended_account_subject_name: string | null;
  transacted_at: string;
  transaction_kind: ParsedBankTransactionRow["transactionKind"];
  uploaded_account_title: string | null;
  uploaded_major_category: string | null;
  withdrawal_amount: number;
  organization_id?: string;
};

export type SupabaseBankTransactionRow = SupabaseBankTransactionInsert & {
  id: string;
};

export type BankTransactionClassificationStatus = "UNREVIEWED" | "RECOMMENDED" | "CONFIRMED" | "DEFERRED" | "EXCLUDED";
export type BankTransactionSourceReconciliationStatus = "SOURCE_REVIEW_REQUIRED";

export type BankTransactionReviewRow = {
  bankAccountId: string;
  classificationStatus: BankTransactionClassificationStatus;
  confirmedAccountSubjectId?: string | null;
  confirmedAccountSubjectName?: string | null;
  counterparty: string;
  description: string;
  id: string;
  recommendedAccountSubjectId: string | null;
  recommendedAccountSubjectName: string | null;
  recommendationReason: string | null;
  transactedAt: string;
  transactionKind: "입금" | "출금" | null;
  amount: number;
};

export type BankTransactionListFilters = {
  bankAccountId?: string;
  classificationStatus?: BankTransactionClassificationStatus;
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  sourceReconciliationStatus?: BankTransactionSourceReconciliationStatus;
};

export type BankTransactionStatusCounts = Record<BankTransactionClassificationStatus | "ALL", number>;

export type LedgerBankZeroAmountSourceRow = {
  description: string;
  issueDetail: string;
  sourceTransactionId: string;
  transactionDate: string;
  transactionKind: string;
  transactionTime: string | null;
};

export type LedgerBankSourceSummary = {
  erpTransactionCount: number;
  googleSheetSourceCount: number;
  ledgerSourceCount: number;
  ledgerOriginalCount: number;
  otherSourceCount: number;
  zeroAmountSourceCount: number;
  zeroAmountSources: LedgerBankZeroAmountSourceRow[];
};

export type BankTransactionSourceCounts = Pick<
  LedgerBankSourceSummary,
  "erpTransactionCount" | "googleSheetSourceCount" | "ledgerSourceCount" | "otherSourceCount"
>;

export type BankTransactionListRow = BankTransactionReviewRow & {
  balanceAmount: number | null;
  branchName: string;
  classificationNote?: string;
  memo?: string;
  originalDescription?: string;
  originalMemo?: string;
  sourceReconciliationIssue?: BankTransactionSourceReconciliationIssue;
  sheetOverrides?: BankTransactionSheetOverride[];
  uploadedAccountTitle?: string;
  uploadedCategory?: string;
};

export type BankTransactionSourceReconciliationIssue = {
  bankAccountId: string;
  bankTransactionId: string;
  comparedAt: string;
  depositImpact: number;
  downstreamLinkLabels: string[];
  reason: string;
  sourceDocumentId: string;
  sourceSheet: string;
  sourceSystem: string;
  sourceTransactionId: string;
  transactedAt: string;
  withdrawalImpact: number;
};

export type BankTransactionSourceReconciliationSummary = {
  depositImpact: number;
  issueCount: number;
  issues: BankTransactionSourceReconciliationIssue[];
  latestComparedAt: string | null;
  withdrawalImpact: number;
};

export type BankTransactionSheetOverride = {
  fieldName: "ACCOUNT_CATEGORY" | "DESCRIPTION" | "MEMO";
  importedAt: string;
  originalValue: string;
  sourceDocumentId: string;
  sourceRow: number;
  sourceSheet: string;
  sourceValue: string;
};

export type BankTransactionListPage = {
  page: number;
  pageSize: number;
  rows: BankTransactionListRow[];
  totalCount: number;
  totalPages: number;
};

export type BankTransactionReviewPage = {
  page: number;
  pageSize: number;
  rows: BankTransactionReviewRow[];
  totalCount: number;
  totalPages: number;
};

export type BankTransactionSubjectAssignment = {
  accountSubjectId: string;
  note?: string;
  transactionId: string;
};

export type BankTransactionReviewAction = "NOTE" | "CONFIRM" | "DEFER" | "EXCLUDE";
export type BankTransactionRuleScope = "SINGLE" | "MATCHING" | "MATCHING_AND_FUTURE";

export type BankTransactionReviewInput = {
  accountSubjectId?: string | null;
  action: BankTransactionReviewAction;
  adminNote?: string;
  ruleScope?: BankTransactionRuleScope;
  transactionId: string;
};

export type BankTransactionReviewResult = {
  account_subject_id: string | null;
  classification_note: string | null;
  classification_status: BankTransactionClassificationStatus;
  applied_count?: number;
  direction?: "DEPOSIT" | "WITHDRAWAL";
  match_text?: string;
  rule_id?: string | null;
  transaction_id: string;
};

export type BankTransactionRulePreview = {
  activeRuleAccountSubjectId: string | null;
  activeRuleAccountSubjectName: string | null;
  activeRuleId: string | null;
  direction: "DEPOSIT" | "WITHDRAWAL";
  matchText: string;
  pendingAmount: number;
  pendingCount: number;
};

const bankTransactionSelect =
  "id, bank_account_id, bank_transaction_uid, transacted_at, transaction_kind, description, deposit_amount, withdrawal_amount, balance_amount, counterparty, branch_name, uploaded_major_category, uploaded_account_title, recommended_account_subject_id, recommended_account_subject_name, match_status, raw_payload, classification_status, recommendation_reason";

export function mapBankTransactionToInsert(row: ParsedBankTransactionRow): SupabaseBankTransactionInsert {
  return {
    balance_amount: row.balanceAmount,
    bank_account_id: row.bankAccountId,
    bank_transaction_uid: buildBankTransactionUid(row),
    branch_name: row.branchName || null,
    classification_status: row.recommendedAccountSubjectName ? "RECOMMENDED" : "UNREVIEWED",
    counterparty: row.branchName || null,
    deposit_amount: row.depositAmount,
    description: row.description,
    match_status: row.matchStatus,
    raw_payload: row.raw,
    recommendation_reason: row.matchStatus === "업로드분류"
      ? "업로드 파일의 계정과목명과 내부 계정과목이 일치함"
      : row.matchStatus === "자동추천" ? "거래 적요 키워드로 추천함" : null,
    recommended_account_subject_id: row.recommendedAccountSubjectId,
    recommended_account_subject_name: row.recommendedAccountSubjectName,
    transacted_at: row.transactedAt,
    transaction_kind: row.transactionKind === null ? null : inferTransactionKind(row.transactionKind, row.depositAmount, row.withdrawalAmount),
    uploaded_account_title: row.uploadedAccountTitle || null,
    uploaded_major_category: row.uploadedMajorCategory || null,
    withdrawal_amount: row.withdrawalAmount,
  };
}

export function buildBankTransactionUid(row: ParsedBankTransactionRow) {
  const supplied = readSuppliedBankTransactionId(row.raw);
  if (supplied) return `BANK:${row.bankAccountId}:${supplied}`;
  const amount = row.withdrawalAmount || row.depositAmount;
  return `FALLBACK:${row.bankAccountId}:${row.transactedAt}:${amount}:${row.description.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR")}`;
}

export async function createBankTransactionsInSupabase(rows: ParsedBankTransactionRow[], organizationId: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .schema(bankTransactionRepositorySchema)
    .from("bank_transactions")
    .upsert(rows.map((row) => ({ ...mapBankTransactionToInsert(row), organization_id: organizationId })), {
      ignoreDuplicates: true,
      onConflict: "bank_transaction_uid",
    })
    .select(bankTransactionSelect);

  if (error) {
    throw new Error(`Failed to create bank transactions: ${error.message}`);
  }

  const transactions = data as SupabaseBankTransactionRow[];
  return { duplicateCount: rows.length - transactions.length, transactions };
}

export const bankTransactionPageSize = 50;

const bankTransactionClassificationStatuses: BankTransactionClassificationStatus[] = [
  "UNREVIEWED",
  "RECOMMENDED",
  "CONFIRMED",
  "DEFERRED",
  "EXCLUDED",
];

const ledgerBankSourceSystem = "dbapt-ledger";
const currentLedgerSourceStatuses = ["PENDING_MAPPING", "IMPORTED", "INVALID", "CONFLICT"];
const ledgerSourceReadBatchSize = 1_000;

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourceString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function sourceAmount(payload: Record<string, unknown>, key: string) {
  const value = Number(payload[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function mapZeroAmountLedgerSource(row: Record<string, unknown>): LedgerBankZeroAmountSourceRow | null {
  const payload = recordValue(row.payload);
  if (sourceAmount(payload, "deposit_amount") !== 0 || sourceAmount(payload, "withdrawal_amount") !== 0) return null;
  return {
    description: sourceString(payload, "description") || "적요 없음",
    issueDetail: typeof row.issue_detail === "string" && row.issue_detail.trim()
      ? row.issue_detail.trim()
      : "입출금액이 모두 0원이어서 회계 거래에서 제외됨",
    sourceTransactionId: String(row.source_transaction_id ?? ""),
    transactionDate: sourceString(payload, "transaction_date"),
    transactionKind: sourceString(payload, "transaction_kind") || "구분 없음",
    transactionTime: sourceString(payload, "transaction_time") || null,
  };
}

export async function loadBankTransactionSourceCounts(
  organizationId: string,
  bankAccountId: string,
): Promise<BankTransactionSourceCounts> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return emptyBankTransactionSourceCounts();
  const baseQuery = () => supabase
    .schema(bankTransactionRepositorySchema)
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("bank_account_id", bankAccountId)
    .is("deleted_at", null);
  const [allResult, ledgerResult, googleSheetResult] = await Promise.all([
    baseQuery(),
    baseQuery().eq("source_system", ledgerBankSourceSystem),
    baseQuery().eq("source_system", "google-sheet"),
  ]);
  const queryError = allResult.error ?? ledgerResult.error ?? googleSheetResult.error;
  if (queryError) throw new Error(`현재 ERP 거래 원본 구성을 불러오지 못했어: ${queryError.message}`);

  const erpTransactionCount = allResult.count ?? 0;
  const ledgerSourceCount = ledgerResult.count ?? 0;
  const googleSheetSourceCount = googleSheetResult.count ?? 0;
  return {
    erpTransactionCount,
    googleSheetSourceCount,
    ledgerSourceCount,
    otherSourceCount: Math.max(erpTransactionCount - ledgerSourceCount - googleSheetSourceCount, 0),
  };
}

export async function loadLedgerBankSourceSummary(
  organizationId: string,
  bankAccountId: string,
): Promise<LedgerBankSourceSummary | undefined> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return undefined;
  const [{ data: mappings, error: mappingError }, sourceCounts] = await Promise.all([
    supabase.schema(bankTransactionRepositorySchema)
      .from("ledger_bank_account_mappings")
      .select("ledger_account_id")
      .eq("organization_id", organizationId)
      .eq("source_system", ledgerBankSourceSystem)
      .eq("bank_account_id", bankAccountId)
      .eq("mapping_status", "CONFIRMED"),
    loadBankTransactionSourceCounts(organizationId, bankAccountId),
  ]);
  if (mappingError) throw new Error(`Ledger 계좌 연결 정보를 불러오지 못했어: ${mappingError.message}`);
  const ledgerAccountIds = [...new Set((mappings ?? []).map((row) => String(row.ledger_account_id)).filter(Boolean))];
  if (!ledgerAccountIds.length) {
    return {
      ...sourceCounts,
      ledgerOriginalCount: 0,
      zeroAmountSourceCount: 0,
      zeroAmountSources: [],
    };
  }

  const currentCountResult = await supabase.schema(bankTransactionRepositorySchema).from("ledger_bank_transaction_sources")
    .select("source_transaction_id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("source_system", ledgerBankSourceSystem)
    .in("ledger_account_id", ledgerAccountIds)
    .in("import_status", currentLedgerSourceStatuses);
  if (currentCountResult.error) throw new Error(`Ledger 원본 건수를 불러오지 못했어: ${currentCountResult.error.message}`);

  const invalidRows: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.schema(bankTransactionRepositorySchema).from("ledger_bank_transaction_sources")
      .select("source_transaction_id,payload,issue_detail")
      .eq("organization_id", organizationId)
      .eq("source_system", ledgerBankSourceSystem)
      .in("ledger_account_id", ledgerAccountIds)
      .eq("import_status", "INVALID")
      .order("source_version", { ascending: true })
      .range(offset, offset + ledgerSourceReadBatchSize - 1);
    if (error) throw new Error(`Ledger 제외 원본을 불러오지 못했어: ${error.message}`);
    const batch = (data ?? []) as Record<string, unknown>[];
    invalidRows.push(...batch);
    if (batch.length < ledgerSourceReadBatchSize) break;
    offset += ledgerSourceReadBatchSize;
  }

  const zeroAmountSources = invalidRows
    .map(mapZeroAmountLedgerSource)
    .filter((row): row is LedgerBankZeroAmountSourceRow => row !== null)
    .sort((left, right) => `${right.transactionDate}T${right.transactionTime ?? "00:00:00"}|${right.sourceTransactionId}`
      .localeCompare(`${left.transactionDate}T${left.transactionTime ?? "00:00:00"}|${left.sourceTransactionId}`));
  return {
    ...sourceCounts,
    ledgerOriginalCount: currentCountResult.count ?? 0,
    zeroAmountSourceCount: zeroAmountSources.length,
    zeroAmountSources,
  };
}

function emptyBankTransactionSourceCounts(): BankTransactionSourceCounts {
  return {
    erpTransactionCount: 0,
    googleSheetSourceCount: 0,
    ledgerSourceCount: 0,
    otherSourceCount: 0,
  };
}

function normalizedBankTransactionSearch(value?: string) {
  return value?.replace(/[%_*,()]/g, " ").replace(/\s+/g, " ").trim();
}

export async function listBankTransactions(
  organizationId: string,
  requestedPage = 1,
  filters: BankTransactionListFilters = {},
  transactionIds?: string[],
): Promise<BankTransactionListPage> {
  const supabase = getSupabaseServerClient();
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  if (!supabase) return { page, pageSize: bankTransactionPageSize, rows: [], totalCount: 0, totalPages: 1 };
  if (transactionIds && transactionIds.length === 0) {
    return { page, pageSize: bankTransactionPageSize, rows: [], totalCount: 0, totalPages: 1 };
  }
  const from = (page - 1) * bankTransactionPageSize;
  let request = supabase.schema(bankTransactionRepositorySchema).from("bank_transactions")
    .select("id,bank_account_id,transacted_at,transaction_kind,description,memo,deposit_amount,withdrawal_amount,balance_amount,counterparty,branch_name,uploaded_major_category,uploaded_account_title,recommended_account_subject_id,recommended_account_subject_name,confirmed_account_subject_id,classification_status,classification_note,recommendation_reason", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (filters.bankAccountId) request = request.eq("bank_account_id", filters.bankAccountId);
  if (filters.classificationStatus) request = request.eq("classification_status", filters.classificationStatus);
  if (transactionIds) request = request.in("id", transactionIds);
  if (filters.dateFrom) request = request.gte("transacted_at", `${filters.dateFrom}T00:00:00+09:00`);
  if (filters.dateTo) request = request.lte("transacted_at", `${filters.dateTo}T23:59:59.999+09:00`);
  const search = normalizedBankTransactionSearch(filters.query);
  if (search) request = request.or(`description.ilike.%${search}%,counterparty.ilike.%${search}%,memo.ilike.%${search}%,uploaded_major_category.ilike.%${search}%,uploaded_account_title.ilike.%${search}%,branch_name.ilike.%${search}%,classification_note.ilike.%${search}%`);
  const { count, data, error } = await request
    .order("transacted_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + bankTransactionPageSize - 1);
  if (error) throw new Error(`은행거래 목록을 불러오지 못했어: ${error.message}`);
  const confirmedSubjectIds = [...new Set((data ?? []).map((row) => row.confirmed_account_subject_id).filter((value): value is string => Boolean(value)))];
  const confirmedSubjectNames = new Map<string, string>();
  if (confirmedSubjectIds.length) {
    const { data: subjectRows, error: subjectError } = await supabase.schema(bankTransactionRepositorySchema)
      .from("account_subjects")
      .select("id,name")
      .in("id", confirmedSubjectIds);
    if (subjectError) throw new Error(`확정 계정과목을 불러오지 못했어: ${subjectError.message}`);
    for (const subject of subjectRows ?? []) confirmedSubjectNames.set(subject.id, subject.name);
  }
  const overrideMap = await loadLatestBankTransactionSheetOverrides(organizationId, (data ?? []).map((row) => row.id));
  const rows = (data ?? []).map((row) => {
    const overrides = overrideMap.get(row.id) ?? [];
    const categoryOverride = overrides.find((override) => override.fieldName === "ACCOUNT_CATEGORY");
    const descriptionOverride = overrides.find((override) => override.fieldName === "DESCRIPTION");
    const memoOverride = overrides.find((override) => override.fieldName === "MEMO");
    return ({
    amount: Number(row.withdrawal_amount) || Number(row.deposit_amount) || 0,
    balanceAmount: row.balance_amount === null ? null : Number(row.balance_amount),
    bankAccountId: row.bank_account_id,
    branchName: row.branch_name ?? "",
    classificationNote: row.classification_note ?? "",
    classificationStatus: row.classification_status,
    confirmedAccountSubjectId: row.confirmed_account_subject_id,
    confirmedAccountSubjectName: row.confirmed_account_subject_id ? confirmedSubjectNames.get(row.confirmed_account_subject_id) ?? null : null,
    counterparty: row.counterparty ?? "",
    description: descriptionOverride?.sourceValue ?? row.description,
    id: row.id,
    memo: memoOverride?.sourceValue ?? row.memo ?? "",
    originalDescription: row.description,
    originalMemo: row.memo ?? "",
    recommendedAccountSubjectId: row.recommended_account_subject_id,
    recommendedAccountSubjectName: row.recommended_account_subject_name,
    recommendationReason: row.recommendation_reason,
    sheetOverrides: overrides,
    transactedAt: row.transacted_at,
    transactionKind: row.transaction_kind,
    uploadedAccountTitle: row.uploaded_account_title ?? "",
    uploadedCategory: categoryOverride?.sourceValue ?? row.uploaded_major_category ?? "",
  }); }) as BankTransactionListRow[];
  const totalCount = count ?? rows.length;
  return {
    page,
    pageSize: bankTransactionPageSize,
    rows,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / bankTransactionPageSize)),
  };
}

async function loadLatestBankTransactionSheetOverrides(
  organizationId: string,
  transactionIds: string[],
): Promise<Map<string, BankTransactionSheetOverride[]>> {
  const result = new Map<string, BankTransactionSheetOverride[]>();
  if (!transactionIds.length) return result;
  const supabase = getSupabaseServerClient();
  if (!supabase) return result;
  const { data, error } = await supabase.schema(bankTransactionRepositorySchema)
    .from("bank_transaction_sheet_field_overrides")
    .select("bank_transaction_id,field_name,source_value,original_value,source_document_id,source_sheet,source_row,imported_at")
    .eq("organization_id", organizationId)
    .eq("apply_status", "APPLIED")
    .in("bank_transaction_id", transactionIds)
    .order("imported_at", { ascending: false });
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code ?? "")) return result;
    throw new Error(`Google 시트 보정 이력을 불러오지 못했어: ${error.message}`);
  }
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const unique = `${row.bank_transaction_id}:${row.field_name}`;
    if (seen.has(unique)) continue;
    seen.add(unique);
    const override: BankTransactionSheetOverride = {
      fieldName: row.field_name,
      importedAt: row.imported_at,
      originalValue: row.original_value ?? "",
      sourceDocumentId: row.source_document_id,
      sourceRow: Number(row.source_row),
      sourceSheet: row.source_sheet,
      sourceValue: row.source_value,
    };
    result.set(row.bank_transaction_id, [...(result.get(row.bank_transaction_id) ?? []), override]);
  }
  return result;
}

export async function countBankTransactionsByStatus(
  organizationId: string,
  filters: Omit<BankTransactionListFilters, "classificationStatus"> = {},
  transactionIds?: string[],
): Promise<BankTransactionStatusCounts> {
  const supabase = getSupabaseServerClient();
  const emptyCounts: BankTransactionStatusCounts = {
    ALL: 0,
    CONFIRMED: 0,
    DEFERRED: 0,
    EXCLUDED: 0,
    RECOMMENDED: 0,
    UNREVIEWED: 0,
  };
  if (!supabase) return emptyCounts;
  if (transactionIds && transactionIds.length === 0) return emptyCounts;
  const search = normalizedBankTransactionSearch(filters.query);

  const entries = await Promise.all([undefined, ...bankTransactionClassificationStatuses].map(async (status) => {
    let request = supabase.schema(bankTransactionRepositorySchema).from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    if (filters.bankAccountId) request = request.eq("bank_account_id", filters.bankAccountId);
    if (transactionIds) request = request.in("id", transactionIds);
    if (filters.dateFrom) request = request.gte("transacted_at", `${filters.dateFrom}T00:00:00+09:00`);
    if (filters.dateTo) request = request.lte("transacted_at", `${filters.dateTo}T23:59:59.999+09:00`);
    if (search) request = request.or(`description.ilike.%${search}%,counterparty.ilike.%${search}%,memo.ilike.%${search}%,uploaded_major_category.ilike.%${search}%,uploaded_account_title.ilike.%${search}%,branch_name.ilike.%${search}%,classification_note.ilike.%${search}%`);
    if (status) request = request.eq("classification_status", status);
    const { count, error } = await request;
    if (error) throw new Error(`은행거래 상태별 건수를 불러오지 못했어: ${error.message}`);
    return [status ?? "ALL", count ?? 0] as const;
  }));

  return { ...emptyCounts, ...Object.fromEntries(entries) };
}

type ReconciliationBatchRow = {
  bank_account_id: string;
  id: string;
  imported_at: string;
  source_document_id: string;
  source_sheet: string;
};

type ReconciliationImportRow = {
  bank_transaction_id: string | null;
  batch_id: string;
  source_payload: Record<string, unknown> | null;
};

type ReconciliationTransactionRow = {
  bank_account_id: string;
  classification_status: BankTransactionClassificationStatus;
  deposit_amount: number | string | null;
  id: string;
  source_system: string | null;
  source_transaction_id: string | null;
  transacted_at: string;
  withdrawal_amount: number | string | null;
};

export function deriveBankTransactionSourceReconciliationIssues(input: {
  downstreamLinks?: Map<string, string[]>;
  importRows: ReconciliationImportRow[];
  latestBatches: ReconciliationBatchRow[];
  transactions: ReconciliationTransactionRow[];
}): BankTransactionSourceReconciliationIssue[] {
  const batchByAccount = new Map(input.latestBatches.map((batch) => [batch.bank_account_id, batch]));
  const matchedTransactionIds = new Set<string>();
  const coverageByBatch = new Map<string, { dateFrom: string; dateTo: string }>();
  for (const row of input.importRows) {
    if (row.bank_transaction_id) matchedTransactionIds.add(row.bank_transaction_id);
    const sourceDate = bankTransactionSheetSourceDate(row.source_payload);
    if (!sourceDate) continue;
    const current = coverageByBatch.get(row.batch_id);
    coverageByBatch.set(row.batch_id, {
      dateFrom: !current || sourceDate < current.dateFrom ? sourceDate : current.dateFrom,
      dateTo: !current || sourceDate > current.dateTo ? sourceDate : current.dateTo,
    });
  }

  return input.transactions.flatMap((transaction) => {
    const batch = batchByAccount.get(transaction.bank_account_id);
    if (!batch || matchedTransactionIds.has(transaction.id)) return [];
    const coverage = coverageByBatch.get(batch.id);
    const transactionDate = transaction.transacted_at.slice(0, 10);
    if (!coverage || transactionDate < coverage.dateFrom || transactionDate > coverage.dateTo) return [];
    if (["DEFERRED", "EXCLUDED"].includes(transaction.classification_status)) return [];
    return [{
      bankAccountId: transaction.bank_account_id,
      bankTransactionId: transaction.id,
      comparedAt: batch.imported_at,
      depositImpact: Number(transaction.deposit_amount) || 0,
      downstreamLinkLabels: input.downstreamLinks?.get(transaction.id) ?? [],
      reason: `최신 Google 시트(${batch.source_sheet}) 대조 기간 ${coverage.dateFrom}~${coverage.dateTo} 안의 ERP 거래지만, 업로드된 어느 원본 행에도 연결되지 않았어. 실제 은행 거래 여부와 시트 누락 여부를 확인해줘.`,
      sourceDocumentId: batch.source_document_id,
      sourceSheet: batch.source_sheet,
      sourceSystem: transaction.source_system ?? "ERP",
      sourceTransactionId: transaction.source_transaction_id ?? transaction.id,
      transactedAt: transaction.transacted_at,
      withdrawalImpact: Number(transaction.withdrawal_amount) || 0,
    }];
  }).sort((left, right) => right.transactedAt.localeCompare(left.transactedAt));
}

function bankTransactionSheetSourceDate(payload: Record<string, unknown> | null) {
  if (!payload) return null;
  for (const key of ["거래일자", "거래일", "날짜", "일자", "transaction_date"]) {
    const value = payload[key];
    if (typeof value !== "string") continue;
    const normalized = value.trim().replace(/[./]/g, "-");
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  }
  return null;
}

export async function loadBankTransactionSourceReconciliationSummary(
  organizationId: string,
  bankAccountId?: string,
): Promise<BankTransactionSourceReconciliationSummary> {
  const empty = { depositImpact: 0, issueCount: 0, issues: [], latestComparedAt: null, withdrawalImpact: 0 };
  const supabase = getSupabaseServerClient();
  if (!supabase) return empty;

  let batchRequest = supabase.schema(bankTransactionRepositorySchema).from("bank_transaction_sheet_import_batches")
    .select("id,bank_account_id,source_document_id,source_sheet,imported_at")
    .eq("organization_id", organizationId)
    .order("imported_at", { ascending: false });
  if (bankAccountId) batchRequest = batchRequest.eq("bank_account_id", bankAccountId);
  const { data: batchData, error: batchError } = await batchRequest;
  if (batchError) {
    if (["42P01", "PGRST205"].includes(batchError.code ?? "")) return empty;
    throw new Error(`Google 시트 대조 배치를 불러오지 못했어: ${batchError.message}`);
  }
  const latestByAccount = new Map<string, ReconciliationBatchRow>();
  for (const row of (batchData ?? []) as ReconciliationBatchRow[]) {
    if (!latestByAccount.has(row.bank_account_id)) latestByAccount.set(row.bank_account_id, row);
  }
  const latestBatches = [...latestByAccount.values()];
  if (!latestBatches.length) return empty;

  const importRows = await readPagedReconciliationRows<ReconciliationImportRow>(async (from, to) => {
    const result = await supabase.schema(bankTransactionRepositorySchema).from("bank_transaction_sheet_import_rows")
      .select("batch_id,bank_transaction_id,source_payload")
      .in("batch_id", (batchData ?? []).map((batch) => batch.id))
      .range(from, to);
    return { data: result.data as ReconciliationImportRow[] | null, error: result.error };
  }, "Google 시트 연결 행");
  const transactions = await readPagedReconciliationRows<ReconciliationTransactionRow>(async (from, to) => {
    const result = await supabase.schema(bankTransactionRepositorySchema).from("bank_transactions")
      .select("id,bank_account_id,transacted_at,deposit_amount,withdrawal_amount,classification_status,source_system,source_transaction_id")
      .eq("organization_id", organizationId)
      .in("bank_account_id", latestBatches.map((batch) => batch.bank_account_id))
      .is("deleted_at", null)
      .range(from, to);
    return { data: result.data as ReconciliationTransactionRow[] | null, error: result.error };
  }, "ERP 은행거래");
  const provisional = deriveBankTransactionSourceReconciliationIssues({ importRows, latestBatches, transactions });
  const downstreamLinks = await loadBankTransactionDownstreamLinks(organizationId, provisional.map((issue) => issue.bankTransactionId));
  const issues = deriveBankTransactionSourceReconciliationIssues({ downstreamLinks, importRows, latestBatches, transactions });
  return {
    depositImpact: issues.reduce((sum, issue) => sum + issue.depositImpact, 0),
    issueCount: issues.length,
    issues,
    latestComparedAt: issues.reduce<string | null>((latest, issue) => !latest || issue.comparedAt > latest ? issue.comparedAt : latest, null),
    withdrawalImpact: issues.reduce((sum, issue) => sum + issue.withdrawalImpact, 0),
  };
}

async function readPagedReconciliationRows<T>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw new Error(`${label}을 불러오지 못했어: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function loadBankTransactionDownstreamLinks(organizationId: string, transactionIds: string[]) {
  const result = new Map<string, string[]>();
  if (!transactionIds.length) return result;
  const supabase = getSupabaseServerClient();
  if (!supabase) return result;
  const add = (transactionId: string, label: string) => {
    const labels = result.get(transactionId) ?? [];
    if (!labels.includes(label)) labels.push(label);
    result.set(transactionId, labels);
  };
  const definitions = [
    ["finance", "vouchers", "bank_transaction_id", "전표"],
    ["finance", "expense_resolutions", "bank_transaction_id", "지출결의"],
    ["finance", "quick_expense_records", "bank_transaction_id", "간편지출"],
    ["finance", "personal_reimbursements", "bank_transaction_id", "개인지출 정산"],
    ["approval", "small_expenses", "bank_transaction_id", "소액지출"],
    ["finance", "workflow_payments", "bank_transaction_id", "통합 지급"],
    ["finance", "collection_receipt_allocations", "bank_transaction_id", "분담금 수납"],
    ["finance", "collection_refunds", "bank_transaction_id", "환급"],
  ] as const;
  for (const [schema, table, column, label] of definitions) {
    const { data, error } = await supabase.schema(schema).from(table)
      .select(column)
      .eq("organization_id", organizationId)
      .in(column, transactionIds);
    if (error) throw new Error(`은행거래 후속 연결(${label})을 확인하지 못했어: ${error.message}`);
    for (const row of data ?? []) {
      const transactionId = String((row as Record<string, unknown>)[column] ?? "");
      if (transactionId) add(transactionId, label);
    }
  }
  for (const column of ["withdrawal_id", "deposit_id"] as const) {
    const { data, error } = await supabase.schema("finance").from("workflow_transfers")
      .select(column)
      .eq("organization_id", organizationId)
      .in(column, transactionIds);
    if (error) throw new Error(`은행거래 후속 연결(계좌이체)을 확인하지 못했어: ${error.message}`);
    for (const row of data ?? []) {
      const transactionId = String((row as Record<string, unknown>)[column] ?? "");
      if (transactionId) add(transactionId, "계좌이체");
    }
  }
  return result;
}

export async function listBankTransactionsForSubjectReview(
  organizationId: string,
  requestedPage = 1,
): Promise<BankTransactionReviewPage> {
  const supabase = getSupabaseServerClient();
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  if (!supabase) return { page, pageSize: bankTransactionPageSize, rows: [], totalCount: 0, totalPages: 1 };
  const from = (page - 1) * bankTransactionPageSize;
  const { count, data, error } = await supabase.schema(bankTransactionRepositorySchema).from("bank_transactions")
    .select("id,bank_account_id,transacted_at,transaction_kind,description,deposit_amount,withdrawal_amount,counterparty,recommended_account_subject_id,recommended_account_subject_name,classification_status,recommendation_reason", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("classification_status", ["UNREVIEWED", "RECOMMENDED", "DEFERRED"])
    .order("transacted_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + bankTransactionPageSize - 1);
  if (error) throw new Error(`은행거래 검토 목록을 불러오지 못했어: ${error.message}`);
  const rows = (data ?? []).map((row) => ({
    amount: Number(row.withdrawal_amount) || Number(row.deposit_amount) || 0,
    bankAccountId: row.bank_account_id,
    classificationStatus: row.classification_status,
    counterparty: row.counterparty ?? "",
    description: row.description,
    id: row.id,
    recommendedAccountSubjectId: row.recommended_account_subject_id,
    recommendedAccountSubjectName: row.recommended_account_subject_name,
    recommendationReason: row.recommendation_reason,
    transactedAt: row.transacted_at,
    transactionKind: row.transaction_kind,
  })) as BankTransactionReviewRow[];
  const totalCount = count ?? rows.length;
  return {
    page,
    pageSize: bankTransactionPageSize,
    rows,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / bankTransactionPageSize)),
  };
}

export async function confirmBankTransactionSubjects(
  organizationId: string,
  actorId: string,
  assignments: BankTransactionSubjectAssignment[],
) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.schema(bankTransactionRepositorySchema).rpc("confirm_bank_transaction_subjects", {
    p_actor: actorId,
    p_assignments: assignments.map((assignment) => ({
      account_subject_id: assignment.accountSubjectId,
      note: assignment.note ?? "",
      transaction_id: assignment.transactionId,
    })),
    p_org: organizationId,
  });
  if (error) throw new Error(`은행거래 계정과목 확정에 실패했어: ${error.message}`);
  return data as Array<{ account_subject_id: string; transaction_id: string }>;
}

export async function saveBankTransactionReview(
  organizationId: string,
  actorId: string,
  input: BankTransactionReviewInput,
) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const isRuleConfirmation = input.action === "CONFIRM" && input.ruleScope && input.ruleScope !== "SINGLE";
  const rpcName = isRuleConfirmation ? "save_bank_transaction_review_rule" : "save_bank_transaction_review";
  const rpcInput = isRuleConfirmation ? {
    p_account_subject_id: input.accountSubjectId || null,
    p_actor: actorId,
    p_note: input.adminNote ?? "",
    p_org: organizationId,
    p_scope: input.ruleScope,
    p_transaction_id: input.transactionId,
  } : {
    p_account_subject_id: input.accountSubjectId || null,
    p_action: input.action,
    p_actor: actorId,
    p_note: input.adminNote ?? "",
    p_org: organizationId,
    p_transaction_id: input.transactionId,
  };
  const { data, error } = await supabase.schema(bankTransactionRepositorySchema).rpc(rpcName, rpcInput);
  if (error) throw new Error(`은행거래 검토 저장에 실패했어: ${error.message}`);
  const result = (data as BankTransactionReviewResult[] | null)?.[0];
  if (!result) throw new Error("저장된 은행거래 검토 결과를 확인하지 못했어.");
  return result;
}

export async function loadBankTransactionRulePreview(
  organizationId: string,
  actorId: string,
  transactionId: string,
): Promise<BankTransactionRulePreview | undefined> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return undefined;
  const { data, error } = await supabase.schema(bankTransactionRepositorySchema).rpc("preview_bank_transaction_counterparty_rule", {
    p_actor: actorId,
    p_org: organizationId,
    p_transaction_id: transactionId,
  });
  if (error) throw new Error(`같은 거래 자동 분류 대상을 불러오지 못했어: ${error.message}`);
  const row = (data as Array<{
    active_rule_account_subject_id: string | null;
    active_rule_account_subject_name: string | null;
    active_rule_id: string | null;
    direction: "DEPOSIT" | "WITHDRAWAL";
    match_text: string;
    pending_amount: number | string;
    pending_count: number;
  }> | null)?.[0];
  if (!row) return undefined;
  return {
    activeRuleAccountSubjectId: row.active_rule_account_subject_id,
    activeRuleAccountSubjectName: row.active_rule_account_subject_name,
    activeRuleId: row.active_rule_id,
    direction: row.direction,
    matchText: row.match_text,
    pendingAmount: Number(row.pending_amount) || 0,
    pendingCount: Number(row.pending_count) || 0,
  };
}
