import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataCleanupPage } from "./data-cleanup-page";

const workspace = { truncated: false, items: [
  { id: "CARD_LINK:QUICK:q1", category: "CARD_LINK" as const, sourceKind: "QUICK", sourceId: "q1", title: "페인트 용품", detail: "철물점", amount: 20000, date: "2026-09-01", href: "/cards", actionLabel: "카드내역 연결" },
  { id: "BUDGET:QUICK:q2", category: "BUDGET" as const, sourceKind: "QUICK", sourceId: "q2", title: "우편 발송", detail: "귀속월 미지정", amount: 40000, date: null, href: "/budgets", actionLabel: "예산 귀속 확인" },
] };

describe("DataCleanupPage", () => {
  it("filters preserved originals by reason and search", () => {
    render(<DataCleanupPage workspace={workspace} />);
    expect(screen.getByText("조회 결과 2건")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "예산 귀속 1" }));
    expect(screen.getByText("조회 결과 1건")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "예산 귀속 확인 →" })).toHaveAttribute("href", "/budgets");
    expect(screen.queryByText("페인트 용품")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 2" }));
    fireEvent.change(screen.getByRole("textbox", { name: "원본 검색" }), { target: { value: "철물점" } });
    expect(screen.getByText("조회 결과 1건")).toBeInTheDocument();
  });
});
