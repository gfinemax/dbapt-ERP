import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErpQuickMenu, QUICK_MENU_STORAGE_KEY } from "./erp-quick-menu";

describe("ERP quick menu preferences", () => {
  beforeEach(() => { localStorage.clear(); });
  it("saves additions, removals and order and restores them after remount", () => {
    const mounted = render(<ErpQuickMenu />);
    fireEvent.click(screen.getByRole("button", { name: "퀵메뉴 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "조합원 등록 제거" }));
    fireEvent.change(screen.getByRole("combobox", { name: "퀵메뉴 추가" }), { target: { value: "advance" } });
    fireEvent.click(screen.getByRole("button", { name: "받은 선지급금 정산 위로" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    const saved = JSON.parse(localStorage.getItem(QUICK_MENU_STORAGE_KEY)!);
    expect(saved).not.toContain("members");
    expect(saved.indexOf("advance")).toBe(saved.indexOf("arrears") - 1);
    mounted.unmount();
    render(<ErpQuickMenu />);
    expect(screen.queryByRole("button", { name: "퀵메뉴 조합원 등록" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "퀵메뉴 받은 선지급금 정산" })).toHaveAttribute("href", "/finance/advance-settlements");
  });
  it("does not save cancelled edits and disables unsupported shortcuts", () => {
    render(<ErpQuickMenu />);
    expect(screen.getByRole("button", { name: "퀵메뉴 미납 조합원" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "퀵메뉴 카드내역" })).toHaveAttribute("href", "/finance/quick-expenses?method=corporate-card");
    fireEvent.click(screen.getByRole("button", { name: "퀵메뉴 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "조합원 등록 제거" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByRole("link", { name: "퀵메뉴 조합원 등록" })).toBeInTheDocument();
    expect(localStorage.getItem(QUICK_MENU_STORAGE_KEY)).toBeNull();
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
  it("keeps the editor and draft when browser storage rejects a save", () => {
    render(<ErpQuickMenu />);
    fireEvent.click(screen.getByRole("button", { name: "퀵메뉴 설정" }));
    const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    try {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
      expect(screen.getByRole("alert")).toHaveTextContent("저장할 수 없어");
      expect(screen.getByRole("combobox", { name: "퀵메뉴 추가" })).toBeInTheDocument();
    } finally { save.mockRestore(); }
  });
});
