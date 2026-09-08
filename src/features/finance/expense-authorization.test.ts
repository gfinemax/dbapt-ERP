import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), schema: vi.fn(), eq: vi.fn(), rows: [] as unknown[] }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: () => ({ schema: mocks.schema }) }));
import { requireExpenseActor, requireExpenseRecord, requireExpenseOcrJob } from "./expense-authorization";

beforeEach(() => {
  vi.clearAllMocks(); mocks.rows = [];
  const query = { select: vi.fn(), eq: mocks.eq, is: vi.fn(), maybeSingle: vi.fn(async () => ({ data: mocks.rows.shift(), error: null })) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query);
  mocks.schema.mockReturnValue({ from: vi.fn(() => query) });
  mocks.identity.mockResolvedValue({ user_id: "uuid-a", organization_id: "org-a", display_name: "동명이인", permissions: ["APPROVE"], active: true });
});
describe("legacy expense identity boundaries", () => {
  it("rejects unauthenticated records and OCR before reading database metadata", async () => {
    mocks.identity.mockRejectedValue(new Error("로그인 필요"));
    await expect(requireExpenseRecord("r")).rejects.toThrow("로그인");
    await expect(requireExpenseOcrJob("job")).rejects.toThrow("로그인");
    expect(mocks.schema).not.toHaveBeenCalled();
  });
  it("does not turn an ordinary applicant into a finance staff member", async () => {
    mocks.identity.mockResolvedValue({ permissions: [], active: true });
    await expect(requireExpenseActor()).rejects.toThrow("권한");
  });
  it("uses the verified organization in both original and binding reads", async () => {
    mocks.rows.push({ resolution_data: { id: "r" } }, { author_user_id: "uuid-a", steps: [], version: 1 });
    await requireExpenseRecord("r", true);
    expect(mocks.eq.mock.calls.filter(([key]) => key === "organization_id")).toEqual([["organization_id", "org-a"], ["organization_id", "org-a"]]);
  });
  it("rejects a same-named but differently bound author", async () => {
    mocks.rows.push({ resolution_data: { id: "r", author: "동명이인" } }, { author_user_id: "uuid-b", steps: [], version: 1 });
    await expect(requireExpenseRecord("r", true)).rejects.toThrow("연결된 작성자");
  });
  it("does not permit an approver to edit an unbound legacy draft", async () => {
    mocks.rows.push({ resolution_data: { id: "r" } }, null);
    await expect(requireExpenseRecord("r", true)).rejects.toThrow("계정 연결");
  });
  it("rejects a missing or foreign original without returning a binding", async () => {
    mocks.rows.push(null);
    await expect(requireExpenseRecord("foreign")).rejects.toThrow("조회 권한");
    expect(mocks.schema).toHaveBeenCalledTimes(1);
  });
});
