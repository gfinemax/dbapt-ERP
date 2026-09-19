import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@/app/finance/quick-menu/actions", () => ({
  loadQuickMenuPreferencesAction: actions.load,
  saveQuickMenuPreferencesAction: actions.save,
}));
import { ErpQuickMenu, QUICK_MENU_STORAGE_KEY } from "./erp-quick-menu";

describe("ERP quick menu preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    actions.load.mockReset().mockResolvedValue({ authenticated: false, menuIds: null, revision: 0 });
    actions.save.mockReset();
  });
  it("saves additions, removals and order and restores them after remount", async () => {
    const mounted = render(<ErpQuickMenu />);
    fireEvent.click(screen.getByRole("button", { name: "퀵메뉴 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "지출 등록·신청 제거" }));
    fireEvent.change(screen.getByRole("combobox", { name: "퀵메뉴 추가" }), { target: { value: "advance" } });
    fireEvent.click(screen.getByRole("button", { name: "받은 선지급금 정산 위로" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "퀵메뉴 추가" })).not.toBeInTheDocument());
    const saved = JSON.parse(localStorage.getItem(QUICK_MENU_STORAGE_KEY)!);
    expect(saved).not.toContain("expense-entry");
    expect(saved.indexOf("advance")).toBe(saved.indexOf("bank") - 1);
    mounted.unmount();
    render(<ErpQuickMenu />);
    expect(screen.queryByRole("link", { name: "퀵메뉴 지출 등록·신청" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "퀵메뉴 받은 선지급금 정산" })).toHaveAttribute("href", "/finance/advance-settlements");
  });
  it("does not save cancelled edits and disables unsupported shortcuts", async () => {
    localStorage.setItem(QUICK_MENU_STORAGE_KEY, JSON.stringify(["arrears", "cards", "members"]));
    render(<ErpQuickMenu />);
    await waitFor(() => expect(actions.load).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "퀵메뉴 미납 조합원" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "퀵메뉴 법인카드 내역 연결" })).toHaveAttribute("href", "/finance/quick-expenses?method=corporate-card");
    fireEvent.click(screen.getByRole("button", { name: "퀵메뉴 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "조합원 등록 제거" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByRole("link", { name: "퀵메뉴 조합원 등록" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(QUICK_MENU_STORAGE_KEY)!)).toEqual(["arrears", "cards", "members"]);
  });
  it("validates stored identifiers and preserves supported callbacks", () => {
    localStorage.setItem(QUICK_MENU_STORAGE_KEY, JSON.stringify(["arrears", "arrears", "malicious", 1]));
    const onSelect = vi.fn();
    render(<ErpQuickMenu onSelect={onSelect} />);
    expect(within(screen.getByRole("region", { name: "퀵메뉴" })).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "퀵메뉴 미납 조합원" }));
    expect(onSelect).toHaveBeenCalledWith("미납 조합원");
  });
  it("falls back safely for corrupt stored preferences", () => {
    localStorage.setItem(QUICK_MENU_STORAGE_KEY, "{");
    render(<ErpQuickMenu />);
    expect(screen.getByRole("link", { name: "퀵메뉴 지출결의 작성" })).toBeInTheDocument();
  });
  it("keeps the editor and draft when browser storage rejects a save", async () => {
    render(<ErpQuickMenu />);
    fireEvent.click(screen.getByRole("button", { name: "퀵메뉴 설정" }));
    const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    try {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("저장할 수 없어"));
      expect(screen.getByRole("combobox", { name: "퀵메뉴 추가" })).toBeInTheDocument();
    } finally { save.mockRestore(); }
  });
  it("loads and saves an authenticated account preference", async () => {
    actions.load.mockResolvedValue({ authenticated: true, menuIds: ["expenses", "corporate-use"], revision: 4 });
    actions.save.mockResolvedValue({ menuIds: ["corporate-use", "expenses"], revision: 5 });
    render(<ErpQuickMenu />);
    await screen.findByRole("link", { name: "퀵메뉴 법인카드 간편처리" });
    fireEvent.click(screen.getByRole("button", { name: "퀵메뉴 설정" }));
    expect(screen.getByText("내 계정의 모든 기기에 같은 메뉴와 순서가 표시돼.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "법인카드 간편처리 위로" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith(["corporate-use", "expenses"], 4, expect.any(String)));
    expect(JSON.parse(localStorage.getItem(QUICK_MENU_STORAGE_KEY)!)).toEqual(["corporate-use", "expenses"]);
  });
  it("shows source-backed pending counts and offers refund management", () => {
    localStorage.setItem(QUICK_MENU_STORAGE_KEY, JSON.stringify(["cards", "refunds", "resolution"]));
    render(<ErpQuickMenu badges={{ "법인카드 내역 연결": 3, "환급관리": 2 }} />);
    expect(screen.getByLabelText("법인카드 내역 연결 대기 3건")).toHaveTextContent("3");
    expect(screen.getByLabelText("환급관리 대기 2건")).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: "퀵메뉴 환급관리" })).toHaveAttribute("href", "/finance/refunds");
    expect(screen.queryByLabelText(/지출결의 작성 대기/)).not.toBeInTheDocument();
  });
});
