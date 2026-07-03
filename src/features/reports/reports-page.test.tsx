import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportsPage } from "./reports-page";

describe("ReportsPage", () => {
  it("renders a managed report list with automatic generation and publication status", () => {
    render(<ReportsPage initialSection="overview" />);

    expect(screen.getByText("회계/자금 > 보고서 > 보고서 목록")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "보고서 목록" })).toBeInTheDocument();
    expect(screen.getByText("분기 종료 다음 달 1일")).toBeInTheDocument();
    expect(screen.getByText("대상월 다음 달 1일")).toBeInTheDocument();
    expect(screen.getAllByText("홈페이지/정보몽땅 공개").length).toBeGreaterThanOrEqual(1);

    const reportTable = screen.getByRole("table", { name: "자동 생성 보고서 목록" });
    expect(within(reportTable).getByRole("columnheader", { name: "생성예정일" })).toHaveClass("text-center");
    expect(within(reportTable).getByText("2026년 1분기 실적보고서")).toBeInTheDocument();
    expect(within(reportTable).getAllByText("2026-04-01")).toHaveLength(2);
    expect(within(reportTable).getAllByText("수정필요")).toHaveLength(2);
    expect(within(reportTable).getAllByText("v2")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "재생성" })).toHaveLength(2);
  });

  it("opens printable statutory fund report documents from the report overview", () => {
    render(<ReportsPage initialSection="overview" />);

    fireEvent.click(screen.getByRole("button", { name: "월별 자금 입출금 명세서 출력" }));
    let dialog = screen.getByRole("dialog", { name: "월별 자금 입출금 명세서" });
    expect(within(dialog).getByRole("heading", { name: "2026년 3월 월별 자금 입출금 명세서" })).toBeInTheDocument();
    expect(within(dialog).getAllByText("당월 수입 합계").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("20,728,000원").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("운영비 세부내역")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "브라우저 프린트" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));

    fireEvent.click(screen.getByRole("button", { name: "연간 자금운용 계획서 출력" }));
    dialog = screen.getByRole("dialog", { name: "연간 자금운용 계획서" });
    expect(within(dialog).getByRole("heading", { name: "2026년 연간 자금운용 계획서" })).toBeInTheDocument();
    expect(within(dialog).getByText("자금수입 계획")).toBeInTheDocument();
    expect(within(dialog).getByText("조합원 분담금")).toBeInTheDocument();
    expect(within(dialog).getByText("토지매입비")).toBeInTheDocument();
    expect(within(dialog).getByText("연간 자금수지")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));

    fireEvent.click(screen.getByRole("button", { name: "분기별 사업실적보고서 출력" }));
    dialog = screen.getByRole("dialog", { name: "분기별 사업실적보고서" });
    expect(within(dialog).getByRole("heading", { name: "2026년 1분기 사업실적보고서" })).toBeInTheDocument();
    expect(within(dialog).getByText("사업추진 실적")).toBeInTheDocument();
    expect(within(dialog).getByText("조합원 모집 현황")).toBeInTheDocument();
    expect(within(dialog).getByText("지급 및 증빙관리")).toBeInTheDocument();
  });

  it("renders the DOCX-based quarterly performance report", () => {
    render(<ReportsPage initialSection="performance" />);

    expect(screen.getByText("회계/자금 > 보고서 > 실적보고서")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "대방동 지역주택조합 실적보고서" })).toBeInTheDocument();
    expect(screen.getByText("2026.1.1.부터 2026.3.31.까지")).toBeInTheDocument();
    expect(screen.getByText(/주택법 제 12조/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DOCX 원본 양식" })).toHaveAttribute("href", "/templates/reports/performance-report-q1-2026.docx");
    expect(screen.getByRole("columnheader", { name: "주택형" })).toHaveClass("text-center");
    expect(screen.getByText("1차조합원 조합변경인가 신청중(조합원 현행화)")).toBeInTheDocument();
    expect(screen.getByText("분기별 의무 작성")).toBeInTheDocument();
  });

  it("renders the monthly cash flow statement from the spreadsheet reference", () => {
    render(<ReportsPage initialSection="cash-flow" />);

    expect(screen.getByText("회계/자금 > 보고서 > 자금입출금명세서")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2026년 3월 자금 입출금명세서" })).toBeInTheDocument();
    expect(screen.getByText("3월 운영비 세부내역")).toBeInTheDocument();
    expect(screen.getByText("8,266,110")).toBeInTheDocument();
    expect(screen.getByText("전월말 현금예금 잔액")).toBeInTheDocument();
  });

  it("renders the annual operating budget reference", () => {
    render(<ReportsPage initialSection="budget" />);

    expect(screen.getByText("회계/자금 > 보고서 > 운영비 예산")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2026년 운영비 예산(안)" })).toBeInTheDocument();
    expect(screen.getByText("(당기 : 2026/01/01 ~ 2026/12/31)")).toBeInTheDocument();
    const budgetTable = screen.getByRole("table", { name: "운영비 예산표" });
    expect(within(budgetTable).getByRole("columnheader", { name: "월 예산" })).toHaveClass("text-center");
    expect(within(budgetTable).getByText("조합장 급여")).toBeInTheDocument();
  });
});
