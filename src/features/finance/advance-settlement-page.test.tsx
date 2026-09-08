import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AdvanceSettlementPage } from "./advance-settlement-page";
import type { AdvanceWorkspace } from "./advance-settlement-repository";
const m = vi.hoisted(() => ({ save: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: m.replace, refresh: m.refresh }) }));
vi.mock("@/app/finance/advance-settlements/actions", () => ({ saveAdvanceSettlementDraft: m.save }));
function fixture(): AdvanceWorkspace { return { viewer: { permissions: ["ADMIN"] }, policy: { approval_enabled: false, budget_posting_enabled: false }, evidence: [{ id: "file", file_name: "receipt.pdf", content_hash: "hash" }], drafts: [],
  candidates: [{ transaction_id: "tx", resolution_id: "r", number: "ADV-1", title: "실제 선지급", signature: "source-v1", legacy_review_required: false, existing_draft_id: null, returns: [], allocations: [{ id: "alloc", payment_id: "pay", amount: 1000, paid_at: "2026-03-01T01:00:00Z", counterparty: "담당자" }] }],
  usage_sources: [{ kind: "QUICK", id: "usage", title: "사용 물품", amount: 800, used_on: "2026-03-15", signature: "usage-v1", existing_draft_id: null, review_reason: null }] }; }
function fill() { fireEvent.click(screen.getByRole("button", { name: "정산 초안 작성" })); fireEvent.change(screen.getByLabelText("정산 제목"), { target: { value: "정산 검토" } }); fireEvent.change(screen.getByLabelText("실제 담당자 선지급 원본"), { target: { value: "tx" } }); fireEvent.change(screen.getByLabelText("alloc 지급 분류"), { target: { value: "INITIAL" } }); fireEvent.click(screen.getByRole("checkbox")); }
beforeEach(() => { vi.clearAllMocks(); m.save.mockResolvedValue({ id: "draft", lock_version: 1 }); });
it("does not invent dates, title, amount or an initial funding classification", () => {
  render(<AdvanceSettlementPage workspace={fixture()} />); fireEvent.click(screen.getByRole("button", { name: "정산 초안 작성" }));
  expect(screen.getByLabelText("정산 제목")).toHaveValue(""); expect(screen.getByLabelText("실제 담당자 선지급 원본")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("실제 담당자 선지급 원본"), { target: { value: "tx" } }); expect(screen.getByLabelText("alloc 지급 분류")).toHaveValue("");
  expect(screen.getByText(/사용 물품 · 800원 · 사용 2026-03-15/)).toBeInTheDocument(); expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
});
it("saves exact original IDs and actual classifications then reloads", async () => {
  render(<AdvanceSettlementPage workspace={fixture()} />); fill(); fireEvent.change(screen.getByLabelText("사용 증빙"), { target: { value: "file" } }); fireEvent.click(screen.getByRole("button", { name: "정산 초안 저장" }));
  await waitFor(() => expect(m.refresh).toHaveBeenCalledOnce());
  expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ transaction_id: "tx", source_signature: "source-v1", funding: [{ allocation_id: "alloc", kind: "INITIAL" }], usage: [{ source_kind: "QUICK", source_id: "usage", signature: "usage-v1", evidence_file_id: "file" }] }), expect.any(String));
  expect(m.replace).toHaveBeenCalledWith("/finance/advance-settlements?draft=draft", { scroll: false });
});
it("retains edits and the same operation key after an uncertain save failure", async () => {
  m.save.mockRejectedValueOnce(new Error("연결 실패")); render(<AdvanceSettlementPage workspace={fixture()} />); fill(); fireEvent.click(screen.getByRole("button", { name: "정산 초안 저장" }));
  await screen.findByText("연결 실패"); expect(screen.getByLabelText("정산 제목")).toHaveValue("정산 검토"); const first = m.save.mock.calls[0];
  await waitFor(() => expect(screen.getByRole("button", { name: "정산 초안 저장" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "정산 초안 저장" })); await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2)); expect(m.save.mock.calls[1]).toEqual(first);
});
it("blocks duplicate clicks while a save is pending", async () => {
  let done!: (v: { id: string; lock_version: number }) => void; m.save.mockReturnValue(new Promise(resolve => { done = resolve; }));
  render(<AdvanceSettlementPage workspace={fixture()} />); fill(); const save = screen.getByRole("button", { name: "정산 초안 저장" }); fireEvent.click(save); fireEvent.click(save); expect(m.save).toHaveBeenCalledOnce();
  await act(async () => done({ id: "draft", lock_version: 1 }));
});
it("keeps readonly roles out of the editor", () => { const data = fixture(); data.viewer.permissions = ["PAY"]; render(<AdvanceSettlementPage workspace={data} />); expect(screen.queryByRole("button", { name: "정산 초안 작성" })).not.toBeInTheDocument(); });
it("retains inputs but blocks saving when the actual source changes in background", () => {
  const data = fixture(); const view = render(<AdvanceSettlementPage workspace={data} />); fill(); const updated = structuredClone(data); updated.candidates[0].signature = "new-payment"; view.rerender(<AdvanceSettlementPage workspace={updated} />);
  expect(screen.getByRole("alert")).toHaveTextContent("입력 내용은 보존"); expect(screen.getByLabelText("정산 제목")).toHaveValue("정산 검토"); expect(screen.getByRole("button", { name: "정산 초안 저장" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("button", { name: "정산 초안 저장" }).closest("form")!); expect(m.save).not.toHaveBeenCalled();
});
it("separates actual facts from draft use and does not treat zero balance as completion", () => {
  const data = fixture(); data.drafts = [{ id: "draft", transaction_id: "tx", lock_version: 1, title: "저장 초안", memo: "", source_stale: false, needs_review: true, funding: [], usage: [], totals: { initial_paid: 1000, additional_paid: 200, returned: 400, draft_used: 800, balance: 0 } }];
  render(<AdvanceSettlementPage workspace={data} initialDraftId="draft" />); expect(screen.getByText("최초 실제 선지급")).toBeInTheDocument(); expect(screen.getByText(/차액이 0이어도 정산 완료가 아니야/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: /정산 승인·완료/ })).toBeDisabled();
});
it("warns when chosen use might already have been paid separately", () => { const data = fixture(); data.usage_sources[0].review_reason = "별도 지급 중복 대조 필요"; render(<AdvanceSettlementPage workspace={data} />); fill(); expect(screen.getByText(/별도 지급 중복 대조 필요/)).toBeInTheDocument(); });
