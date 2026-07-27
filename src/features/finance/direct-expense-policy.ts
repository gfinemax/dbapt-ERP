import { defaultExpenseComplianceSettings, type ExpenseComplianceSettings } from "./expense-compliance";

export type ExpenseCreationSource = "DIRECT" | "APPROVAL_LINKED" | "SMALL_EXPENSE" | "CONTRACT_PAYMENT";
export type DirectExpenseDecision = "ALLOWED" | "RECOMMENDED" | "REQUIRED";

export type DirectExpensePolicyInput = {
  amount: number;
  budgetItem?: string;
  budgetOverReason?: string;
  expenseKind?: string;
  relatedContract?: string;
  relatedMeeting?: string;
  subject?: string;
  reason?: string;
  memo?: string;
  source: ExpenseCreationSource;
};

export type DirectExpensePolicyResult = { decision: DirectExpenseDecision; reasons: string[] };

export function evaluateDirectExpensePolicy(input: DirectExpensePolicyInput, settings: ExpenseComplianceSettings = defaultExpenseComplianceSettings): DirectExpensePolicyResult {
  if (input.source !== "DIRECT") return { decision: "ALLOWED", reasons: [input.source === "APPROVAL_LINKED" ? "승인된 기안에서 생성된 지출결의입니다." : "별도 승인 흐름에서 생성된 지출결의입니다."] };
  if (!settings.allowDirectExpense) return { decision: "REQUIRED", reasons: ["관리자 설정에서 기안 없는 직접 지출을 허용하지 않습니다."] };
  const searchable = `${input.subject ?? ""} ${input.reason ?? ""} ${input.memo ?? ""} ${input.relatedContract ?? ""}`.replace(/\s+/g, " ");
  const matchedKeywords = (settings.directExpenseRequiredKeywords ?? []).filter((keyword) => keyword && searchable.includes(keyword));
  const required: string[] = [];
  if (input.amount > (settings.directExpenseLimit ?? 0)) required.push(`직접 지출 한도 ${(settings.directExpenseLimit ?? 0).toLocaleString("ko-KR")}원을 초과했습니다.`);
  if (input.budgetOverReason?.trim()) required.push("예산 외 또는 예산 초과 지출입니다.");
  if (input.relatedContract?.trim() || /계약|용역/.test(searchable)) required.push("계약 관련 지출입니다.");
  if (input.relatedMeeting?.trim()) required.push("의결과 연결된 지출입니다.");
  if (matchedKeywords.length) required.push(`기안 필수 업무가 포함되어 있습니다: ${matchedKeywords.join(", ")}`);
  if (required.length) return { decision: "REQUIRED", reasons: required };
  const recommended: string[] = [];
  const recommendedKeywords = (settings.directExpenseRecommendedKeywords ?? []).filter((keyword) => keyword && searchable.includes(keyword));
  if (recommendedKeywords.length) recommended.push(`기안 연결 권장 업무가 포함되어 있습니다: ${recommendedKeywords.join(", ")}`);
  if (!input.budgetItem?.trim()) recommended.push("예산 항목이 지정되지 않아 기안 연결을 권장합니다.");
  if (input.amount >= (settings.directExpenseLimit ?? 0) * 0.8) recommended.push("직접 지출 한도에 가까운 금액입니다.");
  return recommended.length ? { decision: "RECOMMENDED", reasons: recommended } : { decision: "ALLOWED", reasons: ["승인 예산 범위 내 일상·정기 지출로 직접 처리할 수 있습니다."] };
}

export function assertDirectExpenseCanProceed(input: DirectExpensePolicyInput & { approvalDocumentId?: string; approvalDocumentStatus?: string }, settings?: ExpenseComplianceSettings) {
  const result = evaluateDirectExpensePolicy(input, settings);
  if (result.decision === "REQUIRED" && (!input.approvalDocumentId || input.approvalDocumentStatus !== "APPROVED")) {
    throw new Error(`승인된 기안을 연결해야 합니다. ${result.reasons.join(" ")}`);
  }
  return result;
}
