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

    expect(screen.getByRole("button", { name: "전체 메뉴로 돌아가기" })).toBeInTheDocument();
    expect(screen.getByText("Daebang ERP")).toBeInTheDocument();
    expect(screen.getByText("지역주택조합 통합관리")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체 메뉴" })).not.toBeInTheDocument();
    expect(screen.getByText("회계/자금")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "회계/자금 업무 탭" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "회계/자금 업무 탭" })).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "기초정보",
      "전표·증빙관리",
      "입출금",
      "채권·채무",
      "예산·결산",
      "은행·카드",
      "인사·급여",
      "세무신고",
      "부가서비스",
      "보고서",
    ]);
    expect(screen.getByRole("link", { name: "기초정보" })).toHaveAttribute("href", "/basic-info");
    expect(screen.getByRole("link", { name: "전표·증빙관리" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "채권·채무" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "예산·결산" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "은행·카드" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "인사·급여" })).toHaveAttribute("href", "/hr-payroll");
    expect(screen.getByRole("link", { name: "세무신고" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "부가서비스" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "보고서" })).toHaveAttribute("href", "/finance/reports");
    expect(screen.queryByRole("link", { name: "거래처등록" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "회계/자금 상세 메뉴" })).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "수입·지출 전표관리",
      "지출결의서 관리",
      "결재함",
      "지급대기",
      "지급완료 내역",
      "분담금 수납관리",
      "환불금 지급관리",
      "증빙자료 관리",
      "세금계산서·계산서",
      "계좌거래 매칭",
      "예산집행 현황",
    ]);
    expect(screen.getByRole("link", { name: "수입·지출 전표관리" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("수입·지출 전표관리")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "지출결의서 관리" })).toHaveAttribute("href", "/finance/expense-resolutions");
    expect(screen.getByRole("link", { name: "결재함" })).toHaveAttribute("href", "/finance/approval-inbox");
    expect(screen.getByRole("link", { name: "지급대기" })).toHaveAttribute("href", "/finance/payment-waiting");
    expect(screen.getByRole("link", { name: "지급완료 내역" })).toHaveAttribute("href", "/finance/payment-completed");
    expect(screen.getByRole("link", { name: "분담금 수납관리" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "환불금 지급관리" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "세금계산서·계산서" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "계좌거래 매칭" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "예산집행 현황" })).toBeInTheDocument();
    expect(screen.getByText("퀵메뉴")).toBeInTheDocument();
    expect(screen.getByText("분담금 수납처리")).toBeInTheDocument();
    expect(screen.getByText("은행거래 업로드")).toBeInTheDocument();
    expect(screen.getByText("지출결의 작성")).toBeInTheDocument();
    expect(screen.getAllByText("지급대기").length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.getAttribute("aria-label")?.startsWith("퀵메뉴 "))
        .map((button) => button.textContent),
    ).toEqual(["조합원 등록", "분담금 수납처리", "은행거래 업로드", "카드내역", "지출결의 작성", "지급대기", "증빙 미첨부", "미납 조합원"]);
    expect(screen.queryByText("온라인문의")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "매입매출거래입력" })).not.toBeInTheDocument();
    expect(screen.queryByText("거래전표증빙문서")).not.toBeInTheDocument();
    expect(screen.queryByText("분담금 입금처리")).not.toBeInTheDocument();
    expect(screen.getByText("도움말")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "전체 메뉴로 돌아가기" }));

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

    expect(screen.getByRole("button", { name: "전체 메뉴로 돌아가기" })).toBeInTheDocument();
    expect(screen.getByText("Daebang ERP")).toBeInTheDocument();
    expect(screen.getByText("회계/자금")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기초정보" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "거래처등록" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("품목등록")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "은행통장 등록" })).toHaveAttribute("href", "/basic-info?section=bank-accounts");
    expect(screen.getByRole("link", { name: "신용카드 등록" })).toHaveAttribute("href", "/basic-info?section=cards");
    expect(screen.getByRole("link", { name: "계정과목 등록" })).toHaveAttribute("href", "/basic-info?section=account-subjects");
    expect(screen.queryByRole("link", { name: "수입·지출 전표관리" })).not.toBeInTheDocument();
  });

  it("renders reports as a finance detail menu", () => {
    render(
      <ErpShell activeDetailLabel="보고서 목록" activeLabel="회계/자금" activeWorkspaceLabel="보고서">
        <p>본문</p>
      </ErpShell>,
    );

    expect(screen.getByRole("link", { name: "보고서" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "보고서 목록" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "보고서 목록" })).toHaveAttribute("href", "/finance/reports");
    expect(screen.getByRole("link", { name: "실적보고서" })).toHaveAttribute("href", "/finance/reports?section=performance");
    expect(screen.getByRole("link", { name: "자금입출금명세서" })).toHaveAttribute("href", "/finance/reports?section=cash-flow");
    expect(screen.getByRole("link", { name: "운영비 예산" })).toHaveAttribute("href", "/finance/reports?section=budget");
    expect(screen.queryByRole("link", { name: "수입·지출 전표관리" })).not.toBeInTheDocument();
  });

  it("does not render online inquiry in the extra services detail menu", () => {
    render(
      <ErpShell activeDetailLabel="도움말" activeLabel="회계/자금" activeWorkspaceLabel="부가서비스">
        <p>본문</p>
      </ErpShell>,
    );

    expect(screen.getByRole("link", { name: "부가서비스" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("온라인문의")).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "회계/자금 상세 메뉴" })).getByRole("link", { name: "도움말" })).toHaveAttribute("aria-current", "page");
  });

  it("renders hr payroll as a finance detail menu", () => {
    render(
      <ErpShell activeDetailLabel="사원정보등록" activeLabel="회계/자금" activeWorkspaceLabel="인사·급여">
        <p>본문</p>
      </ErpShell>,
    );

    expect(screen.getByRole("link", { name: "인사·급여" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "사원정보등록" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "사원정보등록" })).toHaveAttribute("href", "/hr-payroll?section=employees");
    expect(screen.getByRole("link", { name: "급여입력" })).toHaveAttribute("href", "/hr-payroll?section=payroll-entry");
    expect(screen.getByRole("link", { name: "급여대장" })).toHaveAttribute("href", "/hr-payroll?section=payroll-ledger");
    expect(screen.getByRole("link", { name: "급여명세" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "수입·지출 전표관리" })).not.toBeInTheDocument();
  });

  it("links bank transaction upload from the bank-card workspace", () => {
    render(
      <ErpShell activeDetailLabel="은행 거래내역" activeLabel="회계/자금" activeWorkspaceLabel="은행·카드">
        <p>본문</p>
      </ErpShell>,
    );

    expect(screen.getByRole("link", { name: "은행·카드" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "은행 거래내역" })).toHaveAttribute("href", "/finance/bank-transactions");
    expect(screen.getByRole("link", { name: "은행 거래내역" })).toHaveAttribute("aria-current", "page");
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
