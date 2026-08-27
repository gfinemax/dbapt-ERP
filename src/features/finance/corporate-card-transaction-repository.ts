import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CorporateCardTransactionCandidate } from "./corporate-card-transaction";

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
