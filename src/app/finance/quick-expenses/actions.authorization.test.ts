import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), related: vi.fn(), settings: vi.fn(), budget: vi.fn(), save: vi.fn(), record: vi.fn(), importCards: vi.fn(), link: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/finance/expense-authorization", () => ({ requireExpenseActor: mocks.actor, assertExpenseRelatedRow: mocks.related, expenseDb: vi.fn() }));
vi.mock("@/features/finance/expense-compliance-repository", () => ({ getExpenseComplianceSettings: mocks.settings }));
vi.mock("@/features/finance/quick-expense-record-repository", () => ({ getQuickExpenseBudgetAvailability: mocks.budget, saveQuickExpenseRecord: mocks.save, getQuickExpenseRecord: mocks.record }));
vi.mock("@/features/finance/corporate-card-transaction-repository", () => ({ importCorporateCardTransactions: mocks.importCards, linkQuickExpenseCard: mocks.link }));
import { importCorporateCardTransactionsAction, linkQuickExpenseCardAction, saveQuickExpenseRecordAction } from "./actions";
import type { QuickExpenseRecordInput } from "@/features/finance/quick-expense-record";
const actor = { organization_id: "actual-org", user_id: "actual-user", display_name: "Authenticated author" };
const input: QuickExpenseRecordInput = { amount: 10000, approvalSkipReason: "예산 내 사용", bankTransactionId: "bank", budgetItem: "제세공과금>통신비", counterparty: "KT", evidenceStatus: "GENERAL", expenseDetailId: "detail", occurredAt: "2026-09-01", paymentMethod: "BANK_TRANSFER", recordedByLabel: "forged label", sourceType: "BANK_TRANSACTION", usageDescription: "통신비" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.actor.mockResolvedValue(actor); mocks.related.mockResolvedValue(undefined); mocks.settings.mockResolvedValue(null);
  mocks.budget.mockResolvedValue({ unresolvedCount: 0, remainingAmount: 100000, annualRemainingAmount: 100000 });
  mocks.save.mockResolvedValue({ id: "saved" });
});
describe("quick expense mutation authorization", () => {
  it("denies every mutation before privileged storage when the session is unavailable", async () => {
    mocks.actor.mockRejectedValue(new Error("로그인 필요"));
    await expect(saveQuickExpenseRecordAction(input)).rejects.toThrow("로그인");
    await expect(importCorporateCardTransactionsAction([])).rejects.toThrow("로그인");
    await expect(linkQuickExpenseCardAction({ recordId: "q", cardTransactionId: "c" })).rejects.toThrow("로그인");
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.importCards).not.toHaveBeenCalled(); expect(mocks.link).not.toHaveBeenCalled();
  });
  it("uses the authenticated organization and author and validates source ownership", async () => {
    await saveQuickExpenseRecordAction(input);
    expect(mocks.related).toHaveBeenCalledWith("bank_transactions", "bank", actor);
    expect(mocks.settings).toHaveBeenCalledWith("actual-org");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ recordedByLabel: "Authenticated author" }), "actual-org");
  });
  it("rejects foreign card links and never mutates them", async () => {
    mocks.record.mockResolvedValue({ ...input, id: "q" });
    mocks.related.mockRejectedValue(new Error("다른 조합 거래"));
    await expect(linkQuickExpenseCardAction({ recordId: "q", cardTransactionId: "foreign" })).rejects.toThrow("다른 조합");
    expect(mocks.record).toHaveBeenCalledWith("q", "actual-org");
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it("scopes imported card transactions to the authenticated organization", async () => {
    await importCorporateCardTransactionsAction([]);
    expect(mocks.importCards).toHaveBeenCalledWith([], "actual-org");
  });
});
