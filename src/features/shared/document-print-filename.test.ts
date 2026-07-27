import { describe, expect, it } from "vitest";
import { buildDocumentPdfFileName } from "./document-print-filename";

describe("buildDocumentPdfFileName", () => {
  it("combines the document number and title for Korean PDF exports", () => {
    expect(buildDocumentPdfFileName("APR-2026-000001", "부동산 매입 용역 계약서 처리의 건"))
      .toBe("APR-2026-000001(부동산 매입 용역 계약서 처리의 건).pdf");
  });

  it("removes characters that Windows does not allow in file names", () => {
    expect(buildDocumentPdfFileName("APR:2026/1", "계약? 검토 *최종*"))
      .toBe("APR 2026 1(계약 검토 최종).pdf");
  });
});
