import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), actor: vi.fn(), commit: vi.fn(), transition: vi.fn(), settings: vi.fn() }));
vi.mock("@/features/finance/expense-authorization", () => ({ requireExpenseRecord: mocks.access, requireExpenseFact: mocks.access, requireExpenseActor: mocks.actor }));
vi.mock("@/features/finance/expense-resolution-repository", () => ({ commitExpenseCommand: mocks.commit }));
vi.mock("@/features/finance/expense-approval-workflow", () => ({ transitionExpenseApproval: mocks.transition }));
vi.mock("@/features/finance/expense-compliance-repository", () => ({ getExpenseComplianceSettings: mocks.settings }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/features/finance/expense-evidence-ocr.server", () => ({ extractExpenseEvidenceFile: vi.fn() }));
vi.mock("@/features/finance/expense-evidence-openai.server", () => ({ extractExpenseEvidenceWithOpenAI: vi.fn() }));
vi.mock("@/features/finance/expense-evidence-compression.server", () => ({ compressExpenseEvidenceFile: vi.fn() }));
import { transitionExpenseApprovalAction, saveExpenseFactConfirmationAction, deleteExpenseFactConfirmationAction } from "./actions";
const request = { resolutionId: "r", actorLabel: "위조된 관리자", command: "APPROVE" as const, expectedStatus: "승인대기" as const, expectedCurrentApprover: "이전 이름 담당자", expectedAuthorizationVersion: 2 };
function fixture() { return { actor: { user_id: "actual-user", display_name: "실제 사용자", organization_id: "org", permissions: ["APPROVE"] },
  resolution: { id: "r", author: "작성자", approvalStatus: "승인대기", currentApprover: "이전 이름 담당자", history: [], approvalLine: [{ approver: "이전 이름", role: "담당자", status: "결재대기" }, { approver: "최종", role: "조합장", status: "대기" }] },
  binding: { author_user_id: "author", version: 2, steps: [{ order: 1, approver_user_id: "actual-user", legacy_step: { role: "담당자" } }, { order: 2, approver_user_id: "final" }] } }; }
beforeEach(() => { vi.clearAllMocks(); mocks.settings.mockResolvedValue(null); mocks.access.mockResolvedValue(fixture()); mocks.transition.mockReturnValue({ ...fixture().resolution, history: [{ actorName: "old" }] }); mocks.commit.mockResolvedValue({ id: "r" }); });
it("ignores a forged actor label and records the verified identity", async () => {
  await transitionExpenseApprovalAction(request);
  expect(mocks.transition).toHaveBeenCalledWith(expect.objectContaining({ actorLabel: "이전 이름 담당자" }));
  expect(mocks.commit).toHaveBeenCalledWith("APPROVAL", "r", expect.any(Object), expect.objectContaining({ expected_binding_version: 2, after: expect.objectContaining({ history: [{ actorName: "실제 사용자", actorTitle: "" }] }) }), expect.any(String));
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
