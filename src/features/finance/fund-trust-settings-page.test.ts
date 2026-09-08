import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrustContractRow, TrustReadResult } from "./fund-trust-repository";
import type { ReimbursementPermission } from "./reimbursement-domain";

const mocks = vi.hoisted(() => ({ command: vi.fn(), attach: vi.fn(), download: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/finance/trust/actions", () => ({ executeTrustCommand: mocks.command, attachTrustFile: mocks.attach, downloadTrustFile: mocks.download }));
import { FundTrustSettingsPage } from "./fund-trust-settings-page";

const conditions = {
  allowed_source_kinds: ["RESOLUTION"], required_document_types: [], consent_roles: [], no_limit: true, max_request_amount: null,
  operating_allowed: false, operating_advance_allowed: false, operating_basis: "", operating_account_ids: [], advance_settlement_terms: "",
};
function contract(overrides: Partial<TrustContractRow> = {}): TrustContractRow {
  return { id: "contract-a", contract_key: "contract-key", version: 1, lock_version: 3, name: "보관 중인 계약", trustee: "계약 신탁사", reference: "계약서 제1조",
    management_account_id: "management-account", status: "DRAFT", conditions: structuredClone(conditions), created_by: "trusted-user", created_at: "2026-09-08T01:00:00Z", verified_by: null, verified_at: null, ...overrides };
}
function workspace(row: TrustContractRow | null = contract(), permission: ReimbursementPermission = "ADMIN"): TrustReadResult {
  return {
    contracts: row ? [row] : [], requests: [], items: [], submissions: [], events: [],
    files: row ? [{ id: "original-file", request_id: null, transaction_id: null, contract_version_id: row.id, purpose: "CONTRACT", document_type: "",
      file_name: "계약 원본.pdf", content_hash: "a".repeat(64), uploaded_by: "trusted-user", uploaded_at: "2026-09-08T01:00:00Z" }] : [],
    accounts: [{ id: "management-account", label: "관리계좌 ***1234" }, { id: "operating-account", label: "운영계좌 ***5678" }],
    viewer: { user_id: "trusted-user", permissions: [permission] },
  };
}
const page = (data: TrustReadResult) => createElement(FundTrustSettingsPage, { workspace: data });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.command.mockResolvedValue({ id: "contract-a", lock_version: 4 });
  mocks.attach.mockResolvedValue({ id: "uploaded-file" });
  mocks.download.mockResolvedValue("https://storage.example.test/signed-original");
});
afterEach(cleanup);

describe("incomplete drafts and explicit contract conditions", () => {
  it("saves unknown policy as unknown and retains unconfirmed draft lists across reloading", async () => {
    mocks.command.mockResolvedValueOnce({ id: "saved-draft", lock_version: 1 });
    const rendered = render(page(workspace(null)));
    change("계약명", "작성 중인 계약"); change("필수서류 항목", "계약서\n지출증빙"); change("공동 동의 역할", "공동 확인자");
    expect(screen.getByLabelText("운영계좌 집행 허용")).toHaveValue("");
    expect(screen.getByLabelText("운영비 선교부 허용")).toHaveValue("");
    expect(screen.getByLabelText("요청 한도")).toHaveValue("");
    expect(screen.getByLabelText("필수서류 목록 확인")).not.toBeChecked();
    click("초안 저장");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    const [command, payload, key] = mocks.command.mock.calls[0];
    expect(command).toBe("CONTRACT_SAVE"); expect(key).toEqual(expect.any(String));
    expect(payload).not.toHaveProperty("id"); expect(payload).not.toHaveProperty("organization_id"); expect(payload).not.toHaveProperty("actor_id");
    expect(payload.conditions).toMatchObject({ allowed_source_kinds: [], required_document_types: null, consent_roles: null,
      draft_required_document_types: ["계약서", "지출증빙"], draft_consent_roles: ["공동 확인자"], no_limit: null, max_request_amount: null, operating_allowed: null, operating_advance_allowed: null });
    expect(payload.management_account_id).toBeNull();
    rendered.rerender(page(workspace(contract({ id: "saved-draft", name: payload.name, trustee: "", reference: "", management_account_id: null, lock_version: 1, conditions: payload.conditions }))));
    expect(screen.getByLabelText("필수서류 항목")).toHaveValue("계약서\n지출증빙");
    expect(screen.getByLabelText("공동 동의 역할")).toHaveValue("공동 확인자");
    expect(screen.getByLabelText("공동 동의 역할 확인")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "계약 조건 확인 완료" })).toBeDisabled();
  });
  it("saves empty confirmed lists and explicitly entered limits and prohibitions", async () => {
    render(page(workspace(null)));
    fireEvent.click(screen.getByLabelText("필수서류 목록 확인")); fireEvent.click(screen.getByLabelText("공동 동의 역할 확인"));
    change("요청 한도", "false"); change("요청 한도 금액 (원)", "500000");
    change("운영계좌 집행 허용", "false"); change("운영비 선교부 허용", "false");
    fireEvent.click(screen.getByLabelText("지출결의"));
    click("초안 저장");
    await waitFor(() => expect(mocks.command).toHaveBeenCalledOnce());
    expect(mocks.command.mock.calls[0][1].conditions).toMatchObject({ required_document_types: [], consent_roles: [], no_limit: false, max_request_amount: 500000, operating_allowed: false, operating_advance_allowed: false, allowed_source_kinds: ["RESOLUTION"] });
    expect(mocks.command.mock.calls[0][1].conditions).not.toHaveProperty("draft_required_document_types");
  });
  it("preserves existing extra conditions and requires rechecking an edited document list", async () => {
    render(page(workspace(contract({ conditions: { ...conditions, extra_contract_clause: "별도 확인 조건", required_document_types: ["기존 서류"] } }))));
    expect(screen.getByLabelText("필수서류 목록 확인")).toBeChecked();
    change("필수서류 항목", "새 서류");
    expect(screen.getByLabelText("필수서류 목록 확인")).not.toBeChecked();
    click("초안 저장");
    await waitFor(() => expect(mocks.command).toHaveBeenCalledOnce());
    expect(mocks.command.mock.calls[0][1].conditions).toMatchObject({ extra_contract_clause: "별도 확인 조건", required_document_types: null, draft_required_document_types: ["새 서류"] });
  });
  it("saves explicitly permitted operating accounts and advance settlement terms", async () => {
    render(page(workspace()));
    change("운영계좌 집행 허용", "true"); change("운영계좌 집행 근거", "운영비 특약 제2조");
    fireEvent.click(screen.getByLabelText("운영계좌 ***5678"));
    expect(screen.queryByRole("checkbox", { name: "관리계좌 ***1234" })).not.toBeInTheDocument();
    change("운영비 선교부 허용", "true"); change("운영비 선교부 정산 조건", "증빙 검토와 차액 반납 조건");
    click("초안 저장");
    await waitFor(() => expect(mocks.command).toHaveBeenCalledOnce());
    expect(mocks.command.mock.calls[0][1].conditions).toMatchObject({ operating_allowed: true, operating_advance_allowed: true,
      operating_basis: "운영비 특약 제2조", operating_account_ids: ["operating-account"], advance_settlement_terms: "증빙 검토와 차액 반납 조건" });
  });
});

