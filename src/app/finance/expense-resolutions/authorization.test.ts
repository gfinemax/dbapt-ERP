import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), actor: vi.fn(), commit: vi.fn(), transition: vi.fn(), settings: vi.fn(), budgets: vi.fn() }));
vi.mock("@/features/finance/expense-authorization", () => ({ requireExpenseRecord: mocks.access, requireExpenseFact: mocks.access, requireExpenseActor: mocks.actor }));
vi.mock("@/features/finance/expense-resolution-repository", () => ({ commitExpenseCommand: mocks.commit }));
vi.mock("@/features/finance/expense-approval-workflow", () => ({ transitionExpenseApproval: mocks.transition }));
vi.mock("@/features/finance/expense-compliance-repository", () => ({ getExpenseComplianceSettings: mocks.settings }));
vi.mock("@/features/finance/expense-resolution-domain", () => ({ validateExpenseResolutionWorkflow: vi.fn(() => ({ errors: [] })) }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: vi.fn(() => ({})) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/features/finance/expense-evidence-ocr.server", () => ({ extractExpenseEvidenceFile: vi.fn() }));
vi.mock("@/features/finance/expense-evidence-openai.server", () => ({ extractExpenseEvidenceWithOpenAI: vi.fn() }));
vi.mock("@/features/finance/expense-evidence-compression.server", () => ({ compressExpenseEvidenceFile: vi.fn() }));
vi.mock("@/features/finance/budget-profile-repository", () => ({ listExpenseBudgetProfiles: mocks.budgets }));
import { expenseResolutionFixture } from "@/features/finance/expense-resolution-test-fixture";
import { budgetProfilePeriodKey } from "@/features/finance/budget-profile-lookup";
import { transitionExpenseApprovalAction, saveExpenseFactConfirmationAction, deleteExpenseFactConfirmationAction } from "./actions";
const request = { resolutionId: "r", actorLabel: "위조된 관리자", command: "APPROVE" as const, expectedStatus: "승인대기" as const, expectedCurrentApprover: "이전 이름 담당자", expectedAuthorizationVersion: 2 };
function fixture() { return { actor: { user_id: "actual-user", display_name: "실제 사용자", organization_id: "org", permissions: ["APPROVE"] },
  resolution: { id: "r", author: "작성자", approvalStatus: "승인대기", currentApprover: "이전 이름 담당자", history: [], approvalLine: [{ approver: "이전 이름", role: "담당자", status: "결재대기" }, { approver: "최종", role: "조합장", status: "대기" }] },
  binding: { author_user_id: "author", version: 2, steps: [{ order: 1, approver_user_id: "actual-user", legacy_step: { approver: "이전 이름", order: 1, role: "담당자" } }, { order: 2, approver_user_id: "final", legacy_step: { approver: "최종", order: 2, role: "조합장" } }] } }; }
beforeEach(() => { vi.clearAllMocks(); mocks.budgets.mockResolvedValue({}); mocks.settings.mockResolvedValue(null); mocks.access.mockResolvedValue(fixture()); mocks.transition.mockReturnValue({ ...fixture().resolution, history: [{ actorName: "old" }] }); mocks.commit.mockResolvedValue({ id: "r" }); });
it("ignores a forged actor label and records the verified identity", async () => {
  await transitionExpenseApprovalAction(request);
  expect(mocks.transition).toHaveBeenCalledWith(expect.objectContaining({ actorLabel: "이전 이름 담당자" }));
  expect(mocks.commit).toHaveBeenCalledWith("APPROVAL", "r", expect.any(Object), expect.objectContaining({ expected_binding_version: 2, after: expect.objectContaining({ history: [{ actorName: "실제 사용자", actorTitle: "" }] }) }), expect.any(String));
});
it("passes organization compliance settings into the approval workflow", async () => {
  const settings = { postApprovalMaxDays: undefined };
  mocks.settings.mockResolvedValue(settings);
  await transitionExpenseApprovalAction(request);
  expect(mocks.transition).toHaveBeenCalledWith(expect.objectContaining({ settings }));
});
it("rejects a same-named actor whose UUID is not assigned", async () => {
  const access = fixture(); access.actor.user_id = "different-user"; access.actor.display_name = "이전 이름 담당자"; mocks.access.mockResolvedValue(access);
  await expect(transitionExpenseApprovalAction(request)).rejects.toThrow("현재 순서"); expect(mocks.commit).not.toHaveBeenCalled();
});
it("rejects missing bindings and stale client versions before transitioning", async () => {
  await expect(transitionExpenseApprovalAction({ ...request, expectedAuthorizationVersion: 1 })).rejects.toThrow("다시 조회");
  mocks.access.mockResolvedValue({ ...fixture(), binding: null });
  await expect(transitionExpenseApprovalAction(request)).rejects.toThrow("계정 연결"); expect(mocks.transition).not.toHaveBeenCalled();
});
it("requires rebinding when the saved approval route no longer matches the account binding", async () => {
  const access = fixture();
  access.binding.steps[0].legacy_step.approver = "과거 결재자";
  mocks.access.mockResolvedValue(access);
  await expect(transitionExpenseApprovalAction(request)).rejects.toThrow("계정 연결");
  expect(mocks.transition).not.toHaveBeenCalled();
});

it("saves fact drafts atomically with the verified author and rejects signature input", async () => {
  const input = { resolutionId: "r", actualSpender: "지출자", actualExpenseDate: "2026-03-01", vendorName: "거래처", itemDescription: "우편", amount: 1000, businessPurpose: "안내문 발송", missingReceiptReason: "분실", paymentMethod: "현금", authorLabel: "위조 작성자", electronicConfirmation: {} };
  mocks.commit.mockResolvedValue({ id: "fact-id" });
  expect(await saveExpenseFactConfirmationAction(input)).toBe("fact-id");
  expect(mocks.commit).toHaveBeenCalledWith("FACT_SAVE", "r", fixture().resolution, expect.objectContaining({ expected_binding_version: 2, input: expect.objectContaining({ authorLabel: "실제 사용자" }) }), expect.any(String));
  expect(mocks.commit.mock.calls[0][3].input).not.toHaveProperty("electronicConfirmation");
  mocks.commit.mockClear();
  await expect(saveExpenseFactConfirmationAction({ ...input, confirmerLabel: "확인자" })).rejects.toThrow("계정 기반");
  expect(mocks.commit).not.toHaveBeenCalled();
});

it("deletes fact drafts through the same versioned command", async () => {
  await deleteExpenseFactConfirmationAction("fact-id", "r", "위조 작성자");
  expect(mocks.commit).toHaveBeenCalledWith("FACT_DELETE", "r", fixture().resolution, { input: { id: "fact-id", resolutionId: "r" }, expected_binding_version: 2 }, expect.any(String));
});

it("uses the live January budget for approval without overwriting the stored source snapshot", async () => {
  const access = fixture();
  const resolution = expenseResolutionFixture({
    id: "r", author: "author", approvalStatus: "작성중", currentApprover: undefined,
    budgetItem: "benefits", budgetId: "budget-jan", budgetMonth: "2026-01-01", totalPaymentAmount: 252000,
    approvalLine: access.resolution.approvalLine.map((step, index) => ({ ...step, order: index + 1, status: "대기" as const })),
  });
  resolution.budgetSnapshot = { ...resolution.budgetSnapshot, budgetPeriod: "2026-01", monthlyBudgetAmount: 0, currentAnnualBudgetAmount: 0 };
  mocks.access.mockResolvedValue({ ...access, actor: { ...access.actor, user_id: "author" }, resolution });
  const profile = { budgetId: "budget-jan", budgetPeriod: "2026-01", calculationBasis: "approved budget", currentAnnualBudgetAmount: 7800000, monthlyBudgetAmount: 650000, usedAmount: 0, reservedAmount: 0, paymentWaitingAmount: 0, pendingApprovalAmount: 252000, previousAnnualBudgetAmount: 0 };
  const key = budgetProfilePeriodKey("benefits", "2026-01");
  mocks.budgets.mockResolvedValueOnce({ [key]: profile }).mockResolvedValueOnce({ [key]: { ...profile, pendingApprovalAmount: 335000 } });
  mocks.transition.mockImplementation(({ resolution: current }) => ({ ...current, approvalStatus: "승인대기", history: [...current.history, { actorName: "old" }] }));
  mocks.commit.mockImplementation(async (_command, _id, _expected, payload) => payload.after);
  const result = await transitionExpenseApprovalAction({ ...request, command: "REQUEST", expectedStatus: "작성중", expectedCurrentApprover: undefined });
  expect(mocks.budgets).toHaveBeenNthCalledWith(1, "org", ["2026-01"]);
  expect(mocks.commit.mock.calls[0][3].after.budgetSnapshot.monthlyBudgetAmount).toBe(0);
  expect(mocks.commit.mock.calls[0][3].after.history.at(-1).budgetDecision).toMatchObject({ lookupStatus: "LINKED", monthlyBudgetAmount: 650000, remainingBudgetAmount: 398000, source: "OFFICIAL_BUDGET" });
  expect(result.budgetSnapshot).toMatchObject({ budgetPeriod: "2026-01", monthlyBudgetAmount: 650000, currentAnnualBudgetAmount: 7800000, expectedUsedAmount: 335000, remainingBudgetAmount: 315000 });
  mocks.budgets.mockResolvedValueOnce({ [key]: profile }).mockRejectedValueOnce(new Error("temporary read failure"));
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const fallback = await transitionExpenseApprovalAction({ ...request, command: "REQUEST", expectedStatus: "작성중", expectedCurrentApprover: undefined });
    expect(fallback.budgetSnapshot.monthlyBudgetAmount).toBe(650000);
    expect(warning).toHaveBeenCalledOnce();
  } finally {
    warning.mockRestore();
  }
});
