import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadBankAccounts: vi.fn(),
  loadDetail: vi.fn(),
  loadStatus: vi.fn(),
  requireActor: vi.fn(),
}));

vi.mock("@/app/finance/reimbursements/actions", () => ({ reimbursementLogout: vi.fn() }));
vi.mock("@/components/erp-shell", () => ({
  ErpShell: ({ activeDetailLabel, children }: { activeDetailLabel?: string; children: ReactNode }) => (
    <div data-active-detail={activeDetailLabel}>{children}</div>
  ),
}));
vi.mock("@/features/basic-info/bank-account-repository", () => ({
  listBankAccountsFromSupabase: mocks.loadBankAccounts,
}));
vi.mock("@/features/finance/expense-authorization", () => ({
  requireExpenseActor: mocks.requireActor,
}));
vi.mock("@/features/finance/ledger-bank-transaction-backfill", () => ({
  loadLedgerBankBackfillStatus: mocks.loadStatus,
  loadLedgerBankImportedTransactions: mocks.loadDetail,
}));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseSecretConfig: () => true }));
vi.mock("../bank-transactions/actions", () => ({
  setLedgerBankAccountMappingAction: vi.fn(),
  syncLedgerBankTransactionsAction: vi.fn(),
}));

import FinanceBankAccountLinksRoute from "./page";

describe("bank account link settings route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a dedicated destination with account registration and transaction links", async () => {
    mocks.requireActor.mockResolvedValue({ display_name: "오학동", organization_id: "org-1" });
    mocks.loadBankAccounts.mockResolvedValue([]);
    mocks.loadStatus.mockResolvedValue({
      accounts: [],
      state: null,
      totals: { conflict: 0, imported: 0, invalid: 0, pending: 0, staged: 0 },
    });

    const { container } = render(await FinanceBankAccountLinksRoute({ searchParams: Promise.resolve({}) }));

    expect(container.firstElementChild).toHaveAttribute("data-active-detail", "은행계좌 연동");
    expect(screen.getByRole("heading", { level: 1, name: "은행계좌 연동" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "ERP 은행통장 등록" })[0]).toHaveAttribute(
      "href",
      "/basic-info?section=bank-accounts",
    );
    expect(screen.getByRole("link", { name: "은행 거래내역으로 이동" })).toHaveAttribute(
      "href",
      "/finance/bank-transactions?origin=BANK_TRANSACTION",
    );
  });

  it("loads the selected Ledger account detail with a bounded page number", async () => {
    mocks.requireActor.mockResolvedValue({ display_name: "오학동", organization_id: "org-1" });
    mocks.loadBankAccounts.mockResolvedValue([{ accountName: "대방동지역주택조합", accountNo: "071-114261-04-017", accountType: "운영계좌", bankName: "기업은행", createdAt: "2021-02-26", id: "bank-erp", lastSyncedAt: "", status: "정상", unmatchedCount: 0, usageStatus: "사용" }]);
    mocks.loadStatus.mockResolvedValue({
      accounts: [{ account_name: "기업(0711)", account_number_last4: "4017", bank_name: "기업은행", conflict_count: 0, erp_bank_account_id: "bank-erp", imported_count: 1, invalid_count: 0, ledger_account_id: "8", mapping_note: null, pending_count: 0 }],
      state: null,
      totals: { conflict: 0, imported: 1, invalid: 0, pending: 0, staged: 1 },
    });
    mocks.loadDetail.mockResolvedValue({ deposit_total: 100, first_transaction_date: "2024-12-16", last_transaction_date: "2024-12-16", page: 1, page_size: 50, rows: [], total_count: 1, total_pages: 1, withdrawal_total: 0 });

    render(await FinanceBankAccountLinksRoute({ searchParams: Promise.resolve({ ledgerAccountId: "8", page: "2" }) }));

    expect(mocks.loadDetail).toHaveBeenCalledWith("8", 2);
    expect(screen.getByRole("heading", { name: "Ledger 계좌 ID 8 · 1건" })).toBeInTheDocument();
    expect(screen.getByText("ERP 연결 · 기업은행 · 대방동지역주택조합 · ***4017")).toBeInTheDocument();
  });
});
