import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceListPage } from "./finance-list-page";

describe("FinanceListPage", () => {
  it("renders the housing cooperative income and expense voucher workflow", () => {
    render(<FinanceListPage />);

    expect(screen.getByRole("heading", { name: "수입·지출 전표관리" })).toBeInTheDocument();
    expect(screen.getAllByText("수입·지출 전표관리").length).toBeGreaterThan(0);
    expect(screen.getByText("회계/자금 > 전표·증빙관리 > 수입·지출 전표관리")).toBeInTheDocument();
    expect(
      screen.getByText("조합원 분담금 수납, 협력업체 지급, 운영비 지출, 토지매입비, 환불금 등 조합의 자금거래를 전표와 증빙자료 기준으로 관리합니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "추가" })).toBeInTheDocument();
    expect(screen.getByText("수입/지출 전표등록")).toBeInTheDocument();
    expect(screen.getByText("조합원 미납금·업체 미지급금 확인")).toBeInTheDocument();
    expect(screen.getByText("운영비·용역비 지출등록")).toBeInTheDocument();
    expect(screen.getByText("실제 전표를 등록하면 거래처, 금액, 증빙과 은행·카드 매칭 상태가 이 화면에 표시돼.")).toBeInTheDocument();
    expect(screen.getByText("분담금 수납액")).toBeInTheDocument();
    expect(screen.getAllByText("0원").length).toBeGreaterThan(0);
    expect(screen.getByText("이번 달 또는 선택 기간 내 조합원 분담금 수납액")).toBeInTheDocument();
    expect(screen.getByText("지출 집행액")).toBeInTheDocument();
    expect(screen.getByText("등록된 실제 전표가 없어.")).toBeInTheDocument();
    expect(screen.getByText("선택 기간 내 지급 완료된 지출 총액")).toBeInTheDocument();
    expect(screen.getByText("지출결의 승인대기")).toBeInTheDocument();
    expect(screen.getAllByText("0건").length).toBeGreaterThan(0);
    expect(screen.getByText("승인 필요 상태의 지출결의서")).toBeInTheDocument();
    expect(screen.getByText("입금 미매칭")).toBeInTheDocument();
    expect(screen.getByText("은행 입금내역 중 조합원과 아직 연결되지 않은 건")).toBeInTheDocument();
    expect(screen.getByText("조합원명, 업체명, 전표번호, 결의서번호, 증빙, 계정과목 검색")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    const addMenu = screen.getByRole("menu", { name: "전표 추가 선택" });
    expect(within(addMenu).getByText("수입전표")).toBeInTheDocument();
    expect(within(addMenu).getByText("지출결의서")).toBeInTheDocument();
    expect(within(addMenu).getByText("예산 내 간편지출")).toBeInTheDocument();
    expect(within(addMenu).getByText("결의서 없음")).toBeInTheDocument();
    expect(within(addMenu).getByText("지출전표")).toBeInTheDocument();
    expect(within(addMenu).getByText("환불결의")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "지출결의서 작성" })).not.toBeInTheDocument();
    expect(screen.getByText("계정과목")).toBeInTheDocument();
    expect(screen.getByText("은행·카드 연동")).toBeInTheDocument();
    expect(screen.getByText("등록된 계좌와 카드의 거래내역을 불러와 수입·지출 전표와 매칭합니다.")).toBeInTheDocument();
    expect(screen.getByText("연결된 실제 은행·카드 정보가 없어.")).toBeInTheDocument();
    expect(screen.queryByText("매입매출거래입력")).not.toBeInTheDocument();
    expect(screen.queryByText("거래전표증빙문서")).not.toBeInTheDocument();
    expect(screen.queryByText("매입/출금 전표등록")).not.toBeInTheDocument();
    expect(screen.queryByText("거래처 외상잔액확인")).not.toBeInTheDocument();
  });
});
