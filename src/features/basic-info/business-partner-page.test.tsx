import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BusinessPartnerPage } from "./business-partner-page";

describe("BusinessPartnerPage", () => {
  it("renders the basic info partner registration workflow", () => {
    render(<BusinessPartnerPage />);

    expect(screen.getByRole("heading", { name: "거래처 관리" })).toBeInTheDocument();
    expect(screen.getByText("세금계산서 및 채권/채무 관리를 위한 거래처 정보를 등록합니다.")).toBeInTheDocument();
    expect(screen.getByText("회계/자금 > 기초정보 > 거래처등록 > 유형선택 > 건별등록/엑셀 일괄등록")).toBeInTheDocument();
    expect(screen.getAllByText("거래처등록").length).toBeGreaterThan(0);
    expect(screen.getAllByText("품목등록").length).toBeGreaterThan(0);
    expect(screen.getAllByText("은행통장 등록").length).toBeGreaterThan(0);
    expect(screen.getByText("조합 신탁계좌, 운영계좌, 토지비 계좌 등 계좌 기본정보를 등록합니다.")).toBeInTheDocument();
    expect(screen.getAllByText("신용카드 등록").length).toBeGreaterThan(0);
    expect(screen.getByText("법인카드, 업무대행 카드 등 카드 기본정보와 인증정보를 등록합니다.")).toBeInTheDocument();
    expect(screen.getByText("유형선택")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "건별등록" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "엑셀 일괄등록" })).toBeInTheDocument();
    expect(screen.getByText("채권")).toBeInTheDocument();
    expect(screen.getAllByText("채무").length).toBeGreaterThan(0);
    expect(screen.getByText("대한토지신탁")).toBeInTheDocument();
  });

  it("renders bank account registration list and adds an account from the modal", () => {
    render(<BusinessPartnerPage initialSection="bank-accounts" />);

    expect(screen.getByRole("heading", { name: "은행통장 등록" })).toBeInTheDocument();
    expect(screen.getByText("국민은행 신탁계좌")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "은행통장 추가" }));

    expect(screen.getByRole("dialog", { name: "은행통장 등록" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("계좌명"), { target: { value: "추가 운영계좌" } });
    fireEvent.change(screen.getByLabelText("계좌번호"), { target: { value: "111-222-333333" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(screen.queryByRole("dialog", { name: "은행통장 등록" })).not.toBeInTheDocument();
    expect(screen.getByText("추가 운영계좌")).toBeInTheDocument();
    expect(screen.getByText("111-222-333333")).toBeInTheDocument();
  });

  it("renders credit card registration list and adds a card from the modal", () => {
    render(<BusinessPartnerPage initialSection="cards" />);

    expect(screen.getByRole("heading", { name: "신용카드 등록" })).toBeInTheDocument();
    expect(screen.getAllByText("법인카드").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "신용카드 추가" }));

    expect(screen.getByRole("dialog", { name: "신용카드 등록" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("카드명"), { target: { value: "추가 법인카드" } });
    fireEvent.change(screen.getByLabelText("카드번호"), { target: { value: "4444-5555-6666-7777" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(screen.queryByRole("dialog", { name: "신용카드 등록" })).not.toBeInTheDocument();
    expect(screen.getByText("추가 법인카드")).toBeInTheDocument();
    expect(screen.getByText("****-****-****-7777")).toBeInTheDocument();
  });
});
