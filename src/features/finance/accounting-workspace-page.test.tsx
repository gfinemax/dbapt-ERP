import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AccountingWorkspacePage } from "./accounting-workspace-page";
import type { AccountingWorkspace } from "./accounting-workspace-repository";

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }) }));
vi.mock("@/app/finance/accounting-actions", () => ({ saveAccountingDraft: mocks.save }));

function fixture(): AccountingWorkspace {
  return {
    viewer: { permissions: ["ADMIN"] }, policy: { confirmation_enabled: false },
    accounts: [{ id: "expense", code: "501", name: "운영비", subject_type: "지출", normal_balance: "차변", is_active: true },
      { id: "old", code: "102", name: "기존 예금", subject_type: "자산", normal_balance: "차변", is_active: false }],
    sources: [{ kind: "RECOGNITION", id: "tx1", number: "지결-2026-15", title: "사무실 임차료", amount: 1000, occurred_at: "2026-03-15", signature: "source-v1", existing_voucher_id: "draft" },
      { kind: "PAYMENT", id: "payment1", number: "지급-8", title: "임차료 실제 지급", amount: 600, occurred_at: "2026-06-15", signature: "payment-v1", existing_voucher_id: null }],
    vouchers: [{ id: "legacy", voucher_no: "기존-2025-007", voucher_date: "2025-12-31", approval_status: "승인완료", memo: "이전 회계 기록", managed: false, lock_version: null, source_kind: null, source_id: null, source_stale: false,
      lines: [{ id: "old-line", account_subject_id: "old", description: "원본 적요 그대로", debit_amount: 1200, credit_amount: 0, sort_order: 1 }] },
      { id: "draft", voucher_no: "전표-2026-001", voucher_date: "2026-03-15", approval_status: "승인대기", memo: "계정 검토 중", managed: true, lock_version: 3, source_kind: "RECOGNITION", source_id: "tx1", source_stale: false,
        lines: [{ id: "line1", account_subject_id: null, description: "임차료 발생", debit_amount: 1000, credit_amount: 0, sort_order: 1 }, { id: "line2", account_subject_id: "old", description: "상대 계정 검토", debit_amount: 0, credit_amount: 600, sort_order: 2 }] }],
  };
}
function openDraft() { fireEvent.click(screen.getByRole("button", { name: "연결 초안 수정" })); }
function submit() { fireEvent.submit(screen.getByRole("button", { name: "초안 저장" }).closest("form")!); }
beforeEach(() => { vi.resetAllMocks(); mocks.save.mockResolvedValue({ id: "saved-id", lock_version: 4 }); });

