import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), schema: vi.fn() }));
vi.mock("@/features/finance/accounting-workspace-repository", () => ({ assertLegacyVoucherEditable: mocks.guard }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: () => ({ schema: mocks.schema }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/features/finance/expense-authorization", () => ({
  requireExpenseActor: async () => ({ user_id: "user", organization_id: "org", display_name: "지급 담당자", permissions: ["PAY"] }),
  requireExpenseRecord: async () => ({}),
}));
vi.mock("@/features/finance/expense-evidence-ocr.server", () => ({ extractExpenseEvidenceFile: vi.fn() }));
vi.mock("@/features/finance/expense-evidence-openai.server", () => ({ extractExpenseEvidenceWithOpenAI: vi.fn() }));
vi.mock("@/features/finance/expense-evidence-compression.server", () => ({ compressExpenseEvidenceFile: vi.fn() }));
import { transitionExpenseDisbursementAction } from "./actions";

beforeEach(() => vi.clearAllMocks());
it.each(["VOUCHER_CREATE", "VOUCHER_CONFIRM", "VOUCHER_CANCEL"] as const)("blocks managed %s before any legacy operation, original status or voucher write", async command => {
  mocks.guard.mockRejectedValueOnce(new Error("통합 전표관리에서 확인해주세요."));
  await expect(transitionExpenseDisbursementAction({ command, resolutionId: "original", idempotencyKey: "attempt", actorLabel: "forged", expectedPaymentStatus: "지급완료" })).rejects.toThrow("통합 전표관리");
  expect(mocks.guard).toHaveBeenCalledWith("original");
  expect(mocks.schema).not.toHaveBeenCalled();
});
