import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberListPage } from "./member-list-page";

describe("MemberListPage", () => {
  it("renders the member list workflow", () => {
    render(<MemberListPage />);

    expect(screen.getByRole("heading", { name: "조합원관리" })).toBeInTheDocument();
    expect(screen.getByText("M-000124")).toBeInTheDocument();
    expect(screen.getAllByText("미납")).toHaveLength(2);
    expect(screen.getByText("엑셀 내보내기")).toBeInTheDocument();
  });

  it("renders peopleON pagination controls", () => {
    render(
      <MemberListPage
        initialMembers={[
          {
            address: "서울시 서대문구",
            contractStatus: "정상",
            documentStatus: "완료",
            id: "member-1",
            integrationStatus: "정상",
            joinedAt: "-",
            memberNo: "2006-1-212",
            memo: "peopleON API에서 조회한 조합원입니다.",
            name: "강광자",
            paymentStatus: "완료",
            phone: "-",
            recentDocument: { label: "최근 서류", status: "완료" },
            recentPayment: { amount: "-", label: "최근 납부", paidAt: "-" },
            status: "정상",
            unit: "84",
          },
        ]}
        pagination={{
          hasNext: true,
          hasPrevious: false,
          page: 1,
          pageSize: 50,
          totalCount: 116,
          totalPages: 3,
        }}
        query={{ pageSize: "50", tier: "등기조합원" }}
      />,
    );

    expect(screen.getByText("전체 116명")).toBeInTheDocument();
    expect(screen.getByText("1-50 표시")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "다음" })).toHaveAttribute(
      "href",
      "/members?pageSize=50&tier=%EB%93%B1%EA%B8%B0%EC%A1%B0%ED%95%A9%EC%9B%90&page=2",
    );
    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
  });

  it("separates registered and prospective peopleON members by tier tabs", () => {
    render(
      <MemberListPage
        initialMembers={[
          {
            address: "서울시 동작구",
            contractStatus: "검토",
            documentStatus: "검토",
            id: "prospect-1",
            integrationStatus: "정상",
            joinedAt: "-",
            memberNo: "미지정",
            memo: "peopleON API에서 조회한 조합원입니다.",
            name: "고진오",
            paymentStatus: "미납",
            phone: "-",
            recentDocument: { label: "최근 서류", status: "검토" },
            recentPayment: { amount: "-", label: "최근 납부", paidAt: "-" },
            status: "정상",
            unit: "배정전",
          },
        ]}
        pagination={{
          hasNext: false,
          hasPrevious: false,
          page: 1,
          pageSize: 50,
          totalCount: 20,
          totalPages: 1,
        }}
        query={{ pageSize: "50", tier: "예비조합원" }}
      />,
    );

    expect(screen.getByText("고진오")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "등기조합원" })).toHaveAttribute(
      "href",
      "/members?pageSize=50&tier=%EB%93%B1%EA%B8%B0%EC%A1%B0%ED%95%A9%EC%9B%90&page=1",
    );
    expect(screen.getByRole("link", { name: "예비조합원" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("전체 20명")).toBeInTheDocument();
  });

  it("keeps table columns and status badges on one line", () => {
    render(
      <MemberListPage
        initialMembers={[
          {
            address: "서울시 서대문구",
            contractStatus: "검토",
            documentStatus: "검토",
            id: "member-1",
            integrationStatus: "정상",
            joinedAt: "-",
            memberNo: "2006-1-212",
            memo: "peopleON API에서 조회한 조합원입니다.",
            name: "강광자",
            paymentStatus: "미납",
            phone: "01692342467",
            recentDocument: { label: "최근 서류", status: "검토" },
            recentPayment: { amount: "-", label: "최근 납부", paidAt: "-" },
            status: "정상",
            unit: "배정전",
          },
        ]}
      />,
    );

    expect(screen.getByRole("table")).toHaveClass("min-w-[1280px]");
    expect(screen.getByRole("columnheader", { name: "동/호수" })).toHaveClass("whitespace-nowrap");
    expect(screen.getByRole("cell", { name: "배정전" })).toHaveClass("whitespace-nowrap");
    expect(screen.getByRole("cell", { name: "01692342467" })).toHaveClass("whitespace-nowrap");
    expect(screen.getAllByText("검토")[0]).toHaveClass("whitespace-nowrap");
  });

  it("keeps member tier tabs on one line at narrower widths", () => {
    render(<MemberListPage />);

    expect(screen.getByText("이름, 연락처, 조합원번호 검색").parentElement?.parentElement).toHaveClass("lg:flex-row");
    expect(screen.getByText("이름, 연락처, 조합원번호 검색").parentElement).toHaveClass("lg:w-[420px]");
    expect(screen.getByRole("navigation", { name: "조합원 유형" })).toHaveClass("flex-nowrap", "overflow-x-auto");
    expect(screen.getByRole("link", { name: "등기조합원" })).toHaveClass("shrink-0", "whitespace-nowrap");
    expect(screen.getByRole("link", { name: "예비조합원" })).toHaveClass("shrink-0", "whitespace-nowrap");
    expect(screen.getByRole("link", { name: "권리증보유자" })).toHaveClass("shrink-0", "whitespace-nowrap");
  });

  it("breaks multiple member numbers and phone numbers into separate lines", () => {
    render(
      <MemberListPage
        initialMembers={[
          {
            address: "서울시 서대문구",
            contractStatus: "검토",
            documentStatus: "검토",
            id: "member-1",
            integrationStatus: "정상",
            joinedAt: "-",
            memberNo: "2006-1-273, 2006-1-313, 2006-1-273 [통합]",
            memo: "peopleON API에서 조회한 조합원입니다.",
            name: "송동환",
            paymentStatus: "미납",
            phone: "010-6263-3324, 010-4526-3977",
            recentDocument: { label: "최근 서류", status: "검토" },
            recentPayment: { amount: "-", label: "최근 납부", paidAt: "-" },
            status: "정상",
            unit: "배정전",
          },
        ]}
      />,
    );

    expect(screen.getByText("2006-1-273").parentElement).toHaveClass("flex-col");
    expect(screen.getByText("2006-1-313")).toBeInTheDocument();
    expect(screen.getByText("2006-1-273 [통합]")).toBeInTheDocument();
    expect(screen.getByText("010-6263-3324").parentElement).toHaveClass("flex-col");
    expect(screen.getByText("010-4526-3977")).toBeInTheDocument();
  });
});
