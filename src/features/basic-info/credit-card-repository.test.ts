import { describe, expect, it } from "vitest";
import { getCardLastFour, mapCreditCardFromRow } from "./credit-card-repository";

describe("credit card repository", () => {
  it("keeps only the last four digits from a card number", () => {
    expect(getCardLastFour("4444-5555-6666-7777")).toBe("7777");
  });

  it("returns only a masked card number to the UI", () => {
    expect(mapCreditCardFromRow({ card_company: "KB국민카드", card_last_four: "7777", card_name: "법인카드", card_type: "법인카드", id: "card-1", issued_at: "2026-07-15", last_synced_at: null, limit_amount: 0, settlement_bank: "미지정", sync_status: "확인필요", usage_status: "사용" }).cardNo).toBe("****-****-****-7777");
  });
});
