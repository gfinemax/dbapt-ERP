import { describe, expect, it } from "vitest";
import { buildExpenseOcrFormSuggestions } from "./expense-ocr-form-suggestions";

describe("expense OCR form suggestions", () => {
  it("creates subject, reason, and a registered project suggestion from receipt items", () => {
    expect(buildExpenseOcrFormSuggestions({
      budgetItems: ["운영비 > 사무용품비", "운영비 > 소모품비"],
      ocr: {
        issuer: "주아성다이소봉천본점",
        items: [
          { itemName: "에끌라깨끗한물티슈150매" },
          { itemName: "블랙위생백(대형)(70매입)" },
          { itemName: "매장용 다이소로고 타포린백" },
        ],
      },
      projectOptions: ["사무국 비품 구입", "사무국 운영관리"],
    })).toEqual({
      projectName: "사무국 비품 구입",
      reason: "조합 운영에 필요한 에끌라깨끗한물티슈150매, 블랙위생백, 매장용 다이소로고 타포린백을(를) 주아성다이소봉천본점에서 구입함",
      subject: "사무용품 및 소모품 구입",
    });
  });

  it("does not invent a project that is not registered", () => {
    expect(buildExpenseOcrFormSuggestions({
      budgetItems: ["운영비 > 사무용품비"],
      ocr: { itemName: "복사용지" },
      projectOptions: ["기타"],
    }).projectName).toBeUndefined();
  });
});
