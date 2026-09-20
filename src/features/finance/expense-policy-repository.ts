import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizeExpensePolicyValues,
  recommendedExpensePolicyValues,
  type ExpensePolicyImpactPreview,
  type ExpensePolicyValues,
  type ExpensePolicyVersion,
  type ExpensePolicyWorkspace,
} from "./expense-policy-settings";

type PolicyVersionRow = {
  id: string;
  version_no: number;
  status: ExpensePolicyVersion["status"];
  effective_from: string;
  effective_to: string | null;
  change_reason: string;
  policy_data: Partial<ExpensePolicyValues>;
  created_by: string | null;
  created_by_label: string;
  approved_by: string | null;
  approved_by_label: string | null;
  created_at: string;
  approved_at: string | null;
};

const emptyPreview: ExpensePolicyImpactPreview = {
  pendingExpenseResolutions: 0,
  pendingQuickExpenses: 0,
  pendingReimbursements: 0,
  delayedReimbursements: 0,
  longDelayedReimbursements: 0,
  priorYearReimbursements: 0,
};

export function mapExpensePolicyVersion(row: PolicyVersionRow): ExpensePolicyVersion {
  return {
    id: row.id,
    versionNo: row.version_no,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined,
    changeReason: row.change_reason,
    policy: normalizeExpensePolicyValues(row.policy_data),
    createdBy: row.created_by ?? undefined,
    createdByLabel: row.created_by_label,
    approvedBy: row.approved_by ?? undefined,
    approvedByLabel: row.approved_by_label ?? undefined,
    createdAt: row.created_at,
    approvedAt: row.approved_at ?? undefined,
  };
}

export async function getExpensePolicyWorkspace(organizationId: string): Promise<ExpensePolicyWorkspace> {
  const db = requireDb();
  const { data, error } = await db.schema("finance").from("expense_policy_versions")
    .select("id,version_no,status,effective_from,effective_to,change_reason,policy_data,created_by,created_by_label,approved_by,approved_by_label,created_at,approved_at")
    .eq("organization_id", organizationId).order("version_no", { ascending: false });
  if (isPolicySchemaMissing(error)) return { versions: [], preview: emptyPreview };
  if (error) throw new Error(`운영 기준 이력 조회 실패: ${error.message}`);
  const versions = ((data ?? []) as PolicyVersionRow[]).map(mapExpensePolicyVersion);
  const active = versions.find((version) => version.status === "ACTIVE" && isEffectiveToday(version));
  const preview = await previewExpensePolicy(organizationId, active?.policy ?? recommendedExpensePolicyValues);
  return { active, versions, preview };
}

export async function previewExpensePolicy(organizationId: string, policy: ExpensePolicyValues) {
  const db = requireDb();
  const { data, error } = await db.schema("finance").rpc("expense_policy_preview", { p_org: organizationId, p_policy: policy });
  if (isPolicySchemaMissing(error)) return emptyPreview;
  if (error) throw new Error(`운영 기준 영향 미리보기 실패: ${error.message}`);
  return { ...emptyPreview, ...(data as Partial<ExpensePolicyImpactPreview> | null) };
}

export async function runExpensePolicyCommand(input: {
  organizationId: string;
  actorId: string;
  command: "CREATE_DRAFT" | "UPDATE_DRAFT" | "SUBMIT" | "ACTIVATE" | "END";
  data: Record<string, unknown>;
}) {
  const db = requireDb();
  const { data, error } = await db.schema("finance").rpc("expense_policy_command", {
    p_actor: input.actorId,
    p_command: input.command,
    p_data: input.data,
    p_org: input.organizationId,
  });
  if (isPolicySchemaMissing(error)) throw new Error("운영 기준 버전 저장소가 아직 배포되지 않았어. 데이터베이스 마이그레이션을 먼저 적용해줘.");
  if (error) throw new Error(error.message);
  return data;
}

export function isPolicySchemaMissing(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST202" || error?.code === "PGRST205";
}

function isEffectiveToday(version: ExpensePolicyVersion) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  return version.effectiveFrom <= today && (!version.effectiveTo || version.effectiveTo >= today);
}

function requireDb() {
  const db = getSupabaseServerClient();
  if (!db) throw new Error("Supabase가 설정되지 않았어.");
  return db;
}
