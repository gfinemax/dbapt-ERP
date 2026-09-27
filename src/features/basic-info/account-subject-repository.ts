import { getSupabaseServerClient } from "@/lib/supabase/server";

import type {
  AccountSubjectBusinessCategory,
  AccountSubjectNormalBalance,
  AccountSubjectRegistrationInput,
  AccountSubjectSource,
  AccountSubjectType,
  OperatingAccountSubjectCandidate,
  RegisteredAccountSubject,
} from "./account-subject-data";

export const accountSubjectRepositorySchema = "finance";

export type SupabaseAccountSubjectRow = {
  aliases: string[] | null;
  business_category: AccountSubjectBusinessCategory | null;
  code: string;
  created_at: string;
  description: string | null;
  id: string;
  is_active: boolean;
  name: string;
  normal_balance: AccountSubjectNormalBalance | null;
  parent_id: string | null;
  sort_order: number | null;
  source: AccountSubjectSource | null;
  subject_type: AccountSubjectType | null;
};

export type SupabaseAccountSubjectInsert = Omit<SupabaseAccountSubjectRow, "created_at" | "id">;

type OperatingBudgetRow = {
  budget_code: string | null;
  budget_item: string;
  calculation_basis: string | null;
  id: string;
  mapping_note: string | null;
  mapping_status: "CONFIRMED" | "POLICY_REVIEW";
  plan_item_label: string | null;
  plan_section: string | null;
};

type ExpenseDetailRow = {
  aliases: string[] | null;
  budget_id: string;
  name: string;
  policy_note: string | null;
};

export function mapAccountSubjectFromRow(row: SupabaseAccountSubjectRow): RegisteredAccountSubject {
  return {
    aliases: row.aliases ?? [],
    businessCategory: row.business_category ?? "미분류",
    code: row.code,
    description: row.description ?? "",
    id: row.id,
    isActive: row.is_active,
    name: row.name,
    normalBalance: row.normal_balance,
    parentId: row.parent_id,
    sortOrder: row.sort_order ?? 0,
    source: row.source,
    subjectType: row.subject_type,
  };
}

export function mapAccountSubjectToInsert(subject: RegisteredAccountSubject): SupabaseAccountSubjectInsert {
  if (!subject.subjectType || !["수입", "지출", "자산", "부채", "정산"].includes(subject.subjectType)
    || !subject.normalBalance || !["차변", "대변"].includes(subject.normalBalance)
    || !subject.source || !["운영비 예산안", "수지분석표", "직접등록"].includes(subject.source)) {
    throw new Error("계정과목의 유형, 차대변과 출처를 확인한 뒤 등록해줘.");
  }
  return {
    aliases: subject.aliases,
    business_category: subject.businessCategory,
    code: subject.code,
    description: subject.description,
    is_active: subject.isActive,
    name: subject.name,
    normal_balance: subject.normalBalance,
    parent_id: subject.parentId,
    sort_order: subject.sortOrder,
    source: subject.source,
    subject_type: subject.subjectType,
  };
}

const accountSubjectSelect =
  "id, code, name, parent_id, is_active, created_at, subject_type, normal_balance, business_category, source, aliases, description, sort_order";

export async function listAccountSubjectsFromSupabase(organizationId?: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  let query = supabase
    .schema(accountSubjectRepositorySchema)
    .from("account_subjects")
    .select(accountSubjectSelect)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (organizationId) query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  const { data, error } = await query;

  if (error) {
    return null;
  }

  return (data as SupabaseAccountSubjectRow[]).map(mapAccountSubjectFromRow);
}

function businessCategoryForSection(section: string | null): AccountSubjectBusinessCategory {
  if (section === "인건비") return "인건비";
  if (section === "사업추진비") return "사업추진비";
  return "운영비";
}

