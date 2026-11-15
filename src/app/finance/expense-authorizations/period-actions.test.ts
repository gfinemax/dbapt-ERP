import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), record: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/features/finance/expense-authorization", () => ({
  requireExpenseActor: mocks.actor, requireExpenseRecord: mocks.record,
  expenseDb: () => ({ schema: () => ({ rpc: mocks.rpc }) }),
}));
vi.mock("@/features/finance/expense-resolution-repository", () => ({
  stripExpenseAuthorization: (value: Record<string, unknown>) => { const copy = { ...value }; delete copy.authorization; return copy; },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { previewExpenseApprovalPeriodRepairAction, applyExpenseApprovalPeriodRepairAction } from "./period-actions";
import { expenseResolutionFixture } from "@/features/finance/expense-resolution-test-fixture";
import { getOrganizationExpenseApprovalLine } from "@/features/approval/organization-approval-line";
const actor = { user_id: "admin", organization_id: "org", display_name: "관리자", permissions: ["ADMIN"] };
function record() {
  const approvalLine = getOrganizationExpenseApprovalLine("2026-07-01");
  return expenseResolutionFixture({ id: "r", author: "오학동", approvalLine, authorization: { author_user_id: "writer", version: 4, steps: approvalLine.map(step => ({ order: step.order, approver_user_id: "user-" + step.order, legacy_step: step })) } });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue(actor);
  const value = record();
  mocks.record.mockResolvedValue({ actor, resolution: value, binding: value.authorization });
  mocks.rpc.mockResolvedValue({ data: { resolution: value, authorization: value.authorization }, error: null });
});
describe("administrator period repair actions", () => {
  it("previews the authoritative source without making any writes", async () => {
    const result = await previewExpenseApprovalPeriodRepairAction("r", "2026-06-30", "원문 서명일");
    expect(mocks.actor).toHaveBeenCalledWith("ADMIN");
    expect(result.before.authorization?.version).toBe(4);
    expect(result.after.approvalLine.map(step => step.approver)).toEqual(["오학동", "안동연"]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the verified administrator, organization, complete source and binding revision", async () => {
    const value = record();
    await applyExpenseApprovalPeriodRepairAction({ id: "r", expected: value, expectedVersion: 4, referenceDate: "2026-06-30", reason: "원문 서명일", key: "reviewed-operation" });
    expect(mocks.rpc).toHaveBeenCalledWith("repair_expense_approval_period", expect.objectContaining({
      p_org: "org", p_actor: "admin", p_id: "r", p_expected_version: 4,
      p_reference_date: "2026-06-30", p_reason: "원문 서명일", p_key: "reviewed-operation",
      p_expected: expect.not.objectContaining({ authorization: expect.anything() }),
    }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/approval/inbox");
  });
  it("does not send completed financial or approval records for automatic repair", async () => {
    const value = { ...record(), paymentStatus: "지급완료" as const };
    await expect(applyExpenseApprovalPeriodRepairAction({ id: "r", expected: value, expectedVersion: 4, referenceDate: "2026-06-30", reason: "원문", key: "x" })).rejects.toThrow("자동 변경");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects a mismatched reviewed document and propagates stale revision errors", async () => {
    const input = { id: "r", expected: record(), expectedVersion: 4, referenceDate: "2026-06-30", reason: "원문", key: "x" };
    await expect(applyExpenseApprovalPeriodRepairAction({ ...input, id: "other" })).rejects.toThrow("원본");
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "계정 연결이 변경되었습니다." } });
    await expect(applyExpenseApprovalPeriodRepairAction(input)).rejects.toThrow("연결이 변경");
  });
  it("does not bypass administrator authorization and explains a missing migration", async () => {
    mocks.actor.mockRejectedValueOnce(new Error("관리자 권한 필요"));
    await expect(previewExpenseApprovalPeriodRepairAction("r", "2026-06-30", "원문")).rejects.toThrow("관리자");
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing function" } });
    await expect(applyExpenseApprovalPeriodRepairAction({ id: "r", expected: record(), expectedVersion: 4, referenceDate: "2026-06-30", reason: "원문", key: "x" })).rejects.toThrow("마이그레이션");
  });
});
