import { describe, expect, it } from "vitest";
import { normalizeExpenseTiming, normalizeResolutionMode, validateExpenseResolutionWorkflow } from "./expense-resolution-domain";

describe("expense resolution workflow domain", () => {
  it("maps legacy resolution fields without rewriting stored data", () => {
    expect(normalizeResolutionMode({ resolutionType: "BATCH" })).toBe("PROJECT_BULK");
    expect(normalizeExpenseTiming({ paymentFlowType: "사후정산" })).toBe("REIMBURSEMENT");
  });

  it("rejects Excel registration for a single resolution", () => {
    const result = validateExpenseResolutionWorkflow({
      expenseTiming: "ADVANCE",
      inputMethod: "EXCEL",
      paymentAccountNo: "123-456",
      plannedPaymentDate: "2026-07-12",
      projectName: "사무국 비품 구입",
      reason: "사무용품 구입",
      resolutionMode: "SINGLE",
      subject: "7월 비품 구입",
      totalPaymentAmount: 30000,
    });
    expect(result.errors).toContain("엑셀 일괄등록은 프로젝트 일괄 지출결의에서만 사용할 수 있습니다.");
  });

  it("accepts a complete project bulk advance request", () => {
    const result = validateExpenseResolutionWorkflow({
      expenseTiming: "ADVANCE",
      executionMethod: "VENDOR_DIRECT",
      inputMethod: "EXCEL",
      paymentAccountNo: "123-456",
      plannedPaymentDate: "2026-07-12",
      projectName: "사무국 비품 구입",
      reason: "사무용품 구입",
      resolutionMode: "PROJECT_BULK",
      subject: "7월 비품 구입",
      totalPaymentAmount: 30000,
    });
    expect(result.errors).toEqual([]);
  });

  it("requires the original advance resolution for a settlement", () => {
    const result = validateExpenseResolutionWorkflow({
      actualUsedAmount: 920000,
      advancePaidAmount: 1000000,
      expenseTiming: "SETTLEMENT",
      inputMethod: "MANUAL",
      paymentAccountNo: "123-456",
      plannedPaymentDate: "2026-07-12",
      projectName: "정기총회 준비",
      reason: "선지급금 정산",
      resolutionMode: "SINGLE",
      subject: "총회비용 정산",
      totalPaymentAmount: 920000,
    });
    expect(result.errors).toContain("정산할 원 사전결의를 선택해주세요.");
  });

  it("rejects an account allocation total that differs from the payment total", () => {
    const result = validateExpenseResolutionWorkflow({
      accountAllocationTotal: 9000,
      expenseTiming: "ADVANCE",
      executionMethod: "VENDOR_DIRECT",
      inputMethod: "MANUAL",
      itemCount: 1,
      paymentAccountNo: "123-456",
      plannedPaymentDate: "2026-07-12",
      projectName: "사무국 비품 구입",
      reason: "비품 구입",
      resolutionMode: "SINGLE",
      subject: "비품 구입",
      totalPaymentAmount: 11000,
    });
    expect(result.errors).toContain("계정과목 분할금액 합계가 총지급금액과 일치해야 합니다.");
  });

  it("allows a corporate-card reimbursement without a payment account or receipt file when a reason is recorded", () => {
    const result = validateExpenseResolutionWorkflow({
      accountAllocationTotal: 18500,
      evidenceCount: 0,
      evidenceStatus: "NONE",
      expenseBurdenType: "CORPORATE_CARD",
      expenseTiming: "REIMBURSEMENT",
      itemCount: 1,
      missingEvidenceReason: "영수증 미발행 · 공용 법인카드 사용내역 확인 필요",
      plannedPaymentDate: "2026-08-27",
      projectName: "조합 운영",
      reason: "외부 미팅 이동",
      resolutionMode: "SINGLE",
      subject: "업무용 택시비",
      totalPaymentAmount: 18500,
    });

    expect(result.errors).toEqual([]);
  });
});
