import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import { hasReimbursementPermission, type ReimbursementPermission } from "./reimbursement-domain";
export type AdvanceUsageKind = "RESOLUTION" | "QUICK" | "PERSONAL";
export type AdvanceFunding = { allocation_id: string; kind: "INITIAL" | "ADDITIONAL" };
export type AdvanceUsageInput = { source_kind: AdvanceUsageKind; source_id: string; signature: string; evidence_file_id: string | null };
export type AdvanceCandidate = { transaction_id: string; resolution_id: string; number: string; title: string; signature: string; legacy_review_required: boolean; existing_draft_id: string | null;
  allocations: { id: string; payment_id: string; amount: number; paid_at: string; counterparty: string }[];
  returns: { id: string; original_allocation_id: string; amount: number; paid_at: string }[] };
export type AdvanceUsageSource = { kind: AdvanceUsageKind; id: string; title: string; amount: number; used_on: string; signature: string; existing_draft_id: string | null; review_reason: string | null };
export type AdvanceDraft = { id: string; transaction_id: string; lock_version: number; title: string; memo: string; source_stale: boolean; needs_review: boolean; funding: AdvanceFunding[];
  usage: (AdvanceUsageInput & { title: string; amount: number; used_on: string })[];
  totals: { initial_paid: number; additional_paid: number; returned: number; draft_used: number; balance: number | null } };
export type AdvanceWorkspace = { candidates: AdvanceCandidate[]; usage_sources: AdvanceUsageSource[]; drafts: AdvanceDraft[];
  evidence: { id: string; file_name: string; content_hash: string }[]; viewer: { permissions: ReimbursementPermission[] }; policy: { approval_enabled: false; budget_posting_enabled: false } };

export async function loadAdvanceSettlements(): Promise<AdvanceWorkspace> {
  const member = await requireReimbursementIdentity();
  if (!member.active || !member.permissions.some(p => ["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"].includes(p))) throw new Error("선지급 정산 조회 권한이 필요합니다.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("advance_settlement_workspace", { p_org: member.organization_id, p_actor: member.user_id });
  if (error) throw new Error(`선지급 정산 조회 실패: ${error.message}`);
  if (!data || !["candidates", "usage_sources", "drafts", "evidence"].every(key => Array.isArray(data[key]))) throw new Error("선지급 정산 조회 결과를 확인해주세요.");
  return { candidates: data.candidates, usage_sources: data.usage_sources, drafts: data.drafts, evidence: data.evidence, viewer: { permissions: [...member.permissions] }, policy: { approval_enabled: false, budget_posting_enabled: false } };
}
export async function saveAdvanceSettlement(input: Record<string, unknown>, operationKey: string): Promise<{ id: string; lock_version: number }> {
  const member = await requireReimbursementIdentity();
  if (!hasReimbursementPermission(member, "APPROVE")) throw new Error("선지급 정산 초안 저장 권한이 필요합니다.");
  if (!operationKey.trim() || operationKey.length > 200) throw new Error("처리키를 확인해주세요.");
  if (!input || ["actor_id", "organization_id", "p_org", "p_actor"].some(key => Object.hasOwn(input, key))) throw new Error("정산 입력 형식을 확인해주세요.");
  if (input.id && (!Number.isSafeInteger(input.lock_version) || Number(input.lock_version) < 1)) throw new Error("정산 초안 버전을 확인해주세요.");
  if (!input.source_signature || !input.transaction_id) throw new Error("실제 원지급을 확인해주세요.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("advance_settlement_command", { p_org: member.organization_id, p_actor: member.user_id, p_command: "DRAFT_SAVE", p_data: input, p_key: operationKey });
  if (error) throw new Error(error.message);
  if (!data?.id || !Number.isSafeInteger(data.lock_version) || data.lock_version < 1) throw new Error("저장 결과를 확인하지 못했습니다. 같은 처리키로 다시 확인해주세요.");
  return { id: data.id, lock_version: data.lock_version };
}
