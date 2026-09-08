import { budgetUsed, type ReimbursementBudget } from "./reimbursement-domain";
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
  evidence_kind: QuickExpenseRecordInput["evidenceKind"] | null;
  evidence_review_status: QuickExpenseRecord["evidenceReviewStatus"] | null;
  evidence_reviewed_at: string | null;
  evidence_review_note: string | null;
  expense_detail_id: string | null;
  missing_evidence_reason: string | null;
  id: string;
  occurred_at: string;
  payment_method: QuickExpenseRecordInput["paymentMethod"];
  record_status: QuickExpenseRecord["recordStatus"];
  recorded_by_label: string;
  source_type: QuickExpenseRecordInput["sourceType"];
  usage_description: string;
};

const selectFields = "id,source_type,bank_transaction_id,corporate_card_transaction_id,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,expense_detail_id,evidence_status,evidence_kind,evidence_review_status,evidence_reviewed_at,evidence_review_note,missing_evidence_reason,approval_skip_reason,direct_expense_decision,direct_expense_reasons,record_status,recorded_by_label,created_at";

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
    expenseDetailId: row.expense_detail_id ?? undefined,
    evidenceKind: row.evidence_kind ?? undefined,
    evidenceReviewStatus: row.evidence_review_status ?? undefined,
    evidenceReviewedAt: row.evidence_reviewed_at ?? undefined,
    evidenceReviewNote: row.evidence_review_note ?? undefined,
    missingEvidenceReason: row.missing_evidence_reason ?? undefined,
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

export async function getQuickExpenseRecord(recordId: string): Promise<QuickExpenseRecord | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.schema("finance").from("quick_expense_records").select(selectFields).eq("id", recordId).maybeSingle();
  if (error) throw new Error(`간편지출 기록 조회 실패: ${error.message}`);
  return data ? mapQuickExpenseRecord(data as QuickExpenseRecordRow) : null;
}

export async function getQuickExpenseBudgetAvailability(organizationId: string, budgetItem: string, occurredAt: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const dateParts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Seoul", year: "numeric" }).formatToParts(new Date(occurredAt));
  const fiscalYear = Number(dateParts.find((part) => part.type === "year")?.value);
  const month = Number(dateParts.find((part) => part.type === "month")?.value);
  const monthStart = `${fiscalYear}-${String(month).padStart(2, "0")}-01T00:00:00+09:00`;
  const {data,error}=await supabase.schema("finance").rpc("reimbursement_budget_rows",{p_org:organizationId,p_month:monthStart.slice(0,10)});
  if(error) throw new Error(`예산 집계 실패: ${error.message}`);
  const rows=(data??[]) as ReimbursementBudget[];
  const budget=rows.find(row=>row.budget_item===budgetItem);
  if (!budget) return null;
  const approvedAmount = Number(budget.approved_amount) || 0;
  const executedAmount = Number(budget.annual_used_amount) || 0;
  const monthlyBudgetAmount = Number(budget.monthly_amount) || 0;
  const monthlyUsedAmount = budgetUsed(budget);
  return { approvedAmount, executedAmount, monthlyBudgetAmount, monthlyUsedAmount, unresolvedCount:Number(budget.unresolved_count??0), annualRemainingAmount:approvedAmount-executedAmount-Number(budget.annual_reserved_amount??0), remainingAmount: monthlyBudgetAmount - monthlyUsedAmount - Number(budget.reserved_amount) };
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
    expense_detail_id: input.expenseDetailId ?? null,
    evidence_kind: input.evidenceKind ?? "NONE",
    evidence_review_status: input.evidenceStatus === "QUALIFIED" ? "READY" : input.evidenceStatus === "ALTERNATIVE" ? "REVIEW_REQUIRED" : "MISSING",
    missing_evidence_reason: input.missingEvidenceReason ?? "",
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