export function buildOperatingAccountSubjectCandidates(
  budgets: OperatingBudgetRow[],
  details: ExpenseDetailRow[],
): OperatingAccountSubjectCandidate[] {
  const detailsByBudget = new Map<string, ExpenseDetailRow[]>();
  for (const detail of details) {
    detailsByBudget.set(detail.budget_id, [...(detailsByBudget.get(detail.budget_id) ?? []), detail]);
  }

  return budgets.flatMap((budget, index) => {
    if (!budget.budget_code) return [];
    const linkedDetails = detailsByBudget.get(budget.id) ?? [];
    const name = budget.plan_item_label?.trim() || budget.budget_item.split(">").at(-1)?.trim() || budget.budget_item;
    const aliases = [...new Set([
      budget.budget_item,
      ...linkedDetails.flatMap((detail) => [detail.name, ...(detail.aliases ?? [])]),
    ].map((value) => value.trim()).filter((value) => value && value !== name))];
    const notes = [...new Set([
      budget.calculation_basis?.trim(),
      budget.mapping_note?.trim(),
      ...linkedDetails.map((detail) => detail.policy_note?.trim()),
    ].filter((value): value is string => Boolean(value)))];

    return [{
      aliases,
      budgetIds: [budget.id],
      businessCategory: businessCategoryForSection(budget.plan_section),
      code: budget.budget_code,
      description: notes.join(" · "),
      mappingNote: budget.mapping_note ?? "",
      mappingStatus: budget.mapping_status,
      name,
      normalBalance: "차변" as const,
      sortOrder: 100 + index * 10,
      source: "운영비 예산안" as const,
      subjectType: "지출" as const,
    }];
  });
}

export async function listOperatingAccountSubjectCandidates(
  organizationId: string,
  fiscalYear = new Date().getFullYear(),
): Promise<OperatingAccountSubjectCandidate[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: budgets, error: budgetError } = await supabase.schema("approval").from("budgets")
    .select("id,budget_item,budget_code,plan_section,plan_item_label,mapping_status,mapping_note,calculation_basis")
    .eq("organization_id", organizationId)
    .eq("fiscal_year", fiscalYear)
    .not("budget_code", "is", null)
    .order("budget_code");
  if (budgetError) throw new Error(`운영비 기준 계정과목 후보를 불러오지 못했어: ${budgetError.message}`);
  const typedBudgets = (budgets ?? []) as OperatingBudgetRow[];
  if (!typedBudgets.length) return [];

  const { data: details, error: detailError } = await supabase.schema(accountSubjectRepositorySchema)
    .from("expense_detail_items")
    .select("budget_id,name,aliases,policy_note")
    .in("budget_id", typedBudgets.map((budget) => budget.id))
    .eq("is_active", true)
    .order("sort_order");
  if (detailError) throw new Error(`운영비 세부항목을 불러오지 못했어: ${detailError.message}`);

  return buildOperatingAccountSubjectCandidates(typedBudgets, (details ?? []) as ExpenseDetailRow[]);
}

export async function createAccountSubjectsInSupabase(
  subjects: AccountSubjectRegistrationInput[],
  organizationId: string,
  actorId: string,
) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const items = subjects.map((subject) => ({
    aliases: subject.aliases,
    budget_ids: subject.budgetIds,
    business_category: subject.businessCategory,
    code: subject.code,
    description: subject.description,
    is_active: subject.isActive,
    name: subject.name,
    normal_balance: subject.normalBalance,
    parent_id: subject.parentId,
    sort_order: subject.sortOrder,
    source: subject.source,
    subject_type: subject.subjectType,
  }));
  const { data, error } = await supabase.schema(accountSubjectRepositorySchema).rpc("confirm_operating_account_subjects", {
    p_actor: actorId,
    p_items: items,
    p_org: organizationId,
  });

  if (error) {
    if (error.code === "23505") throw new Error("이미 등록된 계정과목 코드가 포함되어 있어. 목록을 새로고침한 뒤 다시 확인해줘.");
    throw new Error(`계정과목 등록에 실패했어: ${error.message}`);
  }

  return (data as SupabaseAccountSubjectRow[]).map(mapAccountSubjectFromRow);
}
