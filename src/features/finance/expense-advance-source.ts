import { normalizeExpenseTiming, type ExpenseTiming, type ExecutionMethod } from "./expense-resolution-domain";

export type ExpenseAdvanceSource = {
  expenseTiming?: ExpenseTiming;
  paymentFlowType?: string;
  executionMethod?: ExecutionMethod;
  paymentStatus?: string;
  actualPaidAmount?: number | null;
  paidAt?: string | null;
};

/** Legacy approval amount and author-entered advance fields are not proof of payment. */
export function isEmployeeAdvanceSettlementSource(source: ExpenseAdvanceSource) {
  return normalizeExpenseTiming(source) === "ADVANCE" && source.executionMethod === "EMPLOYEE_ADVANCE" && source.paymentStatus === "지급완료";
}

export function getEmployeeAdvanceSourceFacts(source?: ExpenseAdvanceSource) {
  if (!source || !isEmployeeAdvanceSettlementSource(source)) return { advancePaidAmount: "", advancePaidAt: "", blockedReason: "지급완료된 담당자 선지급 원결의를 확인해주세요." };
  const amount = typeof source.actualPaidAmount === "number" && Number.isSafeInteger(source.actualPaidAmount) && source.actualPaidAmount > 0 ? String(source.actualPaidAmount) : "";
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const paidAt = typeof source.paidAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.paidAt) && !Number.isNaN(Date.parse(source.paidAt)) && new Date(source.paidAt).toISOString().slice(0, 10) === source.paidAt && source.paidAt <= today ? source.paidAt : "";
  return { advancePaidAmount: amount, advancePaidAt: paidAt, blockedReason: amount && paidAt ? null : "원결의의 실제 지급액·지급일 확인이 필요합니다. 승인금액이나 작성일로 대체할 수 없습니다." };
}

export function validateEmployeeAdvanceSelection(source: ExpenseAdvanceSource | undefined, input: { advancePaidAmount: number; advancePaidAt: string }) {
  const facts = getEmployeeAdvanceSourceFacts(source);
  if (facts.blockedReason) return facts.blockedReason;
  if (input.advancePaidAmount !== Number(facts.advancePaidAmount) || input.advancePaidAt !== facts.advancePaidAt) return "선지급액·선지급일은 원결의의 확인된 실제 지급 내역과 일치해야 합니다.";
  return null;
}
