import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExpenseEntryPage } from "./expense-entry-page";

describe("expense entry routing guide", () => {
  it("starts from payment timing and asks for the money source only after payment", () => {
    render(<ExpenseEntryPage staff />);

    expect(
      screen.getByRole("button", { name: /이미 결제했어요/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("heading", { name: "누구의 돈으로 결제했나요?" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "법인카드" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /조합 돈/ }));

    const paidRoute = screen.getByRole("region", {
      name: "누구의 돈으로 결제했나요?",
    });
    expect(within(paidRoute).getByRole("link", { name: "법인카드" })).toHaveAttribute(
      "href",
      "/finance/quick-expenses?method=corporate-card",
    );
    expect(
      within(paidRoute).getByRole("link", { name: "조합 계좌이체" }),
    ).toHaveAttribute("href", "/finance/quick-expenses?method=bank-transfer");
    expect(within(paidRoute).getByRole("link", { name: "자동이체" })).toHaveAttribute(
      "href",
      "/finance/quick-expenses?method=auto-debit",
    );
    expect(within(paidRoute).getByRole("link", { name: "조합 현금" })).toHaveAttribute(
      "href",
      "/finance/quick-expenses?method=cash",
    );
  });

  it("routes personal money to reimbursement without showing quick-expense methods", () => {
    render(<ExpenseEntryPage staff />);

    fireEvent.click(screen.getByRole("button", { name: /개인 돈/ }));

    expect(
      screen.getByRole("link", { name: "개인 선지출 정산 신청" }),
    ).toHaveAttribute("href", "/finance/reimbursements");
    expect(screen.queryByRole("link", { name: "법인카드" })).not.toBeInTheDocument();
    expect(screen.getByText(/간편지출에 중복 등록하지 않고/)).toBeInTheDocument();
  });

  it("keeps the rare before-payment route separate from actual expense records", () => {
    render(<ExpenseEntryPage staff />);

    fireEvent.click(
      screen.getByRole("button", { name: /아직 결제 전 · 지급 요청/ }),
    );

    expect(
      screen.getByRole("heading", { name: "먼저 승인받거나 지급을 요청해" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "사전 지출결의 작성" }),
    ).toHaveAttribute("href", "/finance/expense-resolutions?start=advance");
    expect(
      screen.getByRole("link", { name: "사업비 집행요청 열기" }),
    ).toHaveAttribute("href", "/finance/trust?view=business");
    expect(screen.getByText(/간편지출 원본을 만들지 않아/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /조합 돈/ })).not.toBeInTheDocument();
  });

  it("opens the advance settlement path without mixing it with reimbursement", () => {
    render(<ExpenseEntryPage staff />);

    fireEvent.click(
      screen.getByRole("button", { name: /선지급금을 사용했어요/ }),
    );

    expect(
      screen.getByRole("link", { name: "선지급 사용정산 열기" }),
    ).toHaveAttribute("href", "/finance/advance-settlements");
    expect(
      screen.queryByRole("link", { name: "개인 선지출 정산 신청" }),
    ).not.toBeInTheDocument();
  });

  it("shows a non-staff user only the personal reimbursement route", () => {
    render(<ExpenseEntryPage staff={false} />);

    expect(
      screen.getByRole("link", { name: "개인 선지출 정산 신청" }),
    ).toHaveAttribute("href", "/finance/reimbursements");
    expect(
      screen.queryByRole("button", { name: /아직 결제 전 · 지급 요청/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /선지급금을 사용했어요/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /조합 돈/ })).not.toBeInTheDocument();
  });
});
