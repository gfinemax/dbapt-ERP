import { getSupabaseServerClient } from "@/lib/supabase/server";

import type {
  AccountSubjectBusinessCategory,
  AccountSubjectNormalBalance,
  AccountSubjectSource,
  AccountSubjectType,
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

export async function createAccountSubjectsInSupabase(subjects: RegisteredAccountSubject[]) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const codes = subjects.map((subject) => subject.code);
  const existing = await supabase.schema(accountSubjectRepositorySchema).from("account_subjects").select(accountSubjectSelect).in("code", codes);
  if (existing.error) throw new Error(`계정과목 중복 확인에 실패했습니다: ${existing.error.message}`);
  const existingCodes = new Set((existing.data as SupabaseAccountSubjectRow[]).map((row) => row.code));
  const inserts = subjects.filter((subject) => !existingCodes.has(subject.code)).map(mapAccountSubjectToInsert);
  if (!inserts.length) return (existing.data as SupabaseAccountSubjectRow[]).map(mapAccountSubjectFromRow);
  const { data, error } = await supabase
    .schema(accountSubjectRepositorySchema)
    .from("account_subjects")
    .insert(inserts)
    .select(accountSubjectSelect);

  if (error) {
    throw new Error(`Failed to create account subjects: ${error.message}`);
  }

  return (data as SupabaseAccountSubjectRow[]).map(mapAccountSubjectFromRow);
}
