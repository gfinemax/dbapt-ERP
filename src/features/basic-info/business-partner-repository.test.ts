import { describe, expect, it } from "vitest";
import { mapBusinessPartnerFromRow, mapOcrPartnerToInsert, normalizeBusinessRegistrationNo } from "./business-partner-repository";

describe("business partner OCR registration repository", () => {
  it("normalizes a business registration number", () => {
    expect(normalizeBusinessRegistrationNo("123 22 92770")).toBe("123-22-92770");
  });

  it("maps confirmed OCR fields into a payable purchase partner", () => {
    expect(mapOcrPartnerToInsert({
      address: "인천 서구 완정로 45번길 52",
      businessCategory: "서비스",
      businessItem: "각종인쇄물디자인",
      evidenceId: "evidence-1",
      firstTransactionDate: "2026-06-19",
      name: "스마트기획",
      registrationNo: "123-22-92770",
      representative: "서광표",
      resolutionNo: "지결-2026-0002",
    })).toMatchObject({
      balance_type: "채무",
      business_category: "서비스",
      business_item: "각종인쇄물디자인",
      evidence_profile_status: "완료",
      name: "스마트기획",
      partner_type: "매입",
      registration_no: "123-22-92770",
      registration_source: "OCR 자동등록",
    });
  });

  it("maps stored OCR registration metadata into the basic information row", () => {
    expect(mapBusinessPartnerFromRow({
      address: "인천 서구",
      balance_amount: 0,
      balance_type: "채무",
      business_category: "서비스",
      business_item: "인쇄",
      code: "BP-OCR-1232292770",
      evidence_profile_status: "완료",
      first_transaction_date: "2026-06-19",
      id: "partner-1",
      name: "스마트기획",
      owner_type: "사업자",
      partner_type: "매입",
      phone: "",
      project_scope: "회계/자금",
      registration_no: "123-22-92770",
      registration_source: "OCR 자동등록",
      representative: "서광표",
      source_evidence_id: "evidence-1",
      source_resolution_no: "지결-2026-0002",
    })).toMatchObject({
      id: "partner-1",
      name: "스마트기획",
      registrationNo: "123-22-92770",
      registrationSource: "OCR 자동등록",
      sourceResolutionNo: "지결-2026-0002",
    });
  });
});
