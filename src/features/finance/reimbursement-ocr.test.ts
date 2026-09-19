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
      evidenceKind: "RECEIPT",
      merchant: "주식회사 공단유통",
      purpose: "페인트 붓, 마스킹 테이프 구입",
      usedOn: "2026-09-15",
    });
  });

  it("does not invent facts that OCR did not recognize", () => {
    expect(buildReimbursementOcrDraft({})).toEqual({
      amount: undefined,
      evidenceKind: undefined,
      merchant: undefined,
      purpose: undefined,
      usedOn: undefined,
    });
  });

  it("maps transfer evidence without inferring a budget item", () => {
    expect(buildReimbursementOcrDraft({ normalizedEvidenceType: "이체확인증", totalAmount: 12000 }))
      .toMatchObject({ amount: "12000", evidenceKind: "BANK_TRANSFER" });
  });
});
