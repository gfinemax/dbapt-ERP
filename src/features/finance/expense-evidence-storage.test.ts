import { describe, expect, it } from "vitest";
import { buildExpenseEvidenceOcrSourcePath, buildExpenseEvidenceStoragePath } from "./expense-evidence-storage";

describe("expense evidence storage path", () => {
  it("builds an ASCII-only key while preserving the file type", () => {
    const path = buildExpenseEvidenceStoragePath("지결-2026-0002", "c1bc29f0-281d-4a11-898c-604aec61b303", "image/jpeg");

    expect(path).toBe("expense-resolutions/2026-0002/c1bc29f0-281d-4a11-898c-604aec61b303.jpg");
    expect(path).toMatch(/^[\x00-\x7F]+$/);
  });

  it("builds a deterministic private OCR source key", () => {
    expect(buildExpenseEvidenceOcrSourcePath("expense-resolutions/2026/id.jpg"))
      .toBe("expense-resolutions/2026/id.jpg.ocr-source");
  });
});
