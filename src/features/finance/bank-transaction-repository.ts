import { getSupabaseServerClient } from "@/lib/supabase/server";
import { inferTransactionKind } from "./bank-transaction-import";
import type { ParsedBankTransactionRow } from "./bank-transaction-import";

export const bankTransactionRepositorySchema = "finance";

export type SupabaseBankTransactionInsert = {
  balance_amount: number | null;
  bank_account_id: string;
  bank_transaction_uid: string;
  branch_name: string | null;
  classification_status: "UNREVIEWED" | "RECOMMENDED";
  counterparty: string | null;
  deposit_amount: number;
  description: string;
  match_status: ParsedBankTransactionRow["matchStatus"];
  raw_payload: Record<string, string>;
  recommendation_reason: string | null;
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

export type BankTransactionReviewRow = {
  bankAccountId: string;
  classificationStatus: "UNREVIEWED" | "RECOMMENDED" | "DEFERRED";
  counterparty: string;
  description: string;
  id: string;
  recommendedAccountSubjectId: string | null;
  recommendedAccountSubjectName: string | null;
  recommendationReason: string | null;
  transactedAt: string;
  transactionKind: "입금" | "출금" | null;
  amount: number;
};

export type BankTransactionSubjectAssignment = {
  accountSubjectId: string;
  note?: string;
  transactionId: string;
};

const bankTransactionSelect =
  "id, bank_account_id, bank_transaction_uid, transacted_at, transaction_kind, description, deposit_amount, withdrawal_amount, balance_amount, counterparty, branch_name, uploaded_major_category, uploaded_account_title, recommended_account_subject_id, recommended_account_subject_name, match_status, raw_payload, classification_status, recommendation_reason";

export function mapBankTransactionToInsert(row: ParsedBankTransactionRow): SupabaseBankTransactionInsert {
  return {
    balance_amount: row.balanceAmount,
    bank_account_id: row.bankAccountId,
    bank_transaction_uid: buildBankTransactionUid(row),
    branch_name: row.branchName || null,
    classification_status: row.recommendedAccountSubjectName ? "RECOMMENDED" : "UNREVIEWED",
    counterparty: row.branchName || null,
    deposit_amount: row.depositAmount,
    description: row.description,
    match_status: row.matchStatus,
    raw_payload: row.raw,
    recommendation_reason: row.matchStatus === "업로드분류"
      ? "업로드 파일의 계정과목명과 내부 계정과목이 일치함"
      : row.matchStatus === "자동추천" ? "거래 적요 키워드로 추천함" : null,
    recommended_account_subject_id: row.recommendedAccountSubjectId,
    recommended_account_subject_name: row.recommendedAccountSubjectName,
    transacted_at: row.transactedAt,
    transaction_kind: row.transactionKind === null ? null : inferTransactionKind(row.transactionKind, row.depositAmount, row.withdrawalAmount),
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

export async function createBankTransactionsInSupabase(rows: ParsedBankTransactionRow[], organizationId: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .schema(bankTransactionRepositorySchema)
    .from("bank_transactions")
    .upsert(rows.map((row) => ({ ...mapBankTransactionToInsert(row), organization_id: organizationId })), {
      ignoreDuplicates: true,
      onConflict: "bank_transaction_uid",
    })
    .select(bankTransactionSelect);

  if (error) {
    throw new Error(`Failed to create bank transactions: ${error.message}`);
  }

  const transactions = data as SupabaseBankTransactionRow[];
  return { duplicateCount: rows.length - transactions.length, transactions };
}

export async function listBankTransactionsForSubjectReview(organizationId: string): Promise<BankTransactionReviewRow[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.schema(bankTransactionRepositorySchema).from("bank_transactions")
    .select("id,bank_account_id,transacted_at,transaction_kind,description,deposit_amount,withdrawal_amount,counterparty,recommended_account_subject_id,recommended_account_subject_name,classification_status,recommendation_reason")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("classification_status", ["UNREVIEWED", "RECOMMENDED", "DEFERRED"])
    .order("transacted_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`은행거래 검토 목록을 불러오지 못했어: ${error.message}`);
  return (data ?? []).map((row) => ({
    amount: Number(row.withdrawal_amount) || Number(row.deposit_amount) || 0,
    bankAccountId: row.bank_account_id,
    classificationStatus: row.classification_status,
    counterparty: row.counterparty ?? "",
    description: row.description,
    id: row.id,
    recommendedAccountSubjectId: row.recommended_account_subject_id,
    recommendedAccountSubjectName: row.recommended_account_subject_name,
    recommendationReason: row.recommendation_reason,
    transactedAt: row.transacted_at,
    transactionKind: row.transaction_kind,
  })) as BankTransactionReviewRow[];
}

export async function confirmBankTransactionSubjects(
  organizationId: string,
  actorId: string,
  assignments: BankTransactionSubjectAssignment[],
) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.schema(bankTransactionRepositorySchema).rpc("confirm_bank_transaction_subjects", {
    p_actor: actorId,
    p_assignments: assignments.map((assignment) => ({
      account_subject_id: assignment.accountSubjectId,
      note: assignment.note ?? "",
      transaction_id: assignment.transactionId,
    })),
    p_org: organizationId,
  });
  if (error) throw new Error(`은행거래 계정과목 확정에 실패했어: ${error.message}`);
  return data as Array<{ account_subject_id: string; transaction_id: string }>;
}
