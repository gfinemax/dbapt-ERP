import { describe, expect, it } from "vitest";
import { recommendExpenseBudget } from "./expense-budget-recommendation";

describe("expense budget recommendation", () => {
  it("recommends book and printing expense for custom envelope printing", () => {
    expect(recommendExpenseBudget({ itemName: "소봉투제작(5백매)", vendorBusinessCategory: "각종인쇄물디자인" })).toEqual({
      accountTitle: "운영비",
      budgetItem: "운영비 > 도서인쇄비",
      confidence: "높음",
      matchedKeyword: "봉투제작",
      reason: "품목명·지출사유에서 '봉투제작'을 인식했습니다.",
    });
  });

  it("uses vendor business category as a secondary signal", () => {
    expect(recommendExpenseBudget({ vendorBusinessCategory: "각종 인쇄물 디자인" })).toMatchObject({
      budgetItem: "운영비 > 도서인쇄비",
      confidence: "보통",
    });
  });

  it("does not fall back to rent without evidence", () => {
    expect(recommendExpenseBudget({ itemName: "알 수 없는 지출" })).toBeNull();
  });

  it("separates common mart supplies into the appropriate operating budget items", () => {
    expect(recommendExpenseBudget({ itemName: "에끌라 깨끗한 물티슈 150매" })?.budgetItem).toBe("운영비 > 사무용품비");
    expect(recommendExpenseBudget({ itemName: "블랙 위생백 대형" })?.budgetItem).toBe("운영비 > 소모품비");
  });
});
