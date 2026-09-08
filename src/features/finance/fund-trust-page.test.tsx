import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FundTrustPage } from "./fund-trust-page";
import type { TrustReadResult } from "./fund-trust-repository";
import type { WorkflowReadResult, WorkflowTransactionRow } from "./fund-workflow-repository";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), attach: vi.fn(), download: vi.fn(), connect: vi.fn(), refreshSource: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }) }));
vi.mock("@/app/finance/trust/actions", () => ({ executeTrustCommand: mocks.execute, attachTrustFile: mocks.attach, downloadTrustFile: mocks.download }));
vi.mock("@/app/finance/trust/source-actions", () => ({ connectTrustSource: mocks.connect, refreshTrustSource: mocks.refreshSource }));

function transaction(id: string, title: string): WorkflowTransactionRow {
  return { id, title, source_id: `source-${id}`, source_kind: "RESOLUTION", amount: 1000, owner_id: null, created_by: "admin", legacy_paid_amount: null, legacy_payment_complete: false, payment_review_required: false,
    route: "TRUST_DIRECT", contract_version_id: "contract", source_snapshot: { number: `지결-${id}` }, source_signature: "signature", revision: 1,
    amounts: { amount: 1000, paid: 0, known_new_paid: 0, remaining: 1000, balance: 1000, overpaid: 0, requestable: 1000, pending: 0, approved: 0, approved_unpaid: 0, payment_review_required: false, legacy_payment_complete: false } };
}
function fixtures() {
  const workflow: WorkflowReadResult = { transactions: [transaction("tx1", "운영비 지급"), transaction("tx2", "사무용품 지급")], payments: [], allocations: [] };
  const workspace: TrustReadResult = { viewer: { user_id: "admin", permissions: ["ADMIN"] }, contracts: [{ id: "contract", contract_key: "contract-key", version: 1, lock_version: 2, name: "확인된 계약", trustee: "신탁사", reference: "계약 제2조", management_account_id: "account", status: "VERIFIED", conditions: { consent_roles: [] }, created_by: "admin", created_at: "2026-09-01", verified_by: "admin", verified_at: "2026-09-01" }],
    requests: [{ id: "draft", request_no: "신탁-1", title: "초안", request_date: null, contract_version_id: null, receipt_reference: "", status: "DRAFT", lock_version: 4, revision: 0, created_by: "admin", created_at: "2026-09-01", updated_at: "2026-09-01" },
      { id: "mixed", request_no: "신탁-2", title: "혼합 요청", request_date: "2026-09-01", contract_version_id: "contract", receipt_reference: "접수1", status: "PARTIAL", lock_version: 7, revision: 1, created_by: "admin", created_at: "2026-09-01", updated_at: "2026-09-01" }],
    items: [{ id: "approved", request_id: "mixed", transaction_id: "tx1", requested_amount: 400, approved_amount: 400, status: "APPROVED", withdrawal_from_status: null, reason: "", needs_review: false, source_revision: 1, paid_amount: 0 },
      { id: "supplement", request_id: "mixed", transaction_id: "tx2", requested_amount: 200, approved_amount: 0, status: "SUPPLEMENT", withdrawal_from_status: null, reason: "추가 서류", needs_review: false, source_revision: 1, paid_amount: 0 }],
    files: [{ id: "invoice", request_id: "mixed", transaction_id: null, purpose: "REQUEST", contract_version_id: null, document_type: "거래명세서", file_name: "Invoice.pdf", content_hash: "hash", uploaded_by: "admin", uploaded_at: "2026-09-01" }], submissions: [], events: [], accounts: [{ id: "account", label: "신탁 관리계좌 ***1234" }] };
  return { workspace, workflow, sources: [] };
}
beforeEach(() => { vi.clearAllMocks(); mocks.execute.mockResolvedValue({ id: "saved", lock_version: 1, revision: 0 }); });

