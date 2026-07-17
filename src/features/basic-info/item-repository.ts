import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ItemInput, RegisteredItem } from "./business-partner-data";

export const itemRepositorySchema = "finance";
const itemSelect = "id, code, name, category, unit, description, usage_status";

type ItemRow = { id: string; code: string; name: string; category: string; unit: string; description: string; usage_status: RegisteredItem["usageStatus"] };

export function mapItemFromRow(row: ItemRow): RegisteredItem {
  return { id: row.id, code: row.code, name: row.name, category: row.category, unit: row.unit, description: row.description, usageStatus: row.usage_status };
}

export async function listItemsFromSupabase(): Promise<RegisteredItem[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.schema(itemRepositorySchema).from("items").select(itemSelect).is("deleted_at", null).order("code");
  if (error) return null;
  return (data as ItemRow[]).map(mapItemFromRow);
}

export async function createItemInSupabase(input: ItemInput) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  if (!input.code.trim() || !input.name.trim()) throw new Error("품목코드와 품목명은 필수입니다.");
  const { data, error } = await supabase.schema(itemRepositorySchema).from("items").insert({
    category: input.category.trim() || "미분류", code: input.code.trim(), description: input.description.trim(), name: input.name.trim(), unit: input.unit.trim() || "식", usage_status: "사용",
  }).select(itemSelect).single();
  if (error) throw new Error(error.message.toLowerCase().includes("duplicate") ? "이미 등록된 품목코드입니다." : `품목 저장에 실패했습니다: ${error.message}`);
  return mapItemFromRow(data as ItemRow);
}
