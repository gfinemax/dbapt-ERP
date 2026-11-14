import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), access: vi.fn(), commit: vi.fn() }));
vi.mock("@/features/finance/expense-authorization", () => ({
  requireExpenseActor: mocks.actor,
  requireExpenseRecord: mocks.access,
}));
vi.mock("@/features/finance/expense-resolution-repository", () => ({ commitExpenseCommand: mocks.commit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { bindExpenseAuthorization } from "./actions";

const expected = { id: "resolution-1", approvalLine: [{ approver: "안동연", order: 1, role: "최종결재", status: "대기" }] } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ user_id: "admin", organization_id: "org", permissions: ["ADMIN"] });
  mocks.access.mockResolvedValue({ resolution: expected });
  mocks.commit.mockResolvedValue(undefined);
});

it("allows an author account reused in the second actual approval step", async () => {
  const threeStepExpected = { id: "resolution-1", approvalLine: [
    { approver: "장현제", order: 1, role: "이사", status: "대기" },
    { approver: "오학동", order: 2, role: "사무국장", status: "대기" },
    { approver: "안동연", order: 3, role: "조합장", status: "대기" },
  ] } as never;
  mocks.access.mockResolvedValueOnce({ resolution: threeStepExpected });
  await bindExpenseAuthorization({
    id: "resolution-1",
    expected: threeStepExpected,
    version: 0,
    author: "same-user",
    steps: [
      { order: 1, approver_user_id: "director-user" },
      { order: 2, approver_user_id: "same-user" },
      { order: 3, approver_user_id: "chair-user" },
    ],
    reason: "담당 계정 확인",
    key: "operation-key",
  });
  expect(mocks.commit).toHaveBeenCalledWith("BIND", "resolution-1", threeStepExpected, expect.objectContaining({
    author_user_id: "same-user",
    steps: [
      { order: 1, approver_user_id: "director-user" },
      { order: 2, approver_user_id: "same-user" },
      { order: 3, approver_user_id: "chair-user" },
    ],
  }), "operation-key");
});

it("still rejects the same account reused in multiple approval steps", async () => {
  const twoStepExpected = { id: "resolution-1", approvalLine: [
    { approver: "장현제", order: 1, role: "이사", status: "대기" },
    { approver: "안동연", order: 2, role: "조합장", status: "대기" },
  ] } as never;
  mocks.access.mockResolvedValueOnce({ resolution: twoStepExpected });
  await expect(bindExpenseAuthorization({
    id: "resolution-1",
    expected: twoStepExpected,
    version: 0,
    author: "author-user",
    steps: [
      { order: 1, approver_user_id: "same-approver" },
      { order: 2, approver_user_id: "same-approver" },
    ],
    reason: "담당 계정 확인",
    key: "operation-key",
  })).rejects.toThrow("같은 계정을 여러 결재 순서에 중복 연결");
  expect(mocks.commit).not.toHaveBeenCalled();
});

it("stores only the required approval account after validating the current route", async () => {
  await bindExpenseAuthorization({
    id: "resolution-1",
    expected,
    version: 0,
    author: "author-user",
    steps: [{ order: 1, approver_user_id: "chair-user" }],
    reason: "실제 담당 계정 확인",
    key: "operation-key",
  });
  expect(mocks.commit).toHaveBeenCalledWith("BIND", "resolution-1", expected, expect.objectContaining({
    author_user_id: "author-user",
    steps: [{ order: 1, approver_user_id: "chair-user" }],
  }), "operation-key");
});
