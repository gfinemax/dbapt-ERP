import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LedgerBankTransactionDetail } from "./ledger-bank-transaction-detail";

const account = {
  account_name: "기업(0711)",
  account_number_last4: "4017",
  bank_name: "기업은행",
  conflict_count: 0,
  erp_bank_account_id: "bank-erp",
  imported_count: 1,
  invalid_count: 0,
  ledger_account_id: "8",
  mapping_note: null,
  pending_count: 0,
};

const detail = {
  deposit_total: 1_500,
  first_transaction_date: "2021-03-15",
  last_transaction_date: "2024-12-16",
  page: 1,
  page_size: 50,
  rows: [{
    balance_amount: 10_000,
    bank_transaction_id: "erp-transaction-uuid",
    category_group: "운영비",
    category_name: "수수료",
    deposit_amount: 1_500,
    description: "테스트 입금",
    imported_at: "2026-11-05T06:55:00+09:00",
    management_memo: "원본 메모",
    payload_hash: "a".repeat(64),
    source_transaction_id: "ledger-transaction-1",
    transaction_date: "2024-12-16",
    transaction_kind: "입금" as const,
    transaction_time: "07:43:28",
    withdrawal_amount: 0,
  }],
  total_count: 1,
  total_pages: 2,
  withdrawal_total: 0,
};

const erpBankAccount = {
  accountName: "대방동지역주택조합",
  accountNo: "071-114261-04-017",
  accountType: "운영계좌" as const,
  bankName: "기업은행",
  createdAt: "2021-02-26",
  id: "bank-erp",
  lastSyncedAt: "2026-11-05 06:55",
  status: "정상" as const,
  unmatchedCount: 0,
  usageStatus: "사용" as const,
};

describe("LedgerBankTransactionDetail", () => {
  it("shows masked account context, totals, provenance IDs, and paging", () => {
    render(<LedgerBankTransactionDetail account={account} detail={detail} erpBankAccount={erpBankAccount} />);

    expect(screen.getByRole("heading", { name: "Ledger 계좌 ID 8 · 1건" })).toBeInTheDocument();
    expect(screen.getByText("기업(0711) · 기업은행 · ***4017")).toBeInTheDocument();
    expect(screen.getByText("ERP 연결 · 기업은행 · 대방동지역주택조합 · ***4017")).toBeInTheDocument();
    expect(screen.getByText("2021-03-15 ~ 2024-12-16")).toBeInTheDocument();
    expect(screen.getByText(/ledger-transaction-1/)).toBeInTheDocument();
    expect(screen.getByText(/erp-transaction-uuid/)).toBeInTheDocument();
    expect(screen.getByText("원본 보호")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "다음" })).toHaveAttribute(
      "href",
      "/finance/bank-account-links?ledgerAccountId=8&page=2#ledger-account-detail",
    );
  });
});
