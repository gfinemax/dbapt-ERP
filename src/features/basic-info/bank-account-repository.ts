import { getSupabaseServerClient } from "@/lib/supabase/server";

import type { BankAccountInput, RegisteredBankAccount } from "./business-partner-data";

export const bankAccountRepositorySchema = "finance";

export type SupabaseBankAccountRow = {
  account_purpose?: string | null;
  account_name: string;
  account_no: string;
  account_type: RegisteredBankAccount["accountType"];
  bank_name: string;
  closed_at?: string | null;
  created_at: string;
  current_balance?: number | string | null;
  id: string;
  last_synced_at: string | null;
  opened_at?: string | null;
  organization_id?: string | null;
  sync_status: RegisteredBankAccount["status"];
  unmatched_count: number;
  usage_status: RegisteredBankAccount["usageStatus"];
  verified_at?: string | null;
};

export type SupabaseBankAccountInsert = {
  account_name: string;
  account_no: string;
  account_purpose: string;
  account_type: RegisteredBankAccount["accountType"];
  bank_name: string;
  closed_at: string | null;
  current_balance: number | null;
  opened_at: string;
  organization_id?: string;
  sync_status: RegisteredBankAccount["status"];
  unmatched_count: number;
  usage_status: RegisteredBankAccount["usageStatus"];
  verified_at: string | null;
};
export type SupabaseBankAccountUpdate = Pick<
  SupabaseBankAccountInsert,
  "account_name" | "account_no" | "account_purpose" | "account_type" | "bank_name" | "closed_at" | "current_balance" | "opened_at" | "verified_at"
>;

const bankAccountSelect = "id, organization_id, bank_name, account_name, account_no, account_type, account_purpose, opened_at, closed_at, verified_at, current_balance, usage_status, created_at, last_synced_at, sync_status, unmatched_count";

export function mapBankAccountFromRow(row: SupabaseBankAccountRow): RegisteredBankAccount {
  return {
    accountPurpose: row.account_purpose ?? "",
    accountName: row.account_name,
    accountNo: row.account_no,
    accountType: row.account_type,
    bankName: row.bank_name,
    closedAt: row.closed_at ?? "",
    createdAt: row.opened_at ?? formatDate(row.created_at),
    currentBalance: row.current_balance === null || row.current_balance === undefined ? null : Number(row.current_balance),
    id: row.id,
    lastSyncedAt: row.last_synced_at ? formatSyncedAt(row.last_synced_at) : "미연동",
    status: row.sync_status,
    unmatchedCount: row.unmatched_count,
    usageStatus: row.usage_status,
    verifiedAt: row.verified_at ?? "",
  };
}

export function mapBankAccountToInsert(input: BankAccountInput, organizationId?: string): SupabaseBankAccountInsert {
  return {
    account_name: input.accountName,
    account_no: input.accountNo,
    account_purpose: input.accountPurpose?.trim() ?? "",
    account_type: input.accountType,
    bank_name: input.bankName,
    closed_at: input.closedAt || null,
    current_balance: input.currentBalance ?? null,
    opened_at: input.createdAt,
    ...(organizationId ? { organization_id: organizationId } : {}),
    sync_status: "확인필요",
    unmatched_count: 0,
    usage_status: "사용",
    verified_at: input.verifiedAt || null,
  };
}

export function mapBankAccountToUpdate(input: BankAccountInput): SupabaseBankAccountUpdate {
  return {
    account_name: input.accountName,
    account_no: input.accountNo,
    account_purpose: input.accountPurpose?.trim() ?? "",
    account_type: input.accountType,
    bank_name: input.bankName,
    closed_at: input.closedAt || null,
    current_balance: input.currentBalance ?? null,
    opened_at: input.createdAt,
    verified_at: input.verifiedAt || null,
  };
}

export async function listBankAccountsFromSupabase(organizationId?: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  let query = supabase
    .schema(bankAccountRepositorySchema)
    .from("bank_accounts")
    .select(bankAccountSelect)
    .order("opened_at", { ascending: true });
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;

  if (error) {
    return null;
  }

  return (data as SupabaseBankAccountRow[]).map(mapBankAccountFromRow);
}

export async function createBankAccountInSupabase(input: BankAccountInput, organizationId?: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  validateBankAccountInput(input);

  const { data, error } = await supabase
    .schema(bankAccountRepositorySchema)
    .from("bank_accounts")
    .insert(mapBankAccountToInsert(input, organizationId))
    .select(bankAccountSelect)
    .single();

  if (error) {
    throw new Error(formatBankAccountSaveError(error.message));
  }

  return mapBankAccountFromRow(data as SupabaseBankAccountRow);
}

export async function updateBankAccountInSupabase(id: string, input: BankAccountInput, organizationId?: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  validateBankAccountInput(input);

  let query = supabase
    .schema(bankAccountRepositorySchema)
    .from("bank_accounts")
    .update(mapBankAccountToUpdate(input))
    .eq("id", id);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query
    .select(bankAccountSelect)
    .single();

  if (error) {
    throw new Error(formatBankAccountSaveError(error.message));
  }

  return mapBankAccountFromRow(data as SupabaseBankAccountRow);
}

function formatBankAccountSaveError(message: string) {
  if (message.toLowerCase().includes("fetch failed")) {
    return "Supabase 연결에 실패했습니다. .env.local의 NEXT_PUBLIC_SUPABASE_URL 주소와 프로젝트 상태를 확인해 주세요.";
  }
  if (message.toLowerCase().includes("duplicate")) return "이미 등록된 계좌번호입니다.";

  return `은행통장 저장에 실패했습니다: ${message}`;
}

function validateBankAccountInput(input: BankAccountInput) {
  if (!input.bankName.trim() || !input.accountName.trim() || !input.accountNo.replace(/\D/g, "")) throw new Error("은행명, 계좌명, 계좌번호를 모두 입력해 주세요.");
  if (!input.createdAt) throw new Error("개설일을 입력해 주세요.");
  if (input.closedAt && input.closedAt < input.createdAt) throw new Error("해지일자는 개설일자보다 빠를 수 없습니다.");
  if (input.currentBalance !== null && input.currentBalance !== undefined && !Number.isSafeInteger(input.currentBalance)) throw new Error("현재잔액을 원 단위 정수로 입력해 주세요.");
}

function formatSyncedAt(value: string) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute}`;
}

function formatDate(value: string) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.year}-${byType.month}-${byType.day}`;
}
