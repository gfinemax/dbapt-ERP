import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireExpenseActor } from "./expense-authorization";
import { getPreliminaryBankExpenseGroupKey, type BankExpenseDraftManifestRow } from "./bank-expense-draft-manifest";

type ManifestDatabaseRow = {
  account_subject_id: string | null;
  account_subject_name: string | null;
  amount: number | string;
  approval_document_id: string | null;
  bank_transaction_id: string;
  budget_candidate_count: number;
  budget_id: string | null;
  budget_name: string | null;
  classification_status: string;
  counterparty: string | null;
  description: string;
  duplicate_resolution_id: string | null;
  duplicate_resolution_no: string | null;
  eligibility: BankExpenseDraftManifestRow["eligibility"];
  existing_resolution_id: string | null;
  existing_resolution_no: string | null;
  expense_detail_candidate_count: number;
  expense_detail_id: string | null;
  expense_detail_name: string | null;
  hold_reason: string | null;
  recommendation_basis: string;
  recommendation_group_key: string | null;
  source_transaction_date: string;
  voucher_id: string | null;
  voucher_no: string | null;
};

export async function loadBankExpenseDraftManifest(input: { from: string; through: string }): Promise<BankExpenseDraftManifestRow[]> {
  const actor = await requireExpenseActor();
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("지출결의 작성 예정표 저장소가 설정되지 않았어.");
  const { data, error } = await supabase.schema("finance").from("bank_expense_draft_manifest")
    .select("bank_transaction_id,source_transaction_date,amount,counterparty,description,classification_status,account_subject_id,account_subject_name,budget_candidate_count,budget_id,budget_name,expense_detail_candidate_count,expense_detail_id,expense_detail_name,existing_resolution_id,existing_resolution_no,approval_document_id,voucher_id,voucher_no,duplicate_resolution_id,duplicate_resolution_no,eligibility,recommendation_group_key,recommendation_basis,hold_reason")
    .eq("organization_id", actor.organization_id)
    .gte("source_transaction_date", input.from)
    .lte("source_transaction_date", input.through)
    .order("source_transaction_date")
    .order("bank_transaction_id");
  if (error) throw new Error(`지출결의 작성 예정표를 불러오지 못했어: ${error.message}`);
  return ((data ?? []) as ManifestDatabaseRow[]).map((row) => {
    const mapped: BankExpenseDraftManifestRow = {
    accountSubjectId: row.account_subject_id ?? undefined,
    accountSubjectName: row.account_subject_name ?? undefined,
    amount: Number(row.amount),
    approvalDocumentId: row.approval_document_id ?? undefined,
    bankTransactionId: row.bank_transaction_id,
    budgetCandidateCount: Number(row.budget_candidate_count),
    budgetId: row.budget_id ?? undefined,
    budgetName: row.budget_name ?? undefined,
    classificationStatus: row.classification_status,
    counterparty: row.counterparty ?? undefined,
    description: row.description,
    duplicateResolutionId: row.duplicate_resolution_id ?? undefined,
    duplicateResolutionNo: row.duplicate_resolution_no ?? undefined,
    eligibility: row.eligibility,
    existingResolutionId: row.existing_resolution_id ?? undefined,
    existingResolutionNo: row.existing_resolution_no ?? undefined,
    expenseDetailCandidateCount: Number(row.expense_detail_candidate_count),
    expenseDetailId: row.expense_detail_id ?? undefined,
    expenseDetailName: row.expense_detail_name ?? undefined,
    holdReason: row.hold_reason ?? undefined,
    recommendationBasis: row.recommendation_basis,
    recommendationGroupKey: row.recommendation_group_key ?? undefined,
    sourceTransactionDate: row.source_transaction_date,
    voucherId: row.voucher_id ?? undefined,
    voucherNo: row.voucher_no ?? undefined,
    };
    const preliminaryGroupKey = getPreliminaryBankExpenseGroupKey(mapped);
    return {
      ...mapped,
      recommendationBasis: preliminaryGroupKey && !mapped.expenseDetailId
        ? `${mapped.recommendationBasis} · 계정과목·예산 UUID와 정확한 목적 문구가 같은 예비 묶음 후보이며 세부항목 선택 후 저장 가능`
        : mapped.recommendationBasis,
      recommendationGroupKey: mapped.recommendationGroupKey ?? preliminaryGroupKey,
    };
  });
}
