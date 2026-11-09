import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ badges: vi.fn() }));
vi.mock("@/app/finance/navigation/actions", () => ({ loadFinanceNavigationBadgesAction: navigation.badges }));

import { ErpShell } from "./erp-shell";

describe("ErpShell", () => {
  beforeEach(() => navigation.badges.mockReset().mockResolvedValue({}));

  it("links the logged-out user label to the ERP login screen", () => {
    render(<ErpShell><p>로그인 전 화면</p></ErpShell>);
    expect(screen.getByRole("link", { name: "로그인 필요" })).toHaveAttribute("href", "/");
  });

  it("highlights the explicitly selected approval detail menu", () => {
    render(<ErpShell activeDetailLabel="새 기안" activeLabel="기안·결재"><p>새 기안 작성</p></ErpShell>);
    const detailMenu = screen.getByRole("navigation", { name: "기안·결재 상세 메뉴" });
    expect(within(detailMenu).getByRole("link", { name: "새 기안" })).toHaveAttribute("aria-current", "page");
    expect(navigation.badges).not.toHaveBeenCalled();
  });

  it("orders finance workspaces by task priority and separates their sections", () => {
    render(<ErpShell activeLabel="회계·자금"><p>본문</p></ErpShell>);
    const workspaceNavigation = screen.getByRole("navigation", { name: "회계·자금 업무 영역" });
    expect(within(workspaceNavigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "업무 홈", "수납·지급", "거래·대사", "전표·증빙", "예산·결산", "보고서·공시",
      "채권·채무", "인사·급여", "세무 자료", "기준정보", "연동·설정",
    ]);
    ["오늘 할 일", "핵심 회계 업무", "전문 업무", "관리"].forEach((label) => {
      expect(within(workspaceNavigation).getByText(label)).toBeInTheDocument();
    });
    expect(within(workspaceNavigation).getByRole("link", { name: "업무 홈" })).toHaveAttribute("aria-current", "page");
    const detailMenu = screen.getByRole("navigation", { name: "회계·자금 상세 메뉴" });
    expect(within(detailMenu).getAllByRole("link").map((link) => link.textContent)).toEqual(["업무현황", "통합 결재함"]);
    expect(within(detailMenu).getByRole("link", { name: "업무현황" })).toHaveAttribute("aria-current", "page");
  });

  it("routes every finance workspace to an implemented destination", () => {
    render(<ErpShell activeLabel="회계·자금"><p>본문</p></ErpShell>);
    const menu = screen.getByRole("navigation", { name: "회계·자금 업무 영역" });
    const expectedRoutes = {
      "업무 홈": "/finance/workspace",
      "수납·지급": "/finance?workspace=cash",
      "거래·대사": "/finance/bank-transactions",
      "전표·증빙": "/finance",
      "예산·결산": "/finance?workspace=budget",
      "보고서·공시": "/finance/reports",
      "채권·채무": "/finance?workspace=receivables",
      "인사·급여": "/hr-payroll",
      "세무 자료": "/finance?workspace=tax",
      "기준정보": "/basic-info",
      "연동·설정": "/finance?workspace=settings",
    };
    Object.entries(expectedRoutes).forEach(([label, href]) => {
      expect(within(menu).getByRole("link", { name: label })).toHaveAttribute("href", href);
    });
    expect(within(menu).queryByRole("link", { name: "부가서비스" })).not.toBeInTheDocument();
  });

  it.each([
    ["수납·지급", "분담금 수납관리", "/finance/collections"],
    ["거래·대사", "미매칭 거래 검토", "/finance/bank-unmatched"],
    ["전표·증빙", "수입·지출 전표관리", "/finance"],
    ["예산·결산", "월 마감", "/finance/month-close"],
    ["보고서·공시", "보고서 현황", "/finance/reports"],
    ["기준정보", "은행계좌 관리", "/basic-info?section=bank-accounts"],
    ["연동·설정", "은행 거래 업로드", "/finance/bank-transactions/upload"],
    ["연동·설정", "시스템 속도", "/finance/performance"],
  ])("renders %s with its own focused detail menu", (workspace, detail, href) => {
    render(<ErpShell activeLabel="회계·자금" activeWorkspaceLabel={workspace} activeDetailLabel={detail}><p>본문</p></ErpShell>);
    expect(screen.getByRole("link", { name: workspace })).toHaveAttribute("aria-current", "page");
    const detailMenu = screen.getByRole("navigation", { name: "회계·자금 상세 메뉴" });
    expect(within(detailMenu).getByRole("link", { name: detail })).toHaveAttribute("href", href);
    expect(within(detailMenu).getByRole("link", { name: detail })).toHaveAttribute("aria-current", "page");
  });

  it("keeps old page labels mapped to the new workspace and detail names", () => {
    render(<ErpShell activeLabel="회계/자금" activeWorkspaceLabel="통합 거래관리" activeDetailLabel="계좌 연동 설정"><p>본문</p></ErpShell>);
    expect(screen.getByRole("link", { name: "연동·설정" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "은행계좌 연동" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("회계·자금")).toBeInTheDocument();
  });

  it("opens mobile navigation with the current focused workspace", () => {
    render(<ErpShell activeLabel="회계·자금" activeWorkspaceLabel="수납·지급" activeDetailLabel="조합 지급대기"><p>본문</p></ErpShell>);
    const toggle = screen.getByRole("button", { name: "회계·자금 · 조합 지급대기 메뉴 열기" });
    fireEvent.click(toggle);
    const menu = screen.getByRole("navigation", { name: "회계·자금 모바일 상세 메뉴" });
    expect(within(menu).getByRole("link", { name: "조합 지급대기" })).toHaveAttribute("aria-current", "page");
    const workspaceMenus = screen.getAllByRole("navigation", { name: "회계·자금 업무 영역" });
    expect(within(workspaceMenus[1]).getByRole("link", { name: "수납·지급" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(toggle);
    expect(screen.queryByRole("navigation", { name: "회계·자금 모바일 상세 메뉴" })).not.toBeInTheDocument();
  });

  it("shows actionable queue badges on both workspace and detail links", async () => {
    navigation.badges.mockResolvedValue({ "전체 지출": 3, "지출 등록·신청": 2, "증빙자료 관리": 1 });
    render(<ErpShell activeLabel="회계·자금" activeWorkspaceLabel="전표·증빙" activeDetailLabel="전체 지출"><p>본문</p></ErpShell>);
    expect(await screen.findByLabelText("전표·증빙 대기 6건")).toHaveTextContent("6");
    const detailMenu = screen.getByRole("navigation", { name: "회계·자금 상세 메뉴" });
    expect(within(detailMenu).getByLabelText("전체 지출 대기 3건")).toHaveTextContent("3");
    await waitFor(() => expect(navigation.badges).toHaveBeenCalledTimes(1));
  });

  it("opens a new expense resolution from the quick menu", () => {
    render(<ErpShell activeLabel="회계·자금"><p>본문</p></ErpShell>);
    fireEvent.click(screen.getByRole("button", { name: "퀵메뉴 펼치기" }));
    expect(screen.getByRole("link", { name: "퀵메뉴 지출결의 작성" })).toHaveAttribute("href", "/finance/expense-entry?flow=before");
  });

  it("collapses to an accessible icon rail without hiding finance navigation", () => {
    render(<ErpShell activeLabel="회계·자금"><p>본문</p></ErpShell>);
    fireEvent.click(screen.getByRole("button", { name: "사이드바 닫기" }));
    const rail = screen.getByRole("navigation", { name: "축소된 전체 메뉴" });
    expect(within(rail).getByRole("link", { name: "회계·자금" })).toHaveAttribute("href", "/finance/workspace");
    expect(within(rail).getByRole("link", { name: "회계·자금" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "사이드바 열기" }));
    expect(screen.queryByRole("navigation", { name: "축소된 전체 메뉴" })).not.toBeInTheDocument();
  });
});
