import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn(), db: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
import { loadFinanceDashboardTasks, loadFinanceTaskSources } from "./finance-task-sources-repository";
beforeEach(() => { vi.clearAllMocks(); mocks.identity.mockResolvedValue({ active: true, organization_id: "verified-org", user_id: "verified-user" }); mocks.db.mockReturnValue({ schema: () => ({ rpc: mocks.rpc }) }); mocks.rpc.mockResolvedValue({ data: [], error: null }); });
it("uses verified identity and queries again for refreshed tasks", async () => {
  await loadFinanceTaskSources(); await loadFinanceTaskSources();
  expect(mocks.rpc).toHaveBeenCalledWith("finance_task_sources", { p_org: "verified-org", p_actor: "verified-user" });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
it("rejects inactive users before privileged reads", async () => {
  mocks.identity.mockResolvedValue({ active: false });
  await expect(loadFinanceTaskSources()).rejects.toThrow("활성"); expect(mocks.db).not.toHaveBeenCalled();
});
it("preserves failure instead of reporting zero tasks", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
  await expect(loadFinanceTaskSources()).rejects.toThrow("불러오지");
});
it("returns only minimal recognized task fields and rejects unsafe links", async () => {
  const row = { id: "one", kind: "MY_APPROVAL", title: "기안", detail: "내 순서", href: "/approval/one" };
  mocks.rpc.mockResolvedValue({ data: [{ ...row, account_no: "hidden" }], error: null });
  expect(await loadFinanceTaskSources()).toEqual([row]);
  mocks.rpc.mockResolvedValue({ data: [{ ...row, href: "//external" }], error: null });
  await expect(loadFinanceTaskSources()).rejects.toThrow("형식");
});
it("loads all dashboard task kinds and restores payment search links", async () => {
  const row = { id: "pay:one", kind: "PAYABLE", title: "용역비 & 수수료", detail: "지급 가능", href: "/finance/payments?tab=READY" };
  mocks.rpc.mockResolvedValue({ data: [{ ...row, account_no: "hidden" }], error: null });
  expect(await loadFinanceDashboardTasks()).toEqual([{ ...row, href: "/finance/payments?tab=READY&q=%EC%9A%A9%EC%97%AD%EB%B9%84%20%26%20%EC%88%98%EC%88%98%EB%A3%8C" }]);
  expect(mocks.rpc).toHaveBeenCalledWith("finance_dashboard_tasks", { p_org: "verified-org", p_actor: "verified-user" });
});
it("rejects unknown dashboard kinds", async () => {
  mocks.rpc.mockResolvedValue({ data: [{ id: "one", kind: "UNKNOWN", title: "업무", detail: "확인", href: "/finance" }], error: null });
  await expect(loadFinanceDashboardTasks()).rejects.toThrow("형식");
});
