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
    console.error("Failed to load bank accounts from Supabase", error.message);
    return null;
  }

  return (data as SupabaseBankAccountRow[]).map(mapBankAccountFromRow);
}

export async function createBankAccountInSupabase(input: BankAccountInput) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .schema(bankAccountRepositorySchema)
    .from("bank_accounts")
    .insert(mapBankAccountToInsert(input))
    .select("id, bank_name, account_name, account_no, account_type, usage_status, created_at, last_synced_at, sync_status, unmatched_count")
    .single();

  if (error) {
    throw new Error(`Failed to create bank account: ${error.message}`);
  }

  return mapBankAccountFromRow(data as SupabaseBankAccountRow);
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
