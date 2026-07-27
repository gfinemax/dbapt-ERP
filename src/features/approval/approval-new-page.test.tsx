import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApprovalNewPage } from "./approval-new-page";

vi.mock("@/app/approval/actions", () => ({
  createApprovalAction: vi.fn(),
}));

describe("ApprovalNewPage", () => {
  it("shows only core inputs first and fills common defaults", () => {
    render(<ApprovalNewPage />);

    expect(screen.getByRole("heading", { name: "간편 기안 작성" })).toBeInTheDocument();
    expect(screen.getByText("사무국")).toBeInTheDocument();
    expect(screen.getByText("내부")).toBeInTheDocument();
    expect(screen.getByText("자동 검토 중")).toBeInTheDocument();
    expect(screen.queryByLabelText("기대효과")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("제목"), {
      target: { value: "부동산 매입 계약 검토" },
    });
    expect(screen.getByLabelText("기안 내용")).toHaveValue(
      "부동산 매입 계약 검토",
    );
  });

  it("opens budget fields conditionally and mirrors one accounting line", () => {
    const { container } = render(
      <ApprovalNewPage
        accountSubjects={["용역비"]}
        budgets={[
          {
            approvedAmount: 10_000_000,
            availableAmount: 8_000_000,
            budgetItem: "용역비",
            executedAmount: 2_000_000,
            fiscalYear: 2026,
            id: "budget-1",
            reservedAmount: 0,
          },
        ]}
        partners={["대방개발"]}
      />,
    );

    fireEvent.click(screen.getByLabelText("예산을 사용하는 기안"));
    fireEvent.change(screen.getByLabelText("총금액"), {
      target: { value: "110000" },
    });
    fireEvent.change(screen.getByLabelText("대표 거래처"), {
      target: { value: "대방개발" },
    });
    fireEvent.change(screen.getByLabelText("예산 항·목·세목"), {
      target: { value: "용역비" },
    });
    fireEvent.change(screen.getByLabelText("계정과목"), {
      target: { value: "용역비" },
    });

    expect(container.querySelector('input[name="linePartner1"]')).toHaveValue(
      "대방개발",
    );
    expect(container.querySelector('input[name="accountSubject1"]')).toHaveValue(
      "용역비",
    );
    expect(container.querySelector('input[name="supplyAmount1"]')).toHaveValue(
      "110000",
    );
  });

  it("shows contract details only for a contract draft", () => {
    render(<ApprovalNewPage />);
    expect(screen.queryByRole("heading", { name: "계약 정보" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("기안 유형"), {
      target: { value: "CONTRACT" },
    });
    expect(screen.getByRole("heading", { name: "계약 정보" })).toBeInTheDocument();
  });
});
