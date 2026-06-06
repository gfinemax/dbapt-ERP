import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceDetailPage } from "./finance-detail-page";

describe("FinanceDetailPage", () => {
  it("renders transaction detail with approval, evidence, and integration context", () => {
    render(<FinanceDetailPage transactionId="finance-0411" />);

    expect(screen.getByRole("heading", { name: "토지계약금 / JV-2026-0411" })).toBeInTheDocument();
    expect(screen.getByText("승인 흐름")).toBeInTheDocument();
    expect(screen.getByText("요청")).toBeInTheDocument();
    expect(screen.getByText("검토")).toBeInTheDocument();
    expect(screen.getByText("승인")).toBeInTheDocument();
    expect(screen.getByText("지급완료")).toBeInTheDocument();
    expect(screen.getByText("증빙")).toBeInTheDocument();
    expect(screen.getByText("은행/카드 매칭")).toBeInTheDocument();
  });
});
