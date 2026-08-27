import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickExpensePage } from "./quick-expense-page";

describe("QuickExpensePage", () => {
  it("saves usage against a bank transaction without creating an expense resolution", async () => {
    const persistRecord = vi.fn(async (input) => ({ ...input, createdAt: "2026-08-27T12:00:00+09:00", directExpenseDecision: "ALLOWED" as const, directExpenseReasons: ["승인 예산 범위 내 일상·정기 지출로 직접 처리할 수 있습니다."], id: "quick-1", recordStatus: "RECORDED" as const }));
    render(<QuickExpensePage initialBankTransactions={[{ counterparty: "KT", description: "인터넷", id: "bank-1", resolutionStatus: "UNRESOLVED", transactedAt: "2026-08-27T09:00:00+09:00", withdrawalAmount: 55000 }]} initialCardTransactions={[]} initialRecords={[]} persistRecord={persistRecord} />);

    fireEvent.change(screen.getByLabelText("미처리 통장 출금거래"), { target: { value: "bank-1" } });
    fireEvent.change(screen.getByLabelText("사용내용"), { target: { value: "조합 사무실 인터넷 요금" } });
    fireEvent.change(screen.getByLabelText("예산항목"), { target: { value: "운영비 > 통신비" } });
    fireEvent.click(screen.getByRole("button", { name: "사용내용 등록" }));

    await waitFor(() => expect(persistRecord).toHaveBeenCalledWith(expect.objectContaining({ bankTransactionId: "bank-1", sourceType: "BANK_TRANSACTION", usageDescription: "조합 사무실 인터넷 요금" })));
    expect(await screen.findByText("지출결의 없이 사용내용을 등록했어.")).toBeInTheDocument();
    expect(screen.getByText("간편처리 완료")).toBeInTheDocument();
  });

  it("supports manual cash usage records", () => {
    render(<QuickExpensePage initialBankTransactions={[]} initialCardTransactions={[]} initialRecords={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "현금" }));
    expect(screen.getByLabelText("금액")).toBeInTheDocument();
    expect(screen.getByLabelText("거래처·지급대상")).toBeInTheDocument();
  });
});
