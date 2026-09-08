import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expenseResolutionHref, parseExpenseEntry } from "./expense-entry";
import { ExpenseResolutionPage, type ManagedExpenseResolution } from "./expense-resolution-page";

beforeEach(() => localStorage.clear());

describe("expense entry and server-authoritative saves", () => {
  it("accepts only supported starts and gives exact original IDs precedence", () => {
    expect(parseExpenseEntry({ start: "reimbursement" })).toEqual({ start: "reimbursement", resolutionId: undefined });
    expect(parseExpenseEntry({ start: ["advance", "reimbursement"] }).start).toBeUndefined();
    expect(parseExpenseEntry({ start: "approve" }).start).toBeUndefined();
    expect(parseExpenseEntry({ start: "advance", resolutionId: "text/id & 1" })).toEqual({ start: undefined, resolutionId: "text/id & 1" });
    expect(expenseResolutionHref({ resolutionId: "text/id & 1" })).toBe("/finance/expense-resolutions?resolutionId=text%2Fid+%26+1");
  });

  it.each(["advance", "reimbursement"] as const)("opens %s without inventing actual dates or creating a row", start => {
    const persist = vi.fn();
    render(<ExpenseResolutionPage initialResolutions={[]} initialEntryStart={start} persistResolution={persist} />);
    const dialog = within(screen.getByRole("dialog", { name: "지출결의서 작성" }));
    expect(dialog.getByRole("button", { name: start === "advance" ? "구매·집행 전에 승인을 받습니다" : "이미 결제한 비용을 신청합니다" })).toHaveAttribute("aria-pressed", "true");
    expect(dialog.getByLabelText("실제 지출일")).toHaveValue("");
    expect(persist).not.toHaveBeenCalled();
  });

  it("does not restore cached records after an empty server result or access failure", async () => {
    localStorage.setItem("dbapt-erp:finance:expense-resolutions", JSON.stringify([{ id: "private", resolutionNo: "이전 조합 자료" }]));
    render(<ExpenseResolutionPage initialResolutions={[]} dataLoadError="조회 권한 없음" persistResolution={vi.fn()} />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(screen.getByRole("button", { name: "전체 0" })).toBeInTheDocument();
    expect(screen.queryByText("이전 조합 자료")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("조회 권한 없음");
  });

  it("retains rejected input, retries once, and reopens only the saved ID after reload", async () => {
    let resolve!: (row: ManagedExpenseResolution) => void;
    const persist = vi.fn<(row: ManagedExpenseResolution) => Promise<ManagedExpenseResolution>>()
      .mockRejectedValueOnce(new Error("권한 확인 실패"))
      .mockImplementation(row => new Promise(done => { resolve = () => done(row); }));
    const view = render(<ExpenseResolutionPage initialResolutions={[]} initialEntryStart="reimbursement" persistResolution={persist} />);
    let dialog = within(screen.getByRole("dialog", { name: "지출결의서 작성" }));
    fireEvent.change(dialog.getByLabelText("건명 (필수)"), { target: { value: "3월 사용분 정산" } });
    fireEvent.click(dialog.getByRole("button", { name: "임시저장" }));
    await screen.findByText(/저장하지 못했습니다/);
    expect(dialog.queryByText(/마지막 임시저장/)).not.toBeInTheDocument();
    expect(dialog.getByLabelText("건명 (필수)")).toHaveValue("3월 사용분 정산");
    expect(screen.getByRole("button", { name: "전체 0" })).toBeInTheDocument();
    expect(localStorage.getItem("dbapt-erp:finance:expense-resolutions")).toBeNull();
    const save = dialog.getByRole("button", { name: "임시저장" });
    fireEvent.click(save); fireEvent.click(save);
    expect(persist).toHaveBeenCalledTimes(2);
    const saved = persist.mock.calls[1][0];
    expect(saved.id).toBe(persist.mock.calls[0][0].id);
    expect(saved.expenseTiming).toBe("REIMBURSEMENT");
    expect(dialog.getByRole("button", { name: "저장 중…" })).toBeDisabled();
    await act(async () => resolve(saved));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "전체 1" })).toBeInTheDocument();
    view.unmount();
    render(<ExpenseResolutionPage initialResolutions={[saved]} initialResolutionId={saved.id} initialEntryStart="advance" persistResolution={persist} />);
    dialog = within(screen.getByRole("dialog", { name: "지출결의서 상세" }));
    expect(dialog.getAllByText("3월 사용분 정산").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "지출결의서 작성" })).not.toBeInTheDocument();
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("replaces a previously displayed list with an empty server refresh", async () => {
    const persist = vi.fn(async (row: ManagedExpenseResolution) => row);
    const view = render(<ExpenseResolutionPage initialResolutions={[]} initialEntryStart="advance" persistResolution={persist} />);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "임시저장" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "전체 1" })).toBeInTheDocument());
    view.rerender(<ExpenseResolutionPage initialResolutions={[]} persistResolution={persist} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "전체 0" })).toBeInTheDocument());
    expect(localStorage.getItem("dbapt-erp:finance:expense-resolutions")).toBeNull();
  });

  it("shows a missing original without opening another record or creating a draft", () => {
    render(<ExpenseResolutionPage initialResolutions={[]} initialResolutionId="missing" initialEntryStart="advance" />);
    expect(screen.getByRole("alert")).toHaveTextContent("해당 지출결의서를 찾을 수 없습니다");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
