import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CorporateCardTransactionCandidate } from "./corporate-card-transaction";
import type { CorporateCardTransactionImportRow } from "./corporate-card-transaction-import";
import { getDefaultOrganizationId } from "./expense-compliance-repository";

type CorporateCardTransactionRow = {
  amount: number | string;
  approval_no: string | null;
  approved_at: string;
  card_last_four: string;
  card_name: string;
  category: string | null;
  id: string;
  linked_resolution_id: string | null;
  merchant_name: string;
  memo: string | null;
};

export function mapCorporateCardTransaction(row: CorporateCardTransactionRow): CorporateCardTransactionCandidate {
  return {
    amount: Number(row.amount) || 0,
    approvalNo: row.approval_no ?? undefined,
    approvedAt: row.approved_at,
    cardLastFour: row.card_last_four,
    cardName: row.card_name,
    category: row.category ?? undefined,
    id: row.id,
    linkedResolutionId: row.linked_resolution_id ?? undefined,
    merchantName: row.merchant_name,
    memo: row.memo ?? undefined,
  };
}

export async function importCorporateCardTransactions(rows: CorporateCardTransactionImportRow[]) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const organizationId = await getDefaultOrganizationId();
  if (!organizationId) throw new Error("법인카드 내역을 귀속할 활성 조합이 없습니다.");
  const payload = rows.map((row) => ({ amount: row.amount, approval_no: row.approvalNo ?? null, approved_at: row.approvedAt, card_last_four: row.cardLastFour, card_name: row.cardName, category: row.category ?? null, memo: row.memo ?? null, merchant_name: row.merchantName, organization_id: organizationId, transaction_uid: row.transactionUid }));
  const { data, error } = await supabase.schema("finance").from("corporate_card_transactions").upsert(payload, { onConflict: "organization_id,transaction_uid", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(`법인카드 이용내역 저장 실패: ${error.message}`);
  return data ?? [];
}

export async function linkQuickExpenseCard(recordId: string, cardTransactionId: string, recordStatus: "RECORDED" | "NEEDS_RESOLUTION") {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.schema("finance").rpc("link_quick_expense_card", { p_record_id: recordId, p_card_transaction_id: cardTransactionId, p_record_status: recordStatus });
  if (error) throw new Error(`카드 이용내역 연결 실패: ${error.message}`);
}

export async function listUnresolvedCorporateCardTransactions(): Promise<CorporateCardTransactionCandidate[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.schema("finance").from("corporate_card_transactions")
    .select("id,approved_at,amount,merchant_name,category,card_name,card_last_four,approval_no,memo,linked_resolution_id")
    .is("linked_resolution_id", null)
    .eq("resolution_status", "UNRESOLVED")
    .order("approved_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`법인카드 승인내역 조회 실패: ${error.message}`);
  return ((data ?? []) as CorporateCardTransactionRow[]).map(mapCorporateCardTransaction);
}