describe("save versions, failed retry and concurrent changes", () => {
  it("uses the returned lock immediately and then accepts a newer refreshed server version", async () => {
    mocks.command.mockResolvedValueOnce({ id: "contract-a", lock_version: 4 }).mockResolvedValueOnce({ id: "contract-a", lock_version: 5 }).mockResolvedValueOnce({ id: "contract-a", lock_version: 9 });
    const rendered = render(page(workspace()));
    change("계약명", "첫 번째 수정"); click("초안 저장");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.command.mock.calls[0][1]).toMatchObject({ id: "contract-a", lock_version: 3 });
    change("계약명", "두 번째 수정"); click("초안 저장");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2));
    expect(mocks.command.mock.calls[1][1]).toMatchObject({ id: "contract-a", lock_version: 4 });
    rendered.rerender(page(workspace(contract({ name: "서버에서 다시 읽은 계약", lock_version: 8 }))));
    expect(screen.getByLabelText("계약명")).toHaveValue("서버에서 다시 읽은 계약");
    change("신탁사", "변경 신탁사"); click("초안 저장");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(3));
    expect(mocks.command.mock.calls[2][1]).toMatchObject({ lock_version: 8, trustee: "변경 신탁사" });
  });
  it("blocks double submit and retries unchanged failed payload with the same operation key", async () => {
    let fail!: (reason: Error) => void;
    mocks.command.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    render(page(workspace())); change("계약명", "실패해도 보관할 입력");
    const form = screen.getByRole("button", { name: "초안 저장" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(mocks.command).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "초안 저장" })).toBeDisabled();
    await act(async () => fail(new Error("일시적인 저장 실패")));
    expect(await screen.findByRole("alert")).toHaveTextContent("일시적인 저장 실패");
    expect(screen.getByLabelText("계약명")).toHaveValue("실패해도 보관할 입력");
    expect(mocks.refresh).not.toHaveBeenCalled();
    click("초안 저장"); await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.command.mock.calls[0]).toEqual(mocks.command.mock.calls[1]);
    change("계약명", "다른 입력"); click("초안 저장");
    await waitFor(() => expect(mocks.command).toHaveBeenCalledTimes(3));
    expect(mocks.command.mock.calls[2][2]).not.toBe(mocks.command.mock.calls[0][2]);
  });
  it("keeps unsaved edits on refresh without silently adopting a newer lock", async () => {
    mocks.command.mockRejectedValueOnce(new Error("계약이 변경되었습니다. 다시 조회해주세요."));
    const rendered = render(page(workspace())); change("계약명", "내 작성 중 내용");
    rendered.rerender(page(workspace(contract({ name: "다른 담당자가 저장한 내용", lock_version: 4 }))));
    expect(screen.getByLabelText("계약명")).toHaveValue("내 작성 중 내용");
    expect(screen.getByText(/다른 변경이 저장됐어/)).toBeInTheDocument();
    click("초안 저장"); await screen.findByRole("alert");
    expect(mocks.command.mock.calls[0][1]).toMatchObject({ lock_version: 3, name: "내 작성 중 내용" });
    click("저장된 내용 다시 불러오기");
    expect(screen.getByLabelText("계약명")).toHaveValue("다른 담당자가 저장한 내용");
    expect(screen.queryByText(/저장하지 않은 변경 있음/)).not.toBeInTheDocument();
  });
});

