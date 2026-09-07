import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import { hasReimbursementPermission, type ReimbursementPermission } from "./reimbursement-domain";
import type { FundItemStatus, FundRequestStatus, FundWithdrawalFromStatus } from "./fund-workflow-domain";

export const trustCommands = [
  "CONTRACT_SAVE", "CONTRACT_VERIFY", "CONTRACT_RETIRE", "ROUTE_ASSIGN",
  "REQUEST_SAVE", "REQUEST_SUBMIT", "REVIEW_START", "REPLY_RECORD", "WITHDRAW_REQUEST", "WITHDRAW_CONFIRM", "FILE_REGISTER",
] as const;
export type TrustCommand = typeof trustCommands[number];
export type TrustFilePurpose = "REQUEST" | "REPLY" | "EVIDENCE" | "CONTRACT" | "PAYMENT";

export type TrustContractRow = {
  id: string; contract_key: string; version: number; lock_version: number;
  name: string; trustee: string; reference: string; management_account_id: string | null;
  status: "DRAFT" | "VERIFIED" | "RETIRED"; conditions: Record<string, unknown>;
  created_by: string; created_at: string; verified_by: string | null; verified_at: string | null;
};
export type TrustRequestRow = {
  id: string; request_no: string; title: string; request_date: string | null;
  contract_version_id: string | null; receipt_reference: string; status: FundRequestStatus;
  lock_version: number; revision: number; created_by: string; created_at: string; updated_at: string;
};
export type TrustItemRow = {
  id: string; request_id: string; transaction_id: string; requested_amount: number; approved_amount: number;
  status: FundItemStatus; withdrawal_from_status: FundWithdrawalFromStatus | null;
  reason: string; needs_review: boolean; source_revision: number | null; paid_amount: number;
};
export type TrustFileRow = {
  id: string; request_id: string | null; transaction_id: string | null; purpose: TrustFilePurpose;
  contract_version_id: string | null; document_type: string; file_name: string; content_hash: string; uploaded_by: string; uploaded_at: string;
};
/** This input is assembled by server upload handlers after verifying the stored object and its hash. */
export type TrustFileRecordInput = {
  id?: string; request_id?: string | null; transaction_id?: string | null; contract_version_id?: string | null;
  document_type?: string; purpose: TrustFilePurpose;
  bucket: string; path: string; file_name: string; content_hash: string;
};
export type TrustSubmissionRow = {
  id: string; request_id: string; revision: number; snapshot: Record<string, unknown>;
  submitted_by: string; submitted_at: string;
};
export type TrustEventRow = {
  id: string; actor_id: string; entity_id: string | null; action: string; reason: string;
  before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; created_at: string;
};
export type TrustAccountRow = { id: string; label: string };
export type TrustReadResult = {
  contracts: TrustContractRow[]; requests: TrustRequestRow[]; items: TrustItemRow[]; files: TrustFileRow[];
  submissions: TrustSubmissionRow[]; events: TrustEventRow[]; accounts: TrustAccountRow[];
  viewer: { user_id: string; permissions: ReimbursementPermission[] };
};
export type TrustCommandResult = { id: string; lock_version?: number; revision?: number };

const commandPermissions: Record<TrustCommand, readonly ReimbursementPermission[]> = {
  CONTRACT_SAVE: ["ADMIN"], CONTRACT_VERIFY: ["ADMIN"], CONTRACT_RETIRE: ["ADMIN"], ROUTE_ASSIGN: ["ADMIN"],
  REQUEST_SAVE: ["APPROVE"], REQUEST_SUBMIT: ["APPROVE"], REVIEW_START: ["APPROVE"], REPLY_RECORD: ["APPROVE"],
  WITHDRAW_REQUEST: ["APPROVE"], WITHDRAW_CONFIRM: ["APPROVE"], FILE_REGISTER: ["ADMIN", "APPROVE", "PAY"],
};
const staffPermissions: readonly ReimbursementPermission[] = ["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"];
const serverContextFields = new Set([
  "organization_id", "organizationId", "org_id", "orgId", "p_org", "actor_id", "actorId", "actorLabel", "p_actor",
  "user_id", "userId", "permissions", "viewer", "created_by", "uploaded_by", "submitted_by", "verified_by",
]);

