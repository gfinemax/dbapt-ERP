import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseEntryPage } from "./expense-entry-page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

describe("expense entry workspace", () => {
  beforeEach(() => replace.mockReset());

  it("starts with payment timing and opens organization payment methods", () => {
    render(<ExpenseEntryPage activeFlow="" staff />);

    expect(screen.getByRole("button", { name: /이미 결제했어요/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "누구의 돈으로 결제했나요?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /조합 돈/ }));

    expect(replace).toHaveBeenCalledWith("/finance/expense-entry?flow=organization", { scroll: false });
    const paidRoute = screen.getByRole("region", { name: "누구의 돈으로 결제했나요?" });
    for (const label of ["법인카드", "조합 계좌이체", "자동이체", "조합 현금"]) {
      expect(within(paidRoute).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("loads an organization form inline after choosing its payment method", () => {
    render(<ExpenseEntryPage activeFlow="organization" activeMethod="corporate-card" staff><div>실제 간편지출 입력 폼</div></ExpenseEntryPage>);

    expect(screen.getByRole("button", { name: "법인카드" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("결제 완료 → 조합 돈 → 법인카드")).toBeInTheDocument();
    expect(screen.getByText("실제 간편지출 입력 폼")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "자동이체" }));
    expect(replace).toHaveBeenCalledWith("/finance/expense-entry?flow=organization&method=auto-debit", { scroll: false });
  });

  it("loads personal reimbursement inline without quick-expense methods", () => {
    render(<ExpenseEntryPage activeFlow="personal" staff><div>실제 개인 정산 신청 폼</div></ExpenseEntryPage>);

    expect(screen.getByText("결제 완료 → 개인 돈 → 개인 선지출 정산")).toBeInTheDocument();
    expect(screen.getByText("실제 개인 정산 신청 폼")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "법인카드" })).not.toBeInTheDocument();
    expect(screen.getByText(/간편지출에 중복 등록하지 않고/)).toBeInTheDocument();
  });

  it("keeps the rare before-payment route separate from actual expense records", () => {
    render(<ExpenseEntryPage activeFlow="" staff />);
    fireEvent.click(screen.getByRole("button", { name: /아직 결제 전 · 지급 요청/ }));

    expect(replace).toHaveBeenCalledWith("/finance/expense-entry?flow=before", { scroll: false });
    expect(screen.getByRole("link", { name: "사전 지출결의 작성" })).toHaveAttribute("href", "/finance/expense-resolutions?start=advance");
    expect(screen.getByRole("link", { name: "사업비 집행요청 열기" })).toHaveAttribute("href", "/finance/trust?view=business");
    expect(screen.getByText(/간편지출 원본을 만들지 않아/)).toBeInTheDocument();
  });

  it("keeps advance settlement separate", () => {
    render(<ExpenseEntryPage activeFlow="" staff />);
    fireEvent.click(screen.getByRole("button", { name: /선지급금을 사용했어요/ }));

    expect(replace).toHaveBeenCalledWith("/finance/expense-entry?flow=advance", { scroll: false });
    expect(screen.getByRole("link", { name: "선지급 사용정산 열기" })).toHaveAttribute("href", "/finance/advance-settlements");
  });

  it("shows a non-staff user the inline personal route only", () => {
    render(<ExpenseEntryPage activeFlow="personal" staff={false}><div>개인 정산 폼</div></ExpenseEntryPage>);

    expect(screen.getByText("개인 정산 폼")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /아직 결제 전 · 지급 요청/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /선지급금을 사용했어요/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /조합 돈/ })).not.toBeInTheDocument();
  });
});
