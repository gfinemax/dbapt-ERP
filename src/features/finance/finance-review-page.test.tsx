import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), load: vi.fn() }));
vi.mock("@/components/erp-shell", () => ({ ErpShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("./reimbursement-auth", () => ({ reimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-page", () => ({ ReimbursementLogin: ({ title, description }: { title?: string; description?: string }) => <section aria-label={title}><p>로그인 필요</p><p>{description}</p></section> }));
vi.mock("@/app/finance/reimbursements/actions", () => ({ reimbursementLogout: vi.fn() }));
vi.mock("./finance-review-repository", async importOriginal => ({ ...await importOriginal<object>(), loadFinanceReview: mocks.load }));
import { FinanceReviewPage } from "./finance-review-page";
beforeEach(() => { vi.clearAllMocks(); mocks.identity.mockResolvedValue({ display_name: "관리자" }); mocks.load.mockResolvedValue({ rows: [], count: 0, page: 1 }); });
describe("read-only finance review routes", () => {
  it.each([["collections", "분담금 수납관리"], ["refunds", "환급관리"], ["evidence", "증빙자료 관리"], ["tax-documents", "세금계산서·계산서"], ["month-close", "월 마감"]] as const)("shows the %s login context instead of personal reimbursement", async (kind, title) => {
    mocks.identity.mockResolvedValue(null);
    render(await FinanceReviewPage({ kind, query: {} }));
    expect(screen.getByRole("region", { name: title })).toHaveTextContent("조직의 자료를 확인하려면 본인 계정으로 로그인해줘.");
    expect(screen.queryByText("개인 지출 정산·월 마감")).not.toBeInTheDocument();
  });
  it("shows unconfigured collections without a zero amount or sample record", async () => {
    mocks.load.mockResolvedValue({ rows: [], count: null, page: 1, connection: "NOT_CONFIGURED" });
    render(await FinanceReviewPage({ kind: "collections", query: {} }));
    expect(screen.getByRole("heading", { name: "원장 연결 설정 필요" })).toBeInTheDocument();
    expect(screen.queryByText(/0건|0원/)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("keeps source and pagination on refresh and navigation", async () => {
    mocks.load.mockResolvedValue({ rows: [{ id: "e1", title: "보존된 파일", status: "증빙", date: "2026-09-01", href: "/download", sourceHref: "/source" }], count: 151, page: 2 });
    render(await FinanceReviewPage({ kind: "evidence", query: { source: "TRUST", page: "2", month: "2026-09" } }));
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), "evidence", "2026-09", 2, "TRUST", false);
    expect(screen.getByRole("link", { name: "다음" })).toHaveAttribute("href", "/finance/evidence?page=3&month=2026-09&source=TRUST&scope=month");
    expect(screen.getByRole("link", { name: "현재 조건 다시 조회" })).toHaveAttribute("href", "/finance/evidence?page=2&month=2026-09&source=TRUST&scope=month");
    expect(screen.getByRole("link", { name: "연결 원본 확인" })).toHaveAttribute("href", "/source");
    expect(screen.getByRole("combobox", { name: "원본 종류" })).toHaveValue("TRUST");
  });
  it("reports failed reads instead of a successful empty result", async () => {
    mocks.load.mockRejectedValue(new Error("저장소 조회 오류"));
    render(await FinanceReviewPage({ kind: "evidence", query: {} }));
    expect(screen.getByRole("alert")).toHaveTextContent("저장소 조회 오류");
    expect(screen.queryByText("현재 조건에 해당하는 기록이 없습니다.")).not.toBeInTheDocument();
  });
  it("offers missing-date review without claiming or executing a period lock", async () => {
    render(await FinanceReviewPage({ kind: "month-close", query: { scope: "missing-date", month: "2026-03" } }));
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), "month-close", "2026-03", 1, "RESOLUTION", true);
    expect(screen.getByRole("combobox", { name: "점검 범위" })).toHaveValue("missing-date");
    expect(screen.queryByRole("button", { name: "마감 확정" })).not.toBeInTheDocument();
    expect(screen.getByText(/이 목록만으로 전체 회계 마감이 완료되지는/)).toBeInTheDocument();
  });
  it("displays bank directions while refund execution remains unconfigured", async () => {
    mocks.load.mockResolvedValue({ rows: [{ id: "b", title: "환급 검토", status: "처리 미확정", date: "2026-09-01", deposit: 0, withdrawal: 500 }], count: 1, page: 1 });
    render(await FinanceReviewPage({ kind: "refunds", query: {} }));
    expect(screen.getByText("입금 0원 · 출금 500원")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /지급|환급/ })).not.toBeInTheDocument();
  });
  it("requires authentication before any read", async () => {
    mocks.identity.mockResolvedValue(null);
    render(await FinanceReviewPage({ kind: "evidence", query: {} }));
    expect(screen.getByText("로그인 필요")).toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
