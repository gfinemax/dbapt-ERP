import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FundPaymentPage } from "./fund-payment-page";
import { paymentFixtures } from "./fund-payment-test-fixtures";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), attach: vi.fn(), download: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/finance/payments/actions", () => ({ executePaymentCommand: mocks.execute, attachPaymentEvidence: mocks.attach }));
vi.mock("@/app/finance/trust/actions", () => ({ downloadTrustFile: mocks.download }));
beforeEach(() => { vi.clearAllMocks(); mocks.execute.mockResolvedValue({ id: "saved" }); window.history.replaceState(null, "", "/finance/payments?from=workspace"); });

function openBankForm() {
  fireEvent.click(screen.getByText("실제 입출금 기록 연결"));
  const form = screen.getByRole("button", { name: "실제 입출금 저장" }).closest("form")!;
  fireEvent.change(within(form).getByLabelText(/미연결 은행 거래/), { target: { value: "bank-new" } });
  fireEvent.change(within(form).getByLabelText("근거 확인 사유"), { target: { value: "출금 명세 확인" } });
  return form;
}

describe("payment UI persistence and source preservation", () => {
  it("uses matching filtered tab counts and retains unrelated URL context", () => {
    const props = paymentFixtures();
    props.workspace.eligibility[1].available = 0;
    render(<FundPaymentPage {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "지급가능 1" }));
    expect(screen.getByRole("button", { name: "지급가능 1" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("table")).getByText("사무용품 지급")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("용역비 지급")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("지출 검색"), { target: { value: "지결-b" } });
    expect(screen.getByRole("button", { name: "전체 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지급가능 0" })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("from")).toBe("workspace");
    expect(new URLSearchParams(window.location.search).get("q")).toBe("지결-b");
    fireEvent.click(screen.getByRole("button", { name: "전체 1" }));
    expect(within(screen.getByRole("table")).getByText("용역비 지급")).toBeInTheDocument();
  });
  it("preserves a completed legacy record with unknown payment evidence in the completed tab", () => {
    const props = paymentFixtures(); const old = props.workspace.transactions[0];
    old.legacy_payment_complete = true; old.amounts = { ...old.amounts, paid: null, remaining: null, payment_review_required: true };
    props.workspace.eligibility[0] = { transaction_id: "a", available: 0, reason: "과거 지급 근거 확인" };
    render(<FundPaymentPage {...props} initialTab="PAID" />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText("사무용품 지급")).toBeInTheDocument();
    expect(table.getAllByText("확인 필요")).toHaveLength(2);
    expect(table.queryByText("용역비 지급")).not.toBeInTheDocument();
  });
  it("records selected bank ID and reason without sending fabricated amount or account number", async () => {
    render(<FundPaymentPage {...paymentFixtures()} />);
    const form = openBankForm();
    expect(within(form).getByRole("option", { name: /운영계좌 \*\*\*1234/ })).toBeInTheDocument();
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(mocks.execute.mock.calls[0].slice(0, 2)).toEqual(["PAYMENT_RECORD", { method: "BANK", bank_transaction_id: "bank-new", reason: "출금 명세 확인" }]);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(within(form).getByLabelText("근거 확인 사유")).toHaveValue("");
  });
  it("retains failed input and retries the same operation key; changed input gets another key", async () => {
    mocks.execute.mockRejectedValue(new Error("일시적 저장 실패"));
    render(<FundPaymentPage {...paymentFixtures()} />);
    const form = openBankForm(); fireEvent.submit(form);
    await screen.findByText("일시적 저장 실패");
    expect(within(form).getByLabelText("근거 확인 사유")).toHaveValue("출금 명세 확인");
    expect(within(form).getByLabelText(/미연결 은행 거래/)).toHaveValue("bank-new");
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "실제 입출금 저장" })).not.toBeDisabled());
    expect(mocks.execute.mock.calls[0][2]).toBe(mocks.execute.mock.calls[1][2]);
    fireEvent.change(within(form).getByLabelText("근거 확인 사유"), { target: { value: "추가 근거 확인" } });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(3));
    expect(mocks.execute.mock.calls[2][2]).not.toBe(mocks.execute.mock.calls[0][2]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("suppresses duplicate submit while the initial request is unresolved", async () => {
    let resolve!: (value: { id: string }) => void;
    mocks.execute.mockImplementation(() => new Promise(r => { resolve = r; }));
    render(<FundPaymentPage {...paymentFixtures()} />);
    const form = openBankForm();
    fireEvent.submit(form); fireEvent.submit(form);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ id: "saved" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });
  it("submits one actual payment with multiple explicitly entered allocations", async () => {
    render(<FundPaymentPage {...paymentFixtures()} />);
    fireEvent.change(screen.getByLabelText("실제 지급·입금"), { target: { value: "out" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /사무용품 지급/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /용역비 지급/ }));
    const amounts = screen.getAllByLabelText("배분금액");
    expect(amounts[0]).toHaveValue(null);
    fireEvent.change(amounts[0], { target: { value: "250" } });
    fireEvent.change(amounts[1], { target: { value: "450" } });
    fireEvent.change(screen.getByLabelText("배분 확인 사유"), { target: { value: "합산 출금 확인" } });
    fireEvent.submit(screen.getByRole("button", { name: "배분 저장" }).closest("form")!);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(mocks.execute.mock.calls[0].slice(0, 2)).toEqual(["PAYMENT_ALLOCATE", { payment_id: "out", reason: "합산 출금 확인", items: [
      { transaction_id: "a", purpose: "DISBURSEMENT", amount: 250, trust_item_id: null },
      { transaction_id: "b", purpose: "DISBURSEMENT", amount: 450, trust_item_id: null },
    ] }]);
    await waitFor(() => expect(screen.queryByLabelText("배분금액")).not.toBeInTheDocument());
  });
  it("retains failed allocation amounts and selection until a successful save", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("다른 지급이 먼저 반영됐어"));
    render(<FundPaymentPage {...paymentFixtures()} />);
    fireEvent.change(screen.getByLabelText("실제 지급·입금"), { target: { value: "out" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /사무용품 지급/ }));
    fireEvent.change(screen.getByLabelText("배분금액"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("배분 확인 사유"), { target: { value: "원본 확인" } });
    const form = screen.getByRole("button", { name: "배분 저장" }).closest("form")!;
    fireEvent.submit(form); await screen.findByText("다른 지급이 먼저 반영됐어");
    expect(screen.getByLabelText("배분금액")).toHaveValue(250);
    expect(screen.getByRole("checkbox", { name: /사무용품 지급/ })).toBeChecked();
    fireEvent.submit(form); await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    expect(mocks.execute.mock.calls[0][2]).toBe(mocks.execute.mock.calls[1][2]);
  });
  it("links an incoming return to its exact original allocation even if the transaction is not payable", async () => {
    const props = paymentFixtures(); props.workspace.eligibility = [];
    props.workspace.allocations = [{ id: "original-250", payment_id: "out", transaction_id: "a", amount: 250, purpose: "DISBURSEMENT", trust_item_id: null, reversed: false }];
    render(<FundPaymentPage {...props} />);
    fireEvent.change(screen.getByLabelText("실제 지급·입금"), { target: { value: "in" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /사무용품 지급/ }));
    fireEvent.change(screen.getByLabelText("배분금액"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("원지급 배분"), { target: { value: "original-250" } });
    fireEvent.change(screen.getByLabelText("배분 확인 사유"), { target: { value: "초과 지급 회수" } });
    fireEvent.submit(screen.getByRole("button", { name: "배분 저장" }).closest("form")!);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(mocks.execute.mock.calls[0][1]).toEqual({ payment_id: "in", reason: "초과 지급 회수", items: [{ transaction_id: "a", purpose: "RETURN", amount: 200, original_allocation_id: "original-250" }] });
  });
  it("allows review-only roles to inspect payment and reversal history without mutation controls", () => {
    const props = paymentFixtures(); props.workspace.viewer.permissions = ["APPROVE"];
    props.workspace.allocations = [{ id: "old", payment_id: "out", transaction_id: "a", amount: 250, purpose: "DISBURSEMENT", trust_item_id: null, reversed: true }];
    props.workspace.reversals = [{ allocation_id: "old", reason: "잘못 연결한 거래", created_at: "2026-09-08T03:00:00Z" }];
    props.workspace.transfers = [{ id: "transfer", amount: 400, paid_at: "2026-09-08T03:00:00Z", reason: "운영계좌 이동 확인", created_at: "2026-09-08T03:00:00Z" }];
    render(<FundPaymentPage {...props} />);
    expect(screen.getByText(/정정 사유: 잘못 연결한 거래/)).toBeInTheDocument();
    expect(screen.getByText(/운영계좌 이동 확인/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "계좌이체 연결 저장" })).not.toBeInTheDocument();
    expect(screen.queryByText("실제 입출금 기록 연결")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "배분 저장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "배분 취소 이력 저장" })).not.toBeInTheDocument();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("offers only current matching trust approvals and submits the selected item identity", async () => {
    const props = paymentFixtures(); props.workspace.transactions[0].route = "TRUST_DIRECT";
    props.trust.requests = [{ id: "request", request_no: "신탁-2026-7", title: "승인 요청", request_date: "2026-09-01", contract_version_id: "contract", receipt_reference: "receipt", status: "APPROVED", lock_version: 2, revision: 1, created_by: "admin", created_at: "2026-09-01", updated_at: "2026-09-01" }];
    const approved = { id: "approved", request_id: "request", transaction_id: "a", requested_amount: 500, approved_amount: 500, status: "APPROVED" as const, withdrawal_from_status: null, reason: "", needs_review: false, source_revision: 1, paid_amount: 100 };
    props.trust.items = [approved, { ...approved, id: "stale", source_revision: 0 }, { ...approved, id: "review", needs_review: true }, { ...approved, id: "pending", status: "PENDING" }];
    render(<FundPaymentPage {...props} />);
    fireEvent.change(screen.getByLabelText("실제 지급·입금"), { target: { value: "out" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /사무용품 지급/ }));
    const select = screen.getByLabelText("유효한 신탁 승인");
    expect(within(select).getAllByRole("option")).toHaveLength(2);
    expect(within(select).getByRole("option", { name: /승인 미지급 400원/ })).toHaveValue("approved");
    fireEvent.change(select, { target: { value: "approved" } });
    fireEvent.change(screen.getByLabelText("배분금액"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("배분 확인 사유"), { target: { value: "승인분 지급" } });
    fireEvent.submit(screen.getByRole("button", { name: "배분 저장" }).closest("form")!);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(mocks.execute.mock.calls[0][1].items).toEqual([{ transaction_id: "a", purpose: "DISBURSEMENT", amount: 200, trust_item_id: "approved" }]);
  });
  it("records cash only with entered actual person, amount, time and evidence identity", async () => {
    const props = paymentFixtures();
    props.trust.files = [{ id: "cash-evidence", request_id: null, transaction_id: null, purpose: "PAYMENT", contract_version_id: null, document_type: "현금 지급증", file_name: "cash.pdf", content_hash: "hash", uploaded_by: "pay-user", uploaded_at: "2026-09-08T03:00:00Z" }];
    render(<FundPaymentPage {...props} />);
    fireEvent.click(screen.getByText("실제 입출금 기록 연결"));
    fireEvent.change(screen.getByLabelText("근거 종류"), { target: { value: "CASH" } });
    const form = screen.getByRole("button", { name: "실제 입출금 저장" }).closest("form")!;
    expect(within(form).getByLabelText("실제 수취인·반납자")).toHaveValue("");
    expect(within(form).getByLabelText("실제 지급·반납 시각")).toHaveValue("");
    fireEvent.change(within(form).getByLabelText("실제 수취인·반납자"), { target: { value: "확인된 반납자" } });
    fireEvent.change(within(form).getByLabelText("현금 구분"), { target: { value: "IN" } });
    fireEvent.change(within(form).getByLabelText("실제 지급·반납 시각"), { target: { value: "2026-09-08T12:30" } });
    fireEvent.change(within(form).getByLabelText("실제 금액"), { target: { value: "200" } });
    fireEvent.change(within(form).getByLabelText("현금 증빙"), { target: { value: "cash-evidence" } });
    fireEvent.change(within(form).getByLabelText("근거 확인 사유"), { target: { value: "잔액 반납 확인" } });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(mocks.execute.mock.calls[0][0]).toBe("PAYMENT_RECORD");
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({ method: "CASH", flow: "IN", amount: 200, counterparty: "확인된 반납자", evidence_file_id: "cash-evidence", reason: "잔액 반납 확인" });
    expect(mocks.execute.mock.calls[0][1].paid_at).toBe("2026-09-08T03:30:00.000Z");
    expect(mocks.execute.mock.calls[0][1]).not.toHaveProperty("bank_transaction_id");
  });
});
