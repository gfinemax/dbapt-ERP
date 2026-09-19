import { beforeEach, describe, expect, it, vi } from "vitest";
import { expenseResolutionFixture } from "./expense-resolution-test-fixture";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), binding: vi.fn(), db: vi.fn(), rpc: vi.fn() }));
vi.mock("./expense-authorization", () => ({
  requireExpenseActor: mocks.actor,
  expenseBinding: mocks.binding,
  expenseDb: mocks.db,
}));
import { convertQuickExpenseToResolution, loadQuickExpenseConversionDraft } from "./quick-expense-conversion-repository";

const snapshot = {
  source: {
    id: "quick-one", amount: "32000", approval_skip_reason: "Policy", bank_transaction_id: null,
    budget_item: "Operating supplies", corporate_card_transaction_id: "card-one", counterparty: "Paint vendor",
    evidence_kind: "RECEIPT", evidence_status: "QUALIFIED", expense_detail_id: "detail-one",
    linked_resolution_id: null, occurred_at: "2026-09-18T16:30:00Z", payment_method: "CORPORATE_CARD",
    record_status: "NEEDS_RESOLUTION", usage_description: "Paint supplies",
  },
  evidence: [{ id: "job-one", content_type: "image/jpeg", created_at: "2026-09-18T10:00:00Z", evidence_type: "영수증",
    file_size: "120", original_filename: "receipt.jpg", result_data: { issuer: "Paint vendor" }, status: "COMPLETED",
    storage_bucket: "expense-evidence", storage_path: "org/receipt.jpg", uploaded_by_label: "Verified author" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ organization_id: "org-one", user_id: "actor-one", display_name: "Verified author", permissions: ["PAY"] });
  mocks.db.mockReturnValue({ schema: () => ({ rpc: mocks.rpc }) });
  mocks.binding.mockResolvedValue({ author_user_id: "actor-one", steps: [], version: 1 });
});

describe("quick expense to resolution repository", () => {
  it("loads authoritative source and evidence as a reusable draft", async () => {
    mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
    const draft = await loadQuickExpenseConversionDraft("quick-one");
    expect(mocks.rpc).toHaveBeenCalledWith("quick_expense_conversion_snapshot", { p_org: "org-one", p_actor: "actor-one", p_id: "quick-one" });
    expect(draft).toMatchObject({ amount: 32000, cardTransactionId: "card-one", occurredDate: "2026-09-19", sourceId: "quick-one" });
    expect(draft.evidenceFiles[0]).toMatchObject({ fileName: "receipt.jpg", fileSize: 120, ocrJobId: "job-one", storagePath: "org/receipt.jpg" });
  });

  it("saves the draft and source link through one scoped idempotent command", async () => {
    const resolution = expenseResolutionFixture({
      id: "resolution-one", subject: "Paint supplies", vendorName: "Paint vendor", budgetItem: "Operating supplies",
      expenseDetailId: "detail-one", actualExpenseDate: "2026-09-19", totalPaymentAmount: 32000,
      cardTransactionId: "card-one", evidenceFiles: [],
    });
    mocks.rpc.mockResolvedValueOnce({ data: snapshot, error: null }).mockResolvedValueOnce({ data: { resolution_id: resolution.id, resolution }, error: null });
    const saved = await convertQuickExpenseToResolution("quick-one", resolution);
    const conversion = mocks.rpc.mock.calls[1];
    expect(conversion[0]).toBe("quick_expense_convert_resolution");
    expect(conversion[1]).toMatchObject({ p_org: "org-one", p_actor: "actor-one", p_id: "quick-one", p_expected: snapshot, p_key: "quick-resolution:quick-one:resolution-one" });
    expect(conversion[1].p_payload.row).toMatchObject({ organization_id: "org-one", id: "resolution-one", total_payment_amount: 32000 });
    expect(saved.authorization).toMatchObject({ author_user_id: "actor-one" });
  });

  it("rejects an already converted source before a write", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot, source: { ...snapshot.source, record_status: "CONVERTED", linked_resolution_id: "existing" } }, error: null });
    await expect(convertQuickExpenseToResolution("quick-one", expenseResolutionFixture())).rejects.toThrow("미전환");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("does not report success after an atomic command error", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: snapshot, error: null }).mockResolvedValueOnce({ data: null, error: { message: "source changed" } });
    await expect(convertQuickExpenseToResolution("quick-one", expenseResolutionFixture())).rejects.toThrow("source changed");
    expect(mocks.binding).not.toHaveBeenCalled();
  });
});
