import { getSupabaseServerClient } from "@/lib/supabase/server";

export type ApprovalSettings = {
  meetingThresholdAmount: number;
  smallExpenseLimit: number;
  materialChangeFields: string[];
  organizationId?: string;
};
export type ApprovalBudgetOption = {
  approvedAmount: number;
  availableAmount: number;
  budgetItem: string;
  executedAmount: number;
  fiscalYear: number;
  id: string;
  reservedAmount: number;
};
export type ApprovalLineRule = {
  documentType: "GENERAL" | "EXPENSE" | "CONTRACT" | null;
  id: string;
  maxAmount?: number;
  minAmount: number;
  ruleName: string;
  steps: Array<{ approverLabel: string; approverRole: string }>;
};
export const defaultApprovalSettings: ApprovalSettings = {
  meetingThresholdAmount: 100_000_000,
  smallExpenseLimit: 50_000,
  materialChangeFields: [
    "amount",
    "counterparty_id",
    "payment_method",
    "budget_item",
    "project_name",
    "meeting_status",
    "has_member_burden",
  ],
};

function client() {
  const value = getSupabaseServerClient();
  if (!value) throw new Error("Supabase 서버 연결이 설정되지 않았어.");
  return value;
}
export async function getApprovalSettings(): Promise<ApprovalSettings> {
  const { data: org } = await client()
    .schema("finance")
    .from("expense_compliance_settings")
    .select("organization_id")
    .limit(1)
    .maybeSingle();
  if (!org?.organization_id) return defaultApprovalSettings;
  const { data, error } = await client()
    .schema("approval")
    .from("settings")
    .select("*")
    .eq("organization_id", org.organization_id)
    .maybeSingle();
  if (error) throw new Error(`기안 설정을 불러오지 못했어: ${error.message}`);
  return data
    ? {
        materialChangeFields: data.material_change_fields,
        meetingThresholdAmount: Number(data.meeting_threshold_amount),
        organizationId: org.organization_id,
        smallExpenseLimit: Number(data.small_expense_limit),
      }
    : { ...defaultApprovalSettings, organizationId: org.organization_id };
}
export async function saveApprovalSettings(settings: ApprovalSettings) {
  if (!settings.organizationId) throw new Error("설정을 저장할 조직이 없어.");
  const { error } = await client()
    .schema("approval")
    .from("settings")
    .upsert(
      {
        material_change_fields: settings.materialChangeFields,
        meeting_threshold_amount: settings.meetingThresholdAmount,
        organization_id: settings.organizationId,
        small_expense_limit: settings.smallExpenseLimit,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
  if (error) throw new Error(`기안 설정을 저장하지 못했어: ${error.message}`);
}
export async function listMeetingRules() {
  const { data, error } = await client()
    .schema("approval")
    .from("meeting_rules")
    .select("*")
    .order("priority");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function addMeetingRule(input: {
  keyword: string;
  organizationId?: string;
  reason: string;
  regulationReference: string;
  recommendedBody: string;
  ruleName: string;
}) {
  const { error } = await client()
    .schema("approval")
    .from("meeting_rules")
    .insert({
      keyword: input.keyword,
      organization_id: input.organizationId || null,
      reason: input.reason,
      recommended_body: input.recommendedBody,
      regulation_reference: input.regulationReference,
      rule_name: input.ruleName,
    });
  if (error) throw new Error(`의결규칙을 저장하지 못했어: ${error.message}`);
}

export async function listApprovalBudgets(): Promise<ApprovalBudgetOption[]> {
  const api = client();
  const { data, error } = await api
    .schema("approval")
    .from("budgets")
    .select("id,fiscal_year,budget_item,approved_amount,executed_amount")
    .order("fiscal_year", { ascending: false })
    .order("budget_item");
  if (error) throw new Error(`예산을 불러오지 못했어: ${error.message}`);
  const ids = (data ?? []).map((row) => row.id);
  let reservations: Array<{
    amount: number | string;
    budget_id: string;
    released_amount: number | string;
  }> = [];
  if (ids.length) {
    const result = await api
      .schema("approval")
      .from("budget_reservations")
      .select("budget_id,amount,released_amount")
      .in("budget_id", ids)
      .eq("status", "ACTIVE");
    if (result.error)
      throw new Error(`집행예정액을 불러오지 못했어: ${result.error.message}`);
    reservations = result.data ?? [];
  }
  return (data ?? []).map((row) => {
    const reservedAmount = reservations
      .filter((item) => item.budget_id === row.id)
      .reduce(
        (sum, item) => sum + Number(item.amount) - Number(item.released_amount),
        0,
      );
    const approvedAmount = Number(row.approved_amount);
    const executedAmount = Number(row.executed_amount);
    return {
      approvedAmount,
      availableAmount: approvedAmount - executedAmount - reservedAmount,
      budgetItem: row.budget_item,
      executedAmount,
      fiscalYear: row.fiscal_year,
      id: row.id,
      reservedAmount,
    };
  });
}

export async function saveApprovalBudget(input: {
  approvedAmount: number;
  budgetItem: string;
  executedAmount: number;
  fiscalYear: number;
  organizationId?: string;
}) {
  if (!input.organizationId) throw new Error("예산을 저장할 조직이 없어.");
  if (
    !input.budgetItem.trim() ||
    input.approvedAmount < 0 ||
    input.executedAmount < 0
  )
    throw new Error("예산 입력값을 확인해줘.");
  const { error } = await client()
    .schema("approval")
    .from("budgets")
    .upsert(
      {
        approved_amount: input.approvedAmount,
        budget_item: input.budgetItem.trim(),
        executed_amount: input.executedAmount,
        fiscal_year: input.fiscalYear,
        organization_id: input.organizationId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,fiscal_year,budget_item" },
    );
  if (error) throw new Error(`예산을 저장하지 못했어: ${error.message}`);
}
export async function listApprovalLineRules(): Promise<ApprovalLineRule[]> {
  const { data, error } = await client()
    .schema("approval")
    .from("approval_line_rules")
    .select("id,rule_name,document_type,min_amount,max_amount,steps")
    .eq("is_active", true)
    .order("priority");
  if (error) throw new Error(`결재선 규칙을 불러오지 못했어: ${error.message}`);
  return (data ?? []).map((row) => ({
    documentType: row.document_type,
    id: row.id,
    maxAmount: row.max_amount === null ? undefined : Number(row.max_amount),
    minAmount: Number(row.min_amount),
    ruleName: row.rule_name,
    steps: row.steps,
  }));
}
export async function saveApprovalLineRule(input: {
  documentType?: string;
  maxAmount?: number;
  minAmount: number;
  organizationId?: string;
  ruleName: string;
  steps: Array<{ approverLabel: string; approverRole: string }>;
}) {
  if (!input.organizationId || !input.ruleName.trim() || !input.steps.length)
    throw new Error("결재선 규칙 입력값을 확인해줘.");
  const { error } = await client()
    .schema("approval")
    .from("approval_line_rules")
    .insert({
      document_type: input.documentType || null,
      max_amount: input.maxAmount || null,
      min_amount: input.minAmount,
      organization_id: input.organizationId,
      rule_name: input.ruleName.trim(),
      steps: input.steps,
    });
  if (error) throw new Error(`결재선 규칙을 저장하지 못했어: ${error.message}`);
}