describe("permissions and immutable contract versions", () => {
  it.each<ReimbursementPermission>(["APPROVE", "PAY", "CLOSE", "SENIOR"])("keeps %s staff read-only and preserves the old expense settings link", (permission) => {
    render(page(workspace(contract(), permission)));
    expect(screen.getByLabelText("계약명")).toBeDisabled();
    for (const name of ["새 계약 초안", "초안 저장", "계약 원본 첨부", "계약 조건 확인 완료", "이 버전 폐기", "이 계약에서 새 버전 작성"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기존 지출 관리설정" })).toHaveAttribute("href", "/finance/expense-settings");
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("makes verified contents read-only and creates a separate version linked to the original", async () => {
    const original = contract({ status: "VERIFIED", verified_by: "trusted-user", verified_at: "2026-09-08T01:00:00Z" });
    const before = structuredClone(original);
    render(page(workspace(original)));
    expect(screen.getByLabelText("계약명")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "초안 저장" })).not.toBeInTheDocument();
    click("이 계약에서 새 버전 작성");
    expect(screen.getByLabelText("계약명")).toBeEnabled();
    expect(screen.queryByText("계약 원본.pdf · 계약 원본")).not.toBeInTheDocument();
    change("계약명", "별도 새 버전");
    mocks.command.mockResolvedValueOnce({ id: "new-version", lock_version: 1 });
    click("초안 저장"); await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.command.mock.calls[0][1]).toMatchObject({ previous_version_id: "contract-a", name: "별도 새 버전" });
    expect(mocks.command.mock.calls[0][1]).not.toHaveProperty("id");
    expect(mocks.command.mock.calls[0][1]).not.toHaveProperty("lock_version");
    expect(original).toEqual(before);
  });
  it("requires a reason before verification and reflects its returned version without waiting for props", async () => {
    render(page(workspace()));
    click("계약 조건 확인 완료"); expect(await screen.findByRole("alert")).toHaveTextContent("사유");
    expect(mocks.command).not.toHaveBeenCalled();
    change("확인·폐기 사유", "원본 계약과 집행 조건 대조 완료"); click("계약 조건 확인 완료");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.command).toHaveBeenCalledWith("CONTRACT_VERIFY", { id: "contract-a", lock_version: 3, reason: "원본 계약과 집행 조건 대조 완료" }, expect.any(String));
    expect(screen.getByLabelText("계약명")).toBeDisabled();
    expect(screen.getByRole("button", { name: "이 계약에서 새 버전 작성" })).toBeInTheDocument();
  });
  it("requires a reason before retiring a verified version", async () => {
    render(page(workspace(contract({ status: "VERIFIED" }))));
    click("이 버전 폐기"); await screen.findByRole("alert"); expect(mocks.command).not.toHaveBeenCalled();
    change("확인·폐기 사유", "계약 종료 확인"); click("이 버전 폐기");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.command).toHaveBeenCalledWith("CONTRACT_RETIRE", { id: "contract-a", lock_version: 3, reason: "계약 종료 확인" }, expect.any(String));
    expect(screen.queryByRole("button", { name: "이 버전 폐기" })).not.toBeInTheDocument();
  });
});

