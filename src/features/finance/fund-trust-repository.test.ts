import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReimbursementMember, ReimbursementPermission } from "./reimbursement-domain";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn(), db: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
import { FundTrustRepositoryError, loadFundTrust, runFundTrust, trustCommands, type TrustCommand } from "./fund-trust-repository";

const member: ReimbursementMember = { organization_id: "verified-org", user_id: "verified-user", display_name: "담당자", permissions: ["ADMIN"], active: true };
const readResult = () => ({ contracts: [], requests: [], items: [], files: [], submissions: [], events: [], accounts: [] });
function asRole(permission: ReimbursementPermission | null) { mocks.identity.mockResolvedValue({ ...member, permissions: permission ? [permission] : [] }); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue(member);
  mocks.rpc.mockResolvedValue({ data: { id: "saved", lock_version: 4, revision: 2 }, error: null });
  mocks.db.mockReturnValue({ schema: () => ({ rpc: mocks.rpc }) });
});

describe("trust server authentication and read boundary", () => {
  it.each<ReimbursementPermission>(["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"])("allows staff %s to read using authenticated identity", async (permission) => {
    asRole(permission);
    const data = { ...readResult(), viewer: { user_id: "forged", permissions: ["ADMIN"] }, unexpected: "hidden" };
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    const result = await loadFundTrust();
    expect(mocks.rpc).toHaveBeenCalledWith("trust_read", { p_org: member.organization_id, p_actor: member.user_id });
    expect(result.viewer).toEqual({ user_id: member.user_id, permissions: [permission] });
    expect(result).not.toHaveProperty("unexpected");
  });
  it("blocks absent authentication, inactive membership and nonstaff before privileged access", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("로그인 필요"));
    await expect(loadFundTrust()).rejects.toThrow("로그인");
    mocks.identity.mockResolvedValueOnce({ ...member, active: false });
    await expect(loadFundTrust()).rejects.toThrow("활성");
    asRole(null);
    await expect(loadFundTrust()).rejects.toThrow("조회 권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("reloads all authoritative sections without substituting empty rows on errors", async () => {
    const data = { ...readResult(), contracts: [{ id: "persisted", lock_version: 7 }], submissions: [{ id: "submission", revision: 2, snapshot: { contract: { version: 1 } } }] };
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    expect(await loadFundTrust()).toEqual({ ...data, viewer: { user_id: member.user_id, permissions: ["ADMIN"] } });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "trust schema unavailable", code: "PGRST202" } });
    await expect(loadFundTrust()).rejects.toMatchObject({ message: "trust schema unavailable", code: "PGRST202" });
  });
  it.each([null, {}, { ...readResult(), accounts: null }, { ...readResult(), events: {} }])("rejects malformed read sections", async (data) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(loadFundTrust()).rejects.toThrow("조회 결과");
  });
});

describe("trust command permission boundaries", () => {
  it.each<TrustCommand>(["CONTRACT_SAVE", "CONTRACT_VERIFY", "CONTRACT_RETIRE", "ROUTE_ASSIGN"])("requires ADMIN for %s", async (command) => {
    asRole("APPROVE");
    await expect(runFundTrust(command, {}, "operation")).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
    asRole("ADMIN");
    expect(await runFundTrust(command, {}, "operation")).toEqual({ id: "saved", lock_version: 4, revision: 2 });
  });
  it.each<TrustCommand>(["REQUEST_SAVE", "REQUEST_SUBMIT", "REVIEW_START", "REPLY_RECORD", "WITHDRAW_REQUEST", "WITHDRAW_CONFIRM"])("requires APPROVE or ADMIN for %s", async (command) => {
    asRole("PAY");
    await expect(runFundTrust(command, {}, "operation")).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
    asRole("APPROVE");
    await expect(runFundTrust(command, {}, "operation")).resolves.toHaveProperty("id", "saved");
  });
  it.each<ReimbursementPermission>(["ADMIN", "APPROVE", "PAY"])("allows %s to register server-prepared file metadata", async (permission) => {
    asRole(permission);
    const input = { purpose: "REQUEST", bucket: "expense-evidence", path: "org/request/hash", file_name: "증빙.pdf", content_hash: "hash" };
    await runFundTrust("FILE_REGISTER", input, "file-key");
    expect(mocks.rpc).toHaveBeenCalledWith("trust_command", { p_org: member.organization_id, p_actor: member.user_id, p_command: "FILE_REGISTER", p_data: input, p_key: "file-key" });
  });
  it.each<ReimbursementPermission>(["CLOSE", "SENIOR"])("does not allow read-only %s staff to register files", async (permission) => {
    asRole(permission);
    await expect(runFundTrust("FILE_REGISTER", {}, "file-key")).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("blocks inactive and unauthenticated mutation and unsupported commands", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("로그인 필요"));
    await expect(runFundTrust("REQUEST_SAVE", {}, "x")).rejects.toThrow("로그인");
    mocks.identity.mockResolvedValueOnce({ ...member, active: false });
    await expect(runFundTrust("REQUEST_SAVE", {}, "x")).rejects.toThrow("활성");
    await expect(runFundTrust("DELETE_AUDIT" as TrustCommand, {}, "x")).rejects.toThrow("지원하지");
    expect(mocks.db).not.toHaveBeenCalled();
    expect(trustCommands).toHaveLength(11);
  });
});

