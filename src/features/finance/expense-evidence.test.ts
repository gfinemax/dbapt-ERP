import { describe, expect, it } from "vitest";
import { extractEvidenceText, hasExtractedEvidenceData, inferEvidenceType } from "./expense-evidence";

describe("expense evidence OCR helpers", () => {
  it("extracts reviewable fields from text evidence", () => {
    const data = extractEvidenceText("공급자: 다이스\n발행일: 2026.07.15\n공급가액: 10,000원\n부가세: 1,000원\n합계: 11,000원");
    expect(data).toEqual({ issuer: "다이스", documentDate: "2026-07-15", supplyAmount: 10000, vatAmount: 1000, totalAmount: 11000 });
    expect(hasExtractedEvidenceData(data)).toBe(true);
  });

  it("infers common evidence types from file names", () => {
    expect(inferEvidenceType("2026-07 세금계산서.pdf", "기타")).toBe("세금계산서");
    expect(inferEvidenceType("업체 송금확인.png", "기타")).toBe("이체확인증");
  });
});
