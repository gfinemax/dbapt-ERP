import { budgetUsed, type ReimbursementBudget } from "@/features/finance/reimbursement-domain";
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
  calculationBasis?: string;
  executedAmount: number;
  fiscalYear: number;
  id: string;
  monthlyBudgetAmount?: number;
  monthlyUsedAmount?: number;
  reservedAmount: number;
  annualReservedAmount?: number;
  pendingAmount?: number;
  unpaidAmount?: number;
  unresolvedCount?: number;
  recordedAmount?: number;
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
export async function getApprovalSettings(organizationId?: string): Promise<ApprovalSettings> {
  const { data: org } = organizationId ? { data: { organization_id: organizationId } } : await client()
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
export async function listMeetingRules(organizationId?: string) {
  let query = client()
    .schema("approval")
    .from("meeting_rules")
    .select("*")
    .order("priority");
  if (organizationId) query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  const { data, error } = await query;
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

export async function listApprovalBudgets(organizationId?: string): Promise<ApprovalBudgetOption[]> {
  const api = client();
  const now = new Date();
  const currentMonthStart = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(now)}-01T00:00:00+09:00`;
  const currentYear = Number(currentMonthStart.slice(0, 4));
  let query = api
    .schema("approval")
    .from("budgets")
    .select("id,organization_id,fiscal_year,budget_item,approved_amount,executed_amount,monthly_amount,calculation_basis")
    .order("fiscal_year", { ascending: false })
    .order("budget_item");
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw new Error(`예산을 불러오지 못했어: ${error.message}`);
  const totals=await api.schema("finance").rpc("unified_budget_totals",{p_month:currentMonthStart.slice(0,10)});
  if(totals.error) throw new Error(`예산 사용액 집계 실패: ${totals.error.message}`);
  const budgetTotals=(totals.data??[]) as ReimbursementBudget[];
  return (data ?? []).map((row) => {
    const total=budgetTotals.find(t=>t.id===row.id);
    if(!total) throw new Error("예산 집계 결과가 누락됐습니다. 다시 조회해주세요.");
    const current=row.fiscal_year===currentYear;
    const reservedAmount=current?Number(total.reserved_amount):0;
    const monthlyUsedAmount=current?budgetUsed(total):0;
    const monthlyBudgetAmount=Number(row.monthly_amount);
    return {
      approvedAmount:Number(row.approved_amount),
      availableAmount:monthlyBudgetAmount-reservedAmount-monthlyUsedAmount,
      budgetItem:row.budget_item, calculationBasis:row.calculation_basis||undefined,
      executedAmount:Number(total.annual_used_amount??0), recordedAmount:Number(row.executed_amount),
      fiscalYear:row.fiscal_year, id:row.id, monthlyBudgetAmount, monthlyUsedAmount, reservedAmount,
      annualReservedAmount:Number(total.annual_reserved_amount??0),
      pendingAmount:current?Number(total.pending_amount??0):0,
      unpaidAmount:current?Number(total.unpaid_amount):0,
      unresolvedCount:Number(total.unresolved_count??0),
    };
  });
}

export async function saveApprovalBudget(input: {
  approvedAmount: number;
  budgetItem: string;
  executedAmount: number;
  fiscalYear: number;
  monthlyBudgetAmount: number;
  organizationId?: string;
}) {
  if (!input.organizationId) throw new Error("예산을 저장할 조직이 없어.");
  if (
    !input.budgetItem.trim() ||
    input.approvedAmount < 0 ||
    input.executedAmount < 0 ||
    input.monthlyBudgetAmount < 0
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
        monthly_amount: input.monthlyBudgetAmount,
        organization_id: input.organizationId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,fiscal_year,budget_item" },
    );
  if (error) throw new Error(`예산을 저장하지 못했어: ${error.message}`);
}
export async function listApprovalLineRules(organizationId?: string): Promise<ApprovalLineRule[]> {
  let query = client()
    .schema("approval")
    .from("approval_line_rules")
    .select("id,rule_name,document_type,min_amount,max_amount,steps")
    .eq("is_active", true)
    .order("priority");
  if (organizationId) query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  const { data, error } = await query;
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
