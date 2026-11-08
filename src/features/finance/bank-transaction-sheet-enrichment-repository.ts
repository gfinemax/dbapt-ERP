import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  matchBankSheetRows,
  type BankSheetEnrichmentPreview,
  type BankSheetEnrichmentResult,
  type BankSheetMatchCandidate,
  type BankSheetSourceRow,
} from "./bank-transaction-sheet-enrichment";

const schema = "finance";
const readBatchSize = 1_000;

type ExistingBankTransaction = {
  deposit_amount: number | string;
  description: string;
  id: string;
  source_transaction_id: string | null;
  transacted_at: string;
  withdrawal_amount: number | string;
};

export type ApplyBankSheetEnrichmentInput = {
  bankAccountId: string;
  reason: string;
  selections: Record<string, string>;
  sourceDocumentId: string;
  sourceRows: BankSheetSourceRow[];
  sourceSheet: string;
};

export async function previewBankTransactionSheetEnrichment(
  organizationId: string,
  bankAccountId: string,
  sourceRows: BankSheetSourceRow[],
): Promise<BankSheetEnrichmentPreview> {
  if (!hasSupabaseSecretConfig()) throw new Error("Supabase 서버 연결을 확인해줘.");
  if (!bankAccountId) throw new Error("보정할 은행계좌를 선택해줘.");
  if (!sourceRows.length || sourceRows.length > 2_000) throw new Error("시트 거래는 1건 이상 2,000건 이하로 확인해줘.");
  const existingRows = await loadExistingBankTransactions(organizationId, bankAccountId);
  return matchBankSheetRows(sourceRows, existingRows);
}

export async function applyBankTransactionSheetEnrichment(
  organizationId: string,
  actorId: string,
  input: ApplyBankSheetEnrichmentInput,
): Promise<BankSheetEnrichmentResult> {
  const sourceDocumentId = input.sourceDocumentId.trim();
  const sourceSheet = input.sourceSheet.trim();
  const reason = input.reason.trim();
  if (!sourceDocumentId || !sourceSheet || reason.length < 10 || reason.length > 500) {
    throw new Error("Google 시트 원본과 10자 이상의 반영 사유를 확인해줘.");
  }
  const preview = await previewBankTransactionSheetEnrichment(organizationId, input.bankAccountId, input.sourceRows);
  const selectedIds = new Set<string>();
  const rows = preview.rows.map((row) => {
    let matchedBankTransactionId = row.matchedBankTransactionId;
    let matchBasis = row.status === "AUTO_MATCH" ? "EXACT" : row.status === "NEW" ? "NEW" : "ZERO_AMOUNT";
    const operation = row.status === "NEW" ? "INSERTED" : row.status === "SKIPPED_ZERO" ? "SKIPPED_ZERO" : "MATCHED";

    if (row.status === "REVIEW_REQUIRED") {
      matchedBankTransactionId = input.selections[String(row.sourceRow)] ?? null;
      if (!matchedBankTransactionId || !row.candidates.some((candidate) => candidate.id === matchedBankTransactionId)) {
        throw new Error(`시트 ${row.sourceRow}행의 ERP 원본을 선택해줘.`);
      }
      matchBasis = row.transactionTime ? "MANUAL_CONFIRMED" : "DATE_ONLY_CONFIRMED";
    }
    if (matchedBankTransactionId) {
      if (selectedIds.has(matchedBankTransactionId)) throw new Error("하나의 ERP 원본을 둘 이상의 시트 행에 연결할 수 없어.");
      selectedIds.add(matchedBankTransactionId);
    }

    return {
      account_category: row.accountCategory,
      deposit_amount: row.depositAmount,
      description: row.description,
      match_basis: matchBasis,
      matched_bank_transaction_id: matchedBankTransactionId,
      memo: row.memo,
      operation,
      source_payload: {
        계좌구분: row.accountLabel,
        거래일자: row.transactionDate,
        거래시간: row.transactionTime,
        거래종류: row.bankTransactionType,
        적요: row.description,
        입금: row.depositAmount,
        출금: row.withdrawalAmount,
        항목구분: row.accountCategory,
        메모: row.memo,
      },
      source_row: row.sourceRow,
      transaction_date: row.transactionDate,
      transaction_time: row.transactionTime,
      withdrawal_amount: row.withdrawalAmount,
    };
  });

  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 서버 연결을 확인해줘.");
  const { data, error } = await supabase.schema(schema).rpc("apply_bank_transaction_sheet_enrichment", {
    p_actor: actorId,
    p_bank_account_id: input.bankAccountId,
    p_expected_current_count: preview.expectedCurrentCount,
    p_org: organizationId,
    p_reason: reason,
    p_rows: rows,
    p_source_document_id: sourceDocumentId,
    p_source_sheet: sourceSheet,
  });
  if (error) throw new Error(`Google 시트 보정 반영에 실패했어: ${error.message}`);
  return data as BankSheetEnrichmentResult;
}

async function loadExistingBankTransactions(organizationId: string, bankAccountId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 서버 연결을 확인해줘.");
  const rows: ExistingBankTransaction[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.schema(schema).from("bank_transactions")
      .select("id,transacted_at,description,deposit_amount,withdrawal_amount,source_transaction_id")
      .eq("organization_id", organizationId)
      .eq("bank_account_id", bankAccountId)
      .is("deleted_at", null)
      .order("transacted_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + readBatchSize - 1);
    if (error) throw new Error(`ERP 은행거래 원본을 불러오지 못했어: ${error.message}`);
    const batch = (data ?? []) as ExistingBankTransaction[];
    rows.push(...batch);
    if (batch.length < readBatchSize) break;
    offset += readBatchSize;
  }
  return rows.map(mapExistingBankTransaction);
}

function mapExistingBankTransaction(row: ExistingBankTransaction): BankSheetMatchCandidate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(new Date(row.transacted_at));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    depositAmount: Number(row.deposit_amount),
    description: row.description,
    id: row.id,
    sourceTransactionId: row.source_transaction_id ?? row.id,
    transactionDate: `${values.year}-${values.month}-${values.day}`,
    transactionTime: `${values.hour}:${values.minute}:${values.second}`,
    withdrawalAmount: Number(row.withdrawal_amount),
  };
}
