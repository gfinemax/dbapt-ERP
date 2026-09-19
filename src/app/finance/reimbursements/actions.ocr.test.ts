import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  identity: vi.fn(),
  localOcr: vi.fn(),
  openAiOcr: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/features/finance/reimbursement-auth", () => ({
  reimbursementCookie: "erp-reimbursement-access",
  requireReimbursementIdentity: mocks.identity,
}));
vi.mock("@/features/finance/reimbursement-repository", () => ({ reimbursementCommand: vi.fn(), reimbursementDb: mocks.db }));
vi.mock("@/features/finance/expense-evidence-ocr.server", () => ({ extractExpenseEvidenceFile: mocks.localOcr }));
vi.mock("@/features/finance/expense-evidence-openai.server", () => ({ extractExpenseEvidenceWithOpenAI: mocks.openAiOcr }));

import { analyzeReimbursementEvidence, submitReimbursement } from "./actions";

function evidenceForm(bytes = new Uint8Array([255, 216, 255])) {
  const form = new FormData();
  form.set("evidence", new File([bytes], "receipt.jpg", { type: "image/jpeg" }));
  return form;
}

describe("reimbursement evidence OCR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mocks.identity.mockResolvedValue({ organization_id: "org", user_id: "user" });
  });

  it("authenticates and returns normalized OCR facts without storing a reimbursement", async () => {
    mocks.openAiOcr.mockResolvedValue({ documentDate: "2026. 9. 15.", issuer: "공단유통", totalAmount: 32600 });
    await expect(analyzeReimbursementEvidence(evidenceForm())).resolves.toEqual({
      ocrData: { documentDate: "2026-09-15", issuer: "공단유통", totalAmount: 32600 },
    });
    expect(mocks.identity).toHaveBeenCalledOnce();
    expect(mocks.openAiOcr).toHaveBeenCalledOnce();
  });

  it("falls back to local OCR when the primary analysis fails", async () => {
    mocks.openAiOcr.mockRejectedValue(new Error("temporary failure"));
    mocks.localOcr.mockResolvedValue({ issuer: "문구점", totalAmount: 12000 });
    await expect(analyzeReimbursementEvidence(evidenceForm())).resolves.toMatchObject({
      ocrData: { issuer: "문구점", totalAmount: 12000, processingNote: expect.stringContaining("로컬 OCR로 전환") },
    });
  });

  it("rejects disguised files before calling OCR", async () => {
    await expect(analyzeReimbursementEvidence(evidenceForm(new Uint8Array([1, 2, 3]))))
      .rejects.toThrow("실제 PDF·PNG·JPEG·WebP 파일만 첨부할 수 있습니다.");
    expect(mocks.openAiOcr).not.toHaveBeenCalled();
  });

  it("reuses stored evidence when an existing personal expense is linked", async () => {
    const quickLinkQuery = chain({ data: { ocr_job_id: "job-1" }, error: null });
    const jobQuery = chain({ data: { storage_bucket: "expense-evidence", storage_path: "org/receipt.jpg" }, error: null });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const download = vi.fn().mockResolvedValue({ data: new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }), error: null });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.db.mockReturnValue({
      schema: () => ({
        from: (table: string) => table === "quick_expense_evidence" ? quickLinkQuery : jobQuery,
        rpc,
      }),
      storage: { from: (bucket: string) => bucket === "expense-evidence" ? { download } : { upload } },
    });
    const form = new FormData();
    Object.entries({
      amount: "20000", budget_id: "budget", delay_reason: "", evidence_kind: "RECEIPT", id: "11111111-1111-4111-8111-111111111111",
      merchant: "문구점", missing_receipt_reason: "", payment_method: "PERSONAL_CARD", purpose: "페인트 용품", source_quick_id: "22222222-2222-4222-8222-222222222222", used_on: "2026-09-15",
    }).forEach(([key, value]) => form.set(key, value));

    await expect(submitReimbursement(form)).resolves.toBeUndefined();
    expect(download).toHaveBeenCalledWith("org/receipt.jpg");
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^org\/user\/11111111-1111-4111-8111-111111111111\/[a-f0-9]{64}$/), expect.any(Buffer), expect.objectContaining({ contentType: "image/jpeg", upsert: false }));
    expect(rpc).toHaveBeenCalledWith("reimbursement_submit_with_evidence", expect.objectContaining({ p_data: expect.objectContaining({ source_quick_id: "22222222-2222-4222-8222-222222222222" }) }));
  });
});

function chain(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  return query;
}
