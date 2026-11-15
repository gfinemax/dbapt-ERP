import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@/app/finance/quick-menu/actions", () => ({
  loadQuickMenuPreferencesAction: actions.load,
  saveQuickMenuPreferencesAction: actions.save,
}));
import { ErpQuickMenu, QUICK_MENU_STORAGE_KEY } from "./erp-quick-menu";
import { defaultQuickMenuIds } from "@/features/finance/erp-quick-menu-catalog";

async function openEditor() {
  await waitFor(() => expect(screen.queryByText("설정을 불러오는 중입니다.")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "즐겨찾기 편집" }));
}
function add(id: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "즐겨찾기 추가" }), { target: { value: id } });
}
async function save() {
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "즐겨찾기 편집" })).not.toBeInTheDocument());
}
describe("personalized top favorites", () => {
  beforeEach(() => {
    localStorage.clear();
    actions.load.mockReset().mockResolvedValue({ authenticated: false, menuIds: null, revision: 0 });
    actions.save.mockReset();
  });
  it("shows recommended destinations immediately and preserves favorites when remounted", async () => {
    const mounted = render(<ErpQuickMenu placement="top" />);
    expect(screen.getByRole("link", { name: "즐겨찾기 지출결의서" })).toHaveAttribute("href", "/finance/expense-resolutions");
    expect(screen.getByRole("link", { name: "즐겨찾기 전표" })).toHaveAttribute("href", "/finance");
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "지출 등록·신청 제거" }));
    add("payments");
    fireEvent.click(screen.getByRole("button", { name: "지급대기 위로" }));
    await save();
    const ids = JSON.parse(localStorage.getItem(QUICK_MENU_STORAGE_KEY)!);
    expect(ids).not.toContain("expense-entry");
    expect(ids.indexOf("payments")).toBe(ids.indexOf("budget") - 1);
    mounted.unmount();
    render(<ErpQuickMenu placement="top" />);
    await waitFor(() => expect(screen.queryByText("설정을 불러오는 중입니다.")).not.toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "즐겨찾기 지출 등록·신청" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "즐겨찾기 지급대기" })).toHaveAttribute("href", "/finance/payments?tab=UNPAID");
  });
  it("searches menu choices and cancels edits without saving", async () => {
    render(<ErpQuickMenu placement="top" />);
    await openEditor();
    expect(screen.getByRole("textbox", { name: "즐겨찾기 메뉴 검색" })).toHaveFocus();
    fireEvent.change(screen.getByRole("textbox", { name: "즐겨찾기 메뉴 검색" }), { target: { value: "정산" } });
    const options = within(screen.getByRole("combobox", { name: "즐겨찾기 추가" })).getAllByRole("option").slice(1);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((option) => option.textContent?.includes("정산"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "전표 제거" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByRole("link", { name: "즐겨찾기 전표" })).toBeInTheDocument();
    expect(localStorage.getItem(QUICK_MENU_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "즐겨찾기 편집" })).toHaveFocus();
  });
  it("restores defaults and closes the editor with Escape", async () => {
    localStorage.setItem(QUICK_MENU_STORAGE_KEY, JSON.stringify(["expenses"]));
    render(<ErpQuickMenu placement="top" />);
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "기본값" }));
    await save();
    expect(JSON.parse(localStorage.getItem(QUICK_MENU_STORAGE_KEY)!)).toEqual(defaultQuickMenuIds);
    await openEditor();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "즐겨찾기 메뉴 검색" }), { key: "Escape" });
    expect(screen.queryByRole("region", { name: "즐겨찾기 편집" })).not.toBeInTheDocument();
  });
  it("loads the account preference and saves the new menus in order", async () => {
    actions.load.mockResolvedValue({ authenticated: true, menuIds: ["expenses", "vouchers"], revision: 4 });
    actions.save.mockResolvedValue({ menuIds: ["vouchers", "expenses", "resolution-list"], revision: 5 });
    render(<ErpQuickMenu placement="top" />);
    await openEditor();
    expect(screen.getByText("내 계정의 모든 기기에 같은 메뉴와 순서가 표시돼.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전표 위로" }));
    add("resolution-list");
    await save();
    expect(actions.save).toHaveBeenCalledWith(["vouchers", "expenses", "resolution-list"], 4, expect.any(String));
    expect(within(screen.getByRole("navigation", { name: "즐겨찾기 바로가기" })).getAllByRole("link").map((link) => link.textContent)).toEqual(["전표", "전체 지출", "지출결의서"]);
  });
  it("does not report an account save as failed when browser storage is blocked", async () => {
    actions.load.mockResolvedValue({ authenticated: true, menuIds: ["vouchers"], revision: 1 });
    actions.save.mockResolvedValue({ menuIds: ["vouchers", "budget"], revision: 2 });
    render(<ErpQuickMenu placement="top" />);
    await openEditor();
    add("budget");
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    try { await save(); expect(screen.queryByRole("alert")).not.toBeInTheDocument(); }
    finally { storage.mockRestore(); }
  });
  it("keeps the draft when anonymous browser storage rejects saving", async () => {
    render(<ErpQuickMenu placement="top" />);
    await openEditor();
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    try {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("저장할 수 없어"));
      expect(screen.getByRole("region", { name: "즐겨찾기 편집" })).toBeInTheDocument();
    } finally { storage.mockRestore(); }
  });
  it("blocks overwriting unavailable account settings and permits reloading them", async () => {
    actions.load.mockRejectedValueOnce(new Error("offline"));
    render(<ErpQuickMenu placement="top" />);
    await screen.findByRole("alert");
    await openEditor();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    actions.load.mockResolvedValue({ authenticated: true, menuIds: ["vouchers"], revision: 7 });
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await openEditor();
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "전표 제거" })).toBeInTheDocument();
  });
  it("retains the editor on account conflicts and changes the retry key when the draft changes", async () => {
    actions.load.mockResolvedValue({ authenticated: true, menuIds: ["vouchers"], revision: 3 });
    actions.save.mockRejectedValue(new Error("다른 화면에서 변경됐습니다. 새로고침해주세요."));
    render(<ErpQuickMenu placement="top" />);
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByRole("alert");
    const key = actions.save.mock.calls[0][2];
    add("budget");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(2));
    expect(actions.save.mock.calls[1][2]).not.toBe(key);
    expect(screen.getByRole("region", { name: "즐겨찾기 편집" })).toBeInTheDocument();
  });
  it("preserves older 12-menu preferences, limits additions and prevents an empty save", async () => {
    localStorage.setItem(QUICK_MENU_STORAGE_KEY, JSON.stringify(["members","collections","refunds","bank","cards","resolution","payments","evidence","advance","expenses","corporate-use","expense-entry"]));
    render(<ErpQuickMenu placement="top" />);
    await openEditor();
    expect(screen.getByRole("combobox", { name: "즐겨찾기 추가" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: / 제거$/ })) fireEvent.click(button);
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "즐겨찾기 추가" })).toBeEnabled();
  });
  it("validates browser preferences and provides the narrow-screen more toggle", async () => {
    localStorage.setItem(QUICK_MENU_STORAGE_KEY, JSON.stringify(["vouchers", "vouchers", "malicious", 1]));
    const mounted = render(<ErpQuickMenu placement="top" />);
    await waitFor(() => expect(screen.queryByText("설정을 불러오는 중입니다.")).not.toBeInTheDocument());
    expect(within(screen.getByRole("navigation", { name: "즐겨찾기 바로가기" })).getAllByRole("link")).toHaveLength(1);
    mounted.unmount();
    localStorage.setItem(QUICK_MENU_STORAGE_KEY, "{");
    render(<ErpQuickMenu placement="top" />);
    await waitFor(() => expect(screen.queryByText("설정을 불러오는 중입니다.")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "즐겨찾기 지출결의서" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "즐겨찾기 더보기" }));
    expect(screen.getByRole("button", { name: "즐겨찾기 접기" })).toHaveAttribute("aria-expanded", "true");
  });
});
