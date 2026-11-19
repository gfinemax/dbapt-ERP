import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Page from "./page";

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
  activity: vi.fn(),
  actor: vi.fn(),
  breakdown: vi.fn(),
  filteredSummary: vi.fn(),
  ledger: vi.fn(),
  list: vi.fn(),
  reconciliation: vi.fn(),
  rule: vi.fn(),
  status: vi.fn(),
  subjects: vi.fn(),
}));

vi.mock("@/app/finance/reimbursements/actions", () => ({ reimbursementLogout: vi.fn() }));
vi.mock("@/app/finance/bank-transactions/actions", () => ({ saveBankTransactionDetailOverridesAction: vi.fn(), saveBankTransactionReviewAction: vi.fn() }));
vi.mock("@/features/basic-info/account-subject-repository", () => ({ listAccountSubjectsFromSupabase: mocks.subjects }));
vi.mock("@/features/basic-info/bank-account-repository", () => ({ listBankAccountsFromSupabase: mocks.accounts }));
vi.mock("@/features/finance/expense-authorization", () => ({ requireExpenseActor: mocks.actor }));
vi.mock("@/features/finance/bank-transaction-list-page", () => ({
  BankTransactionListPage: ({ pageData }: { pageData: { totalCount: number } }) => <p>거래 {pageData.totalCount}건</p>,
}));
vi.mock("@/features/finance/bank-transaction-repository", () => ({
  countBankTransactionsByStatus: mocks.status,
  listBankTransactions: mocks.list,
  loadBankTransactionRulePreview: mocks.rule,
  loadBankTransactionSourceReconciliationSummary: mocks.reconciliation,
  loadExternalRecognitionBreakdown: mocks.breakdown,
  loadFilteredFinancialActivitySummary: mocks.filteredSummary,
  loadFinancialActivitySummary: mocks.activity,
  loadLedgerBankSourceSummary: mocks.ledger,
}));

describe("전체 거래내역 route", () => {
  it("원본 대조 요약을 기다리지 않고 독립 조회를 시작한다", async () => {
    let finishReconciliation: (value: { issues: never[] }) => void = () => undefined;
    mocks.actor.mockResolvedValue({ active: true, organization_id: "org", permissions: ["READ"], user_id: "user" });
    mocks.accounts.mockResolvedValue([]);
    mocks.subjects.mockResolvedValue([]);
    mocks.activity.mockResolvedValue(undefined);
    mocks.filteredSummary.mockResolvedValue(undefined);
    mocks.ledger.mockResolvedValue(undefined);
    mocks.rule.mockResolvedValue(undefined);
    mocks.breakdown.mockResolvedValue(undefined);
    mocks.status.mockResolvedValue({ ALL: 1, CONFIRMED: 0, DEFERRED: 0, EXCLUDED: 0, RECOMMENDED: 0, UNREVIEWED: 1 });
    mocks.list.mockResolvedValue({ page: 1, pageSize: 50, rows: [], totalCount: 1, totalPages: 1 });
    mocks.reconciliation.mockReturnValue(new Promise((resolve) => { finishReconciliation = resolve; }));

    const route = Page({ searchParams: Promise.resolve({}) });
    await vi.waitFor(() => expect(mocks.list).toHaveBeenCalledWith("org", 1, expect.any(Object), undefined));
    expect(mocks.reconciliation).toHaveBeenCalled();

    finishReconciliation({ issues: [] });
    render(await route);
    expect(screen.getByText("거래 1건")).toBeInTheDocument();
  });
});
