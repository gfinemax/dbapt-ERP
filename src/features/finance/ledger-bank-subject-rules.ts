import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type LedgerBankSubjectRuleDirection = "DEPOSIT" | "WITHDRAWAL";
export type LedgerBankSubjectRuleMatchType = "CATEGORY" | "DESCRIPTION";
export type LedgerBankSubjectRuleStatus = "CONFIRMED" | "POLICY_REVIEW" | "TRANSFER";

export type LedgerBankSubjectRuleInput = {
  accountSubjectId: string | null;
  direction: LedgerBankSubjectRuleDirection;
  matchType: LedgerBankSubjectRuleMatchType;
  note?: string;
  ruleStatus: LedgerBankSubjectRuleStatus;
  sourceKey: string;
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
  transactionCount: number;
};

export type LedgerBankSubjectRuleWorkboard = {
  blankDescriptionCount: number;
  categoryGroups: LedgerBankSubjectRuleGroup[];
  descriptionGroups: LedgerBankSubjectRuleGroup[];
  savedRuleCount: number;
  transactionCount: number;
};

export const emptyLedgerBankSubjectRuleWorkboard: LedgerBankSubjectRuleWorkboard = {
  blankDescriptionCount: 0,
  categoryGroups: [],
  descriptionGroups: [],
  savedRuleCount: 0,
  transactionCount: 0,
};

type LedgerSourceRow = {
  payload: Record<string, unknown>;
};

type LedgerRuleRow = {
  account_subject_id: string | null;
  direction: LedgerBankSubjectRuleDirection;
  match_type: LedgerBankSubjectRuleMatchType;
  rule_status: LedgerBankSubjectRuleStatus;
  source_key: string;
};

function stringValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(payload: Record<string, unknown>, key: string) {
  const value = Number(payload[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
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
      transactionCount: 1,
    });
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
    transactionCount,
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
  return buildLedgerBankSubjectRuleWorkboard(sourceRows, (rules ?? []) as LedgerRuleRow[], accountSubjects);
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
