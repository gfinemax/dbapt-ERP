import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceDetailPage } from "./finance-detail-page";

describe("FinanceDetailPage", () => {
  it("renders transaction detail with approval, evidence, and integration context", () => {
    render(<FinanceDetailPage transactionId="finance-0411" />);

    expect(screen.getByRole("heading", { name: "토지매입비 / 지출-2026-0001" })).toBeInTheDocument();
    expect(screen.getByText("승인 흐름")).toBeInTheDocument();
    expect(screen.getByText("작성중")).toBeInTheDocument();
    expect(screen.getByText("승인대기")).toBeInTheDocument();
    expect(screen.getByText("승인완료")).toBeInTheDocument();
    expect(screen.getAllByText("지급대기").length).toBeGreaterThan(0);
    expect(screen.getByText("지급완료")).toBeInTheDocument();
    expect(screen.getByText("지출전표 생성")).toBeInTheDocument();
    expect(screen.getByText("증빙")).toBeInTheDocument();
    expect(screen.getByText("은행·카드 매칭")).toBeInTheDocument();
  });
});
