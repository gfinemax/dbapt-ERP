import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeEvidenceStatus, validateExpenseCompliance } from "./expense-compliance";
import { transitionExpenseDisbursement } from "./expense-disbursement-workflow";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

const petty = (overrides: Record<string, unknown> = {}) => ({ accountTitle: "사무용품비", amount: 10_000, businessPurpose: "사무국 운영", id: "1", item: "복사용지", spender: "오학동", transactionDate: "2026-07-01", vendor: "문구점", ...overrides });

describe("required expense compliance scenarios A-H", () => {
  it("A keeps a personal cash expense without receipt deficient", () => {
    expect(normalizeEvidenceStatus("EXPENSE_FACT_CONFIRMATION", "QUALIFIED")).toBe("ALTERNATIVE");
    expect(validateExpenseCompliance({ actualExpenseDate: "2026-07-01", evidenceKind: "EXPENSE_FACT_CONFIRMATION", evidenceStatus: "DEFICIENT", expenseKind: "PERSONAL_REIMBURSEMENT", missingEvidenceReason: "영수증 분실" }).errors).toEqual([]);
  });
  it("B approves a linked past bank withdrawal without creating another payment", () => {
    const result = validateExpenseCompliance({ actualExpenseDate: "2026-03-15", bankTransactionId: "bank-1", evidenceKind: "BANK_TRANSFER", evidenceStatus: "GENERAL", expenseKind: "BANK_POST_APPROVAL", postApprovalReason: "미작성 지출결의 현행화" });
    expect(result.errors).toEqual([]);
    const resolution = { approvalStatus: "승인완료", bankTransactionId: "bank-1", expenseItems: [], expenseKind: "BANK_POST_APPROVAL", history: [], paymentStatus: "지급대기", resolutionType: "SINGLE", settlementStatus: "정산없음", totalPaymentAmount: 120_000 } as ManagedExpenseResolution;
    expect(() => transitionExpenseDisbursement({ actorLabel: "사무장", command: "PAYMENT_COMPLETE", paidAt: "2026-07-16", paymentAccountNo: "1", paymentMethod: "계좌이체", resolution })).toThrow("추가 지급");
  });
  it("C accepts five allowed small transactions", () => {
    const items = [10_000, 15_000, 20_000, 18_000, 22_000].map((amount, index) => petty({ amount, id: String(index), transactionDate: `2026-07-${String(index + 1).padStart(2, "0")}`, vendor: `문구점${index}` }));
    expect(validateExpenseCompliance({ actualExpenseDate: "2026-07-01", evidenceKind: "CARD_RECEIPT", evidenceStatus: "GENERAL", expenseKind: "PETTY_CASH_BATCH", pettyCashItems: items }).errors).toEqual([]);
  });
  it("D warns without blocking a 110,000 won monthly total", () => {
    const items = [30_000, 30_000, 25_000, 25_000].map((amount, index) => petty({ amount, id: String(index), transactionDate: `2026-07-${index + 1}`, vendor: `업체${index}` }));
    const result = validateExpenseCompliance({ actualExpenseDate: "2026-07-01", evidenceKind: "CARD_RECEIPT", evidenceStatus: "GENERAL", expenseKind: "PETTY_CASH_BATCH", pettyCashItems: items });
    expect(result.errors).toEqual([]); expect(result.warnings.join(" ")).toContain("월 누계");
  });
  it("E and F reject an over-limit row and an excluded contract cost", () => {
    expect(validateExpenseCompliance({ actualExpenseDate: "2026-07-01", evidenceKind: "CARD_RECEIPT", evidenceStatus: "GENERAL", expenseKind: "PETTY_CASH_BATCH", pettyCashItems: [petty({ amount: 35_000 })] }).errors.join(" ")).toContain("기준을 초과");
    expect(validateExpenseCompliance({ actualExpenseDate: "2026-07-01", evidenceKind: "CARD_RECEIPT", evidenceStatus: "GENERAL", expenseKind: "PETTY_CASH_BATCH", pettyCashItems: [petty({ accountTitle: "자문료", amount: 20_000, item: "계약 자문료" })] }).errors.join(" ")).toContain("제외");
  });
  it("G blocks voucher creation when only a confirmation exists and resolution is not approved", () => {
    const resolution = { approvalStatus: "작성중", evidenceKind: "EXPENSE_FACT_CONFIRMATION", expenseItems: [], history: [], paymentStatus: "지급전", resolutionType: "SINGLE", settlementStatus: "정산없음", totalPaymentAmount: 10_000 } as ManagedExpenseResolution;
    expect(() => transitionExpenseDisbursement({ actorLabel: "사무장", command: "VOUCHER_CREATE", resolution, voucherNo: "지출-2026-0001" })).toThrow("지급완료");
  });
  it("H has a database uniqueness gate for one bank transaction per resolution", () => {
    const migration = readFileSync("supabase/migrations/20260716130000_expense_compliance_workflow.sql", "utf8");
    expect(migration).toContain("expense_resolutions_bank_transaction_unique_idx");
    expect(migration).toContain("bank_transactions_uid_unique_idx");
    expect(migration).toContain("vouchers_bank_transaction_unique_idx");
    expect(migration).toContain("expense_resolution_id text references finance.expense_resolutions");
  });
  it("persists voucher headers and balanced lines instead of storing only a number in JSON", () => {
    const actions = readFileSync("src/app/finance/expense-resolutions/actions.ts", "utf8");
    expect(actions).toContain('from("vouchers").upsert');
    expect(actions).toContain('from("voucher_lines").insert');
    expect(actions).toContain("credit_amount: target.amount");
    expect(actions).toContain("debit_amount: target.amount");
  });
});
