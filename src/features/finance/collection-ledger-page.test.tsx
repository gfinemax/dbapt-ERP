import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/finance/collections/actions", () => ({ executeCollectionLedger: vi.fn(), previewCollectionAssessmentCsv: vi.fn(), applyCollectionAssessmentCsv: vi.fn() }));
import { CollectionLedgerPage } from "./collection-ledger-page";
import type { CollectionLedgerWorkspace } from "./collection-ledger-repository";

const workspace: CollectionLedgerWorkspace = {
  assessments: [{ id: "a", external_member_id: "peopleon-42", member_no: "M-42", member_name_snapshot: "김조합", assessment_code: "2026-09", due_date: "2026-09-30", assessed_amount: 1000, allocated_amount: 700, status: "ACTIVE", lock_version: 1 }],
  allocations: [{ id: "x", assessment_id: "a", bank_transaction_id: "bank", amount: 700, reason: "확인", created_at: "2026-09-02", reversed: false, reversal_reason: null, bank_date: "2026-09-02", bank_description: "분담금" }],
  refunds: [], deposit_candidates: [{ id: "bank2", transacted_at: "2026-09-03", description: "추가입금", counterparty: "김조합", amount: 300, available_amount: 300 }], withdrawal_candidates: [],
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
});
