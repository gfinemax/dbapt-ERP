import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approvalDocuments: vi.fn(),
  bankTransactions: vi.fn(),
  cardTransactions: vi.fn(),
  expenseDetails: vi.fn(),
  settings: vi.fn(),
  actor: vi.fn(),
  nextResolutionNo: vi.fn(),
}));

vi.mock("@/features/approval/approval-repository", () => ({ listApprovedApprovalDocumentCandidates: mocks.approvalDocuments }));
vi.mock("./expense-authorization", () => ({ requireExpenseActor: mocks.actor }));
vi.mock("./expense-compliance-repository", () => ({
  getExpenseComplianceSettings: mocks.settings,
  listUnresolvedWithdrawalTransactions: mocks.bankTransactions,
}));
vi.mock("./corporate-card-transaction-repository", () => ({ listUnresolvedCorporateCardTransactions: mocks.cardTransactions }));
vi.mock("./operating-budget-repository", () => ({ listOperatingExpenseDetails: mocks.expenseDetails }));
vi.mock("./expense-resolution-repository", () => ({ getNextExpenseResolutionNoFromSupabase: mocks.nextResolutionNo }));

import { defaultExpenseComplianceSettings } from "./expense-compliance";
import { loadExpenseResolutionFormOptions } from "./expense-resolution-form-options.server";

describe("expense resolution form options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ organization_id: "org-one" });
    mocks.approvalDocuments.mockResolvedValue([{ id: "approval-one" }]);
    mocks.bankTransactions.mockResolvedValue([{ id: "bank-one" }]);
    mocks.cardTransactions.mockResolvedValue([{ id: "card-one" }]);
    mocks.expenseDetails.mockResolvedValue([{ id: "detail-one" }]);
    mocks.settings.mockResolvedValue(null);
    mocks.nextResolutionNo.mockResolvedValue("지결-2026-0042");
  });

  it("loads all creation-only data in one authenticated request", async () => {
    await expect(loadExpenseResolutionFormOptions()).resolves.toEqual({
      approvalDocuments: [{ id: "approval-one" }],
      bankTransactions: [{ id: "bank-one" }],
      cardTransactions: [{ id: "card-one" }],
      directExpenseSettings: defaultExpenseComplianceSettings,
      expenseDetails: [{ id: "detail-one" }],
      nextResolutionNo: "지결-2026-0042",
    });
    expect(mocks.approvalDocuments).toHaveBeenCalledWith("org-one", 50);
    expect(mocks.bankTransactions).toHaveBeenCalledWith("org-one", 50);
    expect(mocks.cardTransactions).toHaveBeenCalledWith("org-one", 50);
    expect(mocks.expenseDetails).toHaveBeenCalledWith("org-one");
    expect(mocks.settings).toHaveBeenCalledWith("org-one");
    expect(mocks.nextResolutionNo).toHaveBeenCalledWith(expect.objectContaining({ organization_id: "org-one" }));
  });
});
