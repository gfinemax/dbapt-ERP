import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HrPayrollPage } from "./hr-payroll-page";

describe("HrPayrollPage", () => {
  it("renders employee registration and opens the employee form", () => {
    render(<HrPayrollPage initialSection="employees" />);

    expect(screen.getByRole("heading", { name: "사원정보등록" })).toBeInTheDocument();
    expect(screen.getByText("회계/자금 > 인사·급여 > 사원정보등록")).toBeInTheDocument();
    expect(screen.getAllByText(/사원에 대한 급여 계산 및 급여 대장을 작성하기 위해 기본적인 사원정보를 등록합니다/).length).toBeGreaterThan(0);
    expect(screen.getByText(/소득세, 주민세 및 4대보험 등을 자동 계산/)).toBeInTheDocument();
    expect(screen.getByText("사원정보 입력창 제공")).toBeInTheDocument();
    expect(screen.getAllByText("김승민").length).toBeGreaterThan(0);
    expect(screen.getByText("김현진")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    const dialog = screen.getByRole("dialog", { name: "사원정보 입력" });
    expect(within(dialog).getByLabelText("사원명")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("입사일자")).toBeInTheDocument();
    expect(within(dialog).getByText("공제 항목 자동계산")).toBeInTheDocument();
  });

  it("renders payroll entry and opens the payroll entry form", () => {
    render(<HrPayrollPage initialSection="payroll-entry" />);

    expect(screen.getByRole("heading", { name: "급여입력 및 전표처리" })).toBeInTheDocument();
    expect(screen.getByText("회계/자금 > 인사·급여 > 급여입력")).toBeInTheDocument();
    expect(screen.getByText("사원정보 입력창 제공")).toBeInTheDocument();
    expect(screen.getByText("급여입력 입력창 제공")).toBeInTheDocument();
    expect(screen.getByText("소득세")).toBeInTheDocument();
    expect(screen.getByText("국민연금")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "급여입력" }));

    const dialog = screen.getByRole("dialog", { name: "급여입력 입력창" });
    expect(within(dialog).getByLabelText("사원선택")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("기본급")).toBeInTheDocument();
    expect(within(dialog).getByText("전표처리")).toBeInTheDocument();
  });

  it("renders payroll ledger with monthly employee payment details", () => {
    render(<HrPayrollPage initialSection="payroll-ledger" />);

    expect(screen.getByRole("heading", { name: "급여대장확인" })).toBeInTheDocument();
    expect(screen.getByText("회계/자금 > 인사·급여 > 급여대장")).toBeInTheDocument();
    expect(screen.getAllByText(/해당 월에 대한 사원별 급여 지급내역을 등록하여 급여 대장을 작성하고 회계 전표 처리 합니다/).length).toBeGreaterThan(0);
    expect(screen.getByText(/급여 복사 기능을 활용/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "기본급" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "차인지급액" })).toBeInTheDocument();
    expect(screen.getAllByText("3,036,100원").length).toBeGreaterThan(0);
    expect(screen.getByText("급여 복사")).toBeInTheDocument();
    expect(screen.getByText("전표처리")).toBeInTheDocument();
  });
});
