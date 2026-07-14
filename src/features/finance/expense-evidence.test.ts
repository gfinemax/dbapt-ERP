import { describe, expect, it } from "vitest";
import { classifyExpenseEvidence, extractEvidenceText, hasExtractedEvidenceData, inferEvidenceType, normalizeEvidenceVendorFields, sanitizeVendorName } from "./expense-evidence";

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

  it("extracts spaced Korean receipt labels", () => {
    const data = extractEvidenceText("상 호 스마트기획\n사업자등록번호 123-22-92770\n성 명 서광표\n사업장 소재지 인천 서구 완정로 45번길 52\n업 태 서비스\n종 목 각종인쇄물디자인\n작성년월일 2026. 06. 19\n공급대가총액 60,000");

    expect(data).toMatchObject({
      documentDate: "2026-06-19",
      issuerAddress: "인천 서구 완정로 45번길 52",
      issuerBusinessCategory: "각종인쇄물디자인",
      issuerBusinessNumber: "123-22-92770",
      issuerBusinessType: "서비스",
      issuerRepresentative: "서광표",
      supplyAmount: 60000,
    });
  });

  it("does not include the adjacent representative field in the supplier name", () => {
    expect(extractEvidenceText("상 호 스마트기획 성 명 서광표\n합계 60,000").issuer).toBe("스마트기획");
  });

  it("removes OCR punctuation from vendor names while preserving Korean, English, numbers, and spaces", () => {
    expect(sanitizeVendorName("스마트기획 | Smart-2026_#")).toBe("스마트기획  Smart2026");
  });

  it("classifies a receipt conservatively even when the model guesses tax invoice", () => {
    expect(classifyExpenseEvidence({
      modelDocumentType: "세금계산서",
      recognizedText: "영수증 (공급받는자용)\n대방동지역주택조합 귀하\n공급대가총액 60,000\n위 금액을 정히 영수함",
      vatAmount: 0,
    })).toMatchObject({
      classificationConfidence: "높음",
      normalizedEvidenceType: "영수증",
      vatTreatment: "NO_VAT",
    });
  });

  it("requires a tax invoice title and supporting document structure", () => {
    expect(classifyExpenseEvidence({
      recognizedText: "세금계산서 공급자 등록번호 107-87-14451 공급받는자 등록번호 123-45-67890 공급가액 세액 영수",
      vatAmount: 700000,
    })).toMatchObject({
      classificationConfidence: "높음",
      normalizedEvidenceType: "세금계산서",
      vatTreatment: "VAT_DEDUCTIBLE",
    });
  });

  it("falls back to receipt when no definite evidence type is found", () => {
    expect(classifyExpenseEvidence({ recognizedText: "품목 수량 단가 합계 60,000" })).toMatchObject({
      classificationConfidence: "낮음",
      normalizedEvidenceType: "영수증",
    });
  });

  it("removes table separators and stops vendor fields at the next OCR label", () => {
    expect(normalizeEvidenceVendorFields({
      issuerAddress: "| 인천 서구 완정로 45번길 52",
      issuerBusinessCategory: "| 각종인쇄물디자인",
      issuerBusinessType: "| 서비스 | 종목 | 각종인쇄물디자인",
      issuerRepresentative: "| 서광표",
    })).toMatchObject({
      issuerAddress: "인천 서구 완정로 45번길 52",
      issuerBusinessCategory: "각종인쇄물디자인",
      issuerBusinessType: "서비스",
      issuerRepresentative: "서광표",
    });
  });
});
