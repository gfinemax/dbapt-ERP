import { describe, expect, it } from "vitest";
import { signLedgerRequest } from "./ledger-contribution-signature";

describe("ledger contribution request signature", () => {
  it("matches the ledger canonical HMAC contract and protects query order", () => {
    const timestamp = "1793790000";
    const nonce = "0123456789abcdef";
    const first = new URL("https://ledger.example/api/integrations/erp/contribution-assessments?after_cursor=3&limit=200");
    const reordered = new URL("https://ledger.example/api/integrations/erp/contribution-assessments?limit=200&after_cursor=3");
    expect(signLedgerRequest("secret", first, timestamp, nonce)).toBe("9c40053e971a5f58fd8735152a325336ae4f7f1df1a371753809cbf6754a543d");
    expect(signLedgerRequest("secret", reordered, timestamp, nonce)).not.toBe(signLedgerRequest("secret", first, timestamp, nonce));
  });
});
