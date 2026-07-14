import { describe, expect, it } from "vitest";
import type { ExpenseEvidenceAttachment } from "./expense-evidence";
import { calculateBatchEvidenceSettlement } from "./expense-batch-settlement";

function evidence(id: string, totalAmount: number, status: ExpenseEvidenceAttachment["ocrStatus"] = "CONFIRMED"): ExpenseEvidenceAttachment {
  return {
    contentType: "image/jpeg", evidenceType: "영수증", fileName: `${id}.jpg`, fileSize: 100, id,
    ocrData: { documentDate: `2026-06-${id.padStart(2, "0")}`, issuer: `거래처${id}`, totalAmount },
    ocrStatus: status, storageBucket: "expense-evidence", storagePath: `${id}.jpg`, uploadedAt: "2026-07-14", uploadedBy: "오학동",
  };
}

describe("batch evidence settlement", () => {
  it("calculates a refund from ten confirmed receipts", () => {
    const result = calculateBatchEvidenceSettlement({ advancePaidAmount: 2_000_000, evidenceFiles: Array.from({ length: 10 }, (_, index) => evidence(String(index + 1), 176_000)) });
    expect(result).toMatchObject({ action: "REFUND_REQUIRED", canApprove: true, confirmedCount: 10, confirmedReceiptTotal: 1_760_000, refundAmount: 240_000 });
  });

  it("blocks approval while OCR results remain unconfirmed", () => {
    const result = calculateBatchEvidenceSettlement({ advancePaidAmount: 2_000_000, evidenceFiles: [evidence("1", 100_000), evidence("2", 200_000, "REVIEW_REQUIRED")] });
    expect(result.canApprove).toBe(false);
    expect(result.pendingCount).toBe(1);
  });
});
