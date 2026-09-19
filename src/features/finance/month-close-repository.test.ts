import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: () => ({ schema: () => ({ rpc: mocks.rpc }) }) }));
import { closeMonth, loadMonthClose } from "./month-close-repository";

beforeEach(() => {
  mocks.identity.mockReset().mockResolvedValue({ user_id: "closer", organization_id: "org", active: true, permissions: ["CLOSE"] });
  mocks.rpc.mockReset().mockResolvedValue({ data: { month: "2026-09-01", period_status: "OPEN", checks: [], ready: true }, error: null });
});
describe("month close workspace", () => {
  it("normalizes the month and reads every check through the verified identity", async () => {
    await loadMonthClose("2026-09");
    expect(mocks.rpc).toHaveBeenCalledWith("month_close_read", { p_org: "org", p_actor: "closer", p_month: "2026-09-01" });
  });
  it("rejects staff without close authority before querying", async () => {
    mocks.identity.mockResolvedValue({ user_id: "reader", organization_id: "org", active: true, permissions: ["PAY"] });
    await expect(loadMonthClose("2026-09")).rejects.toThrow("권한");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not accept an invalid month", () => expect(closeMonth("2026-99", "2026-09-19")).toBe("2026-09-01"));
});
