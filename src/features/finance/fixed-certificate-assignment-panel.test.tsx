// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FixedCertificateAssignmentWorkspace } from "./collection-ledger-repository";

const actions = vi.hoisted(() => ({ preview: vi.fn(), update: vi.fn(), confirm: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/finance/collections/actions", () => ({
  previewFixedCertificateAssignmentFromGoogleSheet: actions.preview,
  updateFixedCertificateAssignmentMatch: actions.update,
  confirmFixedCertificateAccountAssignments: actions.confirm,
}));

import { FixedCertificateAssignmentPanel } from "./fixed-certificate-assignment-panel";

function workspace(overrides: Partial<FixedCertificateAssignmentWorkspace["summary"]> = {}): FixedCertificateAssignmentWorkspace {
  const rows = Array.from({ length: 116 }, (_, index) => ({
    sheet_row_number: index + 4,
    sheet_name_snapshot: `명단${index + 1}`,
    source_root_recognition_id: `root-${index + 1}`,
    external_member_id: `member-${index + 1}`,
    erp_name_snapshot: `ERP${index + 1}`,
    source_version: 1,
    match_status: "EXACT" as const,
  }));
  return {
    batch: {
      id: "batch", status: "PREVIEW", source_document_id: "sheet", source_sheet_id: 72846910,
      source_sheet_name: "조합원연명부(116명)", source_range: "B4:B119", source_hash: "a".repeat(64),
      source_signature: "b".repeat(64), reference_count: 116, contribution_account_subject_id: "contribution",
      suspense_account_subject_id: "suspense", created_by_label: "관리자", created_at: "2026-11-09T00:00:00Z",
      applied_at: null, apply_reason: null, lock_version: 1,
    },
    summary: {
      fixed_count: 137, exact_count: 116, manual_count: 0, unresolved_count: 0,
      contribution_count: 116, suspense_count: 21, active_contribution_count: 0,
      active_suspense_count: 0, contribution_amount: 0, suspense_amount: 0, is_stale: false,
      ...overrides,
    },
    rows,
    candidates: [],
    assignments: [],
  };
}

beforeEach(() => vi.clearAllMocks());

describe("fixed certificate assignment panel", () => {
  it("starts with a read-only source explanation and preview action", () => {
    render(<FixedCertificateAssignmentPanel canDecide initialValue={null} />);
    expect(screen.getByRole("button", { name: "116명 명단 대조 미리보기" })).toBeEnabled();
    expect(screen.getByRole("link", { name: /Google 시트 조합원연명부/ })).toHaveAttribute("href", expect.stringContaining("gid=72846910"));
    expect(screen.getByText(/다른 열은 가져오지 않아/)).toBeInTheDocument();
  });

  it("keeps apply disabled while any of the 13 names is unresolved", () => {
    const value = workspace({ exact_count: 103, unresolved_count: 13, contribution_count: 103, suspense_count: 34 });
    value.rows = value.rows.map((row, index) => index < 13 ? { ...row, source_root_recognition_id: null, external_member_id: null, erp_name_snapshot: null, source_version: null, match_status: "UNRESOLVED" as const } : row);
    render(<FixedCertificateAssignmentPanel canDecide initialValue={value} />);
    expect(screen.getByText("이름이 다른 13명 수동 대조")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /분담금 116건/ })).toBeDisabled();
  });

  it("enables apply only after the 116 and 21 guard and a reason", () => {
    render(<FixedCertificateAssignmentPanel canDecide initialValue={workspace()} />);
    const apply = screen.getByRole("button", { name: /분담금 116건/ });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/분류 근거/), { target: { value: "116명 명단과 원본 ID 대조 완료" } });
    expect(apply).toBeEnabled();
    expect(screen.getByText("116명 분담금 · 21명 가수금 · 원본 버전 검증 완료")).toBeInTheDocument();
  });
});
