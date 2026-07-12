import { describe, expect, it } from "vitest";
import { buildExpenseResolutionImportTemplateCsv, expenseResolutionImportHeaders, parseExpenseResolutionImportRows } from "./expense-resolution-import";

describe("expense resolution Excel import", () => {
  it("parses valid rows and calculates omitted VAT", () => {
    const result = parseExpenseResolutionImportRows([
      [...expenseResolutionImportHeaders],
      ["2026-07-15", "다이스", "복사용지", "운영비", "소모품비", "운영비 > 사무용품", "10,000", "", "계좌이체", "세금계산서", "", "500000", "120000", ""],
    ]);

    expect(result.errors).toEqual([]);
    expect(result.importedRows).toEqual([
      expect.objectContaining({ expenseDate: "2026-07-15", vendorName: "다이스", supplyAmount: 10000, vatAmount: 1000, allocatedBudget: 500000, executedAmount: 120000 }),
    ]);
  });

  it("keeps valid rows and reports every invalid row with its spreadsheet number", () => {
    const result = parseExpenseResolutionImportRows([
      [...expenseResolutionImportHeaders],
      ["2026-07-15", "정상 거래처", "정상 품목", "운영비", "소모품비", "운영비 > 사무용품", "10000", "1000", "계좌이체", "영수증", "", "", "", ""],
      ["2026-02-30", "", "오류 품목", "운영비", "", "", "금액오류", "-1", "수표", "", "", "", "", ""],
    ]);

    expect(result.totalRowCount).toBe(2);
    expect(result.importedRows).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ rowNumber: 3 });
    expect(result.errors[0].messages).toEqual(expect.arrayContaining(["거래처를 입력해야 합니다.", "공급가액은 0 이상의 숫자여야 합니다."]));
  });

  it("rejects a sheet when required headers are missing", () => {
    const result = parseExpenseResolutionImportRows([["거래처", "공급가액"], ["다이스", "10000"]]);
    expect(result.importedRows).toEqual([]);
    expect(result.errors[0].messages[0]).toContain("필수 헤더 누락");
  });

  it("builds an Excel-compatible CSV template with the canonical headers", () => {
    const csv = buildExpenseResolutionImportTemplateCsv();
    expect(csv).toContain(expenseResolutionImportHeaders.join(","));
    expect(csv).toContain("2026-07-15,다이스");
  });
});
