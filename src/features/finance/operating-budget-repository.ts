import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { OperatingExpenseDetail } from "./operating-budget-classification";

type DetailRow = {
  budget_id: string;
  code: string;
  group_name: string;
  id: string;
  name: string;
  policy_note: string;
  quick_expense_eligible: boolean;
  status: OperatingExpenseDetail["status"];
};

export async function listOperatingExpenseDetails(organizationId?: string): Promise<OperatingExpenseDetail[]> {
  const client = getSupabaseServerClient();
  if (!client) return [];
  const { data: budgets, error: budgetError } = await client.schema("approval").from("budgets")
    .select("id,budget_item,organization_id,fiscal_year")
    .eq("fiscal_year", new Date().getFullYear());
  if (budgetError) throw new Error(`세부항목의 예산 연결을 불러오지 못했어: ${budgetError.message}`);
  const scopedBudgets = (budgets ?? []).filter((budget) => !organizationId || budget.organization_id === organizationId);
  if (!scopedBudgets.length) return [];
  const budgetById = new Map(scopedBudgets.map((budget) => [budget.id, budget.budget_item]));
  const query = client.schema("finance").from("expense_detail_items")
    .select("id,budget_id,code,group_name,name,status,policy_note,quick_expense_eligible")
    .in("budget_id", [...budgetById.keys()])
    .eq("is_active", true)
    .order("sort_order");
  const { data, error } = await query;
  if (error) throw new Error(`지출 세부항목을 불러오지 못했어: ${error.message}`);
  return ((data ?? []) as unknown as DetailRow[]).map((row) => ({
    id: row.id,
    code: row.code,
    groupName: row.group_name,
    name: row.name,
    status: row.status,
    policyNote: row.policy_note || undefined,
    quickExpenseEligible: row.quick_expense_eligible,
    budgetItem: budgetById.get(row.budget_id) ?? "",
  })).filter((row) => row.budgetItem);
}
