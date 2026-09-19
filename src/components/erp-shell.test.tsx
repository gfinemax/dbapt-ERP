import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErpShell } from "./erp-shell";

describe("ErpShell", () => {
  it("highlights the explicitly selected approval detail menu", () => {
    render(
      <ErpShell activeDetailLabel="새 기안" activeLabel="기안·결재">
        <p>새 기안 작성</p>
      </ErpShell>,
    );

    const detailMenu = screen.getByRole("navigation", {
      name: "기안·결재 상세 메뉴",
    });
    expect(
      within(detailMenu).getByRole("link", { name: "새 기안" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(detailMenu).getByRole("link", { name: "기안 목록" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("renders the grouped finance workflow in order and preserves workspace categories", () => {
    render(<ErpShell activeLabel="회계/자금"><p>본문</p></ErpShell>);
    const detailMenu = screen.getByRole("navigation", { name: "회계/자금 상세 메뉴" });
    expect(within(detailMenu).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "업무현황", "통합 결재함", "전체 지출", "지출 등록·신청", "선지급 사용정산",
      "월 운영비 요청·수령", "운영비 사용정산", "사업비 집행요청·현황", "조합 지급대기", "전체 지급내역",
      "분담금 수납관리", "환급관리", "수입·지출 전표관리", "계좌거래 매칭", "증빙자료 관리",
      "세금계산서·계산서", "예산집행 현황", "월 마감", "지출 처리 기준", "신탁 집행 기준", "운영 준비 점검",
    ]);
    expect(Array.from(detailMenu.querySelectorAll("p")).map((node) => node.textContent)).toEqual([
      "업무", "지출관리", "신탁 집행관리", "지급관리", "수납·환급", "회계·증빙", "예산·마감", "설정",
    ]);
    expect(within(detailMenu).getByRole("link", { name: "업무현황" })).toHaveAttribute("aria-current", "page");
    expect(within(detailMenu).getAllByRole("link").every((link) => link.getAttribute("href")?.startsWith("/"))).toBe(true);
    expect(within(screen.getByRole("navigation", { name: "회계/자금 업무 탭" })).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "기초정보", "전표·증빙관리", "입출금", "채권·채무", "예산·결산", "은행·카드", "인사·급여", "세무신고", "부가서비스", "보고서",
    ]);
    expect(screen.getByLabelText("사이드바")).toHaveClass("overflow-y-auto");
    fireEvent.click(screen.getByRole("button", { name: "전체 메뉴로 돌아가기" }));
    expect(within(screen.getByRole("navigation", { name: "전체 메뉴" })).getByRole("link", { name: "회계/자금" })).toHaveAttribute("href", "/finance/workspace");
  });

  it("opens a new expense resolution from the quick menu on every screen", () => {
    render(<ErpShell activeLabel="회계/자금"><p>본문</p></ErpShell>);
    expect(screen.getByRole("link", { name: "퀵메뉴 지출결의 작성" })).toHaveAttribute(
      "href",
      "/finance/expense-resolutions?start=advance",
    );
  });

  it.each([
    ["지출결의서 관리", "전체 지출"], ["지급대기", "조합 지급대기"], ["지급완료 내역", "전체 지급내역"],
    ["개인 지출 정산·월 마감", "지출 등록·신청"], ["지출 관리설정", "지출 처리 기준"],
  ])("preserves the active location for legacy page %s", (previous, current) => {
    render(<ErpShell activeLabel="회계/자금" activeDetailLabel={previous}><p>본문</p></ErpShell>);
    expect(within(screen.getByRole("navigation", { name: "회계/자금 상세 메뉴" })).getByRole("link", { name: current })).toHaveAttribute("aria-current", "page");
  });

  it("opens mobile navigation with current location and every workflow destination", () => {
    render(<ErpShell activeLabel="회계/자금" activeDetailLabel="지급대기"><p>본문</p></ErpShell>);
    const toggle = screen.getByRole("button", { name: "회계/자금 · 조합 지급대기 메뉴 열기" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("navigation", { name: "회계/자금 모바일 상세 메뉴" });
    expect(within(menu).getAllByRole("link")).toHaveLength(21);
    expect(within(menu).getByRole("link", { name: "조합 지급대기" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "신탁 집행 기준" })).toHaveAttribute("href", "/finance/workflow-settings");
    fireEvent.click(toggle);
    expect(screen.queryByRole("navigation", { name: "회계/자금 모바일 상세 메뉴" })).not.toBeInTheDocument();
  });

  it("renders basic info as a finance detail menu", () => {
    render(
      <ErpShell
        activeDetailLabel="거래처등록"
        activeLabel="회계/자금"
        activeWorkspaceLabel="기초정보"
      >
        <p>본문</p>
      </ErpShell>,
    );

    expect(
      screen.getByRole("button", { name: "전체 메뉴로 돌아가기" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Daebang ERP")).toBeInTheDocument();
    expect(screen.getByText("회계/자금")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기초정보" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "거래처등록" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("품목등록")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "은행통장 등록" })).toHaveAttribute(
      "href",
      "/basic-info?section=bank-accounts",
    );
    expect(screen.getByRole("link", { name: "신용카드 등록" })).toHaveAttribute(
      "href",
      "/basic-info?section=cards",
    );
    expect(screen.getByRole("link", { name: "계정과목 등록" })).toHaveAttribute(
      "href",
      "/basic-info?section=account-subjects",
    );
    expect(
      screen.queryByRole("link", { name: "수입·지출 전표관리" }),
    ).not.toBeInTheDocument();
  });

  it("renders reports as a finance detail menu", () => {
    render(
      <ErpShell
        activeDetailLabel="보고서 목록"
        activeLabel="회계/자금"
        activeWorkspaceLabel="보고서"
      >
        <p>본문</p>
      </ErpShell>,
    );

    expect(screen.getByRole("link", { name: "보고서" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "보고서 목록" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "보고서 목록" })).toHaveAttribute(
      "href",
      "/finance/reports",
    );
    expect(screen.getByRole("link", { name: "실적보고서" })).toHaveAttribute(
      "href",
      "/finance/reports?section=performance",
    );
    expect(
      screen.getByRole("link", { name: "자금입출금명세서" }),
    ).toHaveAttribute("href", "/finance/reports?section=cash-flow");
    expect(screen.getByRole("link", { name: "운영비 예산" })).toHaveAttribute(
      "href",
      "/finance/reports?section=budget",
    );
    expect(
      screen.queryByRole("link", { name: "수입·지출 전표관리" }),
    ).not.toBeInTheDocument();
  });

  it("does not render online inquiry in the extra services detail menu", () => {
    render(
      <ErpShell
        activeDetailLabel="도움말"
        activeLabel="회계/자금"
        activeWorkspaceLabel="부가서비스"
      >
        <p>본문</p>
      </ErpShell>,
    );

    expect(screen.getByRole("link", { name: "부가서비스" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByText("온라인문의")).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", { name: "회계/자금 상세 메뉴" }),
      ).getByRole("link", { name: "도움말" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("renders hr payroll as a finance detail menu", () => {
    render(
      <ErpShell
        activeDetailLabel="사원정보등록"
        activeLabel="회계/자금"
        activeWorkspaceLabel="인사·급여"
      >
        <p>본문</p>
      </ErpShell>,
    );

    expect(screen.getByRole("link", { name: "인사·급여" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "사원정보등록" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "사원정보등록" })).toHaveAttribute(
      "href",
      "/hr-payroll?section=employees",
    );
    expect(screen.getByRole("link", { name: "급여입력" })).toHaveAttribute(
      "href",
      "/hr-payroll?section=payroll-entry",
    );
    expect(screen.getByRole("link", { name: "급여대장" })).toHaveAttribute(
      "href",
      "/hr-payroll?section=payroll-ledger",
    );
    expect(screen.getByRole("link", { name: "급여명세" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "수입·지출 전표관리" }),
    ).not.toBeInTheDocument();
  });

  it("links bank transaction upload from the bank-card workspace", () => {
    render(
      <ErpShell
        activeDetailLabel="은행 거래내역"
        activeLabel="회계/자금"
        activeWorkspaceLabel="은행·카드"
      >
        <p>본문</p>
      </ErpShell>,
    );

    expect(screen.getByRole("link", { name: "은행·카드" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "은행 거래내역" })).toHaveAttribute(
      "href",
      "/finance/bank-transactions",
    );
    expect(screen.getByRole("link", { name: "은행 거래내역" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("collapses to an accessible icon rail without hiding navigation", () => {
    render(
      <ErpShell>
        <p>본문</p>
      </ErpShell>,
    );

    const closeButton = screen.getByRole("button", { name: "사이드바 닫기" });
    const sidebar = screen.getByLabelText("사이드바");

    expect(sidebar).toHaveClass("md:block");
    expect(sidebar).not.toHaveClass("xl:block");
    expect(closeButton).toHaveAttribute("aria-expanded", "true");
    expect(sidebar).toHaveClass("w-60");
    expect(closeButton).toHaveClass("md:flex");
    expect(closeButton).not.toHaveClass("xl:flex");
    expect(closeButton).toHaveClass("rounded-lg");

    fireEvent.click(closeButton);

    const openButton = screen.getByRole("button", { name: "사이드바 열기" });
    expect(openButton).toHaveAttribute("aria-expanded", "false");
    expect(sidebar).toHaveClass("w-16");
    expect(within(screen.getByRole("navigation", { name: "축소된 전체 메뉴" })).getByRole("link", { name: "회계/자금" })).toHaveAttribute("href", "/finance/workspace");
    fireEvent.click(openButton);
    expect(screen.queryByRole("navigation", { name: "축소된 전체 메뉴" })).not.toBeInTheDocument();
    expect(sidebar).toHaveClass("w-60");
  });
});
