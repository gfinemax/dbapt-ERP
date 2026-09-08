import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceWorkspacePage } from "./finance-workspace-page";
import type { FinanceTaskWorkspace } from "./finance-workspace-domain";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const fixture = (): FinanceTaskWorkspace => ({ staff: true, unavailable: [], tasks: [
  { id: "one", kind: "PAYABLE", title: "용역 지급", detail: "실제 승인 300원", href: "/finance/payments?tab=READY&q=test" },
  { id: "two", kind: "APPROVAL", title: "사무용품 승인", detail: "원본 승인대기", href: "/finance/expenses?source_kind=RESOLUTION&source_id=two" },
] });
beforeEach(() => { refresh.mockClear(); window.history.replaceState(null, "", "/finance/workspace"); });
describe("finance task dashboard", () => {
  it("filters card counts and actual list together, preserves a link and resets", () => {
    render(<FinanceWorkspacePage workspace={fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "지급 가능 1건" }));
    expect(screen.getByRole("button", { name: "지급 가능 1건" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("조회된 업무 중 1건")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "사무용품 승인" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "용역 지급" })).toHaveAttribute("href", "/finance/payments?tab=READY&q=test");
    expect(window.location.search).toBe("?task=PAYABLE");
    fireEvent.change(screen.getByLabelText("업무 검색"), { target: { value: "없는 업무" } });
    expect(screen.getByText("조회된 업무 중 0건")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 보기·검색 초기화" }));
    expect(screen.getByText("조회된 업무 중 2건")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });
  it("shows failed sections as unavailable, never zero or global empty", () => {
    const data = fixture(); data.unavailable = [{ kind: "ACCOUNTING_REVIEW", message: "다시 조회" }];
    render(<FinanceWorkspacePage workspace={data} />);
    expect(screen.getByRole("button", { name: "회계 초안 검토 조회 실패" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("다시 조회");
    expect(screen.getByRole("link", { name: "용역 지급" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "최신 자료 새로고침" }));
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("normal employee only sees their applicable task categories", () => {
    render(<FinanceWorkspacePage workspace={{ staff: false, tasks: [], unavailable: [] }} />);
    const section = within(screen.getByRole("region", { name: "처리할 업무" }));
    expect(section.getAllByRole("button")).toHaveLength(3);
    expect(section.queryByRole("button", { name: /회계/ })).not.toBeInTheDocument();
    expect(screen.getByText(/본인이 신청한 개인 대납 정산과/)).toBeInTheDocument();
  });
});