describe("trusted actor, version and idempotency inputs", () => {
  it.each(["organization_id", "organizationId", "p_org", "actor_id", "actorLabel", "p_actor", "user_id", "permissions", "viewer", "uploaded_by"])("rejects forged context field %s before querying DB", async (key) => {
    await expect(runFundTrust("REQUEST_SAVE", { [key]: "forged" }, "key")).rejects.toThrow("서버에서 확인");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("preserves payload, optimistic lock version and submission revision on retry", async () => {
    const input = { id: "request", lock_version: 3, revision: 1, items: [{ transaction_id: "tx", requested_amount: 400 }], reason: "보완 재제출" };
    const before = structuredClone(input);
    expect(await runFundTrust("REQUEST_SUBMIT", input, "same-key")).toEqual({ id: "saved", lock_version: 4, revision: 2 });
    await runFundTrust("REQUEST_SUBMIT", input, "same-key");
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc).toHaveBeenCalledWith("trust_command", { p_org: member.organization_id, p_actor: member.user_id, p_command: "REQUEST_SUBMIT", p_data: before, p_key: "same-key" });
    expect(input).toEqual(before);
  });
  it("keeps contract participant IDs as business data without replacing server actor", async () => {
    const input = { name: "계약", conditions: { consenters: [{ user_id: "participant" }] } };
    await runFundTrust("CONTRACT_SAVE", input, "contract-key");
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_actor: member.user_id, p_org: member.organization_id, p_data: input });
  });
  it.each(["", " ", "x".repeat(201)])("rejects invalid operation keys", async (key) => {
    await expect(runFundTrust("REQUEST_SAVE", {}, key)).rejects.toThrow("처리키");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each([null, [], { lock_version: -1 }, { lock_version: 0.5 }, { revision: Number.NaN }, { revision: "2" }])("rejects invalid object/version input", async (input) => {
    await expect(runFundTrust("REQUEST_SAVE", input as Record<string, unknown>, "key")).rejects.toThrow();
    expect(mocks.db).not.toHaveBeenCalled();
  });
});

describe("database failure and result handling", () => {
  it.each(["40001", "23505", "42501"])("preserves database code %s and its actionable message", async (code) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code, message: "원본이 변경됐습니다. 다시 조회해주세요." } });
    await expect(runFundTrust("REQUEST_SAVE", {}, "same-key")).rejects.toMatchObject({ name: "FundTrustRepositoryError", code, message: "원본이 변경됐습니다. 다시 조회해주세요." });
    expect(new FundTrustRepositoryError({ code, message: "오류" })).toBeInstanceOf(Error);
  });
  it.each([null, {}, { id: 1 }, { id: "" }, { id: "x", lock_version: null }, { id: "x", revision: -1 }])("rejects malformed mutation results while retaining retry guidance", async (data) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(runFundTrust("REQUEST_SAVE", {}, "same-key")).rejects.toThrow("같은 처리키");
  });
  it("accepts commands returning only the persisted ID and excludes unrequested response fields", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id: "file", actor_id: "forged", secret: "hidden" }, error: null });
    expect(await runFundTrust("FILE_REGISTER", {}, "file-key")).toEqual({ id: "file" });
  });
});
