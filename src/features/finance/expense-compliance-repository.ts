import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ExpenseComplianceSettings } from "./expense-compliance";

export type ExpenseFactConfirmationInput = {
  id?: string;
  resolutionId: string;
  detailTransactionId?: string;
  actualSpender: string;
  actualExpenseDate: string;
  vendorName: string;
  itemDescription: string;
  amount: number;
  businessPurpose: string;
  missingReceiptReason: string;
  paymentMethod: string;
  authorLabel: string;
  confirmerLabel?: string;
  electronicConfirmation?: Record<string, unknown>;
};

export type ExpenseFactConfirmation = ExpenseFactConfirmationInput & {
  id: string;
  revisionNo: number;
  confirmedAt?: string;
  createdAt: string;
};

export type BankTransactionResolutionCandidate = {
  id: string;
  transactedAt: string;
  withdrawalAmount: number;
  counterparty?: string;
  description: string;
  bankTransactionUid?: string;
  resolutionStatus: string;
  linkedResolutionId?: string;
  linkedResolutionNo?: string;
};

export function validateFactConfirmation(input: ExpenseFactConfirmationInput) {
  const errors: string[] = [];
  if (!input.resolutionId.trim()) errors.push("연결할 지출결의서가 필요합니다.");
  if (!input.actualSpender.trim()) errors.push("실제 지출자를 입력해주세요.");
  if (!input.actualExpenseDate) errors.push("실제 지출일을 입력해주세요.");
  if (!input.vendorName.trim()) errors.push("구입처를 입력해주세요.");
  if (!input.itemDescription.trim()) errors.push("구입 품목 또는 서비스를 입력해주세요.");
  if (!(input.amount > 0)) errors.push("지출금액은 0원보다 커야 합니다.");
  if (!input.businessPurpose.trim()) errors.push("조합 업무 관련성을 입력해주세요.");
  if (!input.missingReceiptReason.trim()) errors.push("영수증 미첨부 사유를 입력해주세요.");
  if (!input.paymentMethod.trim()) errors.push("결제수단을 입력해주세요.");
  if (!input.authorLabel.trim()) errors.push("작성자를 확인할 수 없습니다.");
  return errors;
}

export function mapFactConfirmationToRow(input: ExpenseFactConfirmationInput, revisionNo: number) {
  return {
    actual_expense_date: input.actualExpenseDate,
    actual_spender_label: input.actualSpender,
    amount: input.amount,
    author_label: input.authorLabel,
    business_purpose: input.businessPurpose,
    confirmer_label: input.confirmerLabel ?? null,
    confirmed_at: input.confirmerLabel ? new Date().toISOString() : null,
    detail_transaction_id: input.detailTransactionId ?? null,
    electronic_confirmation: input.electronicConfirmation ?? {},
    item_description: input.itemDescription,
    missing_receipt_reason: input.missingReceiptReason,
    payment_method: input.paymentMethod,
    resolution_id: input.resolutionId,
    revision_no: revisionNo,
    vendor_name: input.vendorName,
  };
}

export async function listExpenseFactConfirmations(resolutionId: string): Promise<ExpenseFactConfirmation[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.schema("finance").from("expense_fact_confirmations")
    .select("id,resolution_id,detail_transaction_id,revision_no,actual_spender_label,actual_expense_date,vendor_name,item_description,amount,business_purpose,missing_receipt_reason,payment_method,author_label,confirmer_label,confirmed_at,electronic_confirmation,created_at")
    .eq("resolution_id", resolutionId).eq("is_current", true).is("deleted_at", null).order("created_at");
  if (error) throw new Error(`지출사실확인서 조회 실패: ${error.message}`);
  return (data ?? []).map((row) => ({
    actualExpenseDate: row.actual_expense_date, actualSpender: row.actual_spender_label, amount: Number(row.amount), authorLabel: row.author_label,
    businessPurpose: row.business_purpose, confirmedAt: row.confirmed_at ?? undefined, confirmerLabel: row.confirmer_label ?? undefined,
    createdAt: row.created_at, detailTransactionId: row.detail_transaction_id ?? undefined, electronicConfirmation: row.electronic_confirmation,
    id: row.id, itemDescription: row.item_description, missingReceiptReason: row.missing_receipt_reason, paymentMethod: row.payment_method,
    resolutionId: row.resolution_id, revisionNo: row.revision_no, vendorName: row.vendor_name,
  }));
}

