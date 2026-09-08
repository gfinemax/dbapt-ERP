import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireReimbursementIdentity } from "@/features/finance/reimbursement-auth";

export type ApprovalAuthorization = {
  drafter_user_id: string | null;
  steps: { order: number; user_id: string; legacy_step: { step_id: string; approver_label: string; approver_role: string } }[];
  version: number;
};
export type ApprovalCommandContext = { expectedVersion: number; key: string };
export async function requireApprovalActor(permission: "READ" | "ADMIN" = "READ") {
  const actor = await requireReimbursementIdentity();
  if (permission === "ADMIN" ? !actor.permissions.includes("ADMIN") : !actor.permissions.some(p => ["ADMIN", "APPROVE", "PAY"].includes(p)))
    throw new Error("기안 업무 권한이 없습니다.");
  return actor;
}
export function approvalDb() {
  const db = getSupabaseServerClient();
  if (!db) throw new Error("기안 저장소가 설정되지 않았습니다.");
  return db;
}
export function missingApprovalBinding(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
export async function requireApprovalRecord(id: string, write = false) {
  const actor = await requireApprovalActor();
  const db = approvalDb();
  const { data: document, error } = await db.schema("approval").from("documents").select("*")
    .eq("id", id).eq("organization_id", actor.organization_id).is("deleted_at", null).maybeSingle();
  if (error || !document) throw new Error("조회 권한이 있는 기안을 찾을 수 없습니다.");
  const { data, error: bindingError } = await db.schema("approval").from("document_authorization_bindings")
    .select("drafter_user_id,steps,version").eq("document_id", id).eq("organization_id", actor.organization_id).maybeSingle();
  if (bindingError && !missingApprovalBinding(bindingError)) throw new Error("기안 계정 연결을 확인하지 못했습니다.");
  const binding = data as ApprovalAuthorization | null;
  if (write && !actor.permissions.includes("ADMIN") && binding?.drafter_user_id !== actor.user_id)
    throw new Error("연결된 기안자 또는 관리자만 수정할 수 있습니다.");
  return { actor, document, binding };
}
export async function commitApprovalCommand(command: string, id: string | null, payload: Record<string, unknown>, context: ApprovalCommandContext) {
  const actor = await requireApprovalActor();
  if (!context || !Number.isInteger(context.expectedVersion) || context.expectedVersion < 0 || !context.key?.trim())
    throw new Error("기안 버전과 처리키를 확인한 뒤 다시 시도해주세요.");
  const { data, error } = await approvalDb().schema("approval").rpc("document_command", {
    p_org: actor.organization_id, p_actor: actor.user_id, p_command: command, p_id: id,
    p_expected_version: context.expectedVersion, p_payload: payload, p_key: context.key,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; version: number; approval_status: string };
}
