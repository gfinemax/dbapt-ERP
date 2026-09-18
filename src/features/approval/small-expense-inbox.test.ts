import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSmallExpenseInbox } from "./small-expense-inbox";
import type { ReimbursementMember } from "@/features/finance/reimbursement-domain";
const mock = vi.hoisted(() => ({ roles: vi.fn(), range: vi.fn(), eq: vi.fn(), neq: vi.fn(), is: vi.fn() }));
vi.mock("./small-expense-repository", () => ({ smallExpenseDb: () => {
  const chain = { select: () => chain, eq: (...args: unknown[]) => { mock.eq(...args); return chain; },
    neq: (...args: unknown[]) => { mock.neq(...args); return chain; },
    is: (...args: unknown[]) => { mock.is(...args); return chain; }, order: () => chain,
    maybeSingle: mock.roles, range: mock.range };
  return { schema: () => ({ from: () => chain }) };
} }));
const member: ReimbursementMember = { user_id: "chair", organization_id: "org", display_name: "조합장", active: true, permissions: [] };
beforeEach(() => { vi.clearAllMocks(); mock.roles.mockResolvedValue({ data: { chair_id: "chair" } }); });
describe("소액 확인대기 조회", () => {
  it("다른 월 원본으로 연결하고 조직·본인 사용·기존 결의 연결을 제외한다", async () => {
    mock.range.mockResolvedValue({ data: [{ id: "old", description: "지난달 문구", amount: 1000, expense_date: "2026-08-02" }], count: 1 });
    expect(await loadSmallExpenseInbox(member)).toEqual([expect.objectContaining({ key: "small:old", href: "/approval/inbox?type=small&month=2026-08#small-old" })]);
    expect(mock.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(mock.eq).toHaveBeenCalledWith("review_status", "PENDING");
    expect(mock.neq).toHaveBeenCalledWith("registered_by", "chair");
    expect(mock.neq).toHaveBeenCalledWith("spender_id", "chair");
    expect(mock.is).toHaveBeenCalledWith("batch_resolution_id", null);
  });
  it("관리자라도 지정 확인자가 아니면 원본을 조회하지 않는다", async () => {
    expect(await loadSmallExpenseInbox({ ...member, user_id: "admin", permissions: ["ADMIN"] })).toEqual([]);
    expect(mock.range).not.toHaveBeenCalled();
  });
  it("조회 오류와 잘린 결과를 빈 대기로 표시하지 않는다", async () => {
    mock.range.mockResolvedValueOnce({ error: { message: "unavailable" } });
    await expect(loadSmallExpenseInbox(member)).rejects.toThrow("불러오지 못했어");
    mock.range.mockResolvedValueOnce({ data: [], count: 600 });
    await expect(loadSmallExpenseInbox(member)).rejects.toThrow("조회 한도");
  });
  it("담당자 미지정을 대기 0건으로 숨기지 않는다", async () => {
    mock.roles.mockResolvedValue({ data: null });
    await expect(loadSmallExpenseInbox(member)).rejects.toThrow("담당자 지정이 필요해");
    expect(mock.range).not.toHaveBeenCalled();
  });
});
