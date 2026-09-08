import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireReimbursementIdentity } from "./reimbursement-auth";
import type { ReimbursementMember } from "./reimbursement-domain";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

export type ExpenseAuthorization = {
  author_user_id: string | null;
  steps: { order: number; approver_user_id: string; legacy_step: { approver: string; role: string; order: number } }[];
  version: number;
};

export function isMissingExpenseBinding(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export async function requireExpenseActor(permission: "READ" | "ADMIN" | "PAY" = "READ") {
  const actor = await requireReimbursementIdentity();
  const allowed = permission === "READ" ? actor.permissions.some(p => ["ADMIN", "APPROVE", "PAY"].includes(p))
    : actor.permissions.includes("ADMIN") || actor.permissions.includes(permission);
  if (!allowed) throw new Error("지출결의 업무 권한이 없습니다.");
  return actor;
}

export function expenseDb() {
  const db = getSupabaseServerClient();
  if (!db) throw new Error("지출 저장소가 설정되지 않았습니다.");
  return db;
}

export async function expenseBinding(id: string, actor: ReimbursementMember) {
  const { data, error } = await expenseDb().schema("finance").from("expense_authorization_bindings")
    .select("author_user_id,steps,version").eq("organization_id", actor.organization_id).eq("resolution_id", id).maybeSingle();
  // Pre-migration reads remain available; missing bindings never authorize approval.
  if (isMissingExpenseBinding(error)) return null;
  if (error) throw new Error("지출결의 계정 연결을 확인하지 못했습니다.");
  return data as ExpenseAuthorization | null;
}

export async function requireExpenseRecord(id: string, write = false, actor?: ReimbursementMember) {
  actor ??= await requireExpenseActor();
  const { data, error } = await expenseDb().schema("finance").from("expense_resolutions")
    .select("resolution_data,organization_id").eq("id", id).eq("organization_id", actor.organization_id).is("deleted_at", null).maybeSingle();
  if (error || !data) throw new Error("조회 권한이 있는 지출결의서를 찾을 수 없습니다.");
  const binding = await expenseBinding(id, actor);
  if (write && !actor.permissions.includes("ADMIN") && binding?.author_user_id !== actor.user_id)
    throw new Error("연결된 작성자 또는 관리자만 수정할 수 있습니다. 계정 연결을 확인해주세요.");
  return { actor, binding, resolution: data.resolution_data as ManagedExpenseResolution };
}

export async function assertExpenseRelatedRow(table: string, id: string, actor: ReimbursementMember, schema = "finance") {
  const allowed = ["bank_transactions", "corporate_card_transactions", "business_partners", "documents"];
  if (!allowed.includes(table)) throw new Error("지원하지 않는 연결 자료입니다.");
  const { data, error } = await expenseDb().schema(schema).from(table).select("id").eq("id", id).eq("organization_id", actor.organization_id).maybeSingle();
  if (error || !data) throw new Error("같은 조합에 속한 연결 자료만 사용할 수 있습니다.");
}

export async function requireExpenseFile(storagePath: string, write = false) {
  const actor = await requireExpenseActor();
  const db = expenseDb();
  const { data: links, error: linkError } = await db.schema("finance").from("expense_resolution_evidence")
    .select("resolution_id").eq("storage_bucket", "expense-evidence").eq("storage_path", storagePath);
  if (linkError) throw new Error("증빙 원본 연결을 확인하지 못했습니다.");
  if (links?.length) {
    for (const link of links) await requireExpenseRecord(link.resolution_id, write, actor);
    return { actor, attached: true };
  }
  const { data: supporting, error: supportingError } = await db.schema("finance").from("expense_supporting_files")
    .select("resolution_id").eq("storage_bucket", "expense-evidence").eq("storage_path", storagePath);
  if (supportingError) throw new Error("보완자료 원본 연결을 확인하지 못했습니다.");
  if (supporting?.length) {
    for (const link of supporting) await requireExpenseRecord(link.resolution_id, write, actor);
    return { actor, attached: true };
  }
  const { data: job, error } = await db.schema("finance").from("expense_evidence_ocr_jobs")
    .select("id,created_by").eq("organization_id", actor.organization_id).eq("storage_bucket", "expense-evidence").eq("storage_path", storagePath).maybeSingle();
  if (error || !job || job.created_by !== actor.user_id) throw new Error("본인이 업로드한 미연결 증빙만 사용할 수 있습니다.");
  return { actor, attached: false };
}

export async function requireExpenseOcrJob(id: string, write = false) {
  await requireExpenseActor();
  const { data, error } = await expenseDb().schema("finance").from("expense_evidence_ocr_jobs").select("storage_path").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("OCR 작업을 찾을 수 없습니다.");
  return requireExpenseFile(data.storage_path, write);
}

export async function requireExpenseFact(id: string, resolutionId: string, write = false) {
  const access = await requireExpenseRecord(resolutionId, write);
  const { data, error } = await expenseDb().schema("finance").from("expense_fact_confirmations")
    .select("id").eq("id", id).eq("resolution_id", resolutionId).is("deleted_at", null).maybeSingle();
  if (error || !data) throw new Error("해당 결의서의 사실확인서를 찾을 수 없습니다.");
  return access;
}
