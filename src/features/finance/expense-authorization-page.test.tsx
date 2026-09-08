import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseAuthorizationPage } from "./expense-authorization-page";
import { canApproveExpense, canEditExpense } from "./expense-access-model";
import type { ManagedExpenseResolution } from "./expense-resolution-page";
const mocks = vi.hoisted(() => ({ bind: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/finance/expense-authorizations/actions", () => ({ bindExpenseAuthorization: mocks.bind }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const members = [{ user_id: "author", display_name: "작성자", permissions: ["PAY"] }, { user_id: "a", display_name: "동명이인", permissions: ["APPROVE"] }, { user_id: "b", display_name: "동명이인", permissions: ["APPROVE"] }];
const record = { id: "original", resolutionNo: "지결-1", subject: "원본", author: "동명이인", approvalStatus: "작성중", totalPaymentAmount: 1000,
  approvalLine: [{ order: 1, approver: "동명이인", role: "담당자", status: "대기" }] } as unknown as ManagedExpenseResolution;
beforeEach(() => { vi.clearAllMocks(); mocks.bind.mockResolvedValue(undefined); });
function select() {
  render(<ExpenseAuthorizationPage records={[record]} members={members} />);
  fireEvent.change(screen.getByLabelText("지출결의 원본"), { target: { value: "original" } });
}
function prepare() {
  fireEvent.change(screen.getByLabelText(/작성자 계정/), { target: { value: "author" } });
  fireEvent.change(screen.getByLabelText(/1차 결재 계정/), { target: { value: "a" } });
  fireEvent.change(screen.getByLabelText("연결 확인 근거"), { target: { value: "실제 담당 계정 확인" } });
  fireEvent.click(screen.getByRole("button", { name: "연결 내용 확인" }));
}
describe("explicit author and approver account binding", () => {
  it("does not select same-named accounts or write before explicit review", () => {
    select();
    expect(screen.getByLabelText(/작성자 계정/)).toHaveValue("");
    expect(screen.getByLabelText(/1차 결재 계정/)).toHaveValue("");
    expect(screen.queryByRole("button", { name: "확인한 계정 연결 저장" })).not.toBeInTheDocument();
    prepare();
    expect(screen.getByText("1차 결재자: 동명이인 · a")).toBeInTheDocument();
    expect(mocks.bind).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/1차 결재 계정/), { target: { value: "b" } });
    expect(screen.queryByRole("button", { name: "확인한 계정 연결 저장" })).not.toBeInTheDocument();
  });
  it("saves the reviewed source and UUID once, then refreshes", async () => {
    let done!: () => void;
    mocks.bind.mockImplementation(() => new Promise<void>(resolve => { done = resolve; }));
    select(); prepare();
    const save = screen.getByRole("button", { name: "확인한 계정 연결 저장" }); fireEvent.click(save); fireEvent.click(save);
    expect(mocks.bind).toHaveBeenCalledTimes(1);
    expect(mocks.bind).toHaveBeenCalledWith(expect.objectContaining({ id: record.id, expected: record, version: 0, author: "author", steps: [{ order: 1, approver_user_id: "a" }] }));
    await act(async () => done());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });
  it("distinguishes UUID ownership and approval from matching display names", () => {
    const bound = { ...record, approvalStatus: "승인대기", currentApprover: "동명이인 담당자", approvalLine: [{ ...record.approvalLine[0], status: "결재대기" }], authorization: { author_user_id: "author", version: 1, steps: [{ order: 1, approver_user_id: "a", legacy_step: record.approvalLine[0] }] } } as ManagedExpenseResolution;
    const viewer = { user_id: "b", organization_id: "org", display_name: "동명이인 담당자", permissions: [], active: true };
    expect(canApproveExpense(bound, viewer)).toBe(false);
    expect(canApproveExpense(bound, { ...viewer, user_id: "a" })).toBe(true);
    expect(canEditExpense(bound, viewer)).toBe(false);
    expect(canEditExpense(bound, { ...viewer, user_id: "author" })).toBe(true);
  });
});
