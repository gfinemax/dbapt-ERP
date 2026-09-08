import { beforeEach, expect, it, vi } from "vitest";
import { loadFundSourceOptions } from "./fund-source-options";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), db: vi.fn(), queries: [] as { table: string; eq: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> }[], fail: "" }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.queries = []; mocks.fail = "";
  mocks.identity.mockResolvedValue({ user_id: "actor", organization_id: "verified-org", permissions: ["APPROVE"], active: true });
  mocks.db.mockImplementation(() => ({ schema: () => ({ from: (table: string) => {
    const query = { table, select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn(async () => ({ error: mocks.fail === table ? { message: "읽기 실패" } : null, data: table === "expense_resolutions" ? [{ id: "source-id", resolution_no: "지결-원본", subject: "원본 내용", total_payment_amount: 500, approval_status: "승인완료", payment_status: "지급대기" }] : [] })) };
    mocks.queries.push(query); return query;
  } }) }));
});
it("selects original IDs and document numbers within the verified organization", async () => {
  const result = await loadFundSourceOptions();
  expect(result).toEqual([{ source_kind: "RESOLUTION", source_id: "source-id", number: "지결-원본", title: "원본 내용", amount: 500, status: "승인완료 · 지급대기" }]);
  expect(mocks.queries).toHaveLength(3);
  for (const query of mocks.queries) {
    expect(query.eq).toHaveBeenCalledWith("organization_id", "verified-org");
    expect(query.select.mock.calls[0][0]).not.toMatch(/account|resolution_data|evidence_path/);
  }
});
it("rejects employees and inactive staff before database queries", async () => {
  mocks.identity.mockResolvedValue({ user_id: "actor", organization_id: "verified-org", permissions: [], active: true });
  await expect(loadFundSourceOptions()).rejects.toThrow("권한");
  mocks.identity.mockResolvedValue({ user_id: "actor", organization_id: "verified-org", permissions: ["ADMIN"], active: false });
  await expect(loadFundSourceOptions()).rejects.toThrow("권한");
  expect(mocks.db).not.toHaveBeenCalled();
});
it("propagates source failures instead of presenting an incomplete list as empty", async () => {
  mocks.fail = "personal_reimbursements";
  await expect(loadFundSourceOptions()).rejects.toThrow("읽기 실패");
});
