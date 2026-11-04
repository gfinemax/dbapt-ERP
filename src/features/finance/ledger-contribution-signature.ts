import { createHmac } from "node:crypto";

export const emptyBodySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function signLedgerRequest(secret: string, url: URL, timestamp: string, nonce: string,
  method = "GET", bodySha256 = emptyBodySha256) {
  const canonical = [method.toUpperCase(), url.pathname, url.search.slice(1), timestamp, nonce, bodySha256].join("\n");
  return createHmac("sha256", secret).update(canonical).digest("hex");
}