describe("contract originals and staff download", () => {
  it("keeps the selected file and upload identifiers after failure for an identical retry", async () => {
    mocks.attach.mockRejectedValueOnce(new Error("첨부 저장 실패"));
    render(page(workspace()));
    const selected = new File(["%PDF-original"], "실제 계약.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("계약 원본 파일"), { target: { files: [selected] } });
    click("계약 원본 첨부"); expect(await screen.findByRole("alert")).toHaveTextContent("첨부 저장 실패");
    expect(screen.getByText(/선택 파일: 실제 계약.pdf/)).toBeInTheDocument();
    click("계약 원본 첨부"); await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    const first = mocks.attach.mock.calls[0][0] as FormData; const retry = mocks.attach.mock.calls[1][0] as FormData;
    for (const key of ["contract_version_id", "purpose", "upload_id", "operation_key"]) expect(retry.get(key)).toEqual(first.get(key));
    expect(first.get("contract_version_id")).toBe("contract-a"); expect(first.get("purpose")).toBe("CONTRACT");
    expect(first.get("organization_id")).toBeNull(); expect(first.get("actor_id")).toBeNull();
    expect((retry.get("file") as File).name).toBe(selected.name);
    expect(screen.queryByText(/선택 파일:/)).not.toBeInTheDocument();
  });
  it("does not attach a new contract before its draft has been persisted", () => {
    render(page(workspace(null)));
    expect(screen.getByLabelText("계약 원본 파일")).toBeDisabled();
    expect(screen.getByRole("button", { name: "계약 원본 첨부" })).toBeDisabled();
  });
  it("lets read-only staff request a short-lived download through the authenticated action", async () => {
    render(page(workspace(contract(), "CLOSE")));
    click("다운로드 준비");
    expect(await screen.findByRole("link", { name: "파일 열기 (1분 동안 사용 가능)" })).toHaveAttribute("href", "https://storage.example.test/signed-original");
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith("original-file");
    expect(mocks.command).not.toHaveBeenCalled(); expect(mocks.attach).not.toHaveBeenCalled();
  });
});
