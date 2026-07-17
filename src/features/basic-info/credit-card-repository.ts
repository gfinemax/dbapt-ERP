import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CreditCardInput, RegisteredCreditCard } from "./business-partner-data";

export const creditCardRepositorySchema = "finance";
const cardSelect = "id, card_company, card_name, card_last_four, card_type, issued_at, usage_status, last_synced_at, sync_status, limit_amount, settlement_bank";
type CardRow = { id: string; card_company: string; card_name: string; card_last_four: string; card_type: RegisteredCreditCard["cardType"]; issued_at: string; usage_status: RegisteredCreditCard["usageStatus"]; last_synced_at: string | null; sync_status: RegisteredCreditCard["status"]; limit_amount: number; settlement_bank: string };

export function getCardLastFour(value: string) { return value.replace(/\D/g, "").slice(-4); }
export function mapCreditCardFromRow(row: CardRow): RegisteredCreditCard {
  return { cardCompany: row.card_company, cardName: row.card_name, cardNo: `****-****-****-${row.card_last_four}`, cardType: row.card_type, createdAt: row.issued_at.slice(0, 10), id: row.id, lastSyncedAt: row.last_synced_at ? row.last_synced_at.slice(0, 16).replace("T", " ") : "미연동", limitAmount: Number(row.limit_amount), settlementBank: row.settlement_bank, status: row.sync_status, usageStatus: row.usage_status };
}

export async function listCreditCardsFromSupabase(): Promise<RegisteredCreditCard[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.schema(creditCardRepositorySchema).from("credit_cards").select(cardSelect).is("deleted_at", null).order("issued_at");
  if (error) return null;
  return (data as CardRow[]).map(mapCreditCardFromRow);
}

export async function createCreditCardInSupabase(input: CreditCardInput) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const lastFour = getCardLastFour(input.cardNo);
  if (lastFour.length !== 4) throw new Error("카드번호 마지막 4자리를 확인해 주세요.");
  const { data, error } = await supabase.schema(creditCardRepositorySchema).from("credit_cards").insert({ card_company: input.cardCompany.trim(), card_last_four: lastFour, card_name: input.cardName.trim(), card_type: input.cardType, issued_at: input.createdAt, usage_status: "사용" }).select(cardSelect).single();
  if (error) throw new Error(error.message.toLowerCase().includes("duplicate") ? "같은 카드가 이미 등록되어 있습니다." : `신용카드 저장에 실패했습니다: ${error.message}`);
  return mapCreditCardFromRow(data as CardRow);
}
