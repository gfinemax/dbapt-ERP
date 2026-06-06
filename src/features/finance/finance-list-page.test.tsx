import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceListPage } from "./finance-list-page";

describe("FinanceListPage", () => {
  it("renders the finance and fund management workflow", () => {
    render(<FinanceListPage />);

    expect(screen.getByRole("heading", { name: "회계/자금 관리" })).toBeInTheDocument();
    expect(screen.getByText("입출금 전표")).toBeInTheDocument();
    expect(screen.getByText("계정과목")).toBeInTheDocument();
    expect(screen.getByText("은행/카드 연동")).toBeInTheDocument();
    expect(screen.getAllByText("국민은행 신탁계좌").length).toBeGreaterThan(0);
    expect(screen.getByText("조합원 분담금")).toBeInTheDocument();
    expect(screen.getByText("토지계약금")).toBeInTheDocument();
  });
});
