import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pathname: "/", identity: vi.fn(), load: vi.fn(), save: vi.fn(), badges: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/features/finance/reimbursement-auth", () => ({ reimbursementIdentity: mocks.identity }));
vi.mock("@/app/finance/quick-menu/actions", () => ({ loadQuickMenuPreferencesAction: mocks.load, saveQuickMenuPreferencesAction: mocks.save }));
vi.mock("@/app/finance/navigation/actions", () => ({ loadFinanceNavigationBadgesAction: mocks.badges }));
import RootLayout from "./layout";
import { ErpShell } from "@/components/erp-shell";
async function pageBody(label = "페이지 본문") {
  const layout = await RootLayout({ children: <p>{label}</p> });
  return layout.props.children.props.children;
}
async function loaded() {
  await waitFor(() => expect(screen.queryByText("설정을 불러오는 중입니다.")).not.toBeInTheDocument());
}
describe("global favorites layout", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.pathname = "/";
    mocks.identity.mockReset().mockResolvedValue({ organization_id: "org", user_id: "actor" });
    mocks.load.mockReset().mockResolvedValue({ authenticated: true, menuIds: null, revision: 0 });
    mocks.save.mockReset();
    mocks.badges.mockReset().mockResolvedValue({});
  });
  it.each(["/", "/finance/expense-resolutions", "/finance", "/approval/new", "/members", "/basic-info", "/hr-payroll"])("shows one favorites bar on %s without requiring an ERP shell", async (path) => {
    mocks.pathname = path;
    const view = render(await pageBody());
    await loaded();
    expect(screen.getAllByRole("navigation", { name: "즐겨찾기 바로가기" })).toHaveLength(1);
    expect(screen.getByText("즐겨찾기", { exact: true })).toBeVisible();
    expect(screen.getByRole("link", { name: "즐겨찾기 지출결의서" })).toHaveAttribute("href", "/finance/expense-resolutions");
    expect(view.container.querySelector("[data-erp-global-favorites]")).toHaveClass("sticky", "top-0", "print:hidden");
    expect(screen.getByText("페이지 본문")).toBeInTheDocument();
  });
  it("keeps the account favorite order when navigating between unrelated pages", async () => {
    mocks.load.mockResolvedValue({ authenticated: true, menuIds: ["vouchers", "resolution-list"], revision: 4 });
    mocks.pathname = "/finance";
    const view = render(await pageBody("전표"));
    await loaded();
    mocks.pathname = "/members";
    view.rerender(await pageBody("조합원"));
    await loaded();
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["전표", "지출결의서"]);
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("refreshes preferences when the logged-in account changes on the same page", async () => {
    mocks.load.mockResolvedValueOnce({ authenticated: true, menuIds: ["vouchers"], revision: 2 });
    const view = render(await pageBody());
    await loaded();
    mocks.identity.mockResolvedValue({ organization_id: "org", user_id: "other" });
    mocks.load.mockResolvedValueOnce({ authenticated: true, menuIds: ["budget"], revision: 1 });
    view.rerender(await pageBody());
    await loaded();
    expect(screen.getByRole("link", { name: "즐겨찾기 예산" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "즐겨찾기 전표" })).not.toBeInTheDocument();
  });
  it("remains visible with a collapsed sidebar and avoids rendering twice", async () => {
    const layout = await RootLayout({ children: <ErpShell activeLabel="회계·자금"><p>본문</p></ErpShell> });
    render(layout.props.children.props.children);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "사이드바 닫기" }));
    expect(screen.getAllByRole("navigation", { name: "즐겨찾기 바로가기" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "즐겨찾기 편집" })).toBeVisible();
  });
  it("keeps default links available on login screens and on authentication lookup failure", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("offline"));
    mocks.load.mockResolvedValueOnce({ authenticated: false, menuIds: null, revision: 0 });
    render(await pageBody("로그인"));
    await loaded();
    expect(screen.getByRole("link", { name: "즐겨찾기 전표" })).toBeVisible();
    expect(mocks.badges).not.toHaveBeenCalled();
  });
});
