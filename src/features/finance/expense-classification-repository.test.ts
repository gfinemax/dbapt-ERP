import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), db: vi.fn(), rpc: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
import { loadExpenseClassification, saveExpenseClassification } from "./expense-classification-repository";
import type { ExpenseClassificationInput } from "./expense-classification";
const input: ExpenseClassificationInput = { transaction_id: "tx", expected_version: 0, source_signature: "sig", cost_category: "OPERATING", payment_method: "PERSONAL_CARD", funding_origin: "PERSONAL", processing_route: "RESOLUTION", advance_transaction_id: null, reason: "검토" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({ organization_id: "org", user_id: "actor", active: true, permissions: ["ADMIN"] });
  mocks.db.mockReturnValue({ schema: () => ({ rpc: mocks.rpc }) });
});
describe("expense classification server authorization", () => {
  it("uses only the authenticated organization and actor", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...input, version: 1 }, error: null });
    await saveExpenseClassification(input, "retry-key");
    expect(mocks.rpc).toHaveBeenCalledWith("expense_classification_save", { p_org: "org", p_actor: "actor", p_data: input, p_key: "retry-key" });
  });
  it.each([{ active: false, permissions: ["ADMIN"] }, { active: true, permissions: ["PAY"] }, { active: true, permissions: [] }])("rejects inaccessible read and write before privileged storage: %o", async (access) => {
    mocks.identity.mockResolvedValue({ organization_id: "org", user_id: "actor", ...access });
    await expect(saveExpenseClassification(input, "key")).rejects.toThrow("권한");
    await expect(loadExpenseClassification("tx")).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects contradictory axes before making a database call", async () => {
    await expect(saveExpenseClassification({ ...input, payment_method: "CORPORATE_CARD" }, "key")).rejects.toThrow("조합 자금");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("does not claim success when storage fails or returns a different transaction", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "version conflict" } });
    await expect(saveExpenseClassification(input, "key")).rejects.toThrow("version conflict");
    mocks.rpc.mockResolvedValueOnce({ data: { transaction_id: "other", version: 1 }, error: null });
    await expect(saveExpenseClassification(input, "key")).rejects.toThrow("저장 결과");
  });
});
