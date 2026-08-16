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

  it("applies title, account subject, and budget recommendations after confirmation", () => {
    render(
      <ApprovalNewPage
        accountSubjects={["회의비", "용역비"]}
        budgets={[{ approvedAmount: 1_000_000, availableAmount: 800_000, budgetItem: "회의비", executedAmount: 200_000, fiscalYear: 2026, id: "budget-meeting", reservedAmount: 0 }]}
      />,
    );

    fireEvent.change(screen.getByLabelText("기안 유형"), { target: { value: "EXPENSE" } });
    fireEvent.change(screen.getByLabelText("기안 내용"), { target: { value: "운영위원회 회의용 음료 8잔 주문" } });
    fireEvent.click(screen.getByRole("button", { name: "자동 추천" }));

    expect(screen.getByLabelText("제목")).toHaveValue("운영위원회 회의용 음료 8잔 주문 지출품의");
    expect(screen.getByLabelText("계정과목")).toHaveValue("회의비");
    expect(screen.getByLabelText("예산 항·목·세목")).toHaveValue("회의비");
    expect(screen.getByText("추천 내용을 적용했어요. 상신 전에 한 번 확인해주세요.")).toBeInTheDocument();
  });
});
