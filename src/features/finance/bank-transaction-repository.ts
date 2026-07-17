import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ParsedBankTransactionRow } from "./bank-transaction-import";

export const bankTransactionRepositorySchema = "finance";

export type SupabaseBankTransactionInsert = {
  balance_amount: number | null;
  bank_account_id: string;
  bank_transaction_uid: string;
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
  organization_id?: string;
};

export type SupabaseBankTransactionRow = SupabaseBankTransactionInsert & {
  id: string;
};

const bankTransactionSelect =
  "id, bank_account_id, bank_transaction_uid, transacted_at, transaction_kind, description, deposit_amount, withdrawal_amount, balance_amount, counterparty, branch_name, uploaded_major_category, uploaded_account_title, recommended_account_subject_id, recommended_account_subject_name, match_status, raw_payload";

export function mapBankTransactionToInsert(row: ParsedBankTransactionRow): SupabaseBankTransactionInsert {
  return {
    balance_amount: row.balanceAmount,
    bank_account_id: row.bankAccountId,
    bank_transaction_uid: buildBankTransactionUid(row),
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

export function buildBankTransactionUid(row: ParsedBankTransactionRow) {
  const supplied = Object.entries(row.raw).find(([key]) => /거래.*(고유|번호)|transaction.*id/i.test(key))?.[1]?.trim();
  if (supplied) return `BANK:${row.bankAccountId}:${supplied}`;
  const amount = row.withdrawalAmount || row.depositAmount;
  return `FALLBACK:${row.bankAccountId}:${row.transactedAt}:${amount}:${row.description.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR")}`;
}

export async function createBankTransactionsInSupabase(rows: ParsedBankTransactionRow[]) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: organization, error: organizationError } = await supabase.schema("finance").from("expense_compliance_settings").select("organization_id").limit(1).maybeSingle();
  if (organizationError) throw new Error(`Failed to resolve bank transaction organization: ${organizationError.message}`);
  if (!organization?.organization_id) throw new Error("은행거래를 귀속할 활성 조합이 없습니다.");
  const { data, error } = await supabase
    .schema(bankTransactionRepositorySchema)
    .from("bank_transactions")
    .insert(rows.map((row) => ({ ...mapBankTransactionToInsert(row), organization_id: organization.organization_id })))
    .select(bankTransactionSelect);

  if (error) {
    throw new Error(error.code === "23505" ? "이미 업로드된 은행거래가 포함되어 있습니다." : `Failed to create bank transactions: ${error.message}`);
  }

  return data as SupabaseBankTransactionRow[];
}
