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
    expect(screen.getByText("조합 회계 처리 사례")).toBeInTheDocument();
    expect(screen.getByText(/법무법인 ○○에 동작구청 대응 및 업무대행계약 검토 관련 법무비 3,300,000원/)).toBeInTheDocument();
    expect(screen.getByText("분담금 수납액")).toBeInTheDocument();
    expect(screen.getAllByText("380,000,000원").length).toBeGreaterThan(0);
    expect(screen.getByText("이번 달 또는 선택 기간 내 조합원 분담금 수납액")).toBeInTheDocument();
    expect(screen.getByText("지출 집행액")).toBeInTheDocument();
    expect(screen.getByText("1,447,610,000원")).toBeInTheDocument();
    expect(screen.getByText("선택 기간 내 지급 완료된 지출 총액")).toBeInTheDocument();
    expect(screen.getByText("지출결의 승인대기")).toBeInTheDocument();
    expect(screen.getAllByText("3건").length).toBeGreaterThan(0);
    expect(screen.getByText("승인 필요 상태의 지출결의서")).toBeInTheDocument();
    expect(screen.getByText("입금 미매칭")).toBeInTheDocument();
    expect(screen.getAllByText("9건").length).toBeGreaterThan(0);
    expect(screen.getByText("은행 입금내역 중 조합원과 아직 연결되지 않은 건")).toBeInTheDocument();
    expect(screen.getByText("조합원명, 업체명, 전표번호, 결의서번호, 증빙, 계정과목 검색")).toBeInTheDocument();
    expect(screen.getAllByText("입금미매칭").length).toBeGreaterThan(0);
    expect(screen.getAllByText("지출결의").length).toBeGreaterThan(0);
    expect(screen.getAllByText("지급대기").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    const addMenu = screen.getByRole("menu", { name: "전표 추가 선택" });
    expect(within(addMenu).getByText("수입전표")).toBeInTheDocument();
    expect(within(addMenu).getByText("수입-2026-0001")).toBeInTheDocument();
    expect(within(addMenu).getByText("지출결의서")).toBeInTheDocument();
    expect(within(addMenu).getByText("지결-2026-0001")).toBeInTheDocument();
    expect(within(addMenu).getByText("지출전표")).toBeInTheDocument();
    expect(within(addMenu).getByText("지출-2026-0001")).toBeInTheDocument();
    expect(within(addMenu).getByText("환불결의")).toBeInTheDocument();
    expect(within(addMenu).getByText("환결-2026-0001")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "지출결의서 작성" })).not.toBeInTheDocument();
    expect(screen.getByText("계정과목")).toBeInTheDocument();
    expect(screen.getByText("은행·카드 연동")).toBeInTheDocument();
    expect(screen.getByText("등록된 계좌와 카드의 거래내역을 불러와 수입·지출 전표와 매칭합니다.")).toBeInTheDocument();
    expect(screen.getAllByText("국민은행 신탁계좌").length).toBeGreaterThan(0);
    expect(screen.getAllByText("조합원 분담금").length).toBeGreaterThan(0);
    expect(screen.getByText("토지매입비")).toBeInTheDocument();
    expect(screen.getByText("세무비")).toBeInTheDocument();
    expect(screen.getByText("감정평가비")).toBeInTheDocument();
    expect(screen.getByText("조합원 환불금")).toBeInTheDocument();
    expect(screen.queryByText("매입매출거래입력")).not.toBeInTheDocument();
    expect(screen.queryByText("거래전표증빙문서")).not.toBeInTheDocument();
    expect(screen.queryByText("매입/출금 전표등록")).not.toBeInTheDocument();
    expect(screen.queryByText("거래처 외상잔액확인")).not.toBeInTheDocument();
  });
});
