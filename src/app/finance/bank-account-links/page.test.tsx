import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadBankAccounts: vi.fn(),
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
}));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseSecretConfig: () => true }));
vi.mock("../bank-transactions/actions", () => ({
  setLedgerBankAccountMappingAction: vi.fn(),
  syncLedgerBankTransactionsAction: vi.fn(),
}));

import FinanceBankAccountLinksRoute from "./page";

describe("bank account link settings route", () => {
  it("renders a dedicated destination with account registration and transaction links", async () => {
    mocks.requireActor.mockResolvedValue({ display_name: "파인맥스", organization_id: "org-1" });
    mocks.loadBankAccounts.mockResolvedValue([]);
    mocks.loadStatus.mockResolvedValue({
      accounts: [],
      state: null,
      totals: { conflict: 0, imported: 0, invalid: 0, pending: 0, staged: 0 },
    });

    const { container } = render(await FinanceBankAccountLinksRoute());

    expect(container.firstElementChild).toHaveAttribute("data-active-detail", "계좌 연동 설정");
    expect(screen.getByRole("heading", { level: 1, name: "계좌 연동 설정" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "ERP 은행통장 등록" })[0]).toHaveAttribute(
      "href",
      "/basic-info?section=bank-accounts",
    );
    expect(screen.getByRole("link", { name: "은행 거래내역으로 이동" })).toHaveAttribute(
      "href",
      "/finance/bank-transactions",
    );
  });
});
