import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn(), db: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
import { loadTrustOperating, runTrustOperating } from "./trust-operating-repository";

const member = { organization_id: "org", user_id: "actor", display_name: "담당자", permissions: ["ADMIN"], active: true };
const workspace = { periods: [], bank_links: [], usage: [], contracts: [], bank_candidates: [], usage_candidates: [] };

beforeEach(() => {
  vi.clearAllMocks(); mocks.identity.mockResolvedValue(member); mocks.db.mockReturnValue({ schema: () => ({ rpc: mocks.rpc }) });
  mocks.rpc.mockResolvedValue({ data: workspace, error: null });
});

describe("trust operating repository", () => {
  it("loads every authoritative section with the authenticated organization", async () => {
    await expect(loadTrustOperating()).resolves.toEqual({ ...workspace, viewer: { permissions: ["ADMIN"] } });
    expect(mocks.rpc).toHaveBeenCalledWith("trust_operating_read", { p_org: "org", p_actor: "actor" });
  });

  it("rejects malformed reads instead of substituting an empty ledger", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...workspace, periods: null }, error: null });
    await expect(loadTrustOperating()).rejects.toThrow("조회 결과");
  });

  it.each([
    ["PERIOD_SAVE", "PAY"], ["PERIOD_SUBMIT", "PAY"], ["BANK_LINK", "APPROVE"], ["USAGE_LINK", "PAY"], ["PERIOD_SETTLE", "APPROVE"],
  ] as const)("enforces the server permission for %s", async (command, permission) => {
    mocks.identity.mockResolvedValueOnce({ ...member, permissions: [permission] });
    await expect(runTrustOperating(command, {}, "key")).rejects.toThrow("권한");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("passes only business input and returns the persisted version and totals", async () => {
    const data = { id: "period", lock_version: 2, status: "SUBMITTED", totals: { requested: 100, opening: 0, received: 0, used: 0, returned: 0, balance: 0 } };
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(runTrustOperating("PERIOD_SUBMIT", { id: "period", lock_version: 1 }, "same-key")).resolves.toEqual(data);
    expect(mocks.rpc).toHaveBeenCalledWith("trust_operating_command", { p_org: "org", p_actor: "actor", p_command: "PERIOD_SUBMIT", p_data: { id: "period", lock_version: 1 }, p_key: "same-key" });
  });

  it.each(["organization_id", "actor_id", "p_org", "p_actor", "permissions", "viewer"])("rejects forged context %s", async key => {
    await expect(runTrustOperating("PERIOD_SAVE", { [key]: "forged" }, "key")).rejects.toThrow("서버");
  });
});
