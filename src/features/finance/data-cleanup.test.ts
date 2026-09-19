import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
const rows: Record<string, unknown[]> = {
  quick_expense_records: [
    { id: "q1", usage_description: "법인카드 구매", counterparty: "상점", amount: 1000, occurred_at: "2026-09-03", record_status: "SOURCE_PENDING", budget_item: "운영비", evidence_review_status: "READY" },
    { id: "q2", usage_description: "결의 전환", counterparty: "업체", amount: 2000, occurred_at: "2026-09-02", record_status: "NEEDS_RESOLUTION", budget_item: "사업비", evidence_review_status: "APPROVED" },
  ],
  workflow_transactions: [{ id: "t1", source_kind: "RESOLUTION", source_id: "r1", title: "처리경로 미분류", amount: 3000, updated_at: "2026-09-01" }],
};
function database() {
  return { schema: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      const chain = { select: () => chain, eq: () => chain, in: () => chain, order: () => chain, limit: vi.fn().mockResolvedValue({ data: rows[table], error: null }) };
      return chain;
    },
  }) };
}
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: database }));
import { loadDataCleanupWorkspace } from "./data-cleanup";

describe("data cleanup inventory", () => {
  beforeEach(() => {
    mocks.identity.mockResolvedValue({ organization_id: "org", user_id: "actor", permissions: ["APPROVE"] });
    mocks.rpc.mockReset().mockResolvedValue({ data: [{ source_kind: "QUICK", source_id: "q3", title: "귀속 미정", amount: 4000, suggested_month: null, suggested_budget: null, paid_at: null, needs_review: true, reason: "예산항목·귀속월 확인 필요" }], error: null });
  });
  it("returns review links without mutating or merging source rows", async () => {
    const result = await loadDataCleanupWorkspace();
    expect(result.items.map((item) => item.category)).toEqual(["CARD_LINK", "RESOLUTION", "ROUTE", "BUDGET"]);
    expect(result.items.find((item) => item.category === "RESOLUTION")?.href).toBe("/finance/expense-resolutions?quickExpenseId=q2");
    expect(result.items.find((item) => item.category === "ROUTE")?.href).toContain("source_kind=RESOLUTION");
    expect(result.truncated).toBe(false);
  });
  it("rejects ordinary applicants before reading finance sources", async () => {
    mocks.identity.mockResolvedValue({ organization_id: "org", user_id: "actor", permissions: [] });
    await expect(loadDataCleanupWorkspace()).rejects.toThrow("회계·자금 담당자");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
