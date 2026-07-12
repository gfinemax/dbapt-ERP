import {
  expenseResolutionApprovalStatuses,
  expenseResolutionPaymentStatuses,
  expenseResolutionTypes,
  formatCurrency,
  getApprovalStatusLabel,
  getPaymentStatusLabel,
} from "./finance-model";
import type { EvidenceType, ExpenseResolution, ExpenseResolutionApprovalStatus, ExpenseResolutionPaymentStatus, ExpenseResolutionType, ResolutionHistory } from "./finance-model";

export type { EvidenceType, ExpenseResolution, ExpenseResolutionApprovalStatus, ExpenseResolutionPaymentStatus, ExpenseResolutionType, ResolutionHistory };

export type ExpenseResolutionStatus = ExpenseResolutionApprovalStatus | ExpenseResolutionPaymentStatus;

export const expenseResolutionStatusValues: ExpenseResolutionStatus[] = [...expenseResolutionApprovalStatuses, ...expenseResolutionPaymentStatuses];

export const expenseResolutionTypeOptions: ExpenseResolutionType[] = [...expenseResolutionTypes];

export const expenseResolutionFields = [
  "결의서번호",
  "작성일",
  "작성자",
  "지출예정일",
  "결의서 유형",
  "프로젝트/사업과제",
  "지급유형",
  "지출정보 요약",
  "지출구분",
  "운영비 세부구분",
  "세부 지출내역",
  "예산기간",
  "예산항목",
  "거래처명",
  "지급대상",
  "지급은행",
  "지급계좌번호",
  "예금주",
  "공급가액",
  "부가세",
  "총지급액",
  "지출사유",
  "관련계약",
  "관련회의",
  "증빙자료",
  "승인상태",
  "지급상태",
  "정산상태",
  "출력보관",
  "메모",
];

export const expenseResolutions: ExpenseResolution[] = [];

export function formatExpenseResolutionAmount(amount: number) {
  return formatCurrency(amount);
}

export { getApprovalStatusLabel, getPaymentStatusLabel };

export function getExpenseResolutionSummary() {
  const pendingApprovalItems = expenseResolutions.filter((resolution) => resolution.approvalStatus === "PENDING");

  return {
    pendingApprovalCount: pendingApprovalItems.length,
    waitingPaymentCount: expenseResolutions.filter((resolution) => resolution.approvalStatus === "APPROVED" && resolution.paymentStatus === "PAYMENT_PENDING").length,
    totalPendingAmount: pendingApprovalItems.reduce((sum, resolution) => sum + resolution.totalAmount, 0),
  };
}
