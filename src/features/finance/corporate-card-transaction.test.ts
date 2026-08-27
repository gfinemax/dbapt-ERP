import { describe, expect, it } from "vitest";
import { findCorporateCardMatchCandidates, isTaxiCardTransaction } from "./corporate-card-transaction";

describe("corporate card transaction", () => {
  it("recognizes taxi merchants and categories", () => {
    expect(isTaxiCardTransaction({ amount: 18500, approvedAt: "2026-08-27", cardLastFour: "5521", cardName: "공용카드", id: "1", merchantName: "카카오T" })).toBe(true);
    expect(isTaxiCardTransaction({ amount: 12000, approvedAt: "2026-08-27", cardLastFour: "5521", cardName: "공용카드", category: "택시", id: "2", merchantName: "모빌리티 결제" })).toBe(true);
    expect(isTaxiCardTransaction({ amount: 9800, approvedAt: "2026-08-27", cardLastFour: "5521", cardName: "공용카드", category: "식대", id: "3", merchantName: "한식당" })).toBe(false);
  });

  it("recommends unresolved transactions with the same amount within two days", () => {
    const matches = findCorporateCardMatchCandidates({
      amount: 18500,
      cardLastFour: "5521",
      expenseDate: "2026-08-27",
      transactions: [
        { amount: 18500, approvedAt: "2026-08-27T21:15:00+09:00", cardLastFour: "5521", cardName: "공용카드", id: "exact", merchantName: "카카오T" },
        { amount: 18500, approvedAt: "2026-08-29T09:00:00+09:00", cardLastFour: "5521", cardName: "공용카드", id: "likely", merchantName: "택시" },
        { amount: 18500, approvedAt: "2026-08-27T09:00:00+09:00", cardLastFour: "7777", cardName: "다른카드", id: "other-card", merchantName: "택시" },
      ],
    });

    expect(matches.map((match) => [match.id, match.matchLevel])).toEqual([["exact", "EXACT"], ["likely", "LIKELY"]]);
  });
});
