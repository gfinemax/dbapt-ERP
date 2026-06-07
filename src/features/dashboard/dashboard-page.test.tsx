import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardPage } from "./dashboard-page";

describe("DashboardPage", () => {
  it("renders the ERP shell and first dashboard modules", () => {
    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: "대방동 지역주택조합 ERP" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("조합원관리").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "회계/자금" })).toBeInTheDocument();
    expect(screen.getByText("총회관리")).toBeInTheDocument();
    expect(screen.getAllByText("연동 상태").length).toBeGreaterThan(0);
  });

  it("renders the cash flow and voucher processing widget with period settings", () => {
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "자금 입출금 및 전표처리 현황" })).toBeInTheDocument();
    expect(screen.getByText("조회기준일시 : 2026/06/07 11:13:03")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "월별" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("조합원 분담금")).toBeInTheDocument();
    expect(screen.getByText("증빙누락 2건")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "보고서" })).not.toBeInTheDocument();
    expect(screen.queryByText("실적보고서")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "입출식예금 잔액" })).toBeInTheDocument();
    expect(screen.getAllByText("1,436,936원")).toHaveLength(2);
    expect(screen.getByText("신협")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "조회기간 설정" }));

    expect(screen.getByRole("dialog", { name: "조회기간 설정" })).toBeInTheDocument();
    expect(screen.getByText("2026년 01월 01일 ~ 2026년 12월 31일")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1년" })).toHaveClass("bg-[var(--color-deep-cobalt)]");
    expect(within(screen.getByRole("dialog", { name: "조회기간 설정" })).getByLabelText("은행/카드 거래내역")).toBeChecked();
  });

  it("uses compact typography in the cash flow widget", () => {
    render(<DashboardPage />);

    expect(screen.getByText("2026.06.07", { exact: false })).toHaveClass("text-xl");
    expect(screen.getByRole("heading", { name: "자금 입출금 및 전표처리 현황" })).toHaveClass("text-lg");
    expect(screen.getByText("조회기준일시 : 2026/06/07 11:13:03").parentElement).toHaveClass("text-xs");
    expect(screen.getByRole("heading", { name: "수입" })).toHaveClass("text-sm");
    expect(screen.getByText("증빙누락 2건").parentElement).toHaveClass("text-xs");
  });
});
