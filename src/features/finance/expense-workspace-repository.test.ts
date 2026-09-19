import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn(), db: vi.fn(), quickRows: vi.fn(), personalRows: vi.fn(), smallRows: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
import { loadExpenseWorkspace } from "./expense-workspace-repository";
const member = { organization_id: "org", user_id: "user", permissions: ["ADMIN"], active: true };
beforeEach(() => {
  vi.clearAllMocks(); mocks.identity.mockResolvedValue(member); mocks.quickRows.mockResolvedValue({ data: [], error: null }); mocks.personalRows.mockResolvedValue({ data: [], error: null }); mocks.smallRows.mockResolvedValue({ data: [], error: null });
  mocks.db.mockReturnValue({ schema: () => ({ rpc: mocks.rpc, from: (table: string) => { const chain = { select: () => chain, eq: () => chain, is: () => chain, order: () => chain, in: table === "quick_expense_records" ? mocks.quickRows : mocks.personalRows, range: mocks.smallRows }; return chain; } }) });
  mocks.rpc.mockResolvedValue({ data: { records: [] }, error: null });
});
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
    expect(loaded.records[0].source_id).toBe("own"); expect(loaded.records[0].personal_can_edit).toBe(false);
  });
  it("marks a submitted personal source editable only for its applicant or an administrator", async () => {
    mocks.rpc.mockResolvedValue({ data: { records: [{ source_kind: "PERSONAL", source_id: "own", approval_status: "SUBMITTED" }] }, error: null });
    mocks.personalRows.mockResolvedValue({ data: [{ id: "own", applicant_id: "user", purpose: "사무용품", updated_at: "2026-09-18T00:00:00Z" }], error: null });
    const loaded = await loadExpenseWorkspace(); expect(loaded.records[0]).toMatchObject({ personal_purpose: "사무용품", personal_updated_at: "2026-09-18T00:00:00Z", personal_can_edit: true });
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
  it("merges small expenses into the unified source list without duplicating their generated quick records", async () => {
    const quick = { source_kind: "QUICK", source_id: "quick-1", title: "복사용지", amount: 12000, created_at: "2026-09-19T01:00:00Z", approval_status: "RECORDED", payment_status: null, transaction_id: "tx-1", can_connect: false, amounts: null, trust_items: [], vouchers: [] };
    mocks.rpc.mockResolvedValue({ data: { records: [quick] }, error: null });
    mocks.smallRows.mockResolvedValue({ data: [{ id: "small-1", expense_date: "2026-09-18", partner_name: "문구점", description: "복사용지", amount: "12000", created_at: "2026-09-18T00:00:00Z", updated_at: "2026-09-19T00:00:00Z", review_status: "CONFIRMED", created_by_label: "담당자", quick_record_id: "quick-1" }], error: null });
    const loaded = await loadExpenseWorkspace();
    expect(loaded.records).toHaveLength(1);
    expect(loaded.records[0]).toMatchObject({ source_kind: "SMALL", source_id: "small-1", transaction_id: "tx-1", approval_status: "CONFIRMED" });
  });
});
