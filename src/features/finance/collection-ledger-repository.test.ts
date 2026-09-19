import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: () => ({ schema: () => ({ rpc: mocks.rpc }) }) }));
import { loadCollectionLedger, runCollectionLedger } from "./collection-ledger-repository";

beforeEach(() => {
  mocks.identity.mockReset().mockResolvedValue({ user_id: "actor", organization_id: "org", active: true, permissions: ["ADMIN"] });
  mocks.rpc.mockReset().mockResolvedValue({ data: { assessments: [], allocations: [], refunds: [], deposit_candidates: [], withdrawal_candidates: [] }, error: null });
});
describe("collection ledger repository", () => {
  it("loads only through the authenticated organization and adds the verified viewer", async () => {
    const workspace = await loadCollectionLedger();
    expect(mocks.rpc).toHaveBeenCalledWith("collection_ledger_read", { p_org: "org", p_actor: "actor" });
    expect(workspace.viewer).toEqual({ user_id: "actor", permissions: ["ADMIN"] });
  });
  it("never accepts organization or actor input from the client", async () => {
    await expect(runCollectionLedger("ASSESSMENT_SAVE", { organization_id: "other" }, "key")).rejects.toThrow("서버에서 확인");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires payment permission for actual bank linkage", async () => {
    mocks.identity.mockResolvedValue({ user_id: "actor", organization_id: "org", active: true, permissions: ["APPROVE"] });
    await expect(runCollectionLedger("RECEIPT_ALLOCATE", {}, "key")).rejects.toThrow("권한");
  });
  it("passes an idempotency key and validates the persisted result", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "assessment", status: "ACTIVE", lock_version: 1 }, error: null });
    await expect(runCollectionLedger("ASSESSMENT_SAVE", { external_member_id: "peopleon-1" }, "stable-key")).resolves.toMatchObject({ id: "assessment" });
    expect(mocks.rpc).toHaveBeenCalledWith("collection_ledger_command", expect.objectContaining({ p_org: "org", p_actor: "actor", p_key: "stable-key" }));
  });
});
