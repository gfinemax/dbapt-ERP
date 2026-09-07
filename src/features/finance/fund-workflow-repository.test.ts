import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReimbursementMember } from "./reimbursement-domain";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn(), db: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
import { loadFundWorkflow, runFundWorkflow, type WorkflowCommand } from "./fund-workflow-repository";
const member: ReimbursementMember = { organization_id: "verified-org", user_id: "verified-user", display_name: "담당자", permissions: ["PAY"], active: true };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue(member);
  mocks.rpc.mockResolvedValue({ data: { id: "saved" }, error: null });
  mocks.db.mockReturnValue({ schema: () => ({ rpc: mocks.rpc }) });
});
describe("authenticated workflow persistence boundary", () => {
  it("derives actor and organization from the validated identity even with forged input fields", async () => {
    const forged = { actor_id: "forged", organization_id: "other", reason: "verified bank" };
    expect(await runFundWorkflow("PAYMENT_RECORD", forged, "stable-key")).toEqual({ id: "saved" });
    expect(mocks.rpc).toHaveBeenCalledWith("workflow_command", { p_org: "verified-org", p_actor: "verified-user", p_command: "PAYMENT_RECORD", p_data: forged, p_key: "stable-key" });
  });
  it("blocks missing authentication, inactive users and wrong roles before privileged DB access", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("로그인 필요"));
    await expect(loadFundWorkflow()).rejects.toThrow("로그인");
    mocks.identity.mockResolvedValue({ ...member, active: false });
    await expect(runFundWorkflow("PAYMENT_RECORD", {}, "key")).rejects.toThrow("활성");
    mocks.identity.mockResolvedValue({ ...member, permissions: [] });
    await expect(runFundWorkflow("PAYMENT_ALLOCATE", {}, "key")).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("uses the same operation key after a retry instead of creating a new payment identity", async () => {
    const input = { bank_transaction_id: "bank", method: "BANK", reason: "확인" };
    await runFundWorkflow("PAYMENT_RECORD", input, "retry-key");
    await runFundWorkflow("PAYMENT_RECORD", input, "retry-key");
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });
  it("reloads authoritative rows and never substitutes an empty list on a storage failure", async () => {
    const data = { transactions: [{ id: "persisted" }], payments: [], allocations: [] };
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    expect(await loadFundWorkflow()).toEqual(data);
    expect(mocks.rpc).toHaveBeenCalledWith("workflow_read", { p_org: member.organization_id, p_actor: member.user_id });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "schema unavailable" } });
    await expect(loadFundWorkflow()).rejects.toThrow("schema unavailable");
  });
  it("rejects unsupported commands, missing keys and malformed responses", async () => {
    await expect(runFundWorkflow("EDIT_AUDIT" as WorkflowCommand, {}, "x")).rejects.toThrow("지원하지");
    await expect(runFundWorkflow("PAYMENT_RECORD", {}, "")).rejects.toThrow("처리키");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(runFundWorkflow("PAYMENT_RECORD", {}, "x")).rejects.toThrow("같은 처리키");
  });
});
