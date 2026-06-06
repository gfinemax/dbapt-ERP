import { describe, expect, it } from "vitest";
import { businessPartnerFilters, businessPartners, getBusinessPartnerSummary } from "./business-partner-data";

describe("business partner data", () => {
  it("keeps partner rows for tax invoice and receivable payable management", () => {
    expect(businessPartners.map((partner) => partner.name)).toEqual([
      "대방개발 주식회사",
      "대한토지신탁",
      "파인맥스 업무대행",
    ]);
  });

  it("defines type filters in the registration flow order", () => {
    expect(businessPartnerFilters).toEqual(["전체", "매출", "매입", "혼합"]);
  });

  it("summarizes partners that need receivable or payable review", () => {
    expect(getBusinessPartnerSummary()).toEqual({
      totalPartners: 3,
      receivablePartners: 1,
      payablePartners: 2,
      missingEvidenceProfiles: 1,
    });
  });
});
