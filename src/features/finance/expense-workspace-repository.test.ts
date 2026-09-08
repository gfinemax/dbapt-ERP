import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn(), db: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
import { loadExpenseWorkspace } from "./expense-workspace-repository";
const member = { organization_id: "org", user_id: "user", permissions: ["ADMIN"], active: true };
beforeEach(() => { vi.clearAllMocks(); mocks.identity.mockResolvedValue(member); mocks.db.mockReturnValue({ schema: () => ({ rpc: mocks.rpc }) }); mocks.rpc.mockResolvedValue({ data: { records: [] }, error: null }); });
describe("expense original workspace identity and persistence", () => {
  it("loads more than 100 rows through the scoped RPC without truncating the source list", async () => {
    const records = Array.from({ length: 105 }, (_, i) => ({ source_kind: "RESOLUTION", source_id: String(i) }));
    mocks.rpc.mockResolvedValue({ data: { records }, error: null });
    expect((await loadExpenseWorkspace()).records).toHaveLength(105);
    expect(mocks.rpc).toHaveBeenCalledWith("expense_workspace", { p_org: "org", p_actor: "user" });
  });
  it("accepts ordinary member own-scope reads but never takes staff privileges from RPC data", async () => {
    mocks.identity.mockResolvedValue({ ...member, permissions: [] });
    mocks.rpc.mockResolvedValue({ data: { records: [{ source_kind: "PERSONAL", source_id: "own" }], staff: true }, error: null });
    const loaded = await loadExpenseWorkspace();
    expect(loaded.viewer).toEqual({ staff: false, permissions: [] });
    expect(loaded.records[0].source_id).toBe("own");
  });
  it("denies inactive and unauthenticated access before touching privileged storage", async () => {
    mocks.identity.mockResolvedValueOnce({ ...member, active: false }); await expect(loadExpenseWorkspace()).rejects.toThrow("활성");
    mocks.identity.mockRejectedValueOnce(new Error("로그인 필요")); await expect(loadExpenseWorkspace()).rejects.toThrow("로그인");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("propagates failure rather than rendering false empty originals", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } }); await expect(loadExpenseWorkspace()).rejects.toThrow("unavailable");
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null }); await expect(loadExpenseWorkspace()).rejects.toThrow("조회 결과");
  });
});
