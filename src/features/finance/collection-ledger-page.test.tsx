import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/finance/collections/actions", () => ({ executeCollectionLedger: vi.fn(), syncLedgerContributions: vi.fn(), syncLedgerExternalRecognitions: vi.fn(), previewCollectionAssessmentCsv: vi.fn(), applyCollectionAssessmentCsv: vi.fn(), loadCollectionAssessmentCsv: vi.fn(), cancelCollectionAssessmentCsv: vi.fn() }));
import { CollectionLedgerPage } from "./collection-ledger-page";
import type { CollectionLedgerWorkspace } from "./collection-ledger-repository";

const workspace: CollectionLedgerWorkspace = {
  assessments: [{ id: "a", external_member_id: "peopleon-42", member_no: "M-42", member_name_snapshot: "김조합", assessment_code: "2026-09", due_date: "2026-09-30", assessed_amount: 1000, allocated_amount: 700, cash_allocated_amount: 700, external_recognized_amount: 0, satisfied_amount: 700, status: "ACTIVE", lock_version: 1 }],
  allocations: [{ id: "x", assessment_id: "a", bank_transaction_id: "bank", amount: 700, reason: "확인", created_at: "2026-09-02", reversed: false, reversal_reason: null, bank_date: "2026-09-02", bank_description: "분담금" }],
  external_recognitions: [],
  refunds: [], deposit_candidates: [{ id: "bank2", transacted_at: "2026-09-03", description: "추가입금", counterparty: "김조합", amount: 300, available_amount: 300 }], withdrawal_candidates: [],
  import_batches: [],
  viewer: { user_id: "admin", permissions: ["ADMIN"] },
};
describe("collection ledger page", () => {
  it("shows authoritative ID separately from the display snapshot and the remaining balance", () => {
    render(<CollectionLedgerPage workspace={workspace} mode="collections" />);
    expect(screen.getByText(/peopleon-42/)).toBeInTheDocument();
    expect(screen.getByText(/잔액 300원/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수납 배분" })).toBeInTheDocument();
  });
  it("starts refunds from the preserved receipt allocation and does not offer name matching", () => {
    render(<CollectionLedgerPage workspace={workspace} mode="collections" />);
    expect(screen.getByRole("button", { name: "환급안 작성" })).toBeInTheDocument();
    expect(screen.queryByText(/이름으로 자동/)).not.toBeInTheDocument();
  });
  it("offers audited CSV preview for decision makers", () => {
    render(<CollectionLedgerPage workspace={workspace} mode="collections" />);
    expect(screen.getByRole("heading", { name: "CSV 일괄 등록" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "미리보기" })).toBeInTheDocument();
  });
  it("offers a later partial refund only for the amount still available", () => {
    render(<CollectionLedgerPage workspace={{ ...workspace, refunds: [{ id: "r", source_allocation_id: "x", external_member_id: "peopleon-42", member_name_snapshot: "김조합", reason: "일부 환급", requested_amount: 300, status: "PAID", bank_transaction_id: "out", lock_version: 3, created_by: "other", approved_at: "2026-09-04", paid_at: "2026-09-05", created_at: "2026-09-04" }] }} mode="collections" />);
    expect(screen.getByPlaceholderText("잔여 400원")).toHaveAttribute("max", "400");
  });
  it("offers assessment cancellation only when no active receipt allocation exists", () => {
    render(<CollectionLedgerPage workspace={{ ...workspace, allocations: [], assessments: [{ ...workspace.assessments[0], allocated_amount: 0, cash_allocated_amount: 0, satisfied_amount: 0 }] }} mode="collections" />);
    expect(screen.getByRole("button", { name: "부과 원본 취소" })).toBeInTheDocument();
  });
  it("counts external recognition toward completion without presenting it as a cash receipt", () => {
    render(<CollectionLedgerPage workspace={{
      ...workspace,
      assessments: [{ ...workspace.assessments[0], external_recognized_amount: 300, satisfied_amount: 1000 }],
      external_recognitions: [{ id: "recognition", assessment_id: "a", source_recognition_id: "r-1", source_root_recognition_id: "r-1", source_current_recognition_id: "r-2", source_assessment_id: "source-a", external_member_id: "peopleon-42", member_name_snapshot: "외부인정 조합원", recognized_on: "2026-09-03", recognized_amount: 300, claimed_amount: 400, recognition_type: "상계", reason: "기존 채권 상계", status: "ACTIVE", source_kind: "application_certificate", accounting_treatment: "confirmed_loss", actual_fund_amount: 0, loss_amount: 300, linkage_status: "LINKED", linkage_issue_detail: null, governance_status: "reflected", sync_reason: "CORRECTION", source_version: 2, source_updated_at: "2026-09-03T00:00:00Z", source_payload: {} }],
    }} mode="collections" />);
    expect(screen.getByText(/외부 인정 300원/)).toBeInTheDocument();
    expect(screen.getByText("완납")).toBeInTheDocument();
    expect(screen.getByText(/현금수지 제외/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수납 배분" })).not.toBeInTheDocument();
  });
  it("shows the structured ledger cancellation reason for cancelled external recognition", () => {
    render(<CollectionLedgerPage workspace={{
      ...workspace,
      external_recognitions: [{ id: "cancelled-recognition", assessment_id: "a", source_recognition_id: "r-8", source_root_recognition_id: "r-8", source_current_recognition_id: "r-8", source_assessment_id: "source-a", external_member_id: "peopleon-42", member_name_snapshot: "취소 조합원", recognized_on: "2026-09-03", recognized_amount: 0, claimed_amount: 400, recognition_type: "가입신청필증", reason: "외부 납입 인정", status: "CANCELLED", source_kind: "application_certificate", accounting_treatment: "confirmed_loss", actual_fund_amount: 0, loss_amount: 0, linkage_status: "LINKED", linkage_issue_detail: null, governance_status: "cancelled", sync_reason: "CANCELLATION_REASON_BACKFILL", source_version: 3, source_updated_at: "2026-11-06T00:00:00Z", source_payload: { recognition: { cancel_reason_code: "amount_error", cancel_reason_detail: "금액을 잘못 입력해 취소" } } }],
    }} mode="collections" />);
    expect(screen.getAllByText(/취소 사유: 금액 오류 · 금액을 잘못 입력해 취소/).length).toBeGreaterThan(0);
  });
});
