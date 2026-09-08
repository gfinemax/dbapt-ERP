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
  policy: { confirmation_enabled: false };
};
export type AccountingCommand = "DRAFT_CREATE" | "DRAFT_SAVE";
export type AccountingCommandResult = { id: string; lock_version: number };

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
  return { vouchers: data.vouchers, accounts: data.accounts, sources: data.sources, viewer: { permissions: [...member.permissions] }, policy: { confirmation_enabled: false } };
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
