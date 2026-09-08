import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReimbursementMember } from "./reimbursement-domain";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn(), db: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
import { loadPaymentWorkspace } from "./fund-payment-repository";
import { paymentFixtures } from "./fund-payment-test-fixtures";
const member: ReimbursementMember = { organization_id: "verified-org", user_id: "verified-user", display_name: "담당자", permissions: ["PAY"], active: true };
beforeEach(() => { vi.clearAllMocks(); mocks.identity.mockResolvedValue(member); mocks.db.mockReturnValue({ schema: () => ({ rpc: mocks.rpc }) }); mocks.rpc.mockResolvedValue({ data: paymentFixtures().workspace, error: null }); });
describe("payment workspace authenticated read", () => {
  it("derives scope and viewer permissions from Auth and reloads authoritative rows", async () => {
    const data = { ...paymentFixtures().workspace, viewer: { permissions: ["ADMIN"] } };
    mocks.rpc.mockResolvedValue({ data, error: null });
    const result = await loadPaymentWorkspace();
    expect(mocks.rpc).toHaveBeenCalledWith("payment_workspace", { p_org: member.organization_id, p_actor: member.user_id });
    expect(result.viewer.permissions).toEqual(["PAY"]);
    expect(result.banks[0].account_label).toBe("운영계좌 ***1234");
    data.payments = []; mocks.rpc.mockResolvedValue({ data, error: null });
    expect((await loadPaymentWorkspace()).payments).toEqual([]);
  });
  it("rejects absent authentication, inactive and ordinary users before database access", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("로그인 필요"));
    await expect(loadPaymentWorkspace()).rejects.toThrow("로그인");
    mocks.identity.mockResolvedValueOnce({ ...member, active: false });
    await expect(loadPaymentWorkspace()).rejects.toThrow("권한");
    mocks.identity.mockResolvedValueOnce({ ...member, permissions: [] });
    await expect(loadPaymentWorkspace()).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each(["ADMIN", "APPROVE", "SENIOR", "CLOSE", "PAY"])("allows existing staff role %s to read without fabricating payment authority", async permission => {
    mocks.identity.mockResolvedValue({ ...member, permissions: [permission] });
    expect((await loadPaymentWorkspace()).viewer.permissions).toEqual([permission]);
  });
  it("surfaces DB failure instead of reporting zero payments", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "connection unavailable" } });
    await expect(loadPaymentWorkspace()).rejects.toThrow("connection unavailable");
  });
  it.each(["transactions", "payments", "allocations", "eligibility", "banks", "transfers", "reversals"])("rejects incomplete %s response", async key => {
    mocks.rpc.mockResolvedValue({ data: { ...paymentFixtures().workspace, [key]: null }, error: null });
    await expect(loadPaymentWorkspace()).rejects.toThrow("조회 결과");
  });
});
