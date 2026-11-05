import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type LedgerBankSubjectRuleDirection = "DEPOSIT" | "WITHDRAWAL";
export type LedgerBankSubjectRuleMatchType = "CATEGORY" | "DESCRIPTION";
export type LedgerBankSubjectRuleStatus = "CONFIRMED" | "POLICY_REVIEW" | "TRANSFER";
export type LedgerAccountSubjectSyncStatus = "MATCHED" | "CREATED" | "POLICY_REVIEW" | "TRANSFER";

export type LedgerAccountSubjectSyncInput = {
  categoryGroup: string;
  categoryName: string;
  direction: LedgerBankSubjectRuleDirection;
  ledgerCategoryId: string;
};

export type LedgerAccountSubjectSyncResult = {
  created_count: number;
  matched_count: number;
  review_count: number;
  saved_count: number;
  transfer_count: number;
};

export type LedgerBankSubjectRuleInput = {
  accountSubjectId: string | null;
  direction: LedgerBankSubjectRuleDirection;
  matchType: LedgerBankSubjectRuleMatchType;
  note?: string;
  ruleStatus: LedgerBankSubjectRuleStatus;
  sourceKey: string;
};

export type LedgerBankSubjectTransactionQuery = {
  direction: LedgerBankSubjectRuleDirection;
  matchType: LedgerBankSubjectRuleMatchType;
  page: number;
  sourceKey: string;
};

export type LedgerBankSubjectTransactionRow = {
  accountName: string | null;
  balanceAmount: number | null;
  bankName: string | null;
  depositAmount: number;
  description: string;
  managementMemo: string | null;
  memo: string | null;
  sourceTransactionId: string;
  transactionDate: string | null;
  transactionTime: string | null;
  withdrawalAmount: number;
};

export type LedgerBankSubjectTransactionPage = {
  page: number;
  pageSize: number;
  rows: LedgerBankSubjectTransactionRow[];
  totalCount: number;
  totalPages: number;
};

export type LedgerBankSubjectRuleGroup = {
  amountTotal: number;
  candidateAccountSubjectId: string | null;
  candidateAccountSubjectName: string | null;
  direction: LedgerBankSubjectRuleDirection;
  id: string;
  matchType: LedgerBankSubjectRuleMatchType;
  ruleAccountSubjectId: string | null;
  ruleStatus: LedgerBankSubjectRuleStatus | null;
  sourceGroup: string | null;
  sourceKey: string;
  sourceLabel: string;
  syncStatus: LedgerAccountSubjectSyncStatus | null;
  transactionCount: number;
};

export type LedgerBankSubjectRuleWorkboard = {
  blankDescriptionCount: number;
  categoryGroups: LedgerBankSubjectRuleGroup[];
  descriptionGroups: LedgerBankSubjectRuleGroup[];
  savedRuleCount: number;
  syncedCategoryCount: number;
  transactionCount: number;
};

export const emptyLedgerBankSubjectRuleWorkboard: LedgerBankSubjectRuleWorkboard = {
  blankDescriptionCount: 0,
  categoryGroups: [],
  descriptionGroups: [],
  savedRuleCount: 0,
  syncedCategoryCount: 0,
  transactionCount: 0,
};

type LedgerSourceRow = {
  payload: Record<string, unknown>;
};

type LedgerTransactionSourceRow = LedgerSourceRow & {
  ledger_account_id: string;
  source_transaction_id: string;
};

type LedgerRuleRow = {
  account_subject_id: string | null;
  direction: LedgerBankSubjectRuleDirection;
  match_type: LedgerBankSubjectRuleMatchType;
  rule_status: LedgerBankSubjectRuleStatus;
  source_key: string;
};

type LedgerAccountSubjectLinkRow = {
  account_subject_id: string | null;
  direction: LedgerBankSubjectRuleDirection;
  ledger_category_id: string;
  sync_status: LedgerAccountSubjectSyncStatus;
};

function stringValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(payload: Record<string, unknown>, key: string) {
  const value = Number(payload[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function nullableNumberValue(payload: Record<string, unknown>, key: string) {
  if (payload[key] === null || payload[key] === undefined || payload[key] === "") return null;
  const value = Number(payload[key]);
  return Number.isFinite(value) ? value : null;
}

export function normalizeLedgerDescription(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "").trim();
}

function groupId(matchType: LedgerBankSubjectRuleMatchType, sourceKey: string, direction: LedgerBankSubjectRuleDirection) {
  return `${matchType}:${sourceKey}:${direction}`;
}

function uniqueExactCandidate(label: string, direction: LedgerBankSubjectRuleDirection, accountSubjects: RegisteredAccountSubject[]) {
  const candidates = accountSubjects.filter((subject) => {
    if (!subject.isActive || subject.name !== label) return false;
    if (direction === "DEPOSIT" && subject.subjectType === "지출") return false;
    if (direction === "WITHDRAWAL" && subject.subjectType === "수입") return false;
    return true;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

export function buildLedgerBankSubjectRuleWorkboard(
  sourceRows: LedgerSourceRow[],
  ruleRows: LedgerRuleRow[],
  accountSubjects: RegisteredAccountSubject[],
  linkRows: LedgerAccountSubjectLinkRow[] = [],
): LedgerBankSubjectRuleWorkboard {
  const groups = new Map<string, LedgerBankSubjectRuleGroup>();
  let blankDescriptionCount = 0;
  let transactionCount = 0;

  for (const row of sourceRows) {
    const payload = row.payload ?? {};
    const depositAmount = numberValue(payload, "deposit_amount");
    const withdrawalAmount = numberValue(payload, "withdrawal_amount");
    if ((depositAmount > 0) === (withdrawalAmount > 0)) continue;
    transactionCount += 1;
    const direction: LedgerBankSubjectRuleDirection = depositAmount > 0 ? "DEPOSIT" : "WITHDRAWAL";
    const categoryId = stringValue(payload, "ledger_category_id");
    const categoryName = stringValue(payload, "category_name");
    const categoryGroup = stringValue(payload, "category_group");
    const description = stringValue(payload, "description");
    const hasUsableCategory = Boolean(categoryId && categoryName && categoryName !== "확인필요");
    const matchType: LedgerBankSubjectRuleMatchType = hasUsableCategory ? "CATEGORY" : "DESCRIPTION";
    const sourceKey = hasUsableCategory ? categoryId! : normalizeLedgerDescription(description ?? "");
    if (!sourceKey) {
      blankDescriptionCount += 1;
      continue;
    }
    const id = groupId(matchType, sourceKey, direction);
    const sourceLabel = hasUsableCategory ? categoryName! : description!;
    const existing = groups.get(id);
    if (existing) {
      existing.transactionCount += 1;
      existing.amountTotal += depositAmount || withdrawalAmount;
      continue;
    }
    const candidate = uniqueExactCandidate(sourceLabel, direction, accountSubjects);
    groups.set(id, {
      amountTotal: depositAmount || withdrawalAmount,
      candidateAccountSubjectId: candidate?.id ?? null,
      candidateAccountSubjectName: candidate?.name ?? null,
      direction,
      id,
      matchType,
      ruleAccountSubjectId: null,
      ruleStatus: null,
      sourceGroup: hasUsableCategory ? categoryGroup : null,
      sourceKey,
      sourceLabel,
      syncStatus: null,
      transactionCount: 1,
    });
  }

  const subjectsById = new Map(accountSubjects.map((subject) => [subject.id, subject]));
  for (const link of linkRows) {
    const group = groups.get(groupId("CATEGORY", link.ledger_category_id, link.direction));
    if (!group) continue;
    group.syncStatus = link.sync_status;
    const linkedSubject = link.account_subject_id ? subjectsById.get(link.account_subject_id) : null;
    if (linkedSubject?.isActive) {
      group.candidateAccountSubjectId = linkedSubject.id;
      group.candidateAccountSubjectName = linkedSubject.name;
    }
  }

  for (const rule of ruleRows) {
    const group = groups.get(groupId(rule.match_type, rule.source_key, rule.direction));
    if (!group) continue;
    group.ruleAccountSubjectId = rule.account_subject_id;
    group.ruleStatus = rule.rule_status;
  }

  const sorted = [...groups.values()].sort((left, right) =>
    right.transactionCount - left.transactionCount || left.sourceLabel.localeCompare(right.sourceLabel, "ko-KR"));
  return {
    blankDescriptionCount,
    categoryGroups: sorted.filter((group) => group.matchType === "CATEGORY"),
    descriptionGroups: sorted.filter((group) => group.matchType === "DESCRIPTION"),
    savedRuleCount: sorted.filter((group) => group.ruleStatus !== null).length,
    syncedCategoryCount: sorted.filter((group) => group.matchType === "CATEGORY" && group.syncStatus !== null).length,
    transactionCount,
  };
}

export function buildLedgerAccountSubjectSyncInputs(workboard: LedgerBankSubjectRuleWorkboard): LedgerAccountSubjectSyncInput[] {
  return workboard.categoryGroups.map((group) => ({
    categoryGroup: group.sourceGroup ?? "미분류",
    categoryName: group.sourceLabel,
    direction: group.direction,
    ledgerCategoryId: group.sourceKey,
  }));
}

export const ledgerBankSubjectTransactionPageSize = 25;

export function buildLedgerBankSubjectTransactionPage(
  sourceRows: LedgerTransactionSourceRow[],
  query: LedgerBankSubjectTransactionQuery,
): LedgerBankSubjectTransactionPage {
  const matchingRows = sourceRows.flatMap((row): LedgerBankSubjectTransactionRow[] => {
    const payload = row.payload ?? {};
    const depositAmount = numberValue(payload, "deposit_amount");
    const withdrawalAmount = numberValue(payload, "withdrawal_amount");
    if ((depositAmount > 0) === (withdrawalAmount > 0)) return [];
    const direction: LedgerBankSubjectRuleDirection = depositAmount > 0 ? "DEPOSIT" : "WITHDRAWAL";
    if (direction !== query.direction) return [];
    const categoryId = stringValue(payload, "ledger_category_id");
    const categoryName = stringValue(payload, "category_name");
    const description = stringValue(payload, "description") ?? "적요 없음";
    const hasUsableCategory = Boolean(categoryId && categoryName && categoryName !== "확인필요");
    const matches = query.matchType === "CATEGORY"
      ? hasUsableCategory && categoryId === query.sourceKey
      : !hasUsableCategory && normalizeLedgerDescription(description === "적요 없음" ? "" : description) === query.sourceKey;
    if (!matches) return [];
    return [{
      accountName: stringValue(payload, "account_name"),
      balanceAmount: nullableNumberValue(payload, "balance_amount"),
      bankName: stringValue(payload, "bank_name"),
      depositAmount,
      description,
      managementMemo: stringValue(payload, "management_memo"),
      memo: stringValue(payload, "memo"),
      sourceTransactionId: row.source_transaction_id,
      transactionDate: stringValue(payload, "transaction_date"),
      transactionTime: stringValue(payload, "transaction_time"),
      withdrawalAmount,
    }];
  }).sort((left, right) => {
    const leftDateTime = `${left.transactionDate ?? ""}T${left.transactionTime ?? ""}`;
    const rightDateTime = `${right.transactionDate ?? ""}T${right.transactionTime ?? ""}`;
    return rightDateTime.localeCompare(leftDateTime) || right.sourceTransactionId.localeCompare(left.sourceTransactionId, "ko-KR", { numeric: true });
  });
  const totalCount = matchingRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / ledgerBankSubjectTransactionPageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const offset = (page - 1) * ledgerBankSubjectTransactionPageSize;
  return {
    page,
    pageSize: ledgerBankSubjectTransactionPageSize,
    rows: matchingRows.slice(offset, offset + ledgerBankSubjectTransactionPageSize),
    totalCount,
    totalPages,
  };
}

const sourceReadBatchSize = 1000;

export async function loadLedgerBankSubjectRuleWorkboard(
  organizationId: string,
  accountSubjects: RegisteredAccountSubject[],
): Promise<LedgerBankSubjectRuleWorkboard> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return emptyLedgerBankSubjectRuleWorkboard;
  const sourceRows: LedgerSourceRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.schema("finance").from("ledger_bank_transaction_sources")
      .select("payload")
      .eq("organization_id", organizationId)
      .eq("source_system", "dbapt-ledger")
      .eq("import_status", "IMPORTED")
      .range(offset, offset + sourceReadBatchSize - 1);
    if (error) throw new Error(`Ledger 분류 원본을 불러오지 못했어: ${error.message}`);
    const batch = (data ?? []) as LedgerSourceRow[];
    sourceRows.push(...batch);
    if (batch.length < sourceReadBatchSize) break;
    offset += sourceReadBatchSize;
  }
  const { data: rules, error: ruleError } = await supabase.schema("finance").from("ledger_bank_subject_rules")
    .select("account_subject_id,direction,match_type,rule_status,source_key")
    .eq("organization_id", organizationId)
    .eq("source_system", "dbapt-ledger");
  if (ruleError) throw new Error(`Ledger 분류 규칙을 불러오지 못했어: ${ruleError.message}`);
  const { data: links, error: linkError } = await supabase.schema("finance").from("ledger_account_subject_links")
    .select("account_subject_id,direction,ledger_category_id,sync_status")
    .eq("organization_id", organizationId)
    .eq("source_system", "dbapt-ledger");
  if (linkError) throw new Error(`Ledger 계정과목 동기화 상태를 불러오지 못했어: ${linkError.message}`);
  return buildLedgerBankSubjectRuleWorkboard(
    sourceRows,
    (rules ?? []) as LedgerRuleRow[],
    accountSubjects,
    (links ?? []) as LedgerAccountSubjectLinkRow[],
  );
}

export async function loadLedgerBankSubjectTransactions(
  organizationId: string,
  query: LedgerBankSubjectTransactionQuery,
): Promise<LedgerBankSubjectTransactionPage> {
  if (!organizationId || !query.sourceKey.trim() || query.sourceKey.length > 500) throw new Error("조회할 Ledger 거래 분류를 확인해줘.");
  if (!(["CATEGORY", "DESCRIPTION"] as const).includes(query.matchType)) throw new Error("Ledger 거래 조회 기준을 확인해줘.");
  if (!(["DEPOSIT", "WITHDRAWAL"] as const).includes(query.direction)) throw new Error("Ledger 거래 입출금 방향을 확인해줘.");
  if (!Number.isSafeInteger(query.page) || query.page < 1 || query.page > 10000) throw new Error("Ledger 거래 조회 페이지를 확인해줘.");
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const sourceRows: LedgerTransactionSourceRow[] = [];
  let offset = 0;
  while (true) {
    let request = supabase.schema("finance").from("ledger_bank_transaction_sources")
      .select("source_transaction_id,ledger_account_id,payload")
      .eq("organization_id", organizationId)
      .eq("source_system", "dbapt-ledger")
      .eq("import_status", "IMPORTED");
    if (query.matchType === "CATEGORY") request = request.eq("payload->>ledger_category_id", query.sourceKey);
    const { data, error } = await request.range(offset, offset + sourceReadBatchSize - 1);
    if (error) throw new Error(`Ledger 거래 내용을 불러오지 못했어: ${error.message}`);
    const batch = (data ?? []) as LedgerTransactionSourceRow[];
    sourceRows.push(...batch);
    if (batch.length < sourceReadBatchSize) break;
    offset += sourceReadBatchSize;
  }
  return buildLedgerBankSubjectTransactionPage(sourceRows, query);
}

export async function syncLedgerAccountSubjects(
  organizationId: string,
  actorId: string,
  items: LedgerAccountSubjectSyncInput[],
) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.schema("finance").rpc("sync_ledger_account_subjects", {
    p_actor: actorId,
    p_items: items.map((item) => ({
      category_group: item.categoryGroup,
      category_name: item.categoryName,
      direction: item.direction,
      ledger_category_id: item.ledgerCategoryId,
    })),
    p_org: organizationId,
  });
  if (error) throw new Error(`Ledger 계정과목을 ERP에 동기화하지 못했어: ${error.message}`);
  return data as LedgerAccountSubjectSyncResult;
}

export async function saveLedgerBankSubjectRules(
  organizationId: string,
  actorId: string,
  rules: LedgerBankSubjectRuleInput[],
) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.schema("finance").rpc("save_ledger_bank_subject_rules", {
    p_actor: actorId,
    p_org: organizationId,
    p_rules: rules.map((rule) => ({
      account_subject_id: rule.accountSubjectId,
      direction: rule.direction,
      match_type: rule.matchType,
      note: rule.note ?? "",
      rule_status: rule.ruleStatus,
      source_key: rule.sourceKey,
    })),
  });
  if (error) throw new Error(`Ledger 분류 규칙을 저장하지 못했어: ${error.message}`);
  return data as { recommended_count: number; saved_count: number };
}