describe("trust workspace persistence and navigation", () => {
  it("filters the same underlying supplement items used for the visible count and keeps URL context", () => {
    render(<FundTrustPage {...fixtures()} initialStatus="SUPPLEMENT" />);
    expect(screen.getByRole("heading", { name: "신탁 요청 · 1건" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /신탁-1/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /신탁-2/ }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/finance/trust?status=SUPPLEMENT&request=mixed", { scroll: false });
    expect(screen.getByRole("region", { name: "신탁 요청 상세" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("조회 상태"), { target: { value: "ALL" } });
    expect(screen.getByRole("heading", { name: "신탁 요청 · 2건" })).toBeInTheDocument();
  });
  it("saves an incomplete contract-free draft and refreshes using the persisted ID", async () => {
    render(<FundTrustPage {...fixtures()} />);
    fireEvent.click(screen.getByRole("button", { name: "신탁 요청 준비" }));
    fireEvent.change(screen.getByLabelText("요청명"), { target: { value: "검토 중인 요청" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /운영비 지급/ }));
    fireEvent.change(screen.getByLabelText("이번 요청액"), { target: { value: "300" } });
    fireEvent.submit(screen.getByRole("button", { name: "초안 저장" }).closest("form")!);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(mocks.execute.mock.calls[0][0]).toBe("REQUEST_SAVE");
    expect(mocks.execute.mock.calls[0][1]).toEqual({ title: "검토 중인 요청", request_date: "", contract_version_id: null, items: [{ transaction_id: "tx1", requested_amount: 300 }] });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.replace).toHaveBeenCalledWith("/finance/trust?status=ALL&request=saved", { scroll: false });
  });
  it("retains failed input and retries with the same operation key", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("일시적 저장 오류"));
    render(<FundTrustPage {...fixtures()} />);
    fireEvent.click(screen.getByRole("button", { name: "신탁 요청 준비" }));
    fireEvent.change(screen.getByLabelText("요청명"), { target: { value: "보존할 초안" } });
    const form = screen.getByRole("button", { name: "초안 저장" }).closest("form")!;
    fireEvent.submit(form);
    await screen.findByText("일시적 저장 오류");
    expect(screen.getByLabelText("요청명")).toHaveValue("보존할 초안");
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    expect(mocks.execute.mock.calls[0][2]).toBe(mocks.execute.mock.calls[1][2]);
  });
  it("submits only supplement items with the current request version and selected evidence", async () => {
    render(<FundTrustPage {...fixtures()} initialRequestId="mixed" />);
    fireEvent.click(screen.getByText("보완 항목 재제출 기록"));
    const form = screen.getByRole("button", { name: "제출 기록 저장" }).closest("form")!;
    expect(within(form).queryByRole("checkbox", { name: /운영비 지급/ })).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole("checkbox", { name: /Invoice.pdf/ }));
    fireEvent.change(within(form).getByLabelText("접수번호·접수 확인 내용"), { target: { value: "보완 접수 2" } });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(mocks.execute.mock.calls[0].slice(0, 2)).toEqual(["REQUEST_SUBMIT", { id: "mixed", lock_version: 7, receipt_reference: "보완 접수 2", items: [{ id: "supplement", requested_amount: 200 }], file_ids: ["invoice"], consents: [] }]);
  });
  it("uses the reloaded lock version when editing a saved draft", async () => {
    const props = fixtures();
    const rendered = render(<FundTrustPage {...props} initialRequestId="draft" />);
    props.workspace = { ...props.workspace, requests: props.workspace.requests.map(row => row.id === "draft" ? { ...row, lock_version: 8 } : row) };
    rendered.rerender(<FundTrustPage {...props} initialRequestId="draft" />);
    fireEvent.click(screen.getByRole("button", { name: "초안 수정" }));
    fireEvent.submit(screen.getByRole("button", { name: "초안 저장" }).closest("form")!);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalled());
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({ id: "draft", lock_version: 8 });
  });
  it("keeps review actions unavailable to read-only staff", () => {
    const props = fixtures(); props.workspace.viewer.permissions = ["CLOSE"];
    render(<FundTrustPage {...props} initialRequestId="mixed" />);
    expect(screen.getByRole("heading", { name: "신탁 요청 · 2건" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "신탁 요청 준비" })).not.toBeInTheDocument();
    expect(screen.queryByText("보완 항목 재제출 기록")).not.toBeInTheDocument();
    expect(screen.queryByText("요청 서류·신탁사 회신 첨부")).not.toBeInTheDocument();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("keeps the original edit version and input when another editor refreshes the draft", async () => {
    const props = fixtures();
    const view = render(<FundTrustPage {...props} initialRequestId="draft" />);
    fireEvent.click(screen.getByRole("button", { name: "초안 수정" }));
    fireEvent.change(screen.getByLabelText("요청명"), { target: { value: "내 편집 내용" } });
    props.workspace = { ...props.workspace, requests: props.workspace.requests.map(row => row.id === "draft" ? { ...row, lock_version: 9, title: "다른 담당자 수정" } : row) };
    view.rerender(<FundTrustPage {...props} initialRequestId="draft" />);
    expect(screen.getByRole("alert")).toHaveTextContent("다른 변경이 저장됐어");
    expect(screen.getByLabelText("요청명")).toHaveValue("내 편집 내용");
    fireEvent.submit(screen.getByRole("button", { name: "초안 저장" }).closest("form")!);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalled());
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({ id: "draft", lock_version: 4, title: "내 편집 내용" });
  });
});
