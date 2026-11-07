import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BankTransactionListPage, bankTransactionPageHref } from "./bank-transaction-list-page";

vi.mock("@/app/finance/navigation/actions", () => ({ loadFinanceNavigationBadgesAction: vi.fn().mockResolvedValue({}) }));

const bankAccounts = [{
  accountName: "우리은행 운영계좌",
  accountNo: "1000200031006",
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

const statusCounts = {
  ALL: 4277,
  CONFIRMED: 37,
  DEFERRED: 3,
  EXCLUDED: 2,
  RECOMMENDED: 120,
  UNREVIEWED: 4115,
};

const ledgerSourceSummary = {
  importedTransactionCount: 1258,
  ledgerOriginalCount: 1303,
  zeroAmountSourceCount: 45,
  zeroAmountSources: [{
    description: "예금결산이자",
    issueDetail: "입금과 출금 중 정확히 한 금액만 0보다 커야 합니다.",
    sourceTransactionId: "1303",
    transactionDate: "2022-12-17",
    transactionKind: "예금결산",
    transactionTime: "10:46:59",
  }],
};

describe("BankTransactionListPage", () => {
  it("shows only the paged transaction list and links secondary workflows", () => {
    render(<BankTransactionListPage bankAccounts={bankAccounts} filters={{}} pageData={pageData} statusCounts={statusCounts} />);
    const main = screen.getByRole("main");
    expect(screen.getByRole("heading", { level: 1, name: "은행 거래내역" })).toBeInTheDocument();
    expect(screen.getByText("조회 결과")).toHaveTextContent("4,277건");
    expect(screen.getAllByText("51–100건 · 2/86")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "거래내역 업로드" })).toHaveAttribute("href", "/finance/bank-transactions/upload");
    expect(screen.getAllByRole("link", { name: "계좌 연동 설정" }).every((link) => link.getAttribute("href") === "/finance/bank-account-links")).toBe(true);
    expect(screen.getByRole("link", { name: "미매칭 내역" })).toHaveAttribute("href", "/finance/bank-unmatched");
    expect(within(main).queryByRole("link", { name: "계좌 연동 설정" })).not.toBeInTheDocument();
    expect(within(main).queryByRole("link", { name: "미매칭 확인" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "분류 상태 빠른 필터" })).getByRole("link", { name: /미확인.*4,115/ })).toHaveAttribute("href", "/finance/bank-transactions?status=UNREVIEWED");
    expect(screen.queryByText("기존 Ledger 통장거래 가져오기")).not.toBeInTheDocument();
    expect(screen.queryByText("Ledger 계정과목 매핑 작업대")).not.toBeInTheDocument();
  });

  it("shows only the first five account digits after each bank account name", () => {
    render(<BankTransactionListPage bankAccounts={bankAccounts} filters={{}} pageData={pageData} statusCounts={statusCounts} />);

    expect(screen.getByRole("option", { name: "우리은행 운영계좌 (10002)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /1000200031006/ })).not.toBeInTheDocument();
  });

  it("preserves search, account, date and status filters across pagination", () => {
    expect(bankTransactionPageHref(3, {
      bankAccountId: "bank-1",
      classificationStatus: "UNREVIEWED",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      query: "인터넷",
    })).toBe(
      "/finance/bank-transactions?page=3&q=%EC%9D%B8%ED%84%B0%EB%84%B7&accountId=bank-1&from=2026-09-01&to=2026-09-30&status=UNREVIEWED",
    );
  });

  it("uses a compact six-column table with a signed amount and shortened account", () => {
    render(<BankTransactionListPage bankAccounts={bankAccounts} filters={{}} pageData={pageData} statusCounts={statusCounts} />);

    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    expect(screen.getAllByRole("columnheader").every((header) => header.classList.contains("text-center"))).toBe(true);
    expect(screen.getByRole("columnheader", { name: "금액" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "입금" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "출금" })).not.toBeInTheDocument();
    expect(screen.getByText("−55,000원")).toBeInTheDocument();
    expect(screen.getByText("우리은행 · 1006")).toBeInTheDocument();
    expect(screen.getByText("2026-09-27 09:00").closest("td")).toHaveClass("px-3", "py-2.5");
  });

  it("shows active filters as removable chips", () => {
    render(<BankTransactionListPage
      bankAccounts={bankAccounts}
      filters={{ bankAccountId: "bank-1", classificationStatus: "RECOMMENDED", dateFrom: "2026-09-01", query: "KT" }}
      pageData={pageData}
      statusCounts={statusCounts}
    />);

    expect(screen.getByRole("link", { name: "검색: KT 필터 제거" })).toHaveAttribute("href", "/finance/bank-transactions?accountId=bank-1&from=2026-09-01&status=RECOMMENDED");
    expect(screen.getByRole("link", { name: "추천 있음 필터 제거" })).toHaveAttribute("href", "/finance/bank-transactions?q=KT&accountId=bank-1&from=2026-09-01");
  });

  it("separates zero-amount Ledger source rows from ERP accounting transactions", () => {
    render(<BankTransactionListPage
      bankAccounts={bankAccounts}
      filters={{ bankAccountId: "bank-1" }}
      ledgerSourceSummary={ledgerSourceSummary}
      pageData={pageData}
      statusCounts={statusCounts}
    />);

    const sourceAudit = screen.getByRole("region", { name: "Ledger 원본 대조" });
    expect(within(sourceAudit).getByText("ERP 회계 거래").parentElement).toHaveTextContent("1,258건");
    expect(within(sourceAudit).getByText("Ledger 원본").parentElement).toHaveTextContent("1,303건");
    expect(within(sourceAudit).getByText("금액 없는 원본").parentElement).toHaveTextContent("45건회계 집계 제외");
    expect(within(sourceAudit).getByText("금액 없는 원본 45건 보기")).toBeInTheDocument();
    expect(within(sourceAudit).getByText("1303")).toBeInTheDocument();
    expect(within(sourceAudit).getByText("2022-12-17 10:46:59")).toBeInTheDocument();
    expect(within(sourceAudit).getByText("예금결산이자")).toBeInTheDocument();
  });
});
