import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceListPage } from "./finance-list-page";

describe("FinanceListPage", () => {
  it("renders the finance and fund management workflow", () => {
    render(<FinanceListPage />);

    expect(screen.getByRole("heading", { name: "매입매출거래입력" })).toBeInTheDocument();
    expect(screen.getAllByText("매입매출거래입력").length).toBeGreaterThan(0);
    expect(screen.getByText("회계/자금 > 거래전표증빙문서 > 매입매출거래입력")).toBeInTheDocument();
    expect(screen.getByText("세금계산서, 계산서, 카드, 현금영수증 등의 적격증빙이 발생하는 매입/매출거래를 입력합니다.")).toBeInTheDocument();
    expect(screen.getByText(/판매를 위해 주식회사 흥부상사에서 컴퓨터 2대를 110,000원/)).toBeInTheDocument();
    expect(screen.getByText("매입/출금 전표등록")).toBeInTheDocument();
    expect(screen.getByText("거래처 외상잔액확인")).toBeInTheDocument();
    expect(screen.getByText("기타비용 전표등록")).toBeInTheDocument();
    expect(screen.getByText("계정과목")).toBeInTheDocument();
    expect(screen.getByText("은행/카드 연동")).toBeInTheDocument();
    expect(screen.getByText("등록된 계좌와 카드의 거래내역을 불러와 전표와 매칭합니다.")).toBeInTheDocument();
    expect(screen.getAllByText("주식회사 흥부상사").length).toBeGreaterThan(0);
    expect(screen.getByText("컴퓨터 2대 외상 매입")).toBeInTheDocument();
    expect(screen.getAllByText("국민은행 신탁계좌").length).toBeGreaterThan(0);
    expect(screen.getAllByText("조합원 분담금").length).toBeGreaterThan(0);
    expect(screen.getByText("토지계약금")).toBeInTheDocument();
  });
});
