import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import {
  hasReimbursementPermission,
  type ReimbursementPermission,
} from "./reimbursement-domain";

export const trustOperatingCommands = [
  "PERIOD_SAVE",
  "PERIOD_SUBMIT",
  "BANK_LINK",
  "USAGE_LINK",
  "PERIOD_SETTLE",
] as const;
export type TrustOperatingCommand = (typeof trustOperatingCommands)[number];
export type TrustOperatingTotals = {
  requested: number;
  opening: number;
  received: number;
  used: number;
  returned: number;
  balance: number;
};
export type TrustOperatingPeriod = {
  id: string;
  month: string;
  contract_version_id: string;
  title: string;
  requested_amount: number;
  opening_balance: number;
  closing_balance: number | null;
  status: "DRAFT" | "SUBMITTED" | "OPEN" | "SETTLED";
  lock_version: number;
  request_reference: string;
  submitted_at: string | null;
  settled_at: string | null;
  totals: TrustOperatingTotals;
};
export type TrustOperatingWorkspace = {
  periods: TrustOperatingPeriod[];
  bank_links: {
    period_id: string;
    bank_transaction_id: string;
    kind: "RECEIPT" | "RETURN";
    amount: number;
    reason: string;
    transacted_at: string;
    description: string;
  }[];
  usage: {
    period_id: string;
    transaction_id: string;
    amount: number;
    title: string;
    source_revision: number;
    current_revision: number;
    source_signature: string;
    current_signature: string;
    reason: string;
  }[];
  contracts: {
    id: string;
    name: string;
    conditions: Record<string, unknown>;
  }[];
  bank_candidates: {
    id: string;
    transacted_at: string;
    description: string;
    deposit_amount: number;
    withdrawal_amount: number;
    bank_account_id: string;
  }[];
  usage_candidates: {
    transaction_id: string;
    title: string;
    amount: number;
    paid: number;
    revision: number;
    source_signature: string;
    contract_version_id: string;
    signature: string;
  }[];
  viewer: { permissions: ReimbursementPermission[] };
};
export type TrustOperatingResult = {
  id: string;
  lock_version: number;
  status: TrustOperatingPeriod["status"];
  totals: TrustOperatingTotals;
};

const staffPermissions: readonly ReimbursementPermission[] = [
  "ADMIN",
  "APPROVE",
  "PAY",
  "CLOSE",
  "SENIOR",
];
const commandPermission: Record<
  TrustOperatingCommand,
  ReimbursementPermission
> = {
  PERIOD_SAVE: "APPROVE",
  PERIOD_SUBMIT: "APPROVE",
  BANK_LINK: "PAY",
  USAGE_LINK: "APPROVE",
  PERIOD_SETTLE: "CLOSE",
};
const forbidden = new Set([
  "organization_id",
  "organizationId",
  "p_org",
  "p_actor",
  "actor_id",
  "actorId",
  "permissions",
  "viewer",
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadTrustOperating(): Promise<TrustOperatingWorkspace> {
  const member = await requireReimbursementIdentity();
  if (
    !member.active ||
    !staffPermissions.some((permission) =>
      hasReimbursementPermission(member, permission),
    )
  )
    throw new Error("운영비 신탁 업무 조회 권한이 필요합니다.");
  const { data, error } = await reimbursementDb()
    .schema("finance")
    .rpc("trust_operating_read", {
      p_org: member.organization_id,
      p_actor: member.user_id,
    });
  if (error) throw new Error(error.message);
  const keys = [
    "periods",
    "bank_links",
    "usage",
    "contracts",
    "bank_candidates",
    "usage_candidates",
  ] as const;
  if (!record(data) || keys.some((key) => !Array.isArray(data[key])))
    throw new Error("운영비 신탁 조회 결과를 확인해주세요.");
  return {
    periods: data.periods as TrustOperatingPeriod[],
    bank_links: data.bank_links as TrustOperatingWorkspace["bank_links"],
    usage: data.usage as TrustOperatingWorkspace["usage"],
    contracts: data.contracts as TrustOperatingWorkspace["contracts"],
    bank_candidates:
      data.bank_candidates as TrustOperatingWorkspace["bank_candidates"],
    usage_candidates:
      data.usage_candidates as TrustOperatingWorkspace["usage_candidates"],
    viewer: { permissions: [...member.permissions] },
  };
}

export async function runTrustOperating(
  command: TrustOperatingCommand,
  input: Record<string, unknown>,
  operationKey: string,
): Promise<TrustOperatingResult> {
  const member = await requireReimbursementIdentity();
  if (
    !member.active ||
    !hasReimbursementPermission(member, commandPermission[command])
  )
    throw new Error("이 운영비 신탁 업무를 처리할 권한이 없습니다.");
  if (!trustOperatingCommands.includes(command))
    throw new Error("지원하지 않는 운영비 신탁 업무입니다.");
  if (!record(input) || Object.keys(input).some((key) => forbidden.has(key)))
    throw new Error("조직과 처리자 정보는 서버에서 확인합니다.");
  if (!operationKey.trim() || operationKey.length > 200)
    throw new Error("처리키를 확인해주세요.");
  const { data, error } = await reimbursementDb()
    .schema("finance")
    .rpc("trust_operating_command", {
      p_org: member.organization_id,
      p_actor: member.user_id,
      p_command: command,
      p_data: input,
      p_key: operationKey,
    });
  if (error) throw new Error(error.message);
  if (
    !record(data) ||
    typeof data.id !== "string" ||
    !Number.isSafeInteger(data.lock_version) ||
    typeof data.status !== "string" ||
    !record(data.totals)
  )
    throw new Error(
      "운영비 신탁 처리 결과를 확인하지 못했어. 같은 처리키로 다시 확인해줘.",
    );
  return data as unknown as TrustOperatingResult;
}
