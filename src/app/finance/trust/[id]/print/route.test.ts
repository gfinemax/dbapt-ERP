// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrustPrintSnapshot } from "@/features/finance/fund-trust-print";
import type { TrustReadResult, TrustRequestRow } from "@/features/finance/fund-trust-repository";
import type { WorkflowReadResult } from "@/features/finance/fund-workflow-repository";

const mocks = vi.hoisted(() => ({ trust: vi.fn(), workflow: vi.fn() }));
vi.mock("@/features/finance/fund-trust-repository", () => ({ loadFundTrust: mocks.trust }));
vi.mock("@/features/finance/fund-workflow-repository", () => ({ loadFundWorkflow: mocks.workflow }));
import { dynamic, GET } from "./route";

const requestId = "request-main";
const submittedAt = "2026-09-01T01:00:00.000Z";
const oldSnapshot: TrustPrintSnapshot = {
  requestNo: "신탁-2026-000001", title: "과거 제출한 우편비", requestDate: "2026-09-01", revision: 1, submittedAt,
  trustee: "제출 당시 신탁사", contractName: "제출 당시 계약", contractReference: "원본 계약 제1조",
  managementAccountLabel: "관리계좌 ***1234", receiptReference: "접수-과거-001",
  items: [{ id: "item-main", sourceNo: "지결-2026-000001", title: "과거 우편비 항목", recipient: "과거 수취인", accountMasked: "***6789", requestedAmount: 12000 }],
  files: [{ name: "제출 당시 첨부.pdf", sha256: "a".repeat(64) }],
};

function request(overrides: Partial<TrustRequestRow> = {}): TrustRequestRow {
  return {
    id: requestId, request_no: "신탁-2026-000001", title: "현재 수정된 요청", request_date: "2026-09-08",
    contract_version_id: "contract-current", receipt_reference: "현재 접수정보", status: "PARTIAL", lock_version: 5,
    revision: 2, created_by: "trusted-user", created_at: submittedAt, updated_at: "2026-09-08T01:00:00.000Z", ...overrides,
  };
}
function workspace(): TrustReadResult {
  return {
    contracts: [{ id: "contract-current", contract_key: "contract-key", version: 2, lock_version: 3, name: "현재 계약",
      trustee: "현재 신탁사", reference: "현재 계약 근거", management_account_id: "account-current", status: "VERIFIED",
      conditions: {}, created_by: "trusted-user", created_at: submittedAt, verified_by: "trusted-user", verified_at: submittedAt }],
    requests: [request()],
    items: [{ id: "item-main", request_id: requestId, transaction_id: "transaction-current", requested_amount: 45000,
      approved_amount: 0, status: "PENDING", withdrawal_from_status: null, reason: "", needs_review: false, source_revision: 2, paid_amount: 0 }],
    files: [{ id: "file-current", request_id: requestId, transaction_id: null, purpose: "REQUEST", contract_version_id: null,
      document_type: "RECEIPT", file_name: "현재 첨부.pdf", content_hash: "b".repeat(64), uploaded_by: "trusted-user", uploaded_at: submittedAt }],
    submissions: [
      { id: "submission-old", request_id: requestId, revision: 1, snapshot: { ...oldSnapshot }, submitted_by: "trusted-user", submitted_at: submittedAt },
      { id: "submission-new", request_id: requestId, revision: 2, snapshot: { ...oldSnapshot, revision: 2, title: "새 제출본 제목" }, submitted_by: "trusted-user", submitted_at: "2026-09-08T01:00:00.000Z" },
    ],
    events: [], accounts: [{ id: "account-current", label: "현재 관리계좌 ***9876" }],
    viewer: { user_id: "trusted-user", permissions: ["APPROVE"] },
  };
}
function sources(): WorkflowReadResult {
  return {
    transactions: [{ id: "transaction-current", source_kind: "RESOLUTION", source_id: "source-current", title: "현재 원본 지출",
      amount: 45000, owner_id: null, created_by: "trusted-user", legacy_paid_amount: 0, legacy_payment_complete: false, payment_review_required: false,
      route: "TRUST_DIRECT", contract_version_id: "contract-current", source_snapshot: { number: "지결-2026-000099", recipient: "현재 수취인", accountMasked: "***2468", account: "999-888-777777" },
      source_signature: "current-signature", revision: 2,
      amounts: { amount: 45000, paid: 0, known_new_paid: 0, remaining: 45000, balance: 45000, overpaid: 0, requestable: 45000,
        pending: 0, approved: 0, approved_unpaid: 0, payment_review_required: false, legacy_payment_complete: false } }],
    payments: [], allocations: [],
  };
}
function get(search = "?revision=1", id = requestId) {
  return GET(new Request(`https://erp.example.test/finance/trust/${id}/print${search}`), { params: Promise.resolve({ id }) });
}
function draftWorkspace(): TrustReadResult {
  const data = workspace();
  data.requests = [request({ status: "DRAFT", revision: 0, lock_version: 1, title: "저장된 요청 초안" })];
  data.submissions = [];
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.trust.mockResolvedValue(workspace());
  mocks.workflow.mockResolvedValue(sources());
});