export async function saveExpenseFactConfirmation(input: ExpenseFactConfirmationInput) {
  const errors = validateFactConfirmation(input);
  if (errors.length) throw new Error(errors.join(" "));
  const supabase = requireSupabase();
  let revisionNo = 1;
  if (input.id) {
    const { data: current, error } = await supabase.schema("finance").from("expense_fact_confirmations").select("revision_no,resolution_id").eq("id", input.id).eq("is_current", true).single();
    if (error || !current) throw new Error("수정할 지출사실확인서를 찾을 수 없습니다.");
    if (current.resolution_id !== input.resolutionId) throw new Error("다른 지출결의서의 확인서를 수정할 수 없습니다.");
    revisionNo = current.revision_no + 1;
    const { error: retireError } = await supabase.schema("finance").from("expense_fact_confirmations").update({ is_current: false }).eq("id", input.id);
    if (retireError) throw new Error(`이전 확인서 보존 실패: ${retireError.message}`);
  }
  const { data, error } = await supabase.schema("finance").from("expense_fact_confirmations").insert(mapFactConfirmationToRow(input, revisionNo)).select("id").single();
  if (error) throw new Error(`지출사실확인서 저장 실패: ${error.message}`);
  if (input.detailTransactionId) {
    const { error: linkError } = await supabase.schema("finance").from("expense_detail_transactions").update({ fact_confirmation_id: data.id, evidence_kind: "EXPENSE_FACT_CONFIRMATION", evidence_status: "ALTERNATIVE", updated_at: new Date().toISOString() }).eq("id", input.detailTransactionId).eq("resolution_id", input.resolutionId);
    if (linkError) throw new Error(`상세거래 확인서 연결 실패: ${linkError.message}`);
  }
  await writeComplianceAudit(input.resolutionId, input.id ? "FACT_CONFIRMATION_UPDATED" : "FACT_CONFIRMATION_CREATED", input.authorLabel, input.id ? { id: input.id } : null, { id: data.id, revisionNo });
  return data.id as string;
}

export async function deleteExpenseFactConfirmation(id: string, resolutionId: string, actorLabel: string) {
  const supabase = requireSupabase();
  const { data: current } = await supabase.schema("finance").from("expense_fact_confirmations").select("detail_transaction_id").eq("id", id).eq("resolution_id", resolutionId).maybeSingle();
  const { error } = await supabase.schema("finance").from("expense_fact_confirmations").update({ deleted_at: new Date().toISOString(), is_current: false }).eq("id", id).eq("resolution_id", resolutionId).eq("is_current", true);
  if (error) throw new Error(`지출사실확인서 삭제 실패: ${error.message}`);
  if (current?.detail_transaction_id) await supabase.schema("finance").from("expense_detail_transactions").update({ fact_confirmation_id: null, evidence_status: "DEFICIENT", updated_at: new Date().toISOString() }).eq("id", current.detail_transaction_id).eq("fact_confirmation_id", id);
  await writeComplianceAudit(resolutionId, "FACT_CONFIRMATION_DELETED", actorLabel, { id }, null);
}

export async function listUnresolvedWithdrawalTransactions(): Promise<BankTransactionResolutionCandidate[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.schema("finance").from("bank_transactions")
    .select("id,transacted_at,withdrawal_amount,counterparty,description,bank_transaction_uid,resolution_status")
    .gt("withdrawal_amount", 0).order("transacted_at", { ascending: false }).limit(200);
  if (error) throw new Error(`통장거래 조회 실패: ${error.message}`);
  const ids = (data ?? []).map((row) => row.id);
  const { data: links, error: linkError } = ids.length ? await supabase.schema("finance").from("expense_resolutions").select("id,resolution_no,bank_transaction_id").in("bank_transaction_id", ids).is("deleted_at", null) : { data: [], error: null };
  if (linkError) throw new Error(`통장거래 연결상태 조회 실패: ${linkError.message}`);
  return (data ?? []).map((row) => {
    const linked = (links ?? []).find((item) => item.bank_transaction_id === row.id);
    return { bankTransactionUid: row.bank_transaction_uid ?? undefined, counterparty: row.counterparty ?? undefined, description: row.description, id: row.id, linkedResolutionId: linked?.id, linkedResolutionNo: linked?.resolution_no, resolutionStatus: row.resolution_status, transactedAt: row.transacted_at, withdrawalAmount: Number(row.withdrawal_amount) };
  });
}

