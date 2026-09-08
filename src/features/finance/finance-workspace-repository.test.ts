import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFinanceTaskWorkspace } from "./finance-workspace-repository";
const mock = vi.hoisted(() => ({ identity: vi.fn(), expenses: vi.fn(), payments: vi.fn(), trust: vi.fn(), accounting: vi.fn(), sourceTasks: vi.fn() }));
vi.mock("./finance-task-sources-repository", () => ({ loadFinanceTaskSources: mock.sourceTasks }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mock.identity }));
vi.mock("./expense-workspace-repository", () => ({ loadExpenseWorkspace: mock.expenses }));
vi.mock("./fund-payment-repository", () => ({ loadPaymentWorkspace: mock.payments }));
vi.mock("./fund-trust-repository", () => ({ loadFundTrust: mock.trust }));
vi.mock("./accounting-workspace-repository", () => ({ loadAccountingWorkspace: mock.accounting }));
beforeEach(() => {
  vi.clearAllMocks(); mock.sourceTasks.mockResolvedValue([]); mock.identity.mockResolvedValue({ active: true, permissions: ["ADMIN"] });
  mock.expenses.mockResolvedValue({ records: [] }); mock.payments.mockResolvedValue({ transactions: [], eligibility: [] });
  mock.trust.mockResolvedValue({ requests: [], items: [] }); mock.accounting.mockResolvedValue({ vouchers: [], sources: [] });
});
describe("task dashboard scoped reads", () => {
  it("does not call staff sources for an ordinary applicant", async () => {
    mock.identity.mockResolvedValue({ active: true, permissions: [] });
    expect(await loadFinanceTaskWorkspace()).toEqual({ staff: false, tasks: [], unavailable: [] });
    expect(mock.expenses).toHaveBeenCalledOnce(); expect(mock.payments).not.toHaveBeenCalled(); expect(mock.trust).not.toHaveBeenCalled(); expect(mock.accounting).not.toHaveBeenCalled();
  });
  it("keeps independent results when one source fails and does not expose backend errors", async () => {
    mock.accounting.mockRejectedValue(new Error("private backend detail"));
    mock.expenses.mockResolvedValue({ records: [{ source_kind: "PERSONAL", source_id: "id", title: "대납", approval_status: "SUBMITTED", transaction_id: "tx", can_connect: false }] });
    const data = await loadFinanceTaskWorkspace();
    expect(data.tasks).toHaveLength(1); expect(data.tasks[0].kind).toBe("APPROVAL");
    expect(data.unavailable.map(e => e.kind)).toEqual(["ACCOUNTING_REVIEW"]);
    expect(JSON.stringify(data)).not.toContain("private backend");
  });
  it("rejects inactive users before any data loader", async () => {
    mock.identity.mockResolvedValue({ active: false, permissions: ["ADMIN"] });
    await expect(loadFinanceTaskWorkspace()).rejects.toThrow("활성"); expect(mock.expenses).not.toHaveBeenCalled();
  });
  it("counts supplement requests once even with multiple items and uses actual payment eligibility", async () => {
    mock.trust.mockResolvedValue({ requests: [{ id: "request", request_no: "신탁1", title: "요청" }], items: [{ request_id: "request", status: "SUPPLEMENT" }, { request_id: "request", needs_review: true }] });
    mock.payments.mockResolvedValue({ transactions: [{ id: "tx", title: "지출", amounts: { paid: 0, payment_review_required: false, remaining: 1000 } }], eligibility: [{ transaction_id: "tx", available: 0 }] });
    const data = await loadFinanceTaskWorkspace();
    expect(data.tasks).toHaveLength(1); expect(data.tasks[0].detail).toContain("2건");
    mock.payments.mockResolvedValue({ transactions: [{ id: "tx", title: "지출", amounts: { paid: 300, payment_review_required: false } }], eligibility: [{ transaction_id: "tx", available: 200 }] });
    expect((await loadFinanceTaskWorkspace()).tasks.find(t => t.kind === "PAYABLE")?.detail).toContain("200원");
  });
});
