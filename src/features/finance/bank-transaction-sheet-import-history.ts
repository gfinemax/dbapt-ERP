import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadBankTransactionSourceCounts, type BankTransactionSourceCounts } from "./bank-transaction-repository";

export type BankTransactionSheetImportHistoryEntry = {
  actorLabel: string;
  bankAccountId: string;
  batchId: string;
  currentTransactionCount: number;
  erpOnlyCount: number;
  fieldOverrideCount: number;
  googleSheetSourceCount: number;
  importedAt: string;
  insertedCount: number;
  ledgerSourceCount: number;
  manualMatchCount: number;
  matchedCount: number;
  otherSourceCount: number;
  sourceDepositTotal: number;
  sourceDocumentId: string;
  sourceRowCount: number;
  sourceSheet: string;
  sourceWithdrawalTotal: number;
  skippedCount: number;
};

type SheetImportBatchRow = {
  bank_account_id: string;
  erp_only_count: number | string;
  field_override_count: number | string;
  id: string;
  imported_at: string;
  imported_by: string;
  inserted_count: number | string;
  matched_count: number | string;
  manual_match_count: number | string;
  source_deposit_total: number | string;
  source_document_id: string;
  source_row_count: number | string;
  source_sheet: string;
  source_withdrawal_total: number | string;
  skipped_count: number | string;
};

type ReimbursementMemberRow = {
  display_name: string;
  user_id: string;
};

export async function listBankTransactionSheetImportHistory(
  organizationId: string,
  limit = 6,
): Promise<BankTransactionSheetImportHistoryEntry[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !hasSupabaseSecretConfig()) return [];

  const safeLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 20) : 6;
  const { data, error } = await supabase
    .schema("finance")
    .from("bank_transaction_sheet_import_batches")
    .select("id,bank_account_id,source_document_id,source_sheet,source_row_count,matched_count,manual_match_count,inserted_count,skipped_count,erp_only_count,field_override_count,source_deposit_total,source_withdrawal_total,imported_by,imported_at")
    .eq("organization_id", organizationId)
    .order("imported_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(`시트 증분 반영 이력을 불러오지 못했어: ${error.message}`);

  const batches = (data ?? []) as SheetImportBatchRow[];
  if (!batches.length) return [];

  const actorIds = [...new Set(batches.map((batch) => batch.imported_by))];
  const accountIds = [...new Set(batches.map((batch) => batch.bank_account_id))];
  const [{ data: members, error: memberError }, sourceSummaryEntries] = await Promise.all([
    supabase
      .schema("finance")
      .from("reimbursement_members")
      .select("user_id,display_name")
      .eq("organization_id", organizationId)
      .in("user_id", actorIds),
    Promise.all(accountIds.map(async (bankAccountId) => [
      bankAccountId,
      await loadBankTransactionSourceCounts(organizationId, bankAccountId),
    ] as const)),
  ]);
  if (memberError) throw new Error(`시트 반영 담당자를 불러오지 못했어: ${memberError.message}`);

  const actorLabels = new Map(((members ?? []) as ReimbursementMemberRow[]).map((member) => [member.user_id, member.display_name]));
  const sourceSummaries = new Map(sourceSummaryEntries);
  return batches.map((batch) => mapBankTransactionSheetImportHistoryRow(
    batch,
    actorLabels.get(batch.imported_by) ?? "담당자 미확인",
    sourceSummaries.get(batch.bank_account_id) ?? emptySourceCounts(),
  ));
}

export function mapBankTransactionSheetImportHistoryRow(
  row: SheetImportBatchRow,
  actorLabel: string,
  sourceSummary: BankTransactionSourceCounts,
): BankTransactionSheetImportHistoryEntry {
  return {
    actorLabel,
    bankAccountId: row.bank_account_id,
    batchId: row.id,
    currentTransactionCount: sourceSummary.erpTransactionCount,
    erpOnlyCount: Number(row.erp_only_count ?? 0),
    fieldOverrideCount: Number(row.field_override_count ?? 0),
    googleSheetSourceCount: sourceSummary.googleSheetSourceCount,
    importedAt: row.imported_at,
    insertedCount: Number(row.inserted_count),
    ledgerSourceCount: sourceSummary.ledgerSourceCount,
    manualMatchCount: Number(row.manual_match_count ?? 0),
    matchedCount: Number(row.matched_count),
    otherSourceCount: sourceSummary.otherSourceCount,
    sourceDepositTotal: Number(row.source_deposit_total),
    sourceDocumentId: row.source_document_id,
    sourceRowCount: Number(row.source_row_count),
    sourceSheet: row.source_sheet,
    sourceWithdrawalTotal: Number(row.source_withdrawal_total),
    skippedCount: Number(row.skipped_count ?? 0),
  };
}

function emptySourceCounts(): BankTransactionSourceCounts {
  return {
    erpTransactionCount: 0,
    googleSheetSourceCount: 0,
    ledgerSourceCount: 0,
    otherSourceCount: 0,
  };
}
