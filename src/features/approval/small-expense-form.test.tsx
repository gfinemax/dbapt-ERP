import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SmallExpenseForm } from "./small-expense-form";

describe("소액결의 계정과목 자동 선택", () => {
  it("사용내용 변경에 따라 분류하고 알 수 없는 내용은 기존 분류를 지운다", () => {
    render(<SmallExpenseForm limit={50000} action={vi.fn()} />);
    const description = screen.getByLabelText("사용내용");
    const account = screen.getByLabelText("계정과목");
    fireEvent.change(description, { target: { value: "사무실 실내 페인트용품 구입" } });
    expect(account).toHaveValue("수선비");
    fireEvent.change(description, { target: { value: "복사용지 구입" } });
    expect(account).toHaveValue("소모품비");
    fireEvent.change(description, { target: { value: "기타 구입" } });
    expect(account).toHaveValue("");
    expect(account).toBeInvalid();
    expect(screen.getByRole("status")).toHaveTextContent("자동 분류가 어려워요");
  });

  it("수동 수정은 유지하고 자동 선택으로 돌아갈 수 있다", () => {
    render(<SmallExpenseForm limit={50000} action={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("사용내용"), { target: { value: "페인트용품 구입" } });
    fireEvent.change(screen.getByLabelText("계정과목"), { target: { value: "소모품비" } });
    fireEvent.change(screen.getByLabelText("사용내용"), { target: { value: "사무실 도색" } });
    expect(screen.getByLabelText("계정과목")).toHaveValue("소모품비");
    fireEvent.click(screen.getByRole("button", { name: "자동 선택으로 되돌리기" }));
    expect(screen.getByLabelText("계정과목")).toHaveValue("수선비");
  });

  it("자동 선택 값을 저장 액션에 전달하고 성공 후 입력을 초기화한다", async () => {
    const action = vi.fn(async (data: FormData) => { expect(data.get("accountSubjectName")).toBe("수선비"); });
    render(<SmallExpenseForm limit={50000} action={action} members={[{user_id:"director",display_name:"사무국장"}]} userId="director" budgets={[{id:"repair",budget_item:"일반운영비>수선비",fiscal_year:2026}]} />);
    for (const [label, value] of [["사용일", "2026-09-07"], ["거래처", "미확인"], ["사용내용", "사무실 페인트용품 구입"], ["금액", "20000"]]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.change(screen.getByLabelText("증빙파일"), {target:{files:[new File(["%PDF-1.4"],"receipt.pdf",{type:"application/pdf"})]}});
    expect(screen.getByLabelText("예산항목")).toHaveValue("repair");
    fireEvent.submit(screen.getByLabelText("사용내용").closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByLabelText("사용내용")).toHaveValue(""));
    expect(screen.getByLabelText("계정과목")).toHaveValue("");
  });

  it("등록 실패 시 사용내용·수동 계정과목과 재시도 번호를 유지한다", async () => {
    const action = vi.fn().mockRejectedValue(new Error("이번 달 예산 확인 필요"));
    render(<SmallExpenseForm limit={50000} action={action} />);
    fireEvent.change(screen.getByLabelText("사용내용"), {target:{value:"페인트 구입"}});
    fireEvent.change(screen.getByLabelText("계정과목"), {target:{value:"소모품비"}});
    const form=screen.getByLabelText("사용내용").closest("form")!;
    const id=new FormData(form).get("id");
    fireEvent.submit(form);
    await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("이번 달 예산 확인 필요"));
    expect(screen.getByLabelText("사용내용")).toHaveValue("페인트 구입");
    expect(screen.getByLabelText("계정과목")).toHaveValue("소모품비");
    expect(new FormData(form).get("id")).toBe(id);
  });
});
