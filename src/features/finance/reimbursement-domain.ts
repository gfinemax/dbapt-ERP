export const reimbursementPermissions = ["ADMIN", "APPROVE", "SENIOR", "CLOSE", "PAY"] as const;
export type ReimbursementPermission = typeof reimbursementPermissions[number];
export type ReimbursementMember = { user_id: string; organization_id: string; display_name: string; permissions: ReimbursementPermission[]; active: boolean };
export type ReimbursementPolicy = { submission_day: number; completion_day: number; long_delay_days: number };
export type ReimbursementPeriod = { month: string; status: "OPEN" | "SUPPLEMENT" | "CLOSED"; submission_deadline: string; completion_deadline: string; long_delay_days: number; revision: number };
export type Reimbursement = {
  id: string; applicant_id: string; budget_id: string; used_on: string; budget_month: string; amount: number;
  merchant: string; purpose: string; delay_reason: string; source_quick_id: string | null;
  status: "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED" | "CANCELLED";
  needs_exception: boolean; needs_senior: boolean; exception_approved_at: string | null;
  senior_approved_at: string | null; over_budget_approved_at: string | null;
  submitted_at: string; approved_at: string | null; paid_at: string | null; bank_transaction_id: string | null;
  payment_method?: "PERSONAL_CARD" | "PERSONAL_TRANSFER" | "CASH";
  evidence_kind?: "RECEIPT" | "CARD_STATEMENT" | "BANK_TRANSFER" | "ORDER_DETAILS" | "TRANSACTION_STATEMENT" | "ITEM_PHOTO" | "OTHER_ALTERNATIVE";
  missing_receipt_reason?: string;
  evidence_review_status?: "READY" | "REVIEW_REQUIRED" | "SUPPLEMENT_REQUIRED" | "APPROVED";
  evidence_reviewed_at?: string | null;
  evidence_review_note?: string;
};
export type BudgetEntry = { source_kind: string; source_id: string; title: string; budget_id: string; month: string; amount: number; state: string; paid_at: string | null };
export type BudgetAllocationLine = { budget_id: string; month: string; amount: number; used_on?: string };
export type BudgetAllocationSource = { source_kind: string; source_id: string; title: string; amount: number; source_state: string; suggested_month: string | null; suggested_budget: string | null; paid_at: string | null; signature: string; revision: number; lines: BudgetAllocationLine[]; state: string | null; covered_amount: number; needs_review: boolean; reason: string };
export type ReimbursementBudget = { id: string; budget_item: string; monthly_amount: number; approved_amount: number; annual_recorded_amount: number; quick_amount: number; personal_amount: number; unpaid_amount: number; reserved_amount: number; resolution_amount?: number; manual_amount?: number; pending_amount?: number; unresolved_count?: number; annual_used_amount?: number; annual_reserved_amount?: number };
export type ReimbursementReport = { month: string; revision: number; created_at: string; reason: string; snapshot: { schema_version?: number; entries?: BudgetEntry[]; review?: BudgetAllocationSource[]; budgets: ReimbursementBudget[]; requests: Pick<Reimbursement, "id" | "used_on" | "amount" | "budget_id" | "status">[] } };
export type ReimbursementAudit = { id: string; request_id: string | null; actor_id: string; action: string; reason: string; created_at: string };
export type ReimbursementBank = { id: string; transacted_at: string; withdrawal_amount: number; counterparty: string; description: string };
export type ReimbursementSource = { id: string; occurred_at: string; amount: number; counterparty: string; budget_item: string; usage_description: string };
export const reimbursementStatusLabels = { SUBMITTED: "심사 중", APPROVED: "지급 대기", PAID: "정산 완료", REJECTED: "반려", CANCELLED: "취소" };
export const reimbursementCommandLabels: Record<string,string> = { BUDGET_ASSIGNMENT: "예산 귀속 확인·수정", SUBMIT: "정산 신청", EVIDENCE_APPROVE: "대체증빙 승인", EVIDENCE_SUPPLEMENT: "증빙 보완요청", EXCEPTION: "지연 정산 승인", SENIOR: "장기 지연 승인", OVER_BUDGET: "예산 초과 승인", APPROVE: "예산 반영 승인", REJECT: "반려", CANCEL: "신청 취소", PAY: "지급 연결", REVERSE_PAYMENT: "지급 연결 취소", OPEN: "접수월 개설", SUPPLEMENT: "보완 접수", CLOSE: "월 마감", POLICY: "운영 기준 변경", MEMBER: "담당자 권한 변경" };
export function koreaDate(value = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
export function hasReimbursementPermission(member: ReimbursementMember, permission: ReimbursementPermission) { return member.active && (member.permissions.includes("ADMIN") || member.permissions.includes(permission)); }
export function budgetUsed(b: ReimbursementBudget) { return Number(b.quick_amount) + Number(b.personal_amount) + Number(b.resolution_amount ?? 0) + Number(b.manual_amount ?? 0); }
export function budgetRemaining(b: ReimbursementBudget) { return Number(b.monthly_amount) - budgetUsed(b) - Number(b.reserved_amount); }
export function periodLabel(period: ReimbursementPeriod, today: string) {
  if (period.status === "CLOSED") return "마감";
  if (today > period.completion_deadline) return "접수 기한 종료 · 마감 대기";
  if (period.status === "SUPPLEMENT" || today > period.submission_deadline) return "보완 접수";
  return "정상 접수";
}
export function requestActions(r: Reimbursement, member: ReimbursementMember, period?: ReimbursementPeriod) {
  const actions: string[] = [];
  const other = r.applicant_id !== member.user_id;
  const evidenceReviewStatus = r.evidence_review_status ?? "READY";
  if (r.status === "SUBMITTED") {
    if (other && hasReimbursementPermission(member,"APPROVE")) {
      if (evidenceReviewStatus === "REVIEW_REQUIRED") actions.push("EVIDENCE_APPROVE");
      if (["REVIEW_REQUIRED","SUPPLEMENT_REQUIRED"].includes(evidenceReviewStatus)) actions.push("EVIDENCE_SUPPLEMENT");
      if (r.needs_exception && !r.exception_approved_at) actions.push("EXCEPTION");
      actions.push("REJECT");
    }
    if (other && hasReimbursementPermission(member,"SENIOR")) {
      if (r.needs_senior && !r.senior_approved_at) actions.push("SENIOR");
      if (!r.over_budget_approved_at) actions.push("OVER_BUDGET");
    }
    if (other && hasReimbursementPermission(member,period?.status === "CLOSED" ? "CLOSE" : "APPROVE")
      && ["READY","APPROVED"].includes(evidenceReviewStatus) && (!r.needs_exception || r.exception_approved_at) && (!r.needs_senior || r.senior_approved_at)) actions.push("APPROVE");
    if (!other || hasReimbursementPermission(member,"APPROVE")) actions.push("CANCEL");
  }
  if (r.status === "APPROVED") {
    if (hasReimbursementPermission(member,"PAY")) actions.push("PAY");
    if (hasReimbursementPermission(member,"CLOSE")) actions.push("CANCEL");
  }
  if (r.status === "PAID" && hasReimbursementPermission(member,"PAY")) actions.push("REVERSE_PAYMENT");
  return actions;
}
