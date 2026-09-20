import { describe, expect, it } from "vitest";
import { buildReimbursementOcrDraft } from "./reimbursement-ocr";

describe("reimbursement OCR draft", () => {
  it("maps receipt facts to editable reimbursement fields", () => {
    expect(buildReimbursementOcrDraft({
      documentDate: "2026. 9. 15.",
      issuer: "주식회사 공단유통",
      items: [{ itemName: "페인트 붓" }, { itemName: "마스킹 테이프" }],
      normalizedEvidenceType: "영수증",
      totalAmount: 32600,
    })).toEqual({
      amount: "32600",
      budgetId: undefined,
      budgetItem: undefined,
      evidenceKind: "RECEIPT",
      merchant: "주식회사 공단유통",
      purpose: "페인트 붓, 마스킹 테이프 구입",
      usedOn: "2026-09-15",
    });
  });

  it("does not invent facts that OCR did not recognize", () => {
    expect(buildReimbursementOcrDraft({})).toEqual({
      amount: undefined,
      budgetId: undefined,
      budgetItem: undefined,
      evidenceKind: undefined,
      merchant: undefined,
      purpose: undefined,
      usedOn: undefined,
    });
  });

  it("maps transfer evidence without inventing a budget item", () => {
    expect(buildReimbursementOcrDraft({ normalizedEvidenceType: "이체확인증", totalAmount: 12000 }))
      .toMatchObject({ amount: "12000", evidenceKind: "BANK_TRANSFER" });
  });

  it("matches an OCR recommendation only to a budget item that is actually available", () => {
    const ocr = { issuer: "우정사업본부(우체국)", recognizedText: "우편요금 1,770원", totalAmount: 1770 };
    expect(buildReimbursementOcrDraft(ocr, [
      { id: "printing", budget_item: "일반운영비 > 도서인쇄비" },
      { id: "supplies", budget_item: "일반운영비>사무용품비" },
    ])).toMatchObject({ budgetId: "printing", budgetItem: "일반운영비 > 도서인쇄비" });
    expect(buildReimbursementOcrDraft(ocr, [
      { id: "supplies", budget_item: "일반운영비>사무용품비" },
    ])).toMatchObject({ budgetId: undefined, budgetItem: undefined });
  });
});
