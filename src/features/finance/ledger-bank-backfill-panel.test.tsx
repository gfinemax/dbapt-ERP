import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LedgerBankBackfillPanel } from "./ledger-bank-backfill-panel";
import type { LedgerBankBackfillStatus } from "./ledger-bank-backfill-shared";

const status: LedgerBankBackfillStatus = {
  accounts: [{
    account_name: "Ledger 운영계좌",
    account_number_last4: "7890",
    bank_name: "테스트은행",
    conflict_count: 0,
    erp_bank_account_id: null,
    imported_count: 0,
    invalid_count: 0,
    ledger_account_id: "7",
    mapping_note: null,
    pending_count: 3,
  }],
  state: { last_cursor: 3, last_status: "SUCCESS", last_synced_at: "2026-11-04T12:00:00Z", source_frozen: true },
  totals: { conflict: 0, imported: 0, invalid: 0, pending: 3, staged: 3 },
};

const bankAccounts = [{
  accountName: "ERP 운영계좌",
  accountNo: "9876543210",
  accountType: "운영계좌" as const,
  bankName: "테스트은행",
  createdAt: "2026-11-01",
  id: "bank-erp",
  lastSyncedAt: "",
  status: "확인필요" as const,
  unmatchedCount: 0,
  usageStatus: "사용" as const,
}];

describe("LedgerBankBackfillPanel", () => {
  it("requires an explicit ERP account ID mapping before importing staged rows", async () => {
    const mapped: LedgerBankBackfillStatus = {
      ...status,
      accounts: [{ ...status.accounts[0], erp_bank_account_id: "bank-erp", imported_count: 3, pending_count: 0 }],
      totals: { ...status.totals, imported: 3, pending: 0 },
    };
    const mapAccount = vi.fn().mockResolvedValue({ data: mapped, ok: true });
    render(<LedgerBankBackfillPanel bankAccounts={bankAccounts} initialStatus={status} mapAccount={mapAccount} />);

    expect(screen.getByText("Ledger 계좌 ID 7")).toBeInTheDocument();
    expect(screen.getByText(/테스트은행 · \*\*\*7890/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ledger 계좌 7의 ERP 계좌"), { target: { value: "bank-erp" } });
    fireEvent.click(screen.getByRole("button", { name: "계좌 연결·이관" }));

    await waitFor(() => expect(mapAccount).toHaveBeenCalledWith({ bankAccountId: "bank-erp", ledgerAccountId: "7" }));
    expect(await screen.findByText("계좌 ID 7 매핑을 저장했고 3건이 ERP 원장에 반영됐어.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "연결 확정됨" })).toBeDisabled());
  });

  it("shows bounded cursor continuation instead of pretending a large backfill is complete", async () => {
    const partial: LedgerBankBackfillStatus = {
      ...status,
      state: { ...status.state!, last_cursor: 1003, last_status: "PARTIAL" },
    };
    const syncTransactions = vi.fn().mockResolvedValue({
      data: {
        complete: false,
        imported_count: 0,
        invalid_count: 0,
        next_cursor: 1003,
        received_count: 1000,
        status: partial,
      },
      ok: true,
    });
    render(<LedgerBankBackfillPanel bankAccounts={bankAccounts} initialStatus={status} syncTransactions={syncTransactions} />);
    fireEvent.click(screen.getByRole("button", { name: "Ledger 거래 불러오기" }));
    expect(await screen.findByText("이번 실행에서 1000건을 불러왔어. 거래량을 나눠 처리하므로 같은 버튼을 눌러 이어서 불러와줘.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "다음 거래 이어서 불러오기" })).toBeInTheDocument());
  });

  it("shows a safe Korean error returned by the server action", async () => {
    const syncTransactions = vi.fn().mockResolvedValue({
      error: "Ledger 거래를 불러오지 못했어. 로그인 상태와 연동 설정을 확인해줘.",
      ok: false,
    });
    render(<LedgerBankBackfillPanel bankAccounts={bankAccounts} initialStatus={status} syncTransactions={syncTransactions} />);
    fireEvent.click(screen.getByRole("button", { name: "Ledger 거래 불러오기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인 상태와 연동 설정을 확인해줘.");
  });

  it("disables sync and explains that login is required", () => {
    render(
      <LedgerBankBackfillPanel
        bankAccounts={bankAccounts}
        initialStatus={status}
        loadError="Ledger 거래 이관은 로그인 후 사용할 수 있어."
      />,
    );
    expect(screen.getByRole("button", { name: "Ledger 거래 불러오기" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("로그인 후 사용할 수 있어.");
  });
});
