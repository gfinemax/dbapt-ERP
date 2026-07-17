import { getSupabaseServerClient } from "@/lib/supabase/server";

import type { BankAccountInput, RegisteredBankAccount } from "./business-partner-data";

export const bankAccountRepositorySchema = "finance";

export type SupabaseBankAccountRow = {
  account_name: string;
  account_no: string;
  account_type: RegisteredBankAccount["accountType"];
  bank_name: string;
  created_at: string;
  id: string;
  last_synced_at: string | null;
  sync_status: RegisteredBankAccount["status"];
  unmatched_count: number;
  usage_status: RegisteredBankAccount["usageStatus"];
};

export type SupabaseBankAccountInsert = Omit<SupabaseBankAccountRow, "id" | "last_synced_at">;
export type SupabaseBankAccountUpdate = Pick<SupabaseBankAccountRow, "account_name" | "account_no" | "account_type" | "bank_name" | "created_at">;

export function mapBankAccountFromRow(row: SupabaseBankAccountRow): RegisteredBankAccount {
  return {
    accountName: row.account_name,
    accountNo: row.account_no,
    accountType: row.account_type,
    bankName: row.bank_name,
    createdAt: formatDate(row.created_at),
    id: row.id,
    lastSyncedAt: row.last_synced_at ? formatSyncedAt(row.last_synced_at) : "미연동",
    status: row.sync_status,
    unmatchedCount: row.unmatched_count,
    usageStatus: row.usage_status,
  };
}

export function mapBankAccountToInsert(input: BankAccountInput): SupabaseBankAccountInsert {
  return {
    account_name: input.accountName,
    account_no: input.accountNo,
    account_type: input.accountType,
    bank_name: input.bankName,
    created_at: `${input.createdAt}T00:00:00.000+09:00`,
    sync_status: "확인필요",
    unmatched_count: 0,
    usage_status: "사용",
  };
}

export function mapBankAccountToUpdate(input: BankAccountInput): SupabaseBankAccountUpdate {
  return {
    account_name: input.accountName,
    account_no: input.accountNo,
    account_type: input.accountType,
    bank_name: input.bankName,
    created_at: `${input.createdAt}T00:00:00.000+09:00`,
  };
}

export async function listBankAccountsFromSupabase() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .schema(bankAccountRepositorySchema)
    .from("bank_accounts")
    .select("id, bank_name, account_name, account_no, account_type, usage_status, created_at, last_synced_at, sync_status, unmatched_count")
    .order("created_at", { ascending: true });

  if (error) {
    return null;
  }

  return (data as SupabaseBankAccountRow[]).map(mapBankAccountFromRow);
}

export async function createBankAccountInSupabase(input: BankAccountInput) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  validateBankAccountInput(input);

  const { data, error } = await supabase
    .schema(bankAccountRepositorySchema)
    .from("bank_accounts")
    .insert(mapBankAccountToInsert(input))
    .select("id, bank_name, account_name, account_no, account_type, usage_status, created_at, last_synced_at, sync_status, unmatched_count")
    .single();

  if (error) {
    throw new Error(formatBankAccountSaveError(error.message));
  }

  return mapBankAccountFromRow(data as SupabaseBankAccountRow);
}

export async function updateBankAccountInSupabase(id: string, input: BankAccountInput) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  validateBankAccountInput(input);

  const { data, error } = await supabase
    .schema(bankAccountRepositorySchema)
    .from("bank_accounts")
    .update(mapBankAccountToUpdate(input))
    .eq("id", id)
    .select("id, bank_name, account_name, account_no, account_type, usage_status, created_at, last_synced_at, sync_status, unmatched_count")
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
