import { describe, expect, it } from "vitest";
import { recommendExpenseBudget, recommendOperatingExpenseDetail } from "./expense-budget-recommendation";

describe("expense budget recommendation", () => {
  it("recommends book and printing expense for custom envelope printing", () => {
    expect(recommendExpenseBudget({ itemName: "소봉투제작(5백매)", vendorBusinessCategory: "각종인쇄물디자인" })).toEqual({
      accountTitle: "운영비",
      budgetItem: "일반운영비>도서인쇄비",
      confidence: "높음",
      detailCode: "GENERAL-PRINT",
      matchedKeyword: "봉투제작",
      reason: "품목명·지출사유에서 '봉투제작'을 인식했습니다.",
    });
  });

  it("uses vendor business category as a secondary signal", () => {
    expect(recommendExpenseBudget({ vendorBusinessCategory: "각종 인쇄물 디자인" })).toMatchObject({
      budgetItem: "일반운영비>도서인쇄비",
      confidence: "보통",
    });
  });

  it("does not fall back to rent without evidence", () => {
    expect(recommendExpenseBudget({ itemName: "알 수 없는 지출" })).toBeNull();
  });

  it("separates common mart supplies into the appropriate operating budget items", () => {
    expect(recommendExpenseBudget({ itemName: "에끌라 깨끗한 물티슈 150매" })?.budgetItem).toBe("일반운영비>소모품비");
    expect(recommendExpenseBudget({ itemName: "블랙 위생백 대형" })?.budgetItem).toBe("일반운영비>소모품비");
  });

  it("separates office supplies from consumables", () => {
    expect(recommendExpenseBudget({ itemName: "클리어파일과 건전지" })).toMatchObject({ budgetItem: "일반운영비>사무용품비", detailCode: "GENERAL-SUPPLIES" });
  });

  it("recommends communications expense for postal receipts", () => {
    expect(recommendExpenseBudget({ itemName: "보통", vendorName: "서울신길동우체국" })).toMatchObject({
      accountTitle: "운영비",
      budgetItem: "일반운영비>도서인쇄비",
      detailCode: "GENERAL-PRINT",
      confidence: "보통",
      matchedKeyword: "우체국",
    });
  });

  it("resolves the stable detail from usage, receipt text and vendor data", () => {
    const details = [{ id: "supplies", code: "GENERAL-SUPPLIES", groupName: "일반운영비", name: "사무용품비", budgetItem: "일반운영비>사무용품비", status: "CONFIRMED" as const, quickExpenseEligible: true }];
    expect(recommendOperatingExpenseDetail(details, { evidenceText: "클리어파일 건전지", vendorName: "다이소" })?.detail.id).toBe("supplies");
  });

  it("does not guess a catch-all detail from an ambiguous 기타 label", () => {
    expect(recommendExpenseBudget({ itemName: "기타 비용" })).toBeNull();
  });

  it("prefers a specific purpose over a broader word in the same text", () => {
    expect(recommendExpenseBudget({ itemName: "신문광고 게재비" })?.detailCode).toBe("OTHER-OPERATING");
    expect(recommendExpenseBudget({ itemName: "통신비 AI 구독료" })?.detailCode).toBe("PUBLIC-AI");
  });
});
