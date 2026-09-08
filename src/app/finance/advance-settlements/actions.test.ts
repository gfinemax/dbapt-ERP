import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/features/finance/advance-settlement-repository", () => ({ saveAdvanceSettlement: m.save }));
import { saveAdvanceSettlementDraft } from "./actions";
beforeEach(() => vi.clearAllMocks());
it("revalidates persisted draft reads after a verified save", async () => {
  m.save.mockResolvedValue({ id: "draft", lock_version: 2 });
  expect(await saveAdvanceSettlementDraft({ transaction_id: "tx" }, "key")).toEqual({ id: "draft", lock_version: 2 });
  expect(m.save).toHaveBeenCalledWith({ transaction_id: "tx" }, "key"); expect(m.revalidate).toHaveBeenCalledExactlyOnceWith("/finance/advance-settlements");
});
it("does not signal success or refresh after a failed atomic command", async () => { m.save.mockRejectedValue(new Error("stale")); await expect(saveAdvanceSettlementDraft({}, "key")).rejects.toThrow("stale"); expect(m.revalidate).not.toHaveBeenCalled(); });
