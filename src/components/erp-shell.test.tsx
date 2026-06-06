import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErpShell } from "./erp-shell";

describe("ErpShell", () => {
  it("renders module detail sidebar for finance and can return to the full menu", () => {
    render(
      <ErpShell activeLabel="회계/자금">
        <p>본문</p>
      </ErpShell>,
    );

    expect(screen.getByRole("button", { name: "전체 메뉴" })).toBeInTheDocument();
    expect(screen.getByText("회계/자금")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "회계/자금 업무 탭" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기초정보" })).toHaveAttribute("href", "/basic-info");
    expect(screen.getByRole("link", { name: "거래전표증빙문서" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "은행/카드" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "인사/급여" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "세무신고" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "부가서비스" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "거래처등록" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "매입매출거래입력" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("매입매출거래입력")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "일반대체전표입력" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "세금계산서/계산서" })).toBeInTheDocument();
    expect(screen.getByText("퀵메뉴")).toBeInTheDocument();
    expect(screen.getByText("분담금 입금처리")).toBeInTheDocument();
    expect(screen.getByText("온라인문의")).toBeInTheDocument();
    expect(screen.getByText("도움말")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "전체 메뉴" }));

    expect(screen.getByRole("navigation", { name: "전체 메뉴" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "대시보드" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "조합원" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "회계/자금" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "전체 메뉴" })).queryByRole("link", { name: "기초정보" })).not.toBeInTheDocument();
  });

  it("renders basic info as a finance detail menu", () => {
    render(
      <ErpShell activeDetailLabel="거래처등록" activeLabel="회계/자금" activeWorkspaceLabel="기초정보">
        <p>본문</p>
      </ErpShell>,
    );

    expect(screen.getByRole("button", { name: "전체 메뉴" })).toBeInTheDocument();
    expect(screen.getByText("회계/자금")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기초정보" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "거래처등록" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("품목등록")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "은행통장 등록" })).toHaveAttribute("href", "/basic-info?section=bank-accounts");
    expect(screen.getByRole("link", { name: "신용카드 등록" })).toHaveAttribute("href", "/basic-info?section=cards");
    expect(screen.queryByRole("link", { name: "매입매출거래입력" })).not.toBeInTheDocument();
  });

  it("renders a vertical sidebar toggle tab and switches labels when clicked", () => {
    render(
      <ErpShell>
        <p>본문</p>
      </ErpShell>,
    );

    const closeButton = screen.getByRole("button", { name: "사이드바 닫기" });
    const sidebar = screen.getByLabelText("사이드바");

    expect(sidebar).toHaveClass("md:block");
    expect(sidebar).not.toHaveClass("xl:block");
    expect(closeButton).toHaveTextContent("닫기");
    expect(closeButton).toHaveClass("w-9");
    expect(closeButton).toHaveClass("md:flex");
    expect(closeButton).not.toHaveClass("xl:flex");
    expect(closeButton).toHaveClass("rounded-r-md");

    fireEvent.click(closeButton);

    const openButton = screen.getByRole("button", { name: "사이드바 열기" });
    const openLabel = within(openButton).getByText("메").parentElement;

    expect(openButton).toHaveTextContent("메뉴");
    expect(openLabel).toHaveClass("gap-1.5");
  });
});
