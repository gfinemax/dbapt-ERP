import { describe, expect, it } from "vitest";
import {
  expenseResolutionFields,
  expenseResolutionStatusValues,
  expenseResolutionTypeOptions,
  expenseResolutions,
  getExpenseResolutionSummary,
} from "./expense-resolution-data";

describe("expense resolution data", () => {
  it("defines the cooperative expense resolution status values", () => {
    expect(expenseResolutionStatusValues).toEqual(["DRAFT", "PENDING", "APPROVED", "REJECTED", "BEFORE_PAYMENT", "PAYMENT_PENDING", "PARTIAL_PAID", "PAID", "HOLD"]);
  });

  it("defines the requested expense type options", () => {
    expect(expenseResolutionTypeOptions).toEqual([
      "운영비",
      "용역비",
      "토지매입비",
      "업무대행비",
      "법무비",
      "세무비",
      "감정평가비",
      "환불금",
      "차입금상환",
      "총회비",
      "인쇄비",
      "우편비",
      "홍보비",
      "행사운영비",
      "비품비",
      "소모품비",
      "기타",
    ]);
  });

  it("defines all input fields for creating an expense resolution", () => {
    expect(expenseResolutionFields).toEqual([
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
    ]);
  });

  it("summarizes pending approvals and payment waiting resolutions", () => {
    expect(getExpenseResolutionSummary()).toMatchObject({
      pendingApprovalCount: 2,
      waitingPaymentCount: 1,
      totalPendingAmount: 953300000,
    });
  });

  it("keeps resolution rows in list display shape", () => {
    expect(expenseResolutions[0]).toMatchObject({
      resolutionNo: "지결-2026-0001",
      vendorName: "법무법인 ○○",
      expenseType: "법무비",
      approvalStatus: "PENDING",
      paymentStatus: "PAYMENT_PENDING",
      paymentFlowType: "PRE_APPROVAL",
      budgetPeriod: "2026-07",
      budgetCheckStatus: "NORMAL",
      createdBy: "오학동",
      createdByTitle: "사무장",
      bankName: "국민은행",
      accountNumber: "123456-78-901234",
      vatAmount: 300000,
      totalAmount: 3300000,
    });
    expect(expenseResolutions[0].approvalLines).toHaveLength(3);
    expect(expenseResolutions[0].approvalLines[0]).toMatchObject({
      approverName: "장현제",
      approverTitle: "부장",
      status: "APPROVED",
    });
    expect(expenseResolutions[0].approvalLines[1]).toMatchObject({
      approverName: "오학동",
      approverTitle: "사무장",
      status: "CURRENT",
    });
    expect(expenseResolutions[0].evidenceFiles[0]).toMatchObject({
      evidenceType: "TAX_INVOICE",
      evidenceTypeLabel: "세금계산서",
      amount: 3300000,
    });
    expect(expenseResolutions[0].history[0]).toMatchObject({
      actionType: "CREATED",
      actionLabel: "지출결의서 작성",
    });
    expect(expenseResolutions[0].printRecords[0]).toMatchObject({
      printPurpose: "보관용",
      storageLocation: "2026년 운영비 지출결의서 / 7월 / 001",
    });
  });
});