describe("explicit print revision and authenticated lookup", () => {
  it.each(["", "?revision=", "?revision=%20", "?revision=-1", "?revision=0.5", "?revision=nope", "?revision=Infinity", "?revision=9007199254740992"])("rejects absent or invalid version %s before reading financial data", async (search) => {
    const response = await get(search);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("버전을 선택");
    expect(mocks.trust).not.toHaveBeenCalled();
    expect(mocks.workflow).not.toHaveBeenCalled();
  });
  it("returns a private 403 without exposing authentication or DB error details", async () => {
    mocks.trust.mockRejectedValueOnce(new Error("sensitive actor/token/database detail"));
    const response = await get();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain("조회 권한");
    expect(body).not.toContain("sensitive");
    expect(mocks.workflow).not.toHaveBeenCalled();
  });
  it("uses only the authenticated repository and ignores forged actor or organization query inputs", async () => {
    const response = await get("?revision=1&organization_id=foreign-org&actor_id=other-user");
    expect(response.status).toBe(200);
    expect(mocks.trust).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.workflow).not.toHaveBeenCalled();
  });
  it.each(["?revision=3", "?revision=999"])("returns 404 for an unavailable submission %s without falling back to a live draft", async (search) => {
    const response = await get(search);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("제출본을 찾지");
    expect(mocks.workflow).not.toHaveBeenCalled();
  });
  it("does not select another request's submission with the same revision", async () => {
    const response = await get("?revision=1", "foreign-request");
    expect(response.status).toBe(404);
    expect(mocks.workflow).not.toHaveBeenCalled();
  });
});

describe("immutable historical submission output", () => {
  it("keeps the selected older snapshot despite changed current request, contract, amount and source", async () => {
    const data = workspace();
    const before = structuredClone(data.submissions[0].snapshot);
    mocks.trust.mockResolvedValueOnce(data);
    mocks.workflow.mockRejectedValueOnce(new Error("Current source must not be loaded for a submitted version"));
    const response = await get("?revision=1");
    const html = await response.text();
    expect(response.status).toBe(200);
    for (const oldValue of ["과거 제출한 우편비", "제출 당시 신탁사", "제출 당시 계약", "과거 수취인", "12,000원", "제출 당시 첨부.pdf", "접수-과거-001"]) expect(html).toContain(oldValue);
    for (const currentValue of ["현재 수정된 요청", "현재 계약", "45,000원", "현재 원본 지출", "새 제출본 제목", "현재 첨부.pdf"]) expect(html).not.toContain(currentValue);
    expect(data.submissions[0].snapshot).toEqual(before);
    expect(mocks.workflow).not.toHaveBeenCalled();
  });
  it("selects the requested newer version rather than the first matching request", async () => {
    const response = await get("?revision=2");
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("새 제출본 제목");
    expect(html).not.toContain("과거 제출한 우편비");
  });
  it("serves successful output as uncached HTML with a restrictive CSP", async () => {
    const response = await get();
    expect(dynamic).toBe("force-dynamic");
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
  });
});

describe("revision zero is current draft output only", () => {
  it.each([
    { status: "SUBMITTED", revision: 1 }, { status: "PARTIAL", revision: 2 }, { status: "DRAFT", revision: 1 }, { status: "SUBMITTED", revision: 0 },
  ] as const)("refuses draft output after the request ceased to be an unsubmitted draft: %s", async (state) => {
    const data = workspace(); data.requests = [request(state)]; mocks.trust.mockResolvedValueOnce(data);
    const response = await get("?revision=0");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("요청 초안");
    expect(mocks.workflow).not.toHaveBeenCalled();
  });
  it("builds draft output from current normalized data and uses only accountMasked", async () => {
    mocks.trust.mockResolvedValueOnce(draftWorkspace());
    const response = await get("?revision=0");
    const html = await response.text();
    expect(response.status).toBe(200);
    for (const value of ["요청 준비", "저장된 요청 초안", "현재 원본 지출", "지결-2026-000099", "현재 수취인", "***2468", "현재 관리계좌 ***9876", "45,000원"]) expect(html).toContain(value);
    expect(html).not.toContain("999-888-777777");
    expect(html).not.toContain("과거 제출한 우편비");
    expect(mocks.workflow).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.trust.mock.invocationCallOrder[0]).toBeLessThan(mocks.workflow.mock.invocationCallOrder[0]);
  });
  it("does not fall back to raw account information when the masked field is missing", async () => {
    const live = sources(); delete live.transactions[0].source_snapshot.accountMasked;
    mocks.trust.mockResolvedValueOnce(draftWorkspace()); mocks.workflow.mockResolvedValueOnce(live);
    const response = await get("?revision=0"); const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("미입력");
    expect(html).not.toContain("999-888-777777");
    expect(html).not.toContain("***7777");
  });
  it("excludes removed items, other requests and reply attachments from draft output", async () => {
    const data = draftWorkspace();
    data.items.push({ ...data.items[0], id: "removed-item", transaction_id: "absent-source", status: "WITHDRAWN" });
    data.items.push({ ...data.items[0], id: "other-item", request_id: "other-request", transaction_id: "absent-other-source" });
    data.files.push({ ...data.files[0], id: "reply-file", purpose: "REPLY", file_name: "회신만의첨부.pdf" });
    data.files.push({ ...data.files[0], id: "other-file", request_id: "other-request", file_name: "다른요청첨부.pdf" });
    mocks.trust.mockResolvedValueOnce(data);
    const response = await get("?revision=0"); const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("현재 첨부.pdf");
    expect(html).not.toContain("회신만의첨부.pdf");
    expect(html).not.toContain("다른요청첨부.pdf");
  });
  it("fails closed when a pending draft item's current source cannot be read", async () => {
    mocks.trust.mockResolvedValueOnce(draftWorkspace());
    mocks.workflow.mockResolvedValueOnce({ transactions: [], payments: [], allocations: [] } satisfies WorkflowReadResult);
    const response = await get("?revision=0");
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).not.toContain("저장된 요청 초안");
  });
});
