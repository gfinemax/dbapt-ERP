import { describe, expect, it } from "vitest";
import { extractExpenseEvidenceFile } from "./expense-evidence-ocr.server";

describe("expense evidence file OCR", () => {
  it("extracts structured values and preserves recognized text for textual evidence", async () => {
    const file = new File([
      "공급자: 다이스\n발행일: 2026-07-15\n공급가액: 10,000원\n부가세: 1,000원\n합계: 11,000원",
    ], "세금계산서.txt", { type: "text/plain" });

    await expect(extractExpenseEvidenceFile(file)).resolves.toMatchObject({
      documentDate: "2026-07-15",
      issuer: "다이스",
      recognizedText: expect.stringContaining("공급가액"),
      supplyAmount: 10000,
      totalAmount: 11000,
      vatAmount: 1000,
    });
  });
});
