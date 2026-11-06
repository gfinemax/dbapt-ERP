import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: () => ({ schema: () => ({ rpc: mocks.rpc }) }) }));

import { syncLedgerExternalContributionRecognitions } from "./ledger-external-recognition-sync";

describe("Ledger external contribution recognition sync", () => {
  beforeEach(() => {
    vi.stubEnv("LEDGER_INTEGRATION_URL", "https://ledger.example.test");
    vi.stubEnv("LEDGER_INTEGRATION_SECRET", "shared-secret");
    mocks.identity.mockReset().mockResolvedValue({ user_id: "actor", organization_id: "org", active: true, permissions: ["ADMIN"] });
    mocks.rpc.mockReset().mockImplementation(async (name: string) => name === "ledger_external_recognition_sync_status"
      ? { data: { state: null, unresolved_issues: [], source_count: 0 }, error: null }
      : { data: { received_count: 1, applied_count: 1, reconciled_count: 0, issue_count: 0, unresolved_issue_count: 0 }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("pulls the signed cursor page and persists it with authenticated organization context", async () => {
    const item = { cursor: 1, source_recognition_id: "recognition-1" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, next_cursor: 1, has_more: false, items: [item],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncLedgerExternalContributionRecognitions()).resolves.toMatchObject({
      next_cursor: 1, received_count: 1, applied_count: 1, unresolved_issue_count: 0,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/integrations/erp/external-contribution-recognitions");
    expect(url.searchParams.get("after_cursor")).toBe("0");
    expect(init.headers).toMatchObject({ "X-ERP-Nonce": expect.any(String), "X-ERP-Signature": expect.any(String) });
    expect(mocks.rpc).toHaveBeenCalledWith("sync_ledger_external_recognitions", {
      p_org: "org", p_actor: "actor", p_source_system: "dbapt-ledger",
      p_from_cursor: 0, p_next_cursor: 1, p_items: [item],
    });
  });

  it("rejects malformed pages before writing a new cursor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, next_cursor: "1", has_more: false, items: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(syncLedgerExternalContributionRecognitions()).rejects.toThrow("응답 형식");
    expect(mocks.rpc).not.toHaveBeenCalledWith("sync_ledger_external_recognitions", expect.anything());
  });
});
