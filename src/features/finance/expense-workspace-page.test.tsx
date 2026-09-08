import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseWorkspacePage } from "./expense-workspace-page";
import type { ExpenseWorkspace, ExpenseWorkspaceRecord } from "./expense-workspace-repository";
const mocks = vi.hoisted(() => ({ attach: vi.fn(), connect: vi.fn(), download: vi.fn(), ocr: vi.fn(), refresh: vi.fn(), replace: vi.fn(), review: vi.fn(), update: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }) }));
vi.mock("@/app/finance/expenses/actions", () => ({ attachQuickExpenseEvidenceAction: mocks.attach, connectExpenseOriginal: mocks.connect, reviewQuickExpenseEvidenceAction: mocks.review, updateQuickExpenseDetailsAction: mocks.update }));
vi.mock("@/app/finance/expense-resolutions/actions", () => ({ createExpenseEvidenceDownloadUrlAction: mocks.download, getExpenseEvidenceOcrJobAction: mocks.ocr }));
function fixture(): ExpenseWorkspace {
  const base: ExpenseWorkspaceRecord = { source_kind: "RESOLUTION", source_id: "text-id", number: "지결-2026-1", title: "사무용품", amount: 1000, created_at: "2026-09-01", used_at: "2026-03-01", accounting_date: "2026-03-01", budget_month: null, approval_status: "승인완료", payment_status: "지급완료", author_label: "담당자", counterparty: "거래처", transaction_id: null, can_connect: true, amounts: null, trust_items: [], vouchers: [] };
  return { viewer: { staff: true, permissions: ["ADMIN"] }, records: [base, { ...base, source_kind: "QUICK", source_id: "same-text-id", number: null, title: "개인 사용", approval_status: "CONVERTED", payment_status: null, transaction_id: "connected", can_connect: false }] };
}
beforeEach(() => { vi.clearAllMocks(); mocks.connect.mockResolvedValue({ id: "saved-tx" }); mocks.update.mockResolvedValue({ id: "same-text-id" }); mocks.attach.mockResolvedValue({ id: "same-text-id" }); mocks.review.mockResolvedValue({ id: "same-text-id" }); window.history.replaceState(null, "", "/finance/expenses?from=home"); });
describe("common original expense workspace", () => {
  it("keeps the original reimbursement budget month when opening its existing page", () => {
    const data = fixture(); data.records[0] = { ...data.records[0], source_kind: "PERSONAL", budget_month: "2026-03-01" };
    render(<ExpenseWorkspacePage workspace={data} initialSourceKind="PERSONAL" initialSourceId="text-id" />);
    expect(screen.getByRole("link", { name: "기존 개인 대납 정산 화면에서 확인" })).toHaveAttribute("href", "/finance/reimbursements?month=2026-03");
  });
  it("filters original kind, connection and search with matching counts", () => {
    render(<ExpenseWorkspacePage workspace={fixture()} />);
    fireEvent.change(screen.getByLabelText("원본 종류"), { target: { value: "QUICK" } });
    expect(screen.getByText("전체 원본 2건 · 조회 결과 1건")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("사무용품")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("통합 연결"), { target: { value: "UNCONNECTED" } });
    expect(screen.getByText("전체 원본 2건 · 조회 결과 0건")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("원본 종류"), { target: { value: "ALL" } });
    fireEvent.change(screen.getByLabelText("지출 검색"), { target: { value: "지결-2026-1" } });
    expect(screen.getByText("전체 원본 2건 · 조회 결과 1건")).toBeInTheDocument();
    expect(mocks.replace).toHaveBeenLastCalledWith(expect.stringContaining("from=home"), { scroll: false });
  });
  it("opens its own ID-specific detail and preserves legacy completion without inventing paid amounts", () => {
    render(<ExpenseWorkspacePage workspace={fixture()} initialSourceKind="RESOLUTION" initialSourceId="text-id" />);
    const detail = within(screen.getByRole("region", { name: "지출 상세" }));
    expect(detail.getByText("지급완료")).toBeInTheDocument();
    expect(detail.queryByText("미지정")).not.toBeInTheDocument();
    expect(detail.queryByText(/누적 실제 지급 0원/)).not.toBeInTheDocument();
    expect(detail.getByRole("link", { name: "기존 지출결의 화면에서 확인" })).toHaveAttribute("href", "/finance/expense-resolutions?resolutionId=text-id");
    expect(detail.getByText(/선택한 원본 상세로 바로/)).toBeInTheDocument();
  });
  it("connects the existing source once and reads back the saved transaction without duplicate original rows", async () => {
    const workspace = fixture(); const rendered = render(<ExpenseWorkspacePage workspace={workspace} initialSourceKind="RESOLUTION" initialSourceId="text-id" />);
    fireEvent.click(screen.getByRole("button", { name: "원본 연결" }));
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(1));
    expect(mocks.connect).toHaveBeenCalledWith("RESOLUTION", "text-id", expect.any(String));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    workspace.records[0] = { ...workspace.records[0], transaction_id: "saved-tx", can_connect: false, amounts: { amount: 1000, paid: null, known_new_paid: 0, remaining: null, balance: null, overpaid: null, requestable: null, pending: 0, approved: 0, approved_unpaid: 0, payment_review_required: true, legacy_payment_complete: true } };
    rendered.rerender(<ExpenseWorkspacePage workspace={workspace} initialSourceKind="RESOLUTION" initialSourceId="text-id" />);
    expect(screen.queryByRole("button", { name: "원본 연결" })).not.toBeInTheDocument();
    expect(screen.getByText(/누적 실제 지급 확인 필요/)).toBeInTheDocument();
    expect(screen.getByText("전체 원본 2건 · 조회 결과 2건")).toBeInTheDocument();
  });
  it("keeps selected original and retries the same key on failure", async () => {
    mocks.connect.mockRejectedValueOnce(new Error("일시적 연결 실패"));
    render(<ExpenseWorkspacePage workspace={fixture()} initialSourceKind="RESOLUTION" initialSourceId="text-id" />);
    fireEvent.click(screen.getByRole("button", { name: "원본 연결" })); await screen.findByText("일시적 연결 실패");
    await waitFor(() => expect(screen.getByRole("button", { name: "원본 연결" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "원본 연결" })); await waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(2));
    expect(mocks.connect.mock.calls[0]).toEqual(mocks.connect.mock.calls[1]);
  });
  it("prevents a double click while the enrollment is unresolved", async () => {
    let resolve!: (value: { id: string }) => void;
    mocks.connect.mockImplementation(() => new Promise(r => { resolve = r; }));
    render(<ExpenseWorkspacePage workspace={fixture()} initialSourceKind="RESOLUTION" initialSourceId="text-id" />);
    const button = screen.getByRole("button", { name: "원본 연결" }); fireEvent.click(button); fireEvent.click(button);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ id: "saved" }));
  });
  it("keeps document links on supported query parameters and separates original usage from payment", () => {
    const workspace = fixture(); workspace.records[0].vouchers = [{ id: "voucher-1", voucher_no: "회계-1", status: "승인대기", source_kind: "RECOGNITION" }];
    workspace.records[0].trust_items = [{ id: "item", request_id: "request-1", request_no: "신탁-1", status: "PARTIAL", requested_amount: 1000, approved_amount: 500, paid_amount: 200, needs_review: true }];
    render(<ExpenseWorkspacePage workspace={workspace} initialSourceKind="RESOLUTION" initialSourceId="text-id" />);
    expect(screen.getByRole("link", { name: "회계-1" })).toHaveAttribute("href", "/finance?voucherId=voucher-1");
    expect(screen.getByRole("link", { name: "신탁-1" })).toHaveAttribute("href", "/finance/trust?request=request-1");
    expect(screen.getByText("재검토 필요")).toBeInTheDocument();
  });
  it("starts from real existing forms and explicitly leaves unified advance settlement unfinished", () => {
    render(<ExpenseWorkspacePage workspace={fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "앞으로 지급할 거래" }));
    expect(screen.getByRole("link", { name: "사전 지출결의 작성" })).toHaveAttribute("href", "/finance/expense-resolutions?start=advance");
    fireEvent.click(screen.getByRole("button", { name: "이미 사용하거나 지급한 거래" }));
    expect(screen.getByRole("link", { name: "결의 생략 근거가 있는 간편지출 등록" })).toHaveAttribute("href", "/finance/quick-expenses");
    fireEvent.click(screen.getByRole("button", { name: "먼저 지급한 돈의 정산" }));
    expect(screen.getByText(/정산 확정·예산 반영·추가 지급 실행은 정책 확인 전까지 제한/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /저장/ })).not.toBeInTheDocument();
  });
  it("does not offer staff drafting and accounting links to ordinary applicants", () => {
    const workspace = fixture(); workspace.viewer = { staff: false, permissions: [] }; workspace.records = [{ ...workspace.records[0], source_kind: "PERSONAL", source_id: "own", number: null }];
    render(<ExpenseWorkspacePage workspace={workspace} initialSourceKind="PERSONAL" initialSourceId="own" />);
    fireEvent.click(screen.getByRole("button", { name: "이미 사용하거나 지급한 거래" }));
    expect(screen.getByRole("link", { name: "개인이 먼저 쓴 경비 정산 신청" })).toHaveAttribute("href", "/finance/reimbursements");
    expect(screen.queryByRole("link", { name: /간편지출 등록/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "제목으로 지급 목록 확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "원본 연결" })).toBeInTheDocument();
  });
  it("reviews saved receipt OCR before updating quick-expense text and preserves the original amount", async () => {
    const workspace = fixture(); workspace.records[1] = { ...workspace.records[1], title: "사무용품", amount: 14000, counterparty: "다이소", updated_at: "2026-09-08T08:00:00Z", evidence_files: [{ ocr_job_id: "job-1", file_name: "영수증.jpg", content_type: "image/jpeg", storage_path: "org/user/receipt.jpg", evidence_type: "영수증", status: "COMPLETED", stage: "COMPLETED", progress: 100, result_data: { issuer: "(주)아성다이소봉천본점", totalAmount: 15000, items: [{ itemName: "서류꽂이" }, { itemName: "건전지" }] }, error_message: null, created_at: "2026-09-08" }] };
    render(<ExpenseWorkspacePage workspace={workspace} initialSourceKind="QUICK" initialSourceId="same-text-id" />);
    expect(screen.getByText(/원본 14,000원과 OCR 금액 15,000원이 달라/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "OCR 결과를 내용 수정에 반영" }));
    expect(screen.getByLabelText("사용내용")).toHaveValue("서류꽂이, 건전지");
    expect(screen.getByLabelText("거래처")).toHaveValue("(주)아성다이소봉천본점");
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: "same-text-id", usageDescription: "서류꽂이, 건전지", counterparty: "(주)아성다이소봉천본점", expectedUpdatedAt: "2026-09-08T08:00:00Z", operationKey: expect.any(String) }));
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("amount");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });
  it("records an explicit decision for alternative evidence", async () => {
    const workspace=fixture(); workspace.records[1]={...workspace.records[1],evidence_review_status:"REVIEW_REQUIRED",missing_evidence_reason:"영수증 분실",evidence_files:[{ocr_job_id:"job-1",file_name:"주문내역.jpg",content_type:"image/jpeg",storage_path:"org/user/order.jpg",evidence_type:"주문내역",status:"COMPLETED",stage:"COMPLETED",progress:100,result_data:{},error_message:null,created_at:"2026-09-08"}]};
    render(<ExpenseWorkspacePage workspace={workspace} initialSourceKind="QUICK" initialSourceId="same-text-id"/>);
    fireEvent.change(screen.getByLabelText("증빙 처리 사유"),{target:{value:"카드 승인내역과 주문내역 확인"}});
    fireEvent.click(screen.getByRole("button",{name:"증빙 확인·완료"}));
    await waitFor(()=>expect(mocks.review).toHaveBeenCalledWith({id:"same-text-id",decision:"APPROVE_EVIDENCE",reason:"카드 승인내역과 주문내역 확인",operationKey:expect.any(String)}));
  });
});
