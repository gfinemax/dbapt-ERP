import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/features/finance/fund-workflow-repository", () => ({ runFundWorkflow: mocks.run }));
import { connectExpenseOriginal } from "./actions";
import type { ExpenseSourceKind } from "@/features/finance/expense-workspace-repository";
beforeEach(() => { vi.clearAllMocks(); mocks.run.mockResolvedValue({ id: "existing-transaction" }); });
describe("common expense source connection action", () => {
  it("reuses ENROLL with original type/text ID and refreshes linked workspaces", async () => {
    expect(await connectExpenseOriginal("RESOLUTION", "old-text-id", "retry-key")).toEqual({ id: "existing-transaction" });
    expect(mocks.run).toHaveBeenCalledWith("ENROLL", { source_kind: "RESOLUTION", source_id: "old-text-id" }, "retry-key");
    expect(mocks.revalidate.mock.calls.map(call => call[0])).toEqual(["/finance/expenses", "/finance/trust", "/finance/payments", "/finance"]);
  });
  it("propagates owner/permission failures and never reports refreshed state", async () => {
    mocks.run.mockRejectedValue(new Error("본인의 원본만 연결할 수 있습니다."));
    await expect(connectExpenseOriginal("PERSONAL", "other-user-source", "key")).rejects.toThrow("본인의 원본");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("rejects unimplemented source kinds and empty original IDs", async () => {
    await expect(connectExpenseOriginal("ADVANCE" as ExpenseSourceKind, "source", "key")).rejects.toThrow("원본");
    await expect(connectExpenseOriginal("QUICK", " ", "key")).rejects.toThrow("원본");
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
