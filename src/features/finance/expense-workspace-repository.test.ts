import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn(), db: vi.fn(), quickRows: vi.fn(), personalRows: vi.fn(), resolutionRows: vi.fn(), smallRows: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
import { loadExpenseWorkspace, loadExpenseWorkspacePage } from "./expense-workspace-repository";
const member = { organization_id: "org", user_id: "user", permissions: ["ADMIN"], active: true };
beforeEach(() => {
  vi.clearAllMocks(); mocks.identity.mockResolvedValue(member); mocks.quickRows.mockResolvedValue({ data: [], error: null }); mocks.personalRows.mockResolvedValue({ data: [], error: null }); mocks.resolutionRows.mockResolvedValue({ data: [], error: null }); mocks.smallRows.mockResolvedValue({ data: [], error: null });
  mocks.db.mockReturnValue({ schema: () => ({ rpc: mocks.rpc, from: (table: string) => { const rowLoader = table === "quick_expense_records" ? mocks.quickRows : table === "personal_reimbursements" ? mocks.personalRows : mocks.resolutionRows; const chain = { select: () => chain, eq: () => chain, is: () => chain, order: () => chain, in: rowLoader, range: mocks.smallRows }; return chain; } }) });
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
    const loaded = await loadExpenseWorkspace(); expect(loaded.records[0]).toMatchObject({ usage_description: "사무용품", personal_purpose: "사무용품", personal_updated_at: "2026-09-18T00:00:00Z", personal_can_edit: true });
  });
  it("loads the original reason and memo for resolution detail reading", async () => {
    mocks.rpc.mockResolvedValue({ data: { records: [{ source_kind: "RESOLUTION", source_id: "resolution-1" }] }, error: null });
    mocks.resolutionRows.mockResolvedValue({ data: [{ id: "resolution-1", resolution_data: { reason: "계약 검토 수수료 지급", memo: "담당자 확인 완료" } }], error: null });
    const loaded = await loadExpenseWorkspace();
    expect(loaded.records[0]).toMatchObject({ usage_description: "계약 검토 수수료 지급", memo: "담당자 확인 완료" });
  });
  it("starts independent source metadata requests without waiting for the small-expense pages", async () => {
    let finishSmallRows!: (value: { data: never[]; error: null }) => void;
    mocks.smallRows.mockReturnValue(new Promise((resolve) => { finishSmallRows = resolve; }));
    mocks.rpc.mockResolvedValue({
      data: {
        records: [
          { source_kind: "QUICK", source_id: "quick-1", created_at: "2026-09-20T00:00:00Z" },
          { source_kind: "PERSONAL", source_id: "personal-1", created_at: "2026-09-19T00:00:00Z" },
          { source_kind: "RESOLUTION", source_id: "resolution-1", created_at: "2026-09-18T00:00:00Z" },
        ],
      },
      error: null,
    });

    const loading = loadExpenseWorkspace();
    await vi.waitFor(() => {
      expect(mocks.quickRows).toHaveBeenCalledWith("id", ["quick-1"]);
      expect(mocks.personalRows).toHaveBeenCalledWith("id", ["personal-1"]);
      expect(mocks.resolutionRows).toHaveBeenCalledWith("id", ["resolution-1"]);
    });

    finishSmallRows({ data: [], error: null });
    await expect(loading).resolves.toMatchObject({ records: expect.any(Array) });
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
    expect(loaded.records[0]).toMatchObject({ source_kind: "SMALL", source_id: "small-1", transaction_id: "tx-1", approval_status: "CONFIRMED", usage_description: "복사용지" });
  });
});

describe("expense workspace server pagination", () => {
  it("passes filters to the paged RPC and trusts staff access only from the authenticated member", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        records: [{ source_kind: "PERSONAL", source_id: "own" }],
        selected_record: { source_kind: "RESOLUTION", source_id: "selected" },
        total_count: 125,
        filtered_count: 51,
        kind_counts: { ALL: 125, RESOLUTION: 30, SMALL: 20, QUICK: 25, PERSONAL: 50 },
        page: 2,
        page_size: 50,
        page_count: 2,
        staff: false,
      },
      error: null,
    });

    const loaded = await loadExpenseWorkspacePage({
      kind: "PERSONAL",
      connection: "UNCONNECTED",
      page: "2",
      q: "문구점",
      sort: "AMOUNT_DESC",
      status: "SUBMITTED",
      source_kind: "RESOLUTION",
      source_id: "selected",
    });

    expect(mocks.rpc).toHaveBeenCalledWith("expense_workspace_page", {
      p_org: "org",
      p_actor: "user",
      p_page: 2,
      p_page_size: 50,
      p_kind: "PERSONAL",
      p_connection: "UNCONNECTED",
      p_search: "문구점",
      p_sort: "AMOUNT_DESC",
      p_status: "SUBMITTED",
      p_source_kind: "RESOLUTION",
      p_source_id: "selected",
    });
    expect(loaded.pagination).toEqual({
      totalCount: 125,
      filteredCount: 51,
      kindCounts: { ALL: 125, RESOLUTION: 30, SMALL: 20, QUICK: 25, PERSONAL: 50 },
      page: 2,
      pageSize: 50,
      pageCount: 2,
    });
    expect(loaded.selectedRecord?.source_id).toBe("selected");
    expect(loaded.viewer.staff).toBe(true);
  });

  it("normalizes invalid page input and rejects malformed RPC results", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { records: [] }, error: null });
    await loadExpenseWorkspacePage({ page: "not-a-page" });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "expense_workspace_page",
      expect.objectContaining({ p_page: 1 }),
    );

    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await expect(loadExpenseWorkspacePage()).rejects.toThrow("조회 결과");
  });
});
