import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.client }));
import { getQuickExpenseRecord, listQuickExpenseRecords } from "./quick-expense-record-repository";

const row = {
  id: "quick-one", amount: "32000", linked_resolution_id: "resolution-one",
  source_type: "MANUAL", payment_method: "CASH", occurred_at: "2026-09-19T00:00:00Z",
  counterparty: "Test vendor", usage_description: "Test expense", budget_item: "Test budget",
  evidence_status: "GENERAL", approval_skip_reason: "Test policy", direct_expense_decision: "ALLOWED",
  direct_expense_reasons: [], record_status: "CONVERTED", recorded_by_label: "Test author",
  created_at: "2026-09-19T00:00:00Z",
};

function mockQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error }), maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  mocks.client.mockReturnValue({ schema: () => ({ from: () => query }) });
  return query;
}

beforeEach(() => vi.clearAllMocks());

describe("quick expense persisted origin links", () => {
  it("loads the persisted resolution reference in an organization-scoped list", async () => {
    const query = mockQuery([row]);
    const records = await listQuickExpenseRecords("org-one");
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-one");
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("linked_resolution_id"));
    expect(records[0]).toMatchObject({ id: "quick-one", amount: 32000, linkedResolutionId: "resolution-one" });
  });

  it("does not infer a resolution from CONVERTED status alone", async () => {
    const query = mockQuery({ ...row, linked_resolution_id: null });
    const record = await getQuickExpenseRecord("quick-one", "org-one");
    expect(query.eq).toHaveBeenCalledWith("id", "quick-one");
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-one");
    expect(record?.recordStatus).toBe("CONVERTED");
    expect(record?.linkedResolutionId).toBeUndefined();
  });

  it("does not hide source lookup failures", async () => {
    mockQuery(null, { message: "lookup unavailable" });
    await expect(getQuickExpenseRecord("quick-one", "org-one")).rejects.toThrow("lookup unavailable");
  });
});