export class FundTrustRepositoryError extends Error {
  readonly code: string | undefined;
  constructor(error: { message: string; code?: string }) {
    super(error.message);
    this.name = "FundTrustRepositoryError";
    this.code = error.code;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export async function loadFundTrust(): Promise<TrustReadResult> {
  const member = await requireReimbursementIdentity();
  if (!member.active) throw new Error("활성 조직 권한이 필요합니다.");
  if (!staffPermissions.some((permission) => hasReimbursementPermission(member, permission))) throw new Error("신탁 업무 조회 권한이 없습니다.");
  const result = await reimbursementDb().schema("finance").rpc("trust_read", { p_org: member.organization_id, p_actor: member.user_id });
  if (result.error) throw new FundTrustRepositoryError(result.error);
  const data: unknown = result.data;
  const lists = ["contracts", "requests", "items", "files", "submissions", "events", "accounts"] as const;
  if (!record(data) || lists.some((key) => !Array.isArray(data[key]))) throw new Error("신탁 업무 조회 결과를 확인해주세요.");
  // Return only the declared workspace sections. DB response cannot replace authenticated viewer context.
  return {
    contracts: data.contracts as TrustContractRow[], requests: data.requests as TrustRequestRow[], items: data.items as TrustItemRow[],
    files: data.files as TrustFileRow[], submissions: data.submissions as TrustSubmissionRow[], events: data.events as TrustEventRow[],
    accounts: data.accounts as TrustAccountRow[], viewer: { user_id: member.user_id, permissions: [...member.permissions] },
  };
}

/** SQL owns optimistic locking and transitions. No actor, organization, key or version is inferred from a form. */
export async function runFundTrust(command: TrustCommand, input: Record<string, unknown>, operationKey: string): Promise<TrustCommandResult> {
  const member = await requireReimbursementIdentity();
  if (!member.active) throw new Error("활성 조직 권한이 필요합니다.");
  if (!trustCommands.includes(command)) throw new Error("지원하지 않는 신탁 업무입니다.");
  if (!commandPermissions[command].some((permission) => hasReimbursementPermission(member, permission))) throw new Error("이 신탁 업무를 처리할 권한이 없습니다.");
  if (!record(input)) throw new Error("신탁 업무 입력은 객체여야 합니다.");
  if (Object.keys(input).some((key) => serverContextFields.has(key))) throw new Error("조직·처리자·권한은 서버에서 확인합니다. 입력에서 지정할 수 없습니다.");
  if (typeof operationKey !== "string" || !operationKey.trim() || operationKey.length > 200) throw new Error("처리키를 확인해주세요.");
  for (const field of ["lock_version", "revision"] as const) {
    if (Object.hasOwn(input, field) && !validVersion(input[field])) throw new Error(`${field}은 0 이상의 정수여야 합니다.`);
  }
  const result = await reimbursementDb().schema("finance").rpc("trust_command", {
    p_org: member.organization_id, p_actor: member.user_id, p_command: command, p_data: input, p_key: operationKey,
  });
  if (result.error) throw new FundTrustRepositoryError(result.error);
  const data: unknown = result.data;
  if (!record(data) || typeof data.id !== "string" || !data.id.trim()
    || (Object.hasOwn(data, "lock_version") && !validVersion(data.lock_version))
    || (Object.hasOwn(data, "revision") && !validVersion(data.revision))) {
    throw new Error("신탁 처리 결과를 확인하지 못했습니다. 같은 처리키로 다시 확인해주세요.");
  }
  return { id: data.id, ...(data.lock_version === undefined ? {} : { lock_version: data.lock_version as number }), ...(data.revision === undefined ? {} : { revision: data.revision as number }) };
}
