import { createHmac, timingSafeEqual } from "node:crypto";

const emptyBodyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const noncePattern = /^[A-Za-z0-9_-]{16,128}$/;

export type LedgerIntegrationHeaders = {
  nonce: string;
  requestTimestamp: number;
};

export function verifyLedgerIntegrationRequest(input: {
  headers: Headers;
  method: string;
  path: string;
  query: string;
  secret: string;
  now?: number;
}): LedgerIntegrationHeaders {
  const timestamp = (input.headers.get("x-ledger-timestamp") ?? "").trim();
  const nonce = (input.headers.get("x-ledger-nonce") ?? "").trim();
  const supplied = (input.headers.get("x-ledger-signature") ?? "").trim().toLowerCase();
  if (!/^\d+$/.test(timestamp) || !noncePattern.test(nonce) || !/^[0-9a-f]{64}$/.test(supplied)) {
    throw new Error("invalid integration signature headers");
  }
  const requestTimestamp = Number(timestamp);
  const now = input.now ?? Math.floor(Date.now() / 1_000);
  if (!Number.isSafeInteger(requestTimestamp) || Math.abs(now - requestTimestamp) > 300) {
    throw new Error("expired integration signature");
  }
  const canonical = [input.method.toUpperCase(), input.path, input.query, timestamp, nonce, emptyBodyHash].join("\n");
  const expected = createHmac("sha256", input.secret).update(canonical).digest("hex");
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw new Error("invalid integration signature");
  }
  return { nonce, requestTimestamp };
}
