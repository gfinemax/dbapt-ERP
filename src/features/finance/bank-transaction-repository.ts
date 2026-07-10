import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ParsedBankTransactionRow } from "./bank-transaction-import";

export const bankTransactionRepositorySchema = "finance";

export type SupabaseBankTransactionInsert = {
  balance_amount: number | null;
  bank_account_id: string;
  branch_name: string | null;
  counterparty: string | null;
  deposit_amount: number;
  description: string;
  match_status: ParsedBankTransactionRow["matchStatus"];
  raw_payload: Record<string, string>;
  recommended_account_subject_id: string | null;
  recommended_account_subject_name: string | null;
  transacted_at: string;
  transaction_kind: ParsedBankTransactionRow["transactionKind"];
  uploaded_account_title: string | null;
  uploaded_major_category: string | null;
  withdrawal_amount: number;
};

export type SupabaseBankTransactionRow = SupabaseBankTransactionInsert & {
  id: string;
};

const bankTransactionSelect =
  "id, bank_account_id, transacted_at, transaction_kind, description, deposit_amount, withdrawal_amount, balance_amount, counterparty, branch_name, uploaded_major_category, uploaded_account_title, recommended_account_subject_id, recommended_account_subject_name, match_status, raw_payload";

export function mapBankTransactionToInsert(row: ParsedBankTransactionRow): SupabaseBankTransactionInsert {
  return {
    balance_amount: row.balanceAmount,
    bank_account_id: row.bankAccountId,
    branch_name: row.branchName || null,
    counterparty: row.branchName || null,
    deposit_amount: row.depositAmount,
    description: row.description,
    match_status: row.matchStatus,
    raw_payload: row.raw,
    recommended_account_subject_id: row.recommendedAccountSubjectId,
    recommended_account_subject_name: row.recommendedAccountSubjectName,
    transacted_at: row.transactedAt,
    transaction_kind: row.transactionKind,
    uploaded_account_title: row.uploadedAccountTitle || null,
    uploaded_major_category: row.uploadedMajorCategory || null,
    withdrawal_amount: row.withdrawalAmount,
  };
}

export async function createBankTransactionsInSupabase(rows: ParsedBankTransactionRow[]) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .schema(bankTransactionRepositorySchema)
    .from("bank_transactions")
    .insert(rows.map(mapBankTransactionToInsert))
    .select(bankTransactionSelect);

  if (error) {
    throw new Error(`Failed to create bank transactions: ${error.message}`);
  }

  return data as SupabaseBankTransactionRow[];
}
