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

it("rejects an author account reused as the actual approver", async () => {
  await expect(bindExpenseAuthorization({
    id: "resolution-1",
    expected,
    version: 0,
    author: "same-user",
    steps: [{ order: 1, approver_user_id: "same-user" }],
    reason: "담당 계정 확인",
    key: "operation-key",
  })).rejects.toThrow("서로 다른 계정");
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
