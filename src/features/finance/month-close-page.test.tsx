import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthClosePage } from "./month-close-page";

describe("integrated month close review", () => {
  it("shows cross-ledger blockers without claiming that money totals equal row counts", () => {
    render(<MonthClosePage workspace={{ month: "2026-09-01", period_status: "OPEN", ready: false, checks: [{ key: "bank", label: "미연결 계좌거래", count: 2, href: "/finance/bank-transactions", blocking: true }] }} />);
    expect(screen.getByRole("heading", { name: "마감 전 처리 필요" })).toBeInTheDocument();
    expect(screen.getByText("2건의 원본을 확인해야 해.")).toBeInTheDocument();
    expect(screen.getByText(/건수는 금액 합계가 아니라/)).toBeInTheDocument();
  });
  it("keeps the accounting lock unavailable until policy is confirmed", () => {
    render(<MonthClosePage workspace={{ month: "2026-09-01", period_status: "CLOSED", ready: true, checks: [] }} />);
    expect(screen.queryByRole("button", { name: /마감 확정|재개방/ })).not.toBeInTheDocument();
    expect(screen.getByText(/회계기간 잠금은 조합의 확정된 회계정책/)).toBeInTheDocument();
  });
});
