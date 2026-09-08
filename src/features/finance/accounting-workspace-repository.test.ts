import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReimbursementMember } from "./reimbursement-domain";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn(), db: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
import { assertLegacyVoucherEditable, loadAccountingWorkspace, runAccountingCommand, type AccountingCommand } from "./accounting-workspace-repository";
const member: ReimbursementMember = { organization_id: "verified-org", user_id: "verified-user", display_name: "담당자", permissions: ["APPROVE"], active: true };
const input = { source_kind: "RECOGNITION", source_id: "tx", source_signature: "snapshot-signature", voucher_date: "2026-03-01", lines: [] };
beforeEach(() => { vi.clearAllMocks(); mocks.identity.mockResolvedValue(member); mocks.db.mockReturnValue({ schema: () => ({ rpc: mocks.rpc }) }); mocks.rpc.mockResolvedValue({ data: { id: "voucher", lock_version: 1 }, error: null }); });
describe("accounting draft service boundary", () => {
  it("checks legacy mutation access with Auth scope before the original record is written", async () => {
    await assertLegacyVoucherEditable("original-text-id");
    expect(mocks.rpc).toHaveBeenCalledWith("accounting_legacy_check", { p_org: member.organization_id, p_actor: member.user_id, p_resolution_id: "original-text-id" });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "전표관리에서 확인해주세요" } });
    await expect(assertLegacyVoucherEditable("original-text-id")).rejects.toThrow("전표관리");
    mocks.identity.mockResolvedValue({ ...member, permissions: ["PAY"] });
    mocks.db.mockClear();
    await expect(assertLegacyVoucherEditable("original-text-id")).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("uses verified actor/org for the atomic command and preserves incomplete account drafts", async () => {
    expect(await runAccountingCommand("DRAFT_CREATE", input, "stable-key")).toEqual({ id: "voucher", lock_version: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("accounting_command", { p_org: "verified-org", p_actor: "verified-user", p_command: "DRAFT_CREATE", p_data: input, p_key: "stable-key" });
  });
  it("retries exact same input and key after uncertain persistence", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "connection lost" } });
    await expect(runAccountingCommand("DRAFT_CREATE", input, "same-key")).rejects.toThrow("connection lost");
    await runAccountingCommand("DRAFT_CREATE", input, "same-key");
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });
  it.each(["PAY", "CLOSE", "SENIOR"])("keeps %s read permission separate from draft mutation", async permission => {
    mocks.identity.mockResolvedValue({ ...member, permissions: [permission] });
    mocks.rpc.mockResolvedValue({ data: { vouchers: [], accounts: [], sources: [] }, error: null });
    expect((await loadAccountingWorkspace()).viewer.permissions).toEqual([permission]);
    mocks.db.mockClear();
    await expect(runAccountingCommand("DRAFT_CREATE", input, "key")).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects inactive/unauthenticated/ordinary users before privileged DB access", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("로그인 필요")); await expect(loadAccountingWorkspace()).rejects.toThrow("로그인");
    mocks.identity.mockResolvedValueOnce({ ...member, active: false }); await expect(runAccountingCommand("DRAFT_CREATE", input, "key")).rejects.toThrow("권한");
    mocks.identity.mockResolvedValueOnce({ ...member, permissions: [] }); await expect(loadAccountingWorkspace()).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each(["organization_id", "actor_id", "p_org", "p_actor"])("rejects forged identity field %s", async key => {
    await expect(runAccountingCommand("DRAFT_CREATE", { ...input, [key]: "forged" }, "key")).rejects.toThrow("형식");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("blocks confirmation and stale/missing version inputs before DB access", async () => {
    await expect(runAccountingCommand("CONFIRM" as AccountingCommand, input, "key")).rejects.toThrow("정책");
    await expect(runAccountingCommand("DRAFT_SAVE", { ...input, id: "voucher" }, "key")).rejects.toThrow("버전");
    await expect(runAccountingCommand("DRAFT_CREATE", { ...input, source_signature: "" }, "key")).rejects.toThrow("원본");
    await expect(runAccountingCommand("DRAFT_CREATE", input, " ")).rejects.toThrow("처리키");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("reads persisted vouchers and keeps confirmation disabled and Auth viewer authoritative", async () => {
    const data = { vouchers: [{ id: "persisted", voucher_no: "OLD-1", lines: [] }], accounts: [], sources: [], viewer: { permissions: ["ADMIN"] }, policy: { confirmation_enabled: true } };
    mocks.rpc.mockResolvedValue({ data, error: null });
    const result = await loadAccountingWorkspace();
    expect(result.vouchers).toEqual(data.vouchers);
    expect(result.viewer.permissions).toEqual(["APPROVE"]);
    expect(result.policy.confirmation_enabled).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith("accounting_workspace", { p_org: member.organization_id, p_actor: member.user_id });
  });
  it("does not turn DB failure into an empty ledger or accept incomplete results", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "schema unavailable" } });
    await expect(loadAccountingWorkspace()).rejects.toThrow("schema unavailable");
    mocks.rpc.mockResolvedValueOnce({ data: { vouchers: [], accounts: null, sources: [] }, error: null });
    await expect(loadAccountingWorkspace()).rejects.toThrow("조회 결과");
    mocks.rpc.mockResolvedValueOnce({ data: { id: "voucher" }, error: null });
    await expect(runAccountingCommand("DRAFT_CREATE", input, "key")).rejects.toThrow("같은 처리키");
  });
});