describe("accounting drafts and original records", () => {
  it("shows an invalid source for review without treating unknown amounts as zero or allowing draft creation", () => {
    const workspace = fixture();
    workspace.sources.push({ kind: "PAYMENT", id: "invalid", number: "지급-미확인", title: "원본 확인 대상", amount: null, occurred_at: null, signature: "invalid-v1", existing_voucher_id: null, blocked_reason: "실제 지급 금액과 원본 연결을 확인해줘." });
    render(<AccountingWorkspacePage workspace={workspace} />);
    const row = screen.getByText(/원본 확인 대상 · 금액 확인 필요/).parentElement!;
    expect(within(row).getByRole("status")).toHaveTextContent("실제 지급 금액과 원본 연결을 확인해줘.");
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "원본 연결 초안 작성" }));
    expect(screen.queryByRole("option", { name: /원본 확인 대상/ })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("shows persisted legacy numbers, approval and exact lines without offering to rewrite legacy entries", () => {
    render(<AccountingWorkspacePage workspace={fixture()} initialVoucherId="legacy" />);
    const detail = screen.getByRole("region", { name: "전표 상세" });
    expect(within(detail).getByRole("heading", { name: "기존-2025-007" })).toBeInTheDocument();
    expect(within(detail).getByText("기존 예금")).toBeInTheDocument();
    expect(within(detail).getByText("원본 적요 그대로")).toBeInTheDocument();
    expect(within(detail).getByText("1,200원")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /기존-2025-007.*승인완료/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "연결 초안 수정" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("조회 구분"), { target: { value: "LEGACY" } });
    expect(screen.getByRole("heading", { name: "전표 1건" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /전표-2026-001/ })).not.toBeInTheDocument();
  });

  it("preserves null accounts and inactive selected accounts, and calculates actual debit-credit differences", async () => {
    render(<AccountingWorkspacePage workspace={fixture()} initialVoucherId="draft" />); openDraft();
    expect(screen.getAllByLabelText("계정과목")[0]).toHaveValue("");
    expect(screen.getAllByLabelText("계정과목")[1]).toHaveValue("old");
    expect(screen.getByRole("option", { name: "102 · 기존 예금 · 사용 중지" })).toBeInTheDocument();
    expect(screen.getByText("차변 1,000원 · 대변 600원 · 차이 400원")).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("대변")[1], { target: { value: "1000" } });
    expect(screen.getByText("차변 1,000원 · 대변 1,000원 · 차이 0원")).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("대변")[1], { target: { value: "600" } }); submit();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0].slice(0, 2)).toEqual(["DRAFT_SAVE", { id: "draft", lock_version: 3, source_signature: "source-v1", voucher_date: "2026-03-15", memo: "계정 검토 중", lines: [
      { account_subject_id: null, description: "임차료 발생", debit_amount: 1000, credit_amount: 0 },
      { account_subject_id: "old", description: "상대 계정 검토", debit_amount: 0, credit_amount: 600 },
    ] }]);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/finance?voucherId=saved-id", { scroll: false });
    expect(screen.queryByRole("region", { name: "전표 초안 작성" })).not.toBeInTheDocument();
  });

  it("opens the existing linked voucher and excludes its original from new draft selection", () => {
    render(<AccountingWorkspacePage workspace={fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "연결 전표 확인" }));
    expect(mocks.replace).toHaveBeenCalledWith("/finance?voucherId=draft", { scroll: false });
    expect(screen.getByRole("region", { name: "전표 상세" })).toHaveTextContent("전표-2026-001");
    fireEvent.click(screen.getByRole("button", { name: "원본 연결 초안 작성" }));
    expect(screen.queryByRole("option", { name: /사무실 임차료/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /임차료 실제 지급.*600원/ })).toBeInTheDocument();
  });

  it("uses actual payment source and leaves dates and accounts for explicit review", async () => {
    render(<AccountingWorkspacePage workspace={fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "이 원본으로 초안 작성" }));
    expect(screen.getByLabelText("회계 귀속일")).toHaveValue("");
    expect(screen.getByText(/발생·지급일 2026-06-15/)).toHaveTextContent("600원");
    fireEvent.change(screen.getByLabelText("회계 귀속일"), { target: { value: "2026-06-15" } });
    fireEvent.change(screen.getByLabelText("검토 메모·처리 근거"), { target: { value: "지급 확인 후 계정 검토" } });
    fireEvent.click(screen.getByRole("button", { name: "분개 추가" }));
    expect(screen.getByLabelText("계정과목")).toHaveValue(""); submit();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0][0]).toBe("DRAFT_CREATE");
    expect(mocks.save.mock.calls[0][1]).toMatchObject({ source_kind: "PAYMENT", source_id: "payment1", source_signature: "payment-v1", voucher_date: "2026-06-15", lines: [{ account_subject_id: null, description: "", debit_amount: 0, credit_amount: 0 }] });
  });

  it("keeps PAY viewers read-only and still lets them inspect real linked entries", () => {
    const workspace = fixture(); workspace.viewer.permissions = ["PAY"];
    render(<AccountingWorkspacePage workspace={workspace} initialVoucherId="draft" />);
    expect(screen.getByRole("region", { name: "전표 상세" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /초안/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "연결 전표 확인" })).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("retains failed form input and reuses its operation key for an unchanged retry", async () => {
    mocks.save.mockRejectedValueOnce(new Error("저장 응답 확인 실패"));
    render(<AccountingWorkspacePage workspace={fixture()} initialVoucherId="draft" />); openDraft();
    fireEvent.change(screen.getByLabelText("검토 메모·처리 근거"), { target: { value: "잃으면 안 되는 검토" } }); submit();
    await screen.findByText("저장 응답 확인 실패");
    expect(screen.getByLabelText("검토 메모·처리 근거")).toHaveValue("잃으면 안 되는 검토");
    expect(mocks.refresh).not.toHaveBeenCalled(); submit();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[0][2]).toBe(mocks.save.mock.calls[1][2]);
  });

  it("blocks simultaneous form submissions while a save is in flight", async () => {
    let finish!: (value: { id: string; lock_version: number }) => void;
    mocks.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<AccountingWorkspacePage workspace={fixture()} initialVoucherId="draft" />); openDraft(); submit(); submit();
    expect(mocks.save).toHaveBeenCalledOnce();
    await act(async () => { finish({ id: "draft", lock_version: 4 }); });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it.each(["voucher", "source"] as const)("preserves dirty input and prevents stale %s form submissions until reopened", async change => {
    const workspace = fixture(); const view = render(<AccountingWorkspacePage workspace={workspace} initialVoucherId="draft" />); openDraft();
    fireEvent.change(screen.getByLabelText("검토 메모·처리 근거"), { target: { value: "편집 중 메모" } });
    const next = structuredClone(workspace);
    if (change === "voucher") next.vouchers[1].lock_version = 4; else next.sources[0].signature = "source-v2";
    view.rerender(<AccountingWorkspacePage workspace={next} initialVoucherId="draft" />);
    expect(screen.getByRole("alert")).toHaveTextContent("다른 변경이 저장됐어");
    expect(screen.getByLabelText("검토 메모·처리 근거")).toHaveValue("편집 중 메모");
    expect(screen.getByRole("button", { name: "초안 저장" })).toBeDisabled(); submit();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "편집 닫기" })); openDraft(); submit();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0][1]).toMatchObject(change === "voucher" ? { lock_version: 4 } : { source_signature: "source-v2" });
  });
});
