import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReimbursementMember } from "./reimbursement-domain";
const state = vi.hoisted(() => ({ result: { data: [] as unknown[], count: 0, error: null as unknown }, calls: [] as unknown[][], signed: vi.fn(), db: vi.fn() }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: state.db }));
import { financeEvidenceDownload, loadFinanceReview, reviewMonth, reviewPage } from "./finance-review-repository";
const admin: ReimbursementMember = { user_id: "actor", organization_id: "org-a", display_name: "관리자", permissions: ["ADMIN"], active: true };
beforeEach(() => {
  state.result = { data: [], count: 0, error: null }; state.calls = [];
  state.signed.mockReset().mockResolvedValue({ data: { signedUrl: "https://storage.example/signed" }, error: null });
  const query = new Proxy({}, { get(_target, key) {
    if (key === "then") return (resolve: (value: unknown) => void) => resolve(state.result);
    return (...args: unknown[]) => { state.calls.push([key, ...args]); return query; };
  } });
  state.db.mockReset().mockReturnValue({ schema: () => ({ from: (table: string) => { state.calls.push(["from", table]); return query; } }), storage: { from: (bucket: string) => { state.calls.push(["bucket", bucket]); return { createSignedUrl: state.signed }; } } });
});
describe("finance review access and evidence", () => {
  it("represents unconfigured collections without querying a fake empty ledger", async () => {
    expect(await loadFinanceReview(admin, "collections", "2026-09")).toEqual({ rows: [], count: null, page: 1, connection: "NOT_CONFIGURED" });
    expect(state.db).not.toHaveBeenCalled();
  });
  it.each(["PERSONAL", "TRUST"] as const)("loads only organization %s evidence and re-queries the persisted source", async source => {
    state.result = { data: [{ id: "file", merchant: "실제 거래처", purpose: "사용 증빙", submitted_at: "2026-09-01", file_name: "실제 파일.pdf", uploaded_at: "2026-09-01", request_id: "request" }], count: 51, error: null };
    const first = await loadFinanceReview(admin, "evidence", "2026-09", 2, source);
    expect(first.rows[0].href).toBe(`/finance/evidence/file/download?source=${source}`);
    expect(state.calls).toContainEqual(["eq", "organization_id", "org-a"]);
    expect(state.calls).toContainEqual(["range", 50, 99]);
    state.result.data = [];
    expect((await loadFinanceReview(admin, "evidence", "2026-09", 2, source)).rows).toEqual([]);
    expect(state.db).toHaveBeenCalledTimes(2);
  });
  it("lists missing accounting dates across periods and links the exact common expense source", async () => {
    state.result = { data: [{ id: "original 1", resolution_no: "지결-1", subject: "미등록 일자", accounting_date: null, total_payment_amount: 500 }], count: 1, error: null };
    const result = await loadFinanceReview(admin, "month-close", "2026-09", 1, "RESOLUTION", true);
    expect(state.calls).toContainEqual(["is", "accounting_date", null]);
    expect(state.calls.some(call => call[0] === "gte")).toBe(false);
    expect(result.rows[0].href).toBe("/finance/expenses?source_kind=RESOLUTION&source_id=original%201");
  });
  it("preserves refund review inflow and outflow separately from an unconnected refund ledger", async () => {
    state.result = { data: [{ id: "bank", transacted_at: "2026-09-01", description: "검토", withdrawal_amount: 500, deposit_amount: 0 }], count: 1, error: null };
    const result = await loadFinanceReview(admin, "refunds", "2026-09");
    expect(result.connection).toBe("NOT_CONFIGURED");
    expect(result.rows[0]).toMatchObject({ deposit: 0, withdrawal: 500, status: "환급 검토 대상 · 처리 미확정" });
    expect(result.rows[0].amount).toBeUndefined();
  });
  it.each(["PERSONAL", "TRUST"] as const)("signs %s only after organization lookup and rejects foreign storage paths", async source => {
    state.result.data = { evidence_path: "org-a/actor/file", bucket: "finance-workflow", path: "org-a/actor/file" } as unknown as unknown[];
    await financeEvidenceDownload(admin, "file", source);
    expect(state.calls).toContainEqual(["eq", "organization_id", "org-a"]);
    expect(state.signed).toHaveBeenCalledWith("org-a/actor/file", 60, { download: true });
    state.signed.mockClear();
    state.result.data = { evidence_path: "other-org/actor/file", bucket: "finance-workflow", path: "other-org/actor/file" } as unknown as unknown[];
    await expect(financeEvidenceDownload(admin, "file", source)).rejects.toThrow("조회 가능한 증빙");
    expect(state.signed).not.toHaveBeenCalled();
  });
  it("rejects non-admin and inactive accounts before accessing privileged storage", async () => {
    for (const member of [{ ...admin, permissions: [] }, { ...admin, active: false }] as ReimbursementMember[]) {
      await expect(loadFinanceReview(member, "evidence", "2026-09")).rejects.toThrow("관리자 권한");
      await expect(financeEvidenceDownload(member, "file")).rejects.toThrow("관리자 권한");
    }
    expect(state.db).not.toHaveBeenCalled();
  });
  it("restricts evidence to live parent documents in the authenticated organization", async () => {
    state.result = { data: [{ id: "file", original_filename: "계산서.pdf", evidence_type: "계산서", uploaded_at: "2026-09-01" }], count: 67, error: null };
    const result = await loadFinanceReview(admin, "tax-documents", "2026-09", 2);
    expect(state.calls).toContainEqual(["eq", "expense_resolutions.organization_id", "org-a"]);
    expect(state.calls).toContainEqual(["is", "expense_resolutions.deleted_at", null]);
    expect(state.calls).toContainEqual(["in", "evidence_type", ["세금계산서", "계산서", "전자세금계산서", "전자계산서"]]);
    expect(state.calls).toContainEqual(["range", 50, 99]);
    expect(result.count).toBe(67);
    expect(result.rows[0].href).toBe("/finance/evidence/file/download");
  });
  it("never signs a missing or unauthorized evidence record", async () => {
    state.result.data = null as unknown as unknown[];
    await expect(financeEvidenceDownload(admin, "foreign-file")).rejects.toThrow("조회 가능한 증빙");
    expect(state.signed).not.toHaveBeenCalled();
  });
  it("signs only the verified stored bucket/path and expires in one minute", async () => {
    state.result.data = { storage_bucket: "expense-evidence", storage_path: "existing/file.pdf" } as unknown as unknown[];
    await expect(financeEvidenceDownload(admin, "file")).resolves.toContain("signed");
    expect(state.calls).toContainEqual(["eq", "expense_resolutions.organization_id", "org-a"]);
    expect(state.signed).toHaveBeenCalledWith("existing/file.pdf", 60, { download: true });
  });
  it("does not mistake query errors for an empty ledger", async () => {
    state.result.error = { message: "disconnected" };
    await expect(loadFinanceReview(admin, "month-close", "2026-09")).rejects.toThrow("월 마감");
  });
  it("selects an exact accounting month including December rollover", async () => {
    await loadFinanceReview(admin, "month-close", "2026-12");
    expect(state.calls).toContainEqual(["gte", "accounting_date", "2026-12-01"]);
    expect(state.calls).toContainEqual(["lt", "accounting_date", "2027-01-01"]);
    expect(state.calls).toContainEqual(["eq", "organization_id", "org-a"]);
  });
  it("validates month and pagination inputs", () => {
    expect(reviewMonth("2026-99", "2026-09-07")).toBe("2026-09");
    expect(reviewPage("-1")).toBe(1);
    expect(reviewPage("2.5")).toBe(1);
    expect(reviewPage("3")).toBe(3);
  });
});
