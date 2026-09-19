import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));

const responses: Record<string, { data: unknown[] | null; count: number | null; error: null }> = {
  reimbursement_members: { data: [{ permissions: ["ADMIN", "APPROVE"] }, { permissions: ["PAY"] }], count: null, error: null },
  workflow_contract_versions: { data: [{ conditions: { operating_allowed: true, operating_advance_allowed: true } }], count: null, error: null },
  budgets: { data: null, count: 4, error: null },
  "quick_expense_records:SOURCE_PENDING": { data: null, count: 5, error: null },
  "quick_expense_records:EVIDENCE_PENDING": { data: null, count: 2, error: null },
  "quick_expense_records:NEEDS_RESOLUTION": { data: null, count: 1, error: null },
  "personal_reimbursements:APPROVED": { data: null, count: 3, error: null },
  advance_settlement_drafts: { data: null, count: 2, error: null },
  trust_operating_periods: { data: null, count: 1, error: null },
  "workflow_transactions:UNKNOWN": { data: null, count: 6, error: null },
};

function database() {
  return { schema: () => ({ from: (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
      neq: (key: string, value: unknown) => { filters[`not:${key}`] = value; return chain; },
      then: (resolve: (value: unknown) => void) => {
        const suffix = filters.record_status ?? filters.status ?? filters.route;
        resolve(responses[suffix && table !== "workflow_contract_versions" ? `${table}:${suffix}` : table] ?? responses[table]);
      },
    };
    return chain;
  } }) };
}
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: database }));
import { loadFinanceReadiness } from "./finance-readiness";

describe("finance operational readiness", () => {
  beforeEach(() => mocks.identity.mockResolvedValue({ organization_id: "org", user_id: "actor", permissions: ["ADMIN"] }));
  it("keeps configuration gaps separate from source-backed work queues", async () => {
    const result = await loadFinanceReadiness();
    expect(result.configuration).toMatchObject({ activeStaff: 2, missingRoles: ["마감"], verifiedTrustContracts: 1, operatingFundContracts: 1, currentYearBudgets: 4 });
    expect(result.queues).toEqual({ cardLinkPending: 5, evidencePending: 2, resolutionRequired: 1, personalPaymentPending: 3, advanceSettlementOpen: 2, operatingPeriodOpen: 1, routeUnclassified: 6 });
  });
  it("does not expose the readiness inventory to an ordinary applicant", async () => {
    mocks.identity.mockResolvedValue({ organization_id: "org", user_id: "actor", permissions: [] });
    await expect(loadFinanceReadiness()).rejects.toThrow("회계·자금 담당자");
  });
});
