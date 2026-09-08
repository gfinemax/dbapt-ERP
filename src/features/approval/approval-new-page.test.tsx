import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createApprovalAction } from "@/app/approval/actions";
import { ApprovalNewPage } from "./approval-new-page";

vi.mock("@/app/approval/actions", () => ({
  createApprovalAction: vi.fn(),
}));

describe("ApprovalNewPage", () => {
  it("retains a failed new draft and reuses its document and operation IDs", async () => {
    vi.mocked(createApprovalAction).mockRejectedValue(new Error("저장 실패. 다시 확인해줘."));
    const { container } = render(<ApprovalNewPage viewer={{user_id:"writer",organization_id:"org",display_name:"실제 작성자",permissions:["PAY"],active:true}} />);
    fireEvent.change(screen.getByLabelText("제목"), {target:{value:"실패해도 보존할 신규 기안"}});
    fireEvent.change(screen.getByLabelText("기안 내용"), {target:{value:"신규 기안 본문"}});
    fireEvent.click(screen.getByRole("button",{name:"고급 설정 열기"}));
    fireEvent.change(screen.getByLabelText("부서"), {target:{value:"검증 부서"}});
    fireEvent.change(screen.getByLabelText("기대효과"), {target:{value:"검토 후 실행"}});
    const documentId = container.querySelector<HTMLInputElement>('[name="documentId"]')!.value;
    const key = container.querySelector<HTMLInputElement>('[name="operationKey"]')!.value;
    fireEvent.click(screen.getByRole("button",{name:"임시저장"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
    expect(screen.getByLabelText("제목")).toHaveValue("실패해도 보존할 신규 기안");
    expect(screen.getByLabelText("기안 내용")).toHaveValue("신규 기안 본문");
    fireEvent.change(screen.getByLabelText("제목"), {target:{value:"다시 검토한 신규 기안"}});
    expect(screen.getByLabelText("기대효과")).toHaveValue("검토 후 실행");
    expect(container.querySelector('[name="documentId"]')).toHaveValue(documentId);
    expect(container.querySelector('[name="operationKey"]')).toHaveValue(key);
    fireEvent.click(screen.getByRole("button",{name:"임시저장"}));
    await waitFor(()=>expect(createApprovalAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createApprovalAction).mock.calls[1][0].get("documentId")).toBe(documentId);
    expect(vi.mocked(createApprovalAction).mock.calls[1][0].get("operationKey")).toBe(key);
  });
  it("shows only core inputs first and fills common defaults", () => {
    const { container } = render(<ApprovalNewPage viewer={{user_id:"writer", organization_id:"org", display_name:"실제 기안자", permissions:["PAY"], active:true}} />);

    expect(screen.getByRole("heading", { name: "간편 기안 작성" })).toBeInTheDocument();
    expect(container.querySelector('input[name="drafterLabel"]')).toHaveValue("실제 기안자");
    expect(container.querySelector('input[name="departmentLabel"]')).toHaveValue("");
    expect(screen.queryByRole("button", {name:"결재 요청"})).not.toBeInTheDocument();
    const operationKey = container.querySelector<HTMLInputElement>('input[name="operationKey"]')!.value;
    expect(operationKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByText("내부")).toBeInTheDocument();
    expect(screen.getByText("자동 검토 중")).toBeInTheDocument();
    expect(screen.queryByLabelText("기대효과")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("제목"), {
      target: { value: "부동산 매입 계약 검토" },
    });
    expect(container.querySelector('input[name="operationKey"]')).toHaveValue(operationKey);
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
