import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: () => ({ schema: () => ({ rpc: mocks.rpc }) }) }));
import { applyCollectionAssessmentImport, loadCollectionLedger, previewCollectionAssessmentImport, runCollectionLedger } from "./collection-ledger-repository";

beforeEach(() => {
  mocks.identity.mockReset().mockResolvedValue({ user_id: "actor", organization_id: "org", active: true, permissions: ["ADMIN"] });
  mocks.rpc.mockReset().mockResolvedValue({ data: { assessments: [], allocations: [], refunds: [], deposit_candidates: [], withdrawal_candidates: [] }, error: null });
});
describe("collection ledger repository", () => {
  it("loads only through the authenticated organization and adds the verified viewer", async () => {
    const workspace = await loadCollectionLedger();
    expect(mocks.rpc).toHaveBeenCalledWith("collection_ledger_read", { p_org: "org", p_actor: "actor" });
    expect(workspace.viewer).toEqual({ user_id: "actor", permissions: ["ADMIN"] });
  });
  it("never accepts organization or actor input from the client", async () => {
    await expect(runCollectionLedger("ASSESSMENT_SAVE", { organization_id: "other" }, "key")).rejects.toThrow("서버에서 확인");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires payment permission for actual bank linkage", async () => {
    mocks.identity.mockResolvedValue({ user_id: "actor", organization_id: "org", active: true, permissions: ["APPROVE"] });
    await expect(runCollectionLedger("RECEIPT_ALLOCATE", {}, "key")).rejects.toThrow("권한");
  });
  it("passes an idempotency key and validates the persisted result", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "assessment", status: "ACTIVE", lock_version: 1 }, error: null });
    await expect(runCollectionLedger("ASSESSMENT_SAVE", { external_member_id: "peopleon-1" }, "stable-key")).resolves.toMatchObject({ id: "assessment" });
    expect(mocks.rpc).toHaveBeenCalledWith("collection_ledger_command", expect.objectContaining({ p_org: "org", p_actor: "actor", p_key: "stable-key" }));
  });
  it("previews and applies imports only with the authenticated organization", async () => {
    const result = { batch_id: "batch", file_name: "rows.csv", content_hash: "a".repeat(64), status: "PREVIEW", row_count: 1, create_count: 1, update_count: 0, unchanged_count: 0, error_count: 0, rows: [] };
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    await previewCollectionAssessmentImport({ fileName: "rows.csv", contentHash: "a".repeat(64), rows: [{ row_number: 2, external_member_id: "peopleon-1", member_no: "", member_name_snapshot: "홍길동", assessment_code: "A", due_date: "", assessed_amount: 1000 }] });
    expect(mocks.rpc).toHaveBeenCalledWith("collection_assessment_import_preview", expect.objectContaining({ p_org: "org", p_actor: "actor", p_file_name: "rows.csv" }));
    mocks.rpc.mockResolvedValue({ data: { ...result, status: "APPLIED" }, error: null });
    await applyCollectionAssessmentImport("batch", "stable-key");
    expect(mocks.rpc).toHaveBeenCalledWith("collection_assessment_import_apply", { p_org: "org", p_actor: "actor", p_batch: "batch", p_key: "stable-key" });
  });
  it("does not allow a payment-only actor to import assessments", async () => {
    mocks.identity.mockResolvedValue({ user_id: "actor", organization_id: "org", active: true, permissions: ["PAY"] });
    await expect(previewCollectionAssessmentImport({ fileName: "rows.csv", contentHash: "a".repeat(64), rows: [] })).rejects.toThrow("등록 권한");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
