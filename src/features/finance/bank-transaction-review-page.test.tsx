import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { registeredAccountSubjects } from "@/features/basic-info/account-subject-data";
import { BankTransactionReviewPage, reviewPageHref } from "./bank-transaction-review-page";

const transaction = {
  amount: 55000,
  bankAccountId: "bank-002",
  classificationStatus: "RECOMMENDED" as const,
  counterparty: "KT",
  description: "인터넷 요금",
  id: "transaction-1",
  recommendedAccountSubjectId: registeredAccountSubjects[0].id,
  recommendedAccountSubjectName: registeredAccountSubjects[0].name,
  recommendationReason: "거래 적요 키워드로 추천함",
  transactedAt: "2026-09-27T09:00:00+09:00",
  transactionKind: "출금" as const,
};

describe("BankTransactionReviewPage", () => {
  it("confirms only the selected recommendation without exposing internal codes", async () => {
    const confirmAssignments = vi.fn().mockResolvedValue([
      { account_subject_id: registeredAccountSubjects[0].id, transaction_id: transaction.id },
    ]);
    render(
      <BankTransactionReviewPage
        accountSubjects={registeredAccountSubjects}
        confirmAssignments={confirmAssignments}
        initialTransactions={[transaction]}
        page={1}
        pageSize={50}
        totalCount={1}
        totalPages={1}
      />,
    );

    const select = screen.getByLabelText("인터넷 요금 확정 계정과목");
    expect(within(select).getByRole("option", { name: registeredAccountSubjects[0].name })).toBeInTheDocument();
    expect(select).not.toHaveTextContent(registeredAccountSubjects[0].code);
    fireEvent.click(screen.getByRole("button", { name: "추천값 전체 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1건 확정" }));
    expect(confirmAssignments).toHaveBeenCalledWith([{
      accountSubjectId: registeredAccountSubjects[0].id,
      transactionId: transaction.id,
    }]);
    expect(await screen.findByText("1건의 계정과목을 관리자 확정했어.")).toBeInTheDocument();
    expect(screen.getByText("확인할 은행거래가 없어.")).toBeInTheDocument();
  });

  it("paginates review rows in batches of 50", () => {
    render(
      <BankTransactionReviewPage
        accountSubjects={registeredAccountSubjects}
        initialTransactions={[]}
        page={2}
        pageSize={50}
        totalCount={4277}
        totalPages={86}
      />,
    );
    expect(screen.getByText("전체 4,277건 · 2/86페이지")).toBeInTheDocument();
    expect(screen.getByText("51-100건 표시")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이전 50건" })).toHaveAttribute("href", reviewPageHref(1));
    expect(screen.getByRole("link", { name: "다음 50건" })).toHaveAttribute("href", reviewPageHref(3));
  });
});
