import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), identity: vi.fn(), rpc: vi.fn(), run: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/features/finance/fund-workflow-repository", () => ({ runFundWorkflow: mocks.run }));
vi.mock("@/features/finance/expense-authorization", () => ({ requireExpenseActor: mocks.actor }));
vi.mock("@/features/finance/reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("@/features/finance/reimbursement-repository", () => ({ reimbursementDb: () => ({ schema: () => ({ rpc: mocks.rpc }) }) }));
import { attachQuickExpenseEvidenceAction, connectExpenseOriginal, updatePersonalReimbursementDetailsAction, updateQuickExpenseDetailsAction } from "./actions";
import type { ExpenseSourceKind } from "@/features/finance/expense-workspace-repository";
beforeEach(() => { vi.clearAllMocks(); mocks.run.mockResolvedValue({ id: "existing-transaction" }); mocks.actor.mockResolvedValue({ organization_id: "org", user_id: "actor" }); mocks.identity.mockResolvedValue({ organization_id: "org", user_id: "actor" }); mocks.rpc.mockResolvedValue({ data: { id: "quick" }, error: null }); });
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
  it("updates only reviewed descriptive fields through the scoped idempotent command", async () => {
    await updateQuickExpenseDetailsAction({ id: "quick", usageDescription: "서류꽂이", counterparty: "다이소", budgetItem: "일반운영비>사무용품비", expenseDetailId: "detail", expectedUpdatedAt: "2026-09-08T00:00:00Z", operationKey: "edit-key" });
    expect(mocks.rpc).toHaveBeenCalledWith("quick_expense_command", { p_org: "org", p_actor: "actor", p_command: "UPDATE_DETAILS", p_id: "quick", p_data: { usage_description: "서류꽂이", counterparty: "다이소", budget_item: "일반운영비>사무용품비", expense_detail_id: "detail", expected_updated_at: "2026-09-08T00:00:00Z" }, p_key: "edit-key" });
    expect(mocks.revalidate.mock.calls.map(call => call[0])).toEqual(["/finance/expenses", "/finance/quick-expenses"]);
  });
  it("attaches only the server-issued OCR job identifier", async () => {
    await attachQuickExpenseEvidenceAction("quick", { id: "job", ocrJobId: "job", contentType: "image/jpeg", evidenceType: "영수증", fileName: "receipt.jpg", fileSize: 10, ocrData: {}, ocrStatus: "REVIEW_REQUIRED", storageBucket: "expense-evidence", storagePath: "untrusted-client-path", uploadedAt: "2026-09-08", uploadedBy: "Admin" }, "attach-key");
    expect(mocks.rpc).toHaveBeenCalledWith("quick_expense_command", { p_org: "org", p_actor: "actor", p_command: "ATTACH_EVIDENCE", p_id: "quick", p_data: { ocr_job_id: "job" }, p_key: "attach-key" });
  });
  it("updates only personal reimbursement descriptive fields and records the reason", async () => {
    await expect(updatePersonalReimbursementDetailsAction({ id: "personal", merchant: " 새 거래처 ", purpose: " 수정한 사용내용 ", reason: " 상호 오기 ", expectedUpdatedAt: "2026-09-18T00:00:00Z" })).resolves.toEqual({ ok: true, message: "거래처와 사용내용을 수정했고 변경 이력을 남겼어." });
    expect(mocks.rpc).toHaveBeenCalledWith("reimbursement_detail_update", { p_org: "org", p_actor: "actor", p_id: "personal", p_merchant: "새 거래처", p_purpose: "수정한 사용내용", p_reason: "상호 오기", p_expected_updated_at: "2026-09-18T00:00:00Z" });
    expect(mocks.revalidate.mock.calls.map(call => call[0])).toEqual(["/finance/expenses", "/finance/reimbursements", "/finance/trust", "/finance/payments", "/finance"]);
  });
  it("returns a safe Korean validation result instead of a production server digest", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "변경된 거래처 또는 사용내용이 없습니다." } });
    await expect(updatePersonalReimbursementDetailsAction({ id: "personal", merchant: "기존", purpose: "기존", reason: "확인", expectedUpdatedAt: "2026-09-18T00:00:00Z" })).resolves.toEqual({ ok: false, message: "변경된 거래처 또는 사용내용이 없습니다." });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
