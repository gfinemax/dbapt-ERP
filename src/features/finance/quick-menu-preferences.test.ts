import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: () => ({ schema: () => ({ rpc: mocks.rpc }) }) }));
import { loadQuickMenuPreferences, saveQuickMenuPreferences } from "./quick-menu-preferences";

describe("quick menu account preferences", () => {
  beforeEach(() => {
    mocks.identity.mockReset().mockResolvedValue({ organization_id: "org", user_id: "actor", display_name: "사용자", permissions: [], active: true });
    mocks.rpc.mockReset();
  });
  it("loads only allowlisted account menu identifiers", async () => {
    mocks.rpc.mockResolvedValue({ data: { menu_ids: ["expenses", "malicious", "expenses", "readiness"], revision: 3 }, error: null });
    await expect(loadQuickMenuPreferences()).resolves.toEqual({ authenticated: true, menuIds: ["expenses", "readiness"], revision: 3 });
    expect(mocks.rpc).toHaveBeenCalledWith("quick_menu_preferences_read", { p_org: "org", p_actor: "actor" });
  });
  it("sends the authenticated actor scope and expected revision on save", async () => {
    mocks.rpc.mockResolvedValue({ data: { menu_ids: ["corporate-use"], revision: 5 }, error: null });
    await expect(saveQuickMenuPreferences(["corporate-use"], 4, "operation")).resolves.toEqual({ menuIds: ["corporate-use"], revision: 5 });
    expect(mocks.rpc).toHaveBeenCalledWith("quick_menu_preferences_save", { p_org: "org", p_actor: "actor", p_menu_ids: ["corporate-use"], p_expected_revision: 4, p_operation_key: "operation" });
  });
  it("maps a stale revision to a safe retry instruction", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "다른 화면에서 퀵메뉴가 변경되었습니다." } });
    await expect(saveQuickMenuPreferences(["expenses"], 1, "stale")).rejects.toThrow("새로고침 후 다시 저장");
  });
});
