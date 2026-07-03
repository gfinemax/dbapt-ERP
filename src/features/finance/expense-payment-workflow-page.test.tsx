import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExpensePaymentWorkflowPage } from "./expense-payment-workflow-page";

function findRowByResolutionNo(resolutionNo: string) {
  const row = screen.getAllByRole("row").find((candidate) => within(candidate).queryByText(resolutionNo));
  expect(row).toBeDefined();
  return row as HTMLElement;
}

describe("ExpensePaymentWorkflowPage", () => {
  it("renders payment waiting resolutions with summary cards and payment actions", () => {
    render(<ExpensePaymentWorkflowPage initialMode="waiting" />);

    expect(screen.getByRole("heading", { name: "지급대기" })).toBeInTheDocument();
    expect(screen.getByText("회계/자금 > 전표·증빙관리 > 지급대기")).toBeInTheDocument();
    expect(screen.getByText("최종 결재가 완료되어 실제 지급 처리가 필요한 지출결의서를 관리합니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "지급대기" })).toHaveAttribute("aria-current", "page");

    for (const label of ["지급대기 건수", "지급대기 금액", "오늘 지급예정", "증빙 미첨부"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    const table = screen.getByRole("table", { name: "지급대기 목록" });
    for (const column of ["결의서번호", "지출예정일", "거래처", "지출구분", "지급은행", "지급계좌", "예금주", "총지급액", "증빙여부", "액션"]) {
      expect(within(table).getByText(column)).toBeInTheDocument();
    }
    expect(within(table).getByText("지결-2026-0201")).toBeInTheDocument();
    expect(within(table).getAllByText("대방사무용품").length).toBeGreaterThan(0);
    expect(within(table).getByText("990,000원")).toBeInTheDocument();
    expect(within(table).getAllByRole("button", { name: "지급처리" }).length).toBeGreaterThan(0);
    expect(within(table).getAllByRole("button", { name: "보류" }).length).toBeGreaterThan(0);
  });

  it("opens payment processing modal and moves a paid resolution to completed history", () => {
    render(<ExpensePaymentWorkflowPage initialMode="waiting" />);

    fireEvent.click(within(findRowByResolutionNo("지결-2026-0201")).getByRole("button", { name: "지급처리" }));

    const dialog = screen.getByRole("dialog", { name: "지급처리" });
    expect(within(dialog).getByDisplayValue("지결-2026-0201")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("대방사무용품")).toBeInTheDocument();
    expect(within(dialog).getAllByDisplayValue("990000").length).toBeGreaterThan(0);

    fireEvent.change(within(dialog).getByLabelText("지급일"), { target: { value: "2026-07-02" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "지급방법" }), { target: { value: "계좌이체" } });
    fireEvent.change(within(dialog).getByLabelText("지급메모"), { target: { value: "운영계좌 이체 완료" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "지급완료 처리" }));

    expect(screen.getByRole("heading", { name: "지급완료 내역" })).toBeInTheDocument();
    const completedTable = screen.getByRole("table", { name: "지급완료 내역 목록" });
    const completedRow = within(completedTable).getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0201"));
    expect(completedRow).toBeDefined();
    expect(within(completedRow as HTMLElement).getByText("계좌이체")).toBeInTheDocument();
    expect(within(completedRow as HTMLElement).getAllByText("990,000원").length).toBeGreaterThan(0);
    expect(within(completedRow as HTMLElement).getAllByText("미생성").length).toBeGreaterThan(0);

    fireEvent.click(within(completedRow as HTMLElement).getByRole("button", { name: "상세보기" }));
    const detailDialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(detailDialog).getByText("사무국 관리자 · 지급완료")).toBeInTheDocument();
    expect(within(detailDialog).getByText("운영계좌 이체 완료")).toBeInTheDocument();
  });

  it("puts a waiting payment on hold with a reason", () => {
    render(<ExpensePaymentWorkflowPage initialMode="waiting" />);

    fireEvent.click(within(findRowByResolutionNo("지결-2026-0202")).getByRole("button", { name: "보류" }));

    const dialog = screen.getByRole("dialog", { name: "보류사유 입력" });
    fireEvent.change(within(dialog).getByLabelText("보류사유"), { target: { value: "이체 계좌 확인 필요" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "보류 처리" }));

    const heldRow = findRowByResolutionNo("지결-2026-0202");
    expect(within(heldRow).getAllByText("보류").length).toBeGreaterThan(0);
    expect(within(heldRow).getByText("이체 계좌 확인 필요")).toBeInTheDocument();
  });

  it("renders completed payments and generates voucher numbers", () => {
    render(<ExpensePaymentWorkflowPage initialMode="completed" />);

    expect(screen.getByRole("heading", { name: "지급완료 내역" })).toBeInTheDocument();
    expect(screen.getByText("실제 지급이 완료된 지출결의서와 지출전표 생성 여부를 확인합니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "지급완료 내역" })).toHaveAttribute("aria-current", "page");

    for (const label of ["지급완료 건수", "지급완료 금액", "전표확정 대기", "이체확인증 미첨부"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    const table = screen.getByRole("table", { name: "지급완료 내역 목록" });
    for (const column of ["결의서번호", "지급일", "거래처", "지출구분", "총지급액", "실제지급액", "지급방법", "지출전표번호", "전표상태", "증빙여부", "액션"]) {
      expect(within(table).getByText(column)).toBeInTheDocument();
    }

    const targetRow = findRowByResolutionNo("지결-2026-0301");
    expect(within(targetRow).getAllByText("미생성").length).toBeGreaterThan(0);
    fireEvent.click(within(targetRow).getByRole("button", { name: "전표초안 생성" }));

    const updatedRow = findRowByResolutionNo("지결-2026-0301");
    expect(within(updatedRow).getByText("지출-2026-0003")).toBeInTheDocument();
    expect(within(updatedRow).getByText("전표초안")).toBeInTheDocument();
    fireEvent.click(within(updatedRow).getByRole("button", { name: "전표확정" }));

    const confirmedRow = findRowByResolutionNo("지결-2026-0301");
    expect(within(confirmedRow).getByText("전표확정")).toBeInTheDocument();
    expect(within(confirmedRow).getByRole("button", { name: "전표보기" })).not.toBeDisabled();

    fireEvent.click(within(confirmedRow).getByRole("button", { name: "상세보기" }));
    const detailDialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(detailDialog).getByText("시스템 · 지출전표 초안 생성")).toBeInTheDocument();
    expect(within(detailDialog).getByText("오학동 사무장 · 지출전표 확정")).toBeInTheDocument();
    expect(within(detailDialog).getByText("전표번호 지출-2026-0003 초안 생성")).toBeInTheDocument();
    expect(within(detailDialog).getByText("전표번호 지출-2026-0003 확정")).toBeInTheDocument();
  });
});
