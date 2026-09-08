import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn(), db: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: m.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: m.db }));
import { loadAdvanceSettlements, saveAdvanceSettlement } from "./advance-settlement-repository";
const member = { organization_id: "org", user_id: "actor", active: true, permissions: ["ADMIN"] };
const input = { transaction_id: "tx", source_signature: "current", funding: [], usage: [] };
beforeEach(() => { vi.clearAllMocks(); m.identity.mockResolvedValue(member); m.db.mockReturnValue({ schema: () => ({ rpc: m.rpc }) }); m.rpc.mockResolvedValue({ data: { candidates: [], usage_sources: [], drafts: [], evidence: [] }, error: null }); });
it("scopes actual data by verified identity and keeps financial execution locked", async () => {
  m.rpc.mockResolvedValue({ data: { candidates: [], usage_sources: [], drafts: [], evidence: [], policy: { approval_enabled: true }, viewer: { permissions: ["ADMIN"] } }, error: null });
  m.identity.mockResolvedValue({ ...member, permissions: ["PAY"] });
  const result = await loadAdvanceSettlements();
  expect(result.viewer.permissions).toEqual(["PAY"]); expect(result.policy.approval_enabled).toBe(false);
  expect(m.rpc).toHaveBeenCalledWith("advance_settlement_workspace", { p_org: "org", p_actor: "actor" });
});
it.each([{ permissions: [] }, { permissions: ["PERSONAL"] }])("denies ordinary membership without privileged reads (%s)", async ({ permissions }) => {
  m.identity.mockResolvedValue({ ...member, permissions }); await expect(loadAdvanceSettlements()).rejects.toThrow("조회 권한"); expect(m.db).not.toHaveBeenCalled();
});
it("denies inactive staff before storage", async () => { m.identity.mockResolvedValue({ ...member, active: false }); await expect(loadAdvanceSettlements()).rejects.toThrow(); expect(m.db).not.toHaveBeenCalled(); });
it("does not turn unavailable storage into a false empty list", async () => {
  m.rpc.mockResolvedValueOnce({ error: { message: "offline" } }); await expect(loadAdvanceSettlements()).rejects.toThrow("offline");
  m.rpc.mockResolvedValueOnce({ data: {} }); await expect(loadAdvanceSettlements()).rejects.toThrow("조회 결과");
});
it("retains the exact operation key, original signature and editor version for retries", async () => {
  m.rpc.mockResolvedValue({ data: { id: "draft", lock_version: 3 }, error: null });
  const update = { ...input, id: "draft", lock_version: 2 };
  expect(await saveAdvanceSettlement(update, "retry-key")).toEqual({ id: "draft", lock_version: 3 });
  expect(m.rpc).toHaveBeenCalledWith("advance_settlement_command", { p_org: "org", p_actor: "actor", p_command: "DRAFT_SAVE", p_data: update, p_key: "retry-key" });
});
it("denies PAY writes", async () => { m.identity.mockResolvedValue({ ...member, permissions: ["PAY"] }); await expect(saveAdvanceSettlement(input, "key")).rejects.toThrow("저장 권한"); expect(m.db).not.toHaveBeenCalled(); });
it.each([{ ...input, p_org: "foreign" }, { ...input, id: "draft" }, { ...input, source_signature: "" }])("rejects forged or incomplete commands before storage", async value => { await expect(saveAdvanceSettlement(value, "key")).rejects.toThrow(); expect(m.db).not.toHaveBeenCalled(); });
it("propagates failures and requires a verified save response", async () => {
  m.rpc.mockResolvedValueOnce({ error: { message: "stale original" } }); await expect(saveAdvanceSettlement(input, "key")).rejects.toThrow("stale original");
  m.rpc.mockResolvedValueOnce({ data: { id: "draft" } }); await expect(saveAdvanceSettlement(input, "key")).rejects.toThrow("같은 처리키");
});
