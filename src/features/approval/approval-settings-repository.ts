import { budgetUsed, type ReimbursementBudget } from "@/features/finance/reimbursement-domain";
import type { ReimbursementMember } from "@/features/finance/reimbursement-domain";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { BudgetMappingStatus, OperatingExpenseDetail } from "@/features/finance/operating-budget-classification";

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
  budgetCode?: string;
  calculationBasis?: string;
  details?: OperatingExpenseDetail[];
  executedAmount: number;
  fiscalYear: number;
  id: string;
  mappingNote?: string;
  mappingStatus?: BudgetMappingStatus;
  monthlyBudgetAmount?: number;
  monthlyUsedAmount?: number;
  reservedAmount: number;
  annualReservedAmount?: number;
  pendingAmount?: number;
  unpaidAmount?: number;
  unresolvedCount?: number;
  recordedAmount?: number;
  planItemLabel?: string;
  planSection?: string;
  baseApprovedAmount?: number;
  baseMonthlyBudgetAmount?: number;
  annualAdjustmentAmount?: number;
  monthlyAdjustmentAmount?: number;
};
export type BudgetPlanVersion = {
  approved_at: string | null;
  authority_reference: string;
  created_at: string;
  fiscal_year: number;
  id: string;
  notes: string;
  revision: number;
  status: "DRAFT" | "SUBMITTED" | "ACTIVE" | "ARCHIVED" | "REJECTED";
  title: string;
};
export type BudgetPlanItem = {
  approved_amount: number;
  budget_code: string | null;
  budget_item: string;
  calculation_basis: string;
  id: string;
  mapping_note: string;
  mapping_status: "CONFIRMED" | "POLICY_REVIEW";
  monthly_amount: number;
  plan_id: string;
  plan_item_label: string | null;
  plan_section: string | null;
  sort_order: number;
};
export type BudgetAdjustment = {
  adjustment_no: string;
  adjustment_type: "TRANSFER" | "RESERVE_USE" | "SUPPLEMENT" | "REDUCTION";
  amount: number;
  approved_at: string | null;
  authority_reference: string;
  decision_note: string;
  effective_month: string;
  fiscal_year: number;
  id: string;
  reason: string;
  requested_at: string;
  source_budget_id: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";
  target_budget_id: string | null;
};
export type BudgetGovernance = {
  adjustments: BudgetAdjustment[];
  items: BudgetPlanItem[];
  plans: BudgetPlanVersion[];
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

export async function listApprovalBudgets(organizationId?: string, budgetPeriod?: string): Promise<ApprovalBudgetOption[]> {
  const api = client();
  const now = new Date();
  const requestedPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(budgetPeriod ?? "")
    ? budgetPeriod
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(now);
  const currentMonthStart = `${requestedPeriod}-01T00:00:00+09:00`;
  const currentYear = Number(currentMonthStart.slice(0, 4));
  let query = api
    .schema("approval")
    .from("budgets")
    .select("id,organization_id,fiscal_year,budget_item,budget_code,plan_section,plan_item_label,mapping_status,mapping_note,approved_amount,executed_amount,monthly_amount,calculation_basis")
    .order("fiscal_year", { ascending: false })
    .order("budget_item");
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw new Error(`예산을 불러오지 못했어: ${error.message}`);
  const budgetIds=(data??[]).map((row)=>row.id);
  const detailResult=budgetIds.length?await api.schema("finance").from("expense_detail_items").select("id,budget_id,code,group_name,name,status,policy_note,quick_expense_eligible").in("budget_id",budgetIds).eq("is_active",true).order("sort_order"):{data:[],error:null};
  if(detailResult.error) throw new Error(`예산 세부항목을 불러오지 못했어: ${detailResult.error.message}`);
  const detailsByBudget=new Map<string,OperatingExpenseDetail[]>();
  const budgetItemById=new Map((data??[]).map((row)=>[row.id,row.budget_item]));
  for(const detail of detailResult.data??[]){const budgetItem=budgetItemById.get(detail.budget_id);if(!budgetItem)continue;const mapped={id:detail.id,code:detail.code,groupName:detail.group_name,name:detail.name,status:detail.status as BudgetMappingStatus,policyNote:detail.policy_note||undefined,quickExpenseEligible:detail.quick_expense_eligible,budgetItem};detailsByBudget.set(detail.budget_id,[...(detailsByBudget.get(detail.budget_id)??[]),mapped]);}
  const totals=await api.schema("finance").rpc("unified_budget_totals",{p_month:currentMonthStart.slice(0,10)});
  if(totals.error) throw new Error(`예산 사용액 집계 실패: ${totals.error.message}`);
  const budgetTotals=(totals.data??[]) as ReimbursementBudget[];
  return (data ?? []).map((row) => {
    const total=budgetTotals.find(t=>t.id===row.id);
    if(!total) throw new Error("예산 집계 결과가 누락됐습니다. 다시 조회해주세요.");
    const current=row.fiscal_year===currentYear;
    const reservedAmount=current?Number(total.reserved_amount):0;
    const monthlyUsedAmount=current?budgetUsed(total):0;
    const monthlyBudgetAmount=Number(total.monthly_amount??row.monthly_amount);
    return {
      approvedAmount:Number(total.approved_amount??row.approved_amount),
      availableAmount:monthlyBudgetAmount-reservedAmount-monthlyUsedAmount,
      budgetItem:row.budget_item, calculationBasis:row.calculation_basis||undefined,
      budgetCode:row.budget_code||undefined,planSection:row.plan_section||undefined,planItemLabel:row.plan_item_label||undefined,
      mappingStatus:row.mapping_status as BudgetMappingStatus,mappingNote:row.mapping_note||undefined,details:detailsByBudget.get(row.id)??[],
      executedAmount:Number(total.annual_used_amount??0), recordedAmount:Number(row.executed_amount),
      fiscalYear:row.fiscal_year, id:row.id, monthlyBudgetAmount, monthlyUsedAmount, reservedAmount,
      annualReservedAmount:Number(total.annual_reserved_amount??0),
      pendingAmount:current?Number(total.pending_amount??0):0,
      unpaidAmount:current?Number(total.unpaid_amount):0,
      unresolvedCount:Number(total.unresolved_count??0),
      baseApprovedAmount:Number(total.base_approved_amount??row.approved_amount),
      baseMonthlyBudgetAmount:Number(total.base_monthly_amount??row.monthly_amount),
      annualAdjustmentAmount:Number(total.annual_adjustment_amount??0),
      monthlyAdjustmentAmount:Number(total.monthly_adjustment_amount??0),
    };
  });
}

export async function listBudgetGovernance(organizationId?: string): Promise<BudgetGovernance> {
  if (!organizationId) return { adjustments: [], items: [], plans: [] };
  const api=client().schema("approval");
  const [planResult,adjustmentResult]=await Promise.all([
    api.from("budget_plan_versions")
      .select("id,fiscal_year,revision,status,title,authority_reference,notes,approved_at,created_at")
      .eq("organization_id",organizationId)
      .order("fiscal_year",{ascending:false})
      .order("revision",{ascending:false}),
    api.from("budget_adjustments")
      .select("id,fiscal_year,adjustment_no,adjustment_type,status,source_budget_id,target_budget_id,effective_month,amount,reason,authority_reference,decision_note,requested_at,approved_at")
      .eq("organization_id",organizationId)
      .order("requested_at",{ascending:false})
      .limit(100),
  ]);
  if(planResult.error) throw new Error(`연도별 예산안을 불러오지 못했어: ${planResult.error.message}`);
  if(adjustmentResult.error) throw new Error(`예산변경 내역을 불러오지 못했어: ${adjustmentResult.error.message}`);
  const planIds=(planResult.data??[]).map(plan=>plan.id);
  const itemResult=planIds.length
    ? await api.from("budget_plan_version_items")
      .select("id,plan_id,budget_code,budget_item,plan_section,plan_item_label,mapping_status,mapping_note,approved_amount,monthly_amount,calculation_basis,sort_order")
      .in("plan_id",planIds).order("sort_order").order("budget_item")
    : {data:[],error:null};
  if(itemResult.error) throw new Error(`예산안 항목을 불러오지 못했어: ${itemResult.error.message}`);
  return {
    adjustments:(adjustmentResult.data??[]).map(row=>({...row,amount:Number(row.amount)})) as BudgetAdjustment[],
    items:(itemResult.data??[]).map(row=>({...row,approved_amount:Number(row.approved_amount),monthly_amount:Number(row.monthly_amount)})) as BudgetPlanItem[],
    plans:(planResult.data??[]) as BudgetPlanVersion[],
  };
}

export async function runBudgetGovernanceCommand(
  member: ReimbursementMember,
  command: string,
  data: Record<string,unknown>,
) {
  const {data:result,error}=await client().schema("approval").rpc("budget_governance_command",{
    p_org:member.organization_id,
    p_actor:member.user_id,
    p_command:command,
    p_data:data,
  });
  if(error) throw new Error(error.code==="23505"?"같은 연도·예산코드의 자료가 이미 있습니다.":error.message);
  return result;
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
