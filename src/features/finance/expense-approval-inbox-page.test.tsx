import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExpenseApprovalInboxPage } from "./expense-approval-inbox-page";

function findRowByResolutionNo(resolutionNo: string) {
  const row = screen.getAllByRole("row").find((candidate) => within(candidate).queryByText(resolutionNo));
  expect(row).toBeDefined();
  return row as HTMLElement;
}

describe("ExpenseApprovalInboxPage", () => {
  it("renders the approval inbox with summary cards, filters, and my pending approvals", () => {
    render(<ExpenseApprovalInboxPage />);

    expect(screen.getByRole("heading", { name: "결재함" })).toBeInTheDocument();
    expect(screen.getByText("회계/자금 > 전표·증빙관리 > 결재함")).toBeInTheDocument();
    expect(screen.getByText("내가 결재해야 할 지출결의서와 결재 진행 중인 문서를 확인하고 승인 또는 반려 처리합니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "결재함" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("현재 사용자: 오학동 사무장")).toBeInTheDocument();

    expect(screen.getAllByText("내 결재대기").length).toBeGreaterThan(0);
    expect(screen.getByText("3건")).toBeInTheDocument();
    expect(screen.getByText("오늘 결재완료")).toBeInTheDocument();
    expect(screen.getByText("1건")).toBeInTheDocument();
    expect(screen.getByText("반려 문서")).toBeInTheDocument();
    expect(screen.getByText("최종승인 대기금액")).toBeInTheDocument();
    expect(screen.getByText("12,300,000원")).toBeInTheDocument();

    for (const filter of ["전체", "내 결재대기", "결재완료", "반려", "최종승인대기", "지급대기"]) {
      expect(screen.getAllByRole("button", { name: filter }).length).toBeGreaterThan(0);
    }

    const table = screen.getByRole("table", { name: "결재함 목록" });
    for (const column of ["결의서번호", "작성일", "작성자", "거래처", "지출구분", "총지급액", "현재결재자", "승인상태", "지급상태", "액션"]) {
      expect(within(table).getByText(column)).toBeInTheDocument();
    }
    expect(within(table).getByText("지결-2026-0101")).toBeInTheDocument();
    expect(within(table).getAllByText("오학동 사무장").length).toBeGreaterThan(0);
    expect(within(table).getByText("한빛전기안전")).toBeInTheDocument();
  });

  it("opens the reused expense resolution detail modal from the inbox", () => {
    render(<ExpenseApprovalInboxPage />);

    fireEvent.click(within(findRowByResolutionNo("지결-2026-0101")).getByRole("button", { name: "상세보기" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(dialog).getByText("지결-2026-0101")).toBeInTheDocument();
    expect(within(dialog).getAllByText("한빛전기안전").length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("heading", { name: "결재선" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "처리이력" })).toBeInTheDocument();
  });

  it("approves my pending resolution and moves it to the final approver", () => {
    render(<ExpenseApprovalInboxPage />);

    const targetRow = findRowByResolutionNo("지결-2026-0101");
    fireEvent.click(within(targetRow).getByRole("button", { name: "승인" }));

    const updatedRow = findRowByResolutionNo("지결-2026-0101");
    expect(within(updatedRow).getByText("안동연 조합장")).toBeInTheDocument();
    expect(within(updatedRow).getByText("승인대기")).toBeInTheDocument();
    expect(within(updatedRow).getByRole("button", { name: "승인" })).toBeDisabled();
  });

  it("rejects a pending resolution with a reason modal and saves the reason", () => {
    render(<ExpenseApprovalInboxPage />);

    fireEvent.click(within(findRowByResolutionNo("지결-2026-0102")).getByRole("button", { name: "반려" }));

    const dialog = screen.getByRole("dialog", { name: "반려사유 입력" });
    fireEvent.change(within(dialog).getByLabelText("반려사유"), { target: { value: "계약서 원본 확인 필요" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "반려 처리" }));

    const rejectedRow = findRowByResolutionNo("지결-2026-0102");
    expect(within(rejectedRow).getAllByText("반려").length).toBeGreaterThan(0);
    expect(within(rejectedRow).getByText("지급전")).toBeInTheDocument();
    expect(within(rejectedRow).getByText("계약서 원본 확인 필요")).toBeInTheDocument();
    expect(within(rejectedRow).getByText("없음")).toBeInTheDocument();
  });
});