export async function linkBankTransactionToResolution(input: { bankTransactionId: string; resolutionId: string; actorLabel: string }) {
  const supabase = requireSupabase();
  const { data: linked } = await supabase.schema("finance").from("expense_resolutions").select("id,resolution_no").eq("bank_transaction_id", input.bankTransactionId).is("deleted_at", null).maybeSingle();
  if (linked && linked.id !== input.resolutionId) throw new Error(`이미 ${linked.resolution_no} 결의서에 연결된 통장거래입니다.`);
  const { data: transaction, error: transactionError } = await supabase.schema("finance").from("bank_transactions").select("transacted_at,withdrawal_amount").eq("id", input.bankTransactionId).single();
  if (transactionError || !transaction) throw new Error("연결할 통장 출금거래를 찾을 수 없습니다.");
  const before = { bankTransactionId: null };
  const { error } = await supabase.schema("finance").from("expense_resolutions").update({ actual_expense_date: transaction.transacted_at.slice(0, 10), bank_transaction_id: input.bankTransactionId, expense_kind: "BANK_POST_APPROVAL", is_post_approval: true, payment_status: "지급전" }).eq("id", input.resolutionId);
  if (error) throw new Error(error.code === "23505" ? "이미 다른 결의서에 연결된 통장거래입니다." : `통장거래 연결 실패: ${error.message}`);
  await supabase.schema("finance").from("bank_transactions").update({ resolution_status: "DRAFTING" }).eq("id", input.bankTransactionId);
  await writeComplianceAudit(input.resolutionId, "BANK_TRANSACTION_LINKED", input.actorLabel, before, { bankTransactionId: input.bankTransactionId });
  return { actualExpenseDate: transaction.transacted_at.slice(0, 10), withdrawalAmount: Number(transaction.withdrawal_amount) };
}

export async function getExpenseComplianceSettings(organizationId: string): Promise<ExpenseComplianceSettings | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.schema("finance").from("expense_compliance_settings").select("petty_cash_limit,monthly_person_warning_limit,petty_cash_allowed_accounts,petty_cash_excluded_keywords,allow_no_evidence_approval,no_evidence_approver_role,allow_personal_reimbursement,post_approval_max_days,fact_confirmer_roles,approval_line").eq("organization_id", organizationId).maybeSingle();
  if (error) throw new Error(`지출 관리설정 조회 실패: ${error.message}`);
  return data ? { allowNoEvidenceApproval: data.allow_no_evidence_approval, allowPersonalReimbursement: data.allow_personal_reimbursement, approvalLine: data.approval_line, factConfirmerRoles: data.fact_confirmer_roles, monthlyPersonWarningLimit: Number(data.monthly_person_warning_limit), noEvidenceApproverRole: data.no_evidence_approver_role ?? undefined, pettyCashAllowedAccounts: data.petty_cash_allowed_accounts, pettyCashExcludedKeywords: data.petty_cash_excluded_keywords, pettyCashLimit: Number(data.petty_cash_limit), postApprovalMaxDays: data.post_approval_max_days ?? undefined } : null;
}

export async function getDefaultOrganizationId() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.schema("finance").from("expense_resolutions").select("organization_id").not("organization_id", "is", null).limit(1).maybeSingle();
  if (error) throw new Error(`조합 정보 조회 실패: ${error.message}`);
  if (data?.organization_id) return data.organization_id as string;
  const { data: settings, error: settingsError } = await supabase.schema("finance").from("expense_compliance_settings").select("organization_id").limit(1).maybeSingle();
  if (settingsError) throw new Error(`기본 조합 조회 실패: ${settingsError.message}`);
  return settings?.organization_id as string | undefined;
}

export async function saveExpenseComplianceSettings(organizationId: string, settings: ExpenseComplianceSettings) {
  const supabase = requireSupabase();
  const { error } = await supabase.schema("finance").from("expense_compliance_settings").upsert({ allow_no_evidence_approval: settings.allowNoEvidenceApproval, allow_personal_reimbursement: settings.allowPersonalReimbursement ?? true, approval_line: settings.approvalLine ?? [], fact_confirmer_roles: settings.factConfirmerRoles ?? [], monthly_person_warning_limit: settings.monthlyPersonWarningLimit, no_evidence_approver_role: settings.noEvidenceApproverRole ?? null, organization_id: organizationId, petty_cash_allowed_accounts: settings.pettyCashAllowedAccounts, petty_cash_excluded_keywords: settings.pettyCashExcludedKeywords, petty_cash_limit: settings.pettyCashLimit, post_approval_max_days: settings.postApprovalMaxDays ?? null, updated_at: new Date().toISOString() });
  if (error) throw new Error(`지출 관리설정 저장 실패: ${error.message}`);
}

async function writeComplianceAudit(resolutionId: string, action: string, actorLabel: string, beforeData: unknown, afterData: unknown) {
  const supabase = requireSupabase();
  const { error } = await supabase.schema("finance").from("expense_workflow_audit_logs").insert({ action, actor_label: actorLabel, before_data: beforeData, after_data: afterData, resolution_id: resolutionId });
  if (error) throw new Error(`감사로그 저장 실패: ${error.message}`);
}

function requireSupabase() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  return supabase;
}
