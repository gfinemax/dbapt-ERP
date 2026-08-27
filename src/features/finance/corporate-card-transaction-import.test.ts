import { describe, expect, it } from "vitest";
import { parseCorporateCardTransactionText } from "./corporate-card-transaction-import";

describe("parseCorporateCardTransactionText", () => {
  it("parses Korean card CSV columns and quoted merchant names", () => {
    expect(parseCorporateCardTransactionText("승인일자,승인금액,가맹점명,카드번호,승인번호\n2026-08-27,15800,\"카카오T, 택시\",1234-5678-9012-5521,48392011")[0]).toMatchObject({
      amount: 15800,
      cardLastFour: "5521",
      merchantName: "카카오T, 택시",
      transactionUid: "APPROVAL:48392011",
    });
  });
});
