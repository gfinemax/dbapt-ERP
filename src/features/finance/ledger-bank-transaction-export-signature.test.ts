import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyLedgerIntegrationRequest } from "./ledger-bank-transaction-export-signature";

const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function headers(secret: string, path: string, query: string, timestamp: string, nonce: string) {
  const canonical = ["GET", path, query, timestamp, nonce, emptyHash].join("\n");
  const signature = createHmac("sha256", secret).update(canonical).digest("hex");
  return new Headers({
    "X-Ledger-Nonce": nonce,
    "X-Ledger-Signature": signature,
    "X-Ledger-Timestamp": timestamp,
  });
}

describe("Ledger ERP bank export signature", () => {
  it("accepts the signed path and query but rejects tampering", () => {
    const secret = "shared-secret";
    const path = "/api/integrations/ledger/bank-transactions";
    const query = "after_cursor=0&limit=500";
    const timestamp = "1794040000";
    const nonce = "0123456789abcdef";
    const signed = headers(secret, path, query, timestamp, nonce);
    expect(verifyLedgerIntegrationRequest({ headers: signed, method: "GET", path, query, secret, now: 1794040000 }))
      .toEqual({ nonce, requestTimestamp: 1794040000 });
    expect(() => verifyLedgerIntegrationRequest({
      headers: signed, method: "GET", path, query: "after_cursor=1&limit=500", secret, now: 1794040000,
    })).toThrow("invalid integration signature");
  });

  it("rejects expired and malformed requests", () => {
    const path = "/api/integrations/ledger/bank-transactions";
    const query = "after_cursor=0&limit=500";
    const signed = headers("secret", path, query, "1794040000", "0123456789abcdef");
    expect(() => verifyLedgerIntegrationRequest({
      headers: signed, method: "GET", path, query, secret: "secret", now: 1794041000,
    })).toThrow("expired integration signature");
    expect(() => verifyLedgerIntegrationRequest({
      headers: new Headers(), method: "GET", path, query, secret: "secret", now: 1794040000,
    })).toThrow("invalid integration signature headers");
  });
});
