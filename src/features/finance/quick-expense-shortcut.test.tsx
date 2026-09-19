import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuickExpensePage } from "./quick-expense-page";
const card = { id: "card-one", amount: 32600, approvedAt: "2026-09-18", cardLastFour: "1234", cardName: "조합카드", merchantName: "문구점" };
describe("transaction-aware quick expense shortcuts", () => {
  it("preselects the corporate method and an available authorized transaction", () => {
    render(<QuickExpensePage initialPaymentMethod="CORPORATE_CARD" initialSourceId="card-one" initialBankTransactions={[]} initialCardTransactions={[card]} initialRecords={[]} />);
    expect(screen.getByRole("button", { name: "법인카드" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("미처리 법인카드 승인내역")).toHaveValue("card-one");
  });
  it("does not select an unavailable transaction supplied through a URL", () => {
    render(<QuickExpensePage initialPaymentMethod="CORPORATE_CARD" initialSourceId="foreign-card" initialBankTransactions={[]} initialCardTransactions={[card]} initialRecords={[]} />);
    expect(screen.getByLabelText("미처리 법인카드 승인내역")).toHaveValue("");
    expect(screen.getByText(/연결하려던 거래를 선택할 수 없어/)).toBeInTheDocument();
  });
  it("opens temporary corporate-card entry when approval data has not arrived", () => {
    render(<QuickExpensePage initialPaymentMethod="CORPORATE_CARD" initialBankTransactions={[]} initialCardTransactions={[]} initialRecords={[]} />);
    expect(screen.getByLabelText("카드 사용금액")).toBeInTheDocument();
    expect(screen.getByText("등록된 미처리 법인카드 승인내역이 없습니다.")).toBeInTheDocument();
  });
});
