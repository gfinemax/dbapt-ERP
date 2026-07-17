import { describe, expect, it } from "vitest";
import { normalizeEvidenceStatus, validateExpenseCompliance } from "./expense-compliance";

describe("expense compliance", () => {
  it("keeps an expense fact confirmation as alternative evidence", () => {
    expect(normalizeEvidenceStatus("EXPENSE_FACT_CONFIRMATION", "QUALIFIED")).toBe("ALTERNATIVE");
  });

  it("requires a linked bank transaction and post-approval reason", () => {
    const result = validateExpenseCompliance({ actualExpenseDate: "2026-03-15", evidenceKind: "BANK_TRANSFER", evidenceStatus: "GENERAL", expenseKind: "BANK_POST_APPROVAL" });
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining("은행거래"), expect.stringContaining("사후결의 사유")]));
  });

  it("warns but does not block a person's monthly petty-cash excess", () => {
    const result = validateExpenseCompliance({ actualExpenseDate: "2026-07-01", evidenceKind: "CARD_RECEIPT", evidenceStatus: "GENERAL", expenseKind: "PETTY_CASH_BATCH", pettyCashItems: [
      { accountTitle: "사무용품비", amount: 30_000, businessPurpose: "사무국", id: "1", item: "용지", spender: "오학동", transactionDate: "2026-07-01", vendor: "문구점A" },
      { accountTitle: "우편료·택배비", amount: 25_000, businessPurpose: "발송", id: "2", item: "택배", spender: "오학동", transactionDate: "2026-07-02", vendor: "택배사" },
      { accountTitle: "소모품비", amount: 50_000, businessPurpose: "사무국", id: "3", item: "토너", spender: "오학동", transactionDate: "2026-07-03", vendor: "문구점B" },
    ] });
    expect(result.warnings.join(" ")).toContain("월 누계");
    expect(result.errors.join(" ")).toContain("기준을 초과");
  });

  it("rejects excluded items regardless of amount and detects split transactions", () => {
    const excluded = validateExpenseCompliance({ actualExpenseDate: "2026-07-01", evidenceKind: "CARD_RECEIPT", evidenceStatus: "GENERAL", expenseKind: "PETTY_CASH_BATCH", pettyCashItems: [{ accountTitle: "자문료", amount: 20_000, businessPurpose: "계약 검토", id: "1", item: "법률 자문료", spender: "오학동", transactionDate: "2026-07-01", vendor: "법무법인" }] });
    expect(excluded.errors.join(" ")).toContain("제외");
    const split = validateExpenseCompliance({ actualExpenseDate: "2026-07-01", evidenceKind: "CARD_RECEIPT", evidenceStatus: "GENERAL", expenseKind: "PETTY_CASH_BATCH", pettyCashItems: [
      { accountTitle: "사무용품비", amount: 20_000, businessPurpose: "사무국", id: "1", item: "용지", spender: "오학동", transactionDate: "2026-07-01", vendor: "문구점" },
      { accountTitle: "사무용품비", amount: 20_000, businessPurpose: "사무국", id: "2", item: "펜", spender: "오학동", transactionDate: "2026-07-01", vendor: "문구점" },
    ] });
    expect(split.warnings.join(" ")).toContain("분할결제");
  });
});
