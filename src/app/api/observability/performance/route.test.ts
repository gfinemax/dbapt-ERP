import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), insert: vi.fn() }));
vi.mock("@/features/finance/reimbursement-auth", () => ({ reimbursementIdentity: mocks.identity }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: () => ({ schema: () => ({ from: () => ({ insert: mocks.insert }) }) }) }));

import { POST } from "./route";

const measurement = { metricName: "LCP", route: "/finance/bank-transactions?q=secret", sessionId: "11111111-1111-4111-8111-111111111111", value: 1200 };

describe("performance measurement API", () => {
  beforeEach(() => {
    mocks.identity.mockReset().mockResolvedValue({ organization_id: "org", user_id: "user" });
    mocks.insert.mockReset().mockResolvedValue({ error: null });
  });

  it("stores a sanitized batch under the authenticated organization", async () => {
    const response = await POST(new Request("http://localhost/api/observability/performance", { body: JSON.stringify([measurement]), headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" }, method: "POST" }));
    expect(response.status).toBe(202);
    expect(mocks.insert).toHaveBeenCalledWith([expect.objectContaining({ metric_name: "LCP", organization_id: "org", route: "/finance/bank-transactions", user_id: "user" })]);
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain("secret");
  });

  it("ignores measurements when the user is not authenticated", async () => {
    mocks.identity.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/observability/performance", { body: JSON.stringify(measurement), headers: { "content-type": "application/json" }, method: "POST" }));
    expect(response.status).toBe(204);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects cross-site submissions before reading user state", async () => {
    const response = await POST(new Request("http://localhost/api/observability/performance", { body: JSON.stringify(measurement), headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" }, method: "POST" }));
    expect(response.status).toBe(403);
    expect(mocks.identity).not.toHaveBeenCalled();
  });
});
