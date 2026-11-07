import { fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(screen.getByText("취소 원본 보존")).toBeInTheDocument();
    expect(screen.getByText(/ERP 연결 대상에서는 제외해/)).toBeInTheDocument();
    expect(screen.getByText("취소")).toBeInTheDocument();
    expect(screen.queryByText("부과 연결 완료")).not.toBeInTheDocument();
  });
  it("shows one logical source ID and keeps technical version data collapsed", () => {
    render(<CollectionLedgerPage workspace={{
      ...workspace,
      external_recognitions: [{ id: "corrected-recognition", assessment_id: "a", source_recognition_id: "r-10", source_root_recognition_id: "r-10", source_current_recognition_id: "r-12", source_assessment_id: "source-a", external_member_id: "peopleon-42", member_name_snapshot: "정정 조합원", recognized_on: "2026-09-03", recognized_amount: 300, claimed_amount: 400, recognition_type: "가입신청필증", reason: "금액 정정", status: "ACTIVE", source_kind: "application_certificate", accounting_treatment: "confirmed_loss", actual_fund_amount: 0, loss_amount: 300, linkage_status: "LINKED", linkage_issue_detail: null, governance_status: "reflected", sync_reason: "CORRECTION", source_version: 12, source_updated_at: "2026-09-03T00:00:00Z", source_payload: {} }],
    }} mode="collections" />);
    expect(screen.getByText("2026-09-03 · 원본 ID r-10")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "변경 이력" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "버전" })).not.toBeInTheDocument();
    const history = screen.getByRole("group", { name: "정정 조합원 변경 이력 정보" });
    expect(history).not.toHaveAttribute("open");
    expect(within(history).getByText("현재 ID r-12")).toBeInTheDocument();
    expect(within(history).getByText("동기화 순번 v12")).toBeInTheDocument();
  });
  it("sorts external recognitions by Korean member name in both directions", () => {
    const recognition = { id: "sort-one", assessment_id: null, source_recognition_id: "sort-one", source_root_recognition_id: "sort-one", source_current_recognition_id: "sort-one", source_assessment_id: null, external_member_id: "peopleon-one", member_name_snapshot: "유숙경", recognized_on: "2026-09-03", recognized_amount: 300, claimed_amount: 300, recognition_type: "가입신청필증", reason: "정렬 확인", status: "ACTIVE", source_kind: "application_certificate", accounting_treatment: "confirmed_loss", actual_fund_amount: 0, loss_amount: 300, linkage_status: "MEMBER_LEVEL", linkage_issue_detail: null, governance_status: "reflected", sync_reason: "INITIAL", source_version: 1, source_updated_at: "2026-09-03T00:00:00Z", source_payload: {} } as const;
    render(<CollectionLedgerPage workspace={{
      ...workspace,
      external_recognitions: [recognition, { ...recognition, id: "sort-two", source_recognition_id: "sort-two", source_root_recognition_id: "sort-two", source_current_recognition_id: "sort-two", external_member_id: "peopleon-two", member_name_snapshot: "박승수" }],
    }} mode="collections" />);
    const panel = screen.getByRole("tabpanel");
    const header = within(panel).getByRole("columnheader", { name: /조합원·원본 ID/ });
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(within(panel).getByText("박승수").compareDocumentPosition(within(panel).getByText("유숙경")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "조합원 내림차순으로 전환" }));
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(within(panel).getByText("유숙경").compareDocumentPosition(within(panel).getByText("박승수")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "조합원 오름차순으로 전환" })).toBeInTheDocument();
  });
  it("separates Dongil fixed certificates from general external recognitions without overlap", () => {
    const general = { id: "general", assessment_id: "a", source_recognition_id: "r-general", source_root_recognition_id: "r-general", source_current_recognition_id: "r-general", source_assessment_id: "source-a", external_member_id: "peopleon-42", member_name_snapshot: "일반 인정 조합원", recognized_on: "2026-09-03", recognized_amount: 55_000_000, claimed_amount: 55_000_000, recognition_type: "신탁사 입금", reason: "신탁 보관", status: "ACTIVE", source_kind: "trust_account", accounting_treatment: "trust_receipt", actual_fund_amount: 55_000_000, loss_amount: 0, linkage_status: "LINKED", linkage_issue_detail: null, governance_status: "reflected", sync_reason: "INITIAL", source_version: 1, source_updated_at: "2026-09-03T00:00:00Z", source_payload: {} } as const;
    const fixed = { id: "fixed", assessment_id: null, source_recognition_id: "agency_receipt:137", source_root_recognition_id: "agency_receipt:137", source_current_recognition_id: "agency_receipt:137", source_assessment_id: null, external_member_id: null, member_name_snapshot: "정액 필증 조합원", recognized_on: "2009-07-13", recognized_amount: 30_000_000, claimed_amount: 30_000_000, recognition_type: "동일건설 정액 필증", reason: "정액 필증", status: "ACTIVE", source_kind: "dongil_fixed_certificate", accounting_treatment: "confirmed_loss", actual_fund_amount: 0, loss_amount: 30_000_000, linkage_status: "ASSESSMENT_MISSING", linkage_issue_detail: "ERP 부과 원본 연결 ID가 없습니다.", governance_status: "legacy_reflected", sync_reason: "INITIAL_AGENCY_BACKFILL", source_version: 1, source_updated_at: "2026-11-06T00:00:00Z", source_payload: {} } as const;

    render(<CollectionLedgerPage workspace={{ ...workspace, external_recognitions: [general, fixed] }} mode="collections" />);

    expect(screen.getByRole("tab", { name: "일반 외부납입 · 1건" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("일반 인정 조합원")).toBeInTheDocument();
    expect(screen.queryByText("정액 필증 조합원")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "정액 필증 3천만원 · 1건" }));
    expect(screen.queryByText("일반 인정 조합원")).not.toBeInTheDocument();
    expect(screen.getByText("정액 필증 조합원")).toBeInTheDocument();
    expect(screen.getByText("PeopleON ID 연결 필요")).toBeInTheDocument();
    expect(screen.queryByText("ERP 부과 원본 연결 ID가 없습니다.")).not.toBeInTheDocument();
    const fixedSummary = screen.getByRole("region", { name: "정액 필증 3천만원 요약" });
    expect(within(fixedSummary).getByText("1건 · 30,000,000원")).toBeInTheDocument();
    expect(within(fixedSummary).getByText("30,000,000원")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "전체 감사 목록 · 2건" }));
    expect(screen.getByText("일반 인정 조합원")).toBeInTheDocument();
    expect(screen.getByText("정액 필증 조합원")).toBeInTheDocument();
  });
  it("filters fixed certificates by the current Ledger member classification without changing accounting", () => {
    const fixed = { id: "fixed-registered", assessment_id: null, source_recognition_id: "agency_receipt:1", source_root_recognition_id: "agency_receipt:1", source_current_recognition_id: "agency_receipt:1", source_assessment_id: null, external_member_id: "peopleon-1", member_name_snapshot: "등기 대상", recognized_on: "2009-07-13", recognized_amount: 30_000_000, claimed_amount: 30_000_000, recognition_type: "동일건설 정액 필증", reason: "정액 필증", status: "ACTIVE", source_kind: "dongil_fixed_certificate", accounting_treatment: "confirmed_loss", actual_fund_amount: 0, loss_amount: 30_000_000, linkage_status: "MEMBER_LEVEL", linkage_issue_detail: null, governance_status: "legacy_reflected", sync_reason: "MEMBER_CLASSIFICATION_BACKFILL", source_version: 10, source_updated_at: "2026-11-07T00:00:00Z", source_payload: { member_group: "registered", member_status: "조합원" } } as const;
    const recognitions = [
      fixed,
      { ...fixed, id: "fixed-withdrawn", source_recognition_id: "agency_receipt:2", source_root_recognition_id: "agency_receipt:2", source_current_recognition_id: "agency_receipt:2", member_name_snapshot: "환불 대상", source_payload: { member_group: "withdrawn", member_status: "환불조합원" } },
      { ...fixed, id: "fixed-prospective", source_recognition_id: "agency_receipt:3", source_root_recognition_id: "agency_receipt:3", source_current_recognition_id: "agency_receipt:3", member_name_snapshot: "예비 대상", source_payload: { member_group: "prospective", member_status: "예비조합원" } },
      { ...fixed, id: "fixed-unknown", source_recognition_id: "agency_receipt:4", source_root_recognition_id: "agency_receipt:4", source_current_recognition_id: "agency_receipt:4", member_name_snapshot: "미확인 대상", source_payload: {} },
    ];

    render(<CollectionLedgerPage workspace={{ ...workspace, external_recognitions: recognitions }} mode="collections" />);
    fireEvent.click(screen.getByRole("tab", { name: "정액 필증 3천만원 · 4건" }));

    expect(screen.getByRole("tab", { name: /전체.*4건.*120,000,000원/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /등기조합원.*1건.*30,000,000원/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /탈퇴·환불조합원.*1건.*30,000,000원/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /예비조합원.*1건.*30,000,000원/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /미확인.*1건.*30,000,000원/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /탈퇴·환불조합원.*1건/ }));
    expect(screen.getByText("환불 대상")).toBeInTheDocument();
    expect(screen.queryByText("등기 대상")).not.toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "정액 필증 3천만원 요약" });
    expect(within(summary).getByText("1건 · 30,000,000원")).toBeInTheDocument();
    expect(within(summary).getByText("실제 보관 자금").parentElement).toHaveTextContent("0원");
  });
  it("shows every unresolved recognition and explains missing PeopleON identity instead of a missing assessment", () => {
    const fixed = { id: "fixed", assessment_id: null, source_recognition_id: "agency_receipt:137", source_root_recognition_id: "agency_receipt:137", source_current_recognition_id: "agency_receipt:137", source_assessment_id: null, external_member_id: null, member_name_snapshot: "박용수", recognized_on: "2009-07-13", recognized_amount: 30_000_000, claimed_amount: 30_000_000, recognition_type: "동일건설 정액 필증", reason: "정액 필증", status: "ACTIVE", source_kind: "dongil_fixed_certificate", accounting_treatment: "confirmed_loss", actual_fund_amount: 0, loss_amount: 30_000_000, linkage_status: "ASSESSMENT_MISSING", linkage_issue_detail: "ERP 부과 원본 연결 ID가 없습니다.", governance_status: "legacy_reflected", sync_reason: "INITIAL_AGENCY_BACKFILL", source_version: 1, source_updated_at: "2026-11-06T00:00:00Z", source_payload: {} } as const;
    const unresolved = Array.from({ length: 6 }, (_, index) => ({
      id: `issue-${index}`,
      source_recognition_id: index === 5 ? "agency_receipt:137" : `source-${index}`,
      source_version: 1,
      issue_code: "UNKNOWN_ASSESSMENT" as const,
      issue_detail: "Ledger 외부납입 원장에 ERP 부과 원본 연결 ID가 없습니다.",
      created_at: "2026-11-07T00:00:00Z",
    }));

    render(<CollectionLedgerPage workspace={{
      ...workspace,
      external_recognitions: [fixed],
      ledger_external_recognition_sync: { state: null, unresolved_issues: unresolved, source_count: 1 },
    }} mode="collections" />);

    expect(screen.getByText("외부납입 연결 검토 6건")).toBeInTheDocument();
    expect(screen.getByText(/agency_receipt:137 · 박용수 · PeopleON 고유 ID 연결이 필요해/)).toBeInTheDocument();
  });
});
