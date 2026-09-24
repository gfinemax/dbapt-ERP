import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import { hasReimbursementPermission, type ReimbursementPermission } from "./reimbursement-domain";

export type AccountingSourceKind = "RECOGNITION" | "PAYMENT" | "TRANSFER";
export type AccountingLineInput = { account_subject_id: string | null; description: string; debit_amount: number; credit_amount: number };
export type AccountingSource = { kind: AccountingSourceKind; id: string; title: string; number: string | null; amount: number | null; occurred_at: string | null; signature: string; existing_voucher_id: string | null; blocked_reason?: string };
export type AccountingVoucher = {
  id: string; voucher_no: string; voucher_date: string; approval_status: string; memo: string | null;
  managed: boolean; lock_version: number | null; source_kind: AccountingSourceKind | null; source_id: string | null; source_stale: boolean;
  lines: (AccountingLineInput & { id: string; sort_order: number })[];
};
export type AccountingWorkspace = {
  vouchers: AccountingVoucher[];
  accounts: { id: string; code: string; name: string; subject_type: string; normal_balance: string; is_active: boolean }[];
  sources: AccountingSource[];
  viewer: { permissions: ReimbursementPermission[] };
  policy: { confirmation_enabled: boolean };
};
export type AccountingCommand = "DRAFT_CREATE" | "DRAFT_SAVE";
export type AccountingCommandResult = { id: string; lock_version: number };
export type AccountingBatchConfirmationInput = { items: { id: string; lock_version: number }[]; reason: string };
export type AccountingBatchConfirmationResult = { confirmed_count: number; confirmed_ids: string[] };

export async function assertLegacyVoucherEditable(resolutionId: string): Promise<void> {
  const member = await requireReimbursementIdentity();
  if (!hasReimbursementPermission(member, "APPROVE")) throw new Error("전표 처리 권한이 필요합니다.");
  const { error } = await reimbursementDb().schema("finance").rpc("accounting_legacy_check", { p_org: member.organization_id, p_actor: member.user_id, p_resolution_id: resolutionId });
  if (error) throw new Error(error.message);
}

export async function loadAccountingWorkspace(): Promise<AccountingWorkspace> {
  const member = await requireReimbursementIdentity();
  if (!member.active || !member.permissions.some(p => ["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"].includes(p))) throw new Error("회계 자료 조회 권한이 필요합니다.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("accounting_workspace", { p_org: member.organization_id, p_actor: member.user_id });
  if (error) throw new Error(`회계 자료 조회 실패: ${error.message}`);
  if (!data || !["vouchers", "accounts", "sources"].every(key => Array.isArray(data[key]))) throw new Error("회계 자료 조회 결과를 확인해주세요.");
  return { vouchers: data.vouchers, accounts: data.accounts, sources: data.sources, viewer: { permissions: [...member.permissions] }, policy: { confirmation_enabled: true } };
}

export async function confirmAccountingDrafts(input: AccountingBatchConfirmationInput, operationKey: string): Promise<AccountingBatchConfirmationResult> {
  const member = await requireReimbursementIdentity();
  if (!member.active || !hasReimbursementPermission(member, "APPROVE")) throw new Error("전표 일괄 확정 권한이 필요합니다.");
  if (!operationKey.trim() || operationKey.length > 200) throw new Error("처리키를 확인해주세요.");
  if (!input || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) throw new Error("확정할 전표를 1건 이상 100건 이하로 선택해주세요.");
  if (typeof input.reason !== "string" || input.reason.trim().length < 2 || input.reason.length > 500) throw new Error("일괄 확인 근거를 2자 이상 500자 이하로 입력해주세요.");
  const ids = new Set<string>();
  for (const item of input.items) {
    if (!item || typeof item.id !== "string" || !item.id || !Number.isSafeInteger(item.lock_version) || item.lock_version < 1 || ids.has(item.id)) throw new Error("확정할 전표와 버전을 다시 확인해주세요.");
    ids.add(item.id);
  }
  const { data, error } = await reimbursementDb().schema("finance").rpc("accounting_batch_confirm", {
    p_org: member.organization_id,
    p_actor: member.user_id,
    p_data: { items: input.items, reason: input.reason.trim() },
    p_key: operationKey,
  });
  if (error) throw new Error(error.message);
  if (!data || !Number.isSafeInteger(data.confirmed_count) || data.confirmed_count !== input.items.length || !Array.isArray(data.confirmed_ids)) throw new Error("전표 일괄 확정 결과를 확인하지 못했습니다. 같은 처리키로 다시 확인해주세요.");
  return { confirmed_count: data.confirmed_count, confirmed_ids: data.confirmed_ids };
}

export async function runAccountingCommand(command: AccountingCommand, input: Record<string, unknown>, operationKey: string): Promise<AccountingCommandResult> {
  const member = await requireReimbursementIdentity();
  if (!hasReimbursementPermission(member, "APPROVE")) throw new Error("회계 초안 저장 권한이 필요합니다.");
  if (!["DRAFT_CREATE", "DRAFT_SAVE"].includes(command)) throw new Error("회계 확정·정정 정책 확인 전에는 초안만 저장할 수 있습니다.");
  if (!operationKey.trim() || operationKey.length > 200) throw new Error("처리키를 확인해주세요.");
  if (!input || ["organization_id", "actor_id", "p_org", "p_actor"].some(key => Object.hasOwn(input, key))) throw new Error("회계 입력 형식을 확인해주세요.");
  if (typeof input.source_signature !== "string" || !input.source_signature) throw new Error("회계 원본을 다시 확인해주세요.");
  if (command === "DRAFT_SAVE" && (!Number.isSafeInteger(input.lock_version) || Number(input.lock_version) < 1)) throw new Error("초안 버전을 확인해주세요.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("accounting_command", { p_org: member.organization_id, p_actor: member.user_id, p_command: command, p_data: input, p_key: operationKey });
  if (error) throw new Error(error.message);
  if (!data?.id || !Number.isSafeInteger(data.lock_version) || data.lock_version < 1) throw new Error("저장 결과를 확인하지 못했습니다. 같은 처리키로 다시 확인해주세요.");
  return { id: data.id, lock_version: data.lock_version };
}
