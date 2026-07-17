import { describe, expect, it } from "vitest";
import { mapFactConfirmationToRow, validateFactConfirmation } from "./expense-compliance-repository";

const valid = { actualExpenseDate: "2026-07-01", actualSpender: "오학동", amount: 10_000, authorLabel: "오학동 사무장", businessPurpose: "사무국 문서 출력", itemDescription: "복사용지", missingReceiptReason: "영수증 분실", paymentMethod: "개인 현금", resolutionId: "exp-1", vendorName: "문구점" };

describe("expense compliance repository mappings", () => {
  it("validates every required fact-confirmation field", () => {
    expect(validateFactConfirmation({ ...valid, missingReceiptReason: "" })).toContain("영수증 미첨부 사유를 입력해주세요.");
    expect(validateFactConfirmation(valid)).toEqual([]);
  });
  it("maps a revision without changing the original document", () => {
    const row = mapFactConfirmationToRow(valid, 2);
    expect(row).toMatchObject({ amount: 10_000, revision_no: 2, resolution_id: "exp-1" });
    expect(row).not.toHaveProperty("is_current");
  });
});
