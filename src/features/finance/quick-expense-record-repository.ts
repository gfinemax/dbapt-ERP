import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getDefaultOrganizationId } from "./expense-compliance-repository";
import type { QuickExpenseRecord, QuickExpenseRecordInput } from "./quick-expense-record";

type QuickExpenseRecordRow = {
  amount: number | string;
  approval_skip_reason: string;
  bank_transaction_id: string | null;
  budget_item: string;
  corporate_card_transaction_id: string | null;
  counterparty: string;
  created_at: string;
  direct_expense_decision: QuickExpenseRecord["directExpenseDecision"];
  direct_expense_reasons: string[];
  evidence_status: QuickExpenseRecordInput["evidenceStatus"];
  id: string;
  occurred_at: string;
  payment_method: QuickExpenseRecordInput["paymentMethod"];
  record_status: QuickExpenseRecord["recordStatus"];
  recorded_by_label: string;
  source_type: QuickExpenseRecordInput["sourceType"];
  usage_description: string;
};

const selectFields = "id,source_type,bank_transaction_id,corporate_card_transaction_id,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,evidence_status,approval_skip_reason,direct_expense_decision,direct_expense_reasons,record_status,recorded_by_label,created_at";

function mapQuickExpenseRecord(row: QuickExpenseRecordRow): QuickExpenseRecord {
  return {
    amount: Number(row.amount) || 0,
    approvalSkipReason: row.approval_skip_reason,
    bankTransactionId: row.bank_transaction_id ?? undefined,
    budgetItem: row.budget_item,
    corporateCardTransactionId: row.corporate_card_transaction_id ?? undefined,
    counterparty: row.counterparty,
    createdAt: row.created_at,
    directExpenseDecision: row.direct_expense_decision,
    directExpenseReasons: row.direct_expense_reasons,
    evidenceStatus: row.evidence_status,
    id: row.id,
    occurredAt: row.occurred_at,
    paymentMethod: row.payment_method,
    recordedByLabel: row.recorded_by_label,
    recordStatus: row.record_status,
    sourceType: row.source_type,
    usageDescription: row.usage_description,
  };
}

export async function listQuickExpenseRecords(): Promise<QuickExpenseRecord[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.schema("finance").from("quick_expense_records").select(selectFields).order("occurred_at", { ascending: false }).limit(200);
  if (error) throw new Error(`간편지출 기록 조회 실패: ${error.message}`);
  return ((data ?? []) as QuickExpenseRecordRow[]).map(mapQuickExpenseRecord);
}

export async function getQuickExpenseBudgetAvailability(organizationId: string, budgetItem: string, occurredAt: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const fiscalYear = Number(occurredAt.slice(0, 4));
  const [{ data: budget, error: budgetError }, { data: quickRecords, error: quickError }] = await Promise.all([
    supabase.schema("approval").from("budgets").select("approved_amount,executed_amount").eq("organization_id", organizationId).eq("fiscal_year", fiscalYear).eq("budget_item", budgetItem).maybeSingle(),
    supabase.schema("finance").from("quick_expense_records").select("amount").eq("organization_id", organizationId).eq("budget_item", budgetItem).eq("record_status", "RECORDED").gte("occurred_at", `${fiscalYear}-01-01T00:00:00+09:00`).lt("occurred_at", `${fiscalYear + 1}-01-01T00:00:00+09:00`),
  ]);
  if (budgetError) throw new Error(`승인예산 조회 실패: ${budgetError.message}`);
  if (quickError) throw new Error(`간편지출 예산집행 조회 실패: ${quickError.message}`);
  if (!budget) return null;
  const approvedAmount = Number(budget.approved_amount) || 0;
  const executedAmount = Number(budget.executed_amount) || 0;
  const quickExpenseAmount = (quickRecords ?? []).reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  return { approvedAmount, executedAmount, quickExpenseAmount, remainingAmount: approvedAmount - executedAmount - quickExpenseAmount };
}

export async function saveQuickExpenseRecord(input: QuickExpenseRecordInput & { directExpenseDecision: QuickExpenseRecord["directExpenseDecision"]; directExpenseReasons: string[]; recordStatus: QuickExpenseRecord["recordStatus"] }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const organizationId = await getDefaultOrganizationId();
  if (!organizationId) throw new Error("간편지출을 귀속할 활성 조합이 없습니다.");
  const { data, error } = await supabase.schema("finance").from("quick_expense_records").insert({
    amount: input.amount,
    approval_skip_reason: input.approvalSkipReason,
    bank_transaction_id: input.bankTransactionId ?? null,
    budget_item: input.budgetItem,
    corporate_card_transaction_id: input.corporateCardTransactionId ?? null,
    counterparty: input.counterparty,
    direct_expense_decision: input.directExpenseDecision,
    direct_expense_reasons: input.directExpenseReasons,
    evidence_status: input.evidenceStatus,
    occurred_at: input.occurredAt,
    organization_id: organizationId,
    payment_method: input.paymentMethod,
    record_status: input.recordStatus,
    recorded_by_label: input.recordedByLabel,
    source_type: input.sourceType,
    usage_description: input.usageDescription,
  }).select(selectFields).single();
  if (error) throw new Error(error.code === "23505" ? "이미 사용내용이 등록된 거래입니다." : `간편지출 기록 저장 실패: ${error.message}`);
  return mapQuickExpenseRecord(data as QuickExpenseRecordRow);
}
