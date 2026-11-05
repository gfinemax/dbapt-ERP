import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BankTransactionListPage, bankTransactionPageHref } from "./bank-transaction-list-page";

const bankAccounts = [{
  accountName: "우리은행 운영계좌",
  accountNo: "***1006",
  accountType: "운영계좌" as const,
  bankName: "우리은행",
  createdAt: "2026-01-01",
  id: "bank-1",
  lastSyncedAt: "2026-11-06 09:00",
  status: "정상" as const,
  unmatchedCount: 1,
  usageStatus: "사용" as const,
}];

const pageData = {
  page: 2,
  pageSize: 50,
  rows: [{
    amount: 55000,
    balanceAmount: 1200000,
    bankAccountId: "bank-1",
    branchName: "대방동",
    classificationStatus: "RECOMMENDED" as const,
    counterparty: "KT",
    description: "인터넷 요금",
    id: "transaction-1",
    recommendedAccountSubjectId: "subject-1",
    recommendedAccountSubjectName: "통신비",
    recommendationReason: "거래 적요 키워드로 추천함",
    transactedAt: "2026-09-27T09:00:00+09:00",
    transactionKind: "출금" as const,
  }],
  totalCount: 4277,
  totalPages: 86,
};

describe("BankTransactionListPage", () => {
  it("shows only the paged transaction list and links secondary workflows", () => {
    render(<BankTransactionListPage bankAccounts={bankAccounts} filters={{}} pageData={pageData} />);
    expect(screen.getByRole("heading", { level: 1, name: "은행 거래내역" })).toBeInTheDocument();
    expect(screen.getByText("전체 4,277건 · 2/86페이지")).toBeInTheDocument();
    expect(screen.getByText("51-100건 표시")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "거래내역 업로드" })).toHaveAttribute("href", "/finance/bank-transactions/upload");
    expect(screen.getAllByRole("link", { name: "계좌 연동 설정" }).every((link) => link.getAttribute("href") === "/finance/bank-account-links")).toBe(true);
    expect(screen.getByRole("link", { name: "미매칭 확인" })).toHaveAttribute("href", "/finance/bank-unmatched");
    expect(screen.queryByText("기존 Ledger 통장거래 가져오기")).not.toBeInTheDocument();
    expect(screen.queryByText("Ledger 계정과목 매핑 작업대")).not.toBeInTheDocument();
  });

  it("preserves account and status filters across pagination", () => {
    expect(bankTransactionPageHref(3, { bankAccountId: "bank-1", classificationStatus: "UNREVIEWED" })).toBe(
      "/finance/bank-transactions?page=3&accountId=bank-1&status=UNREVIEWED",
    );
  });
});
