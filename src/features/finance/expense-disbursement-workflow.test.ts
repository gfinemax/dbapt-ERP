import { describe, expect, it } from "vitest";
import { DisbursementWorkflowError, transitionExpenseDisbursement } from "./expense-disbursement-workflow";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

function createResolution(overrides: Partial<ManagedExpenseResolution> = {}) {
  return {
    id: "resolution-1",
    approvalStatus: "승인완료",
    expenseItems: [],
    history: [],
    paymentStatus: "지급대기",
    resolutionType: "SINGLE",
    settlementStatus: "정산없음",
    totalPaymentAmount: 30_000,
    ...overrides,
  } as ManagedExpenseResolution;
}

const payment = {
  actorLabel: "오학동 사무장",
  paidAt: "2026-07-12",
  paymentAccountNo: "123-456",
  paymentMethod: "계좌이체" as const,
  transitionedAt: "2026-07-12 14:00",
};

describe("expense disbursement workflow", () => {
  it("completes an approved group payment", () => {
    const result = transitionExpenseDisbursement({ ...payment, command: "PAYMENT_COMPLETE", resolution: createResolution() });
    expect(result).toMatchObject({ actualPaidAmount: 30_000, paidAt: "2026-07-12", paymentStatus: "지급완료" });
    expect(result.history.at(-1)?.actionLabel).toBe("지급완료");
  });

  it("moves an item-payment batch through partial and complete states", () => {
    const resolution = createResolution({
      batchPaymentMode: "ITEM",
      expenseItems: [
        { itemNo: 1, paymentStatus: "지급대기", totalAmount: 10_000 },
        { itemNo: 2, paymentStatus: "지급대기", totalAmount: 20_000 },
      ],
      resolutionType: "BATCH",
    } as Partial<ManagedExpenseResolution>);
    const partial = transitionExpenseDisbursement({ ...payment, command: "ITEM_PAYMENT_COMPLETE", itemNo: 1, resolution });
    expect(partial).toMatchObject({ actualPaidAmount: 10_000, paymentStatus: "부분지급" });
    const completed = transitionExpenseDisbursement({ ...payment, command: "ITEM_PAYMENT_COMPLETE", itemNo: 2, resolution: partial });
    expect(completed).toMatchObject({ actualPaidAmount: 30_000, paymentStatus: "지급완료" });
  });

  it("requires a hold reason", () => {
    expect(() => transitionExpenseDisbursement({ actorLabel: "오학동 사무장", command: "PAYMENT_HOLD", resolution: createResolution() })).toThrow(DisbursementWorkflowError);
    const held = transitionExpenseDisbursement({ actorLabel: "오학동 사무장", command: "PAYMENT_HOLD", reason: "계좌 확인", resolution: createResolution() });
    expect(held).toMatchObject({ holdReason: "계좌 확인", paymentStatus: "보류" });
  });

  it("creates a voucher idempotently and confirms its draft", () => {
    const paid = createResolution({ paymentStatus: "지급완료" });
    const draft = transitionExpenseDisbursement({ actorLabel: "오학동 사무장", command: "VOUCHER_CREATE", resolution: paid, voucherNo: "지출-2026-0001" });
    expect(draft).toMatchObject({ voucherNo: "지출-2026-0001", voucherStatus: "전표초안" });
    expect(transitionExpenseDisbursement({ actorLabel: "오학동 사무장", command: "VOUCHER_CREATE", resolution: draft, voucherNo: "지출-2026-0002" })).toBe(draft);
    const confirmed = transitionExpenseDisbursement({ actorLabel: "오학동 사무장", command: "VOUCHER_CONFIRM", resolution: draft, transitionedAt: "2026-07-12 15:00" });
    expect(confirmed).toMatchObject({ voucherConfirmedBy: "오학동 사무장", voucherStatus: "전표확정" });
  });

  it("rejects payment before final approval and voucher creation before payment", () => {
    expect(() => transitionExpenseDisbursement({ ...payment, command: "PAYMENT_COMPLETE", resolution: createResolution({ approvalStatus: "승인대기" }) })).toThrow(DisbursementWorkflowError);
    expect(() => transitionExpenseDisbursement({ actorLabel: "오학동 사무장", command: "VOUCHER_CREATE", resolution: createResolution(), voucherNo: "지출-2026-0001" })).toThrow(DisbursementWorkflowError);
  });
});
