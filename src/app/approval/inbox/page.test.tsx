import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import Page from "./page";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), documents: vi.fn(), resolutions: vi.fn(), small: vi.fn(), workspace: vi.fn() }));
vi.mock("@/components/erp-shell", () => ({ ErpShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/features/finance/reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("@/features/finance/reimbursement-page", () => ({ ReimbursementLogin: () => <p>로그인 필요</p> }));
vi.mock("@/features/approval/approval-repository", () => ({ listApprovalDocuments: mocks.documents }));
vi.mock("@/features/finance/expense-resolution-repository", () => ({ listExpenseResolutionsFromSupabase: mocks.resolutions }));
vi.mock("@/features/approval/small-expense-repository", () => ({ loadSmallExpenseWorkspace: mocks.workspace }));
vi.mock("@/features/approval/small-expense-inbox", () => ({ loadSmallExpenseInbox: mocks.small }));
vi.mock("@/features/approval/small-expense-page", () => ({ SmallExpensePage: ({ mode }: { mode: string }) => <p>소액 화면 {mode}</p> }));
vi.mock("@/features/finance/expense-approval-inbox-page", () => ({ ExpenseApprovalInboxPage: ({ initialDetailId }: { initialDetailId: string }) => <p>결의 상세 {initialDetailId}</p> }));
vi.mock("@/app/finance/expense-resolutions/actions", () => ({ transitionExpenseApprovalAction: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({ user_id: "chair", organization_id: "org", display_name: "조합장", permissions: ["APPROVE"], active: true });
  mocks.documents.mockResolvedValue([]); mocks.resolutions.mockResolvedValue([]); mocks.small.mockResolvedValue([]);
});
describe("통합 결재함", () => {
  it("다른 유형 조회가 실패해도 지난달 소액 확인 원본으로 이동한다", async () => {
    mocks.documents.mockRejectedValue(new Error("기안 연결 실패"));
    mocks.small.mockResolvedValue([{ key: "small:1", kind: "small", title: "지난달 문구", label: "소액지출 확인", amount: 1000, href: "/approval/inbox?type=small&month=2026-08#small-1" }]);
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("alert")).toHaveTextContent("기안 연결 실패");
    expect(screen.getByRole("link", { name: /지난달 문구/ })).toHaveAttribute("href", "/approval/inbox?type=small&month=2026-08#small-1");
  });
  it("소액 담당자에게 일반 문서 권한을 확대하지 않는다", async () => {
    mocks.identity.mockResolvedValue({ user_id: "chair", organization_id: "org", display_name: "조합장", permissions: [], active: true });
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(mocks.documents).not.toHaveBeenCalled(); expect(mocks.resolutions).not.toHaveBeenCalled();
    expect(mocks.small).toHaveBeenCalled();
  });
  it("지출 상세 원본 ID를 전달한다", async () => {
    render(await Page({ searchParams: Promise.resolve({ type: "expense", id: "original-1" }) }));
    expect(screen.getByText("결의 상세 original-1")).toBeInTheDocument();
  });
  it("소액 확인 화면은 지정 월의 같은 원본을 review 모드로 연다", async () => {
    mocks.workspace.mockResolvedValue({ rows: [] });
    render(await Page({ searchParams: Promise.resolve({ type: "small", month: "2026-08" }) }));
    expect(mocks.workspace).toHaveBeenCalledWith(expect.objectContaining({ user_id: "chair" }), "2026-08");
    expect(screen.getByText("소액 화면 review")).toBeInTheDocument();
  });
});
