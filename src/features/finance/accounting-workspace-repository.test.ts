import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReimbursementMember } from "./reimbursement-domain";
const mocks = vi.hoisted(() => ({ db: vi.fn(), eq: vi.fn(), from: vi.fn(), identity: vi.fn(), is: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(), order: vi.fn(), rpc: vi.fn(), select: vi.fn() }));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
import { assertLegacyVoucherEditable, confirmAccountingDrafts, correctAccountingVoucherAccounts, createAccountingBankAccountSubject, findAccountingVoucherIdByResolutionId, loadAccountingWorkspace, runAccountingCommand, type AccountingCommand } from "./accounting-workspace-repository";
const member: ReimbursementMember = { organization_id: "verified-org", user_id: "verified-user", display_name: "담당자", permissions: ["APPROVE"], active: true };
const input = { source_kind: "RECOGNITION", source_id: "tx", source_signature: "snapshot-signature", voucher_date: "2026-03-01", lines: [] };
beforeEach(() => {
  vi.clearAllMocks();
  const query = { eq: mocks.eq, from: mocks.from, is: mocks.is, limit: mocks.limit, maybeSingle: mocks.maybeSingle, order: mocks.order, rpc: mocks.rpc, select: mocks.select };
  for (const method of [mocks.eq, mocks.from, mocks.is, mocks.limit, mocks.order, mocks.select]) method.mockReturnValue(query);
  mocks.identity.mockResolvedValue(member);
  mocks.db.mockReturnValue({ schema: () => query });
  mocks.rpc.mockResolvedValue({ data: { id: "voucher", lock_version: 1 }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: { id: "first-voucher" }, error: null });
});
describe("accounting draft service boundary", () => {
  it("checks legacy mutation access with Auth scope before the original record is written", async () => {
    await assertLegacyVoucherEditable("original-text-id");
    expect(mocks.rpc).toHaveBeenCalledWith("accounting_legacy_check", { p_org: member.organization_id, p_actor: member.user_id, p_resolution_id: "original-text-id" });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "전표관리에서 확인해주세요" } });
    await expect(assertLegacyVoucherEditable("original-text-id")).rejects.toThrow("전표관리");
    mocks.identity.mockResolvedValue({ ...member, permissions: ["PAY"] });
    mocks.db.mockClear();
    await expect(assertLegacyVoucherEditable("original-text-id")).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("uses verified actor/org for the atomic command and preserves incomplete account drafts", async () => {
    expect(await runAccountingCommand("DRAFT_CREATE", input, "stable-key")).toEqual({ id: "voucher", lock_version: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("accounting_command", { p_org: "verified-org", p_actor: "verified-user", p_command: "DRAFT_CREATE", p_data: input, p_key: "stable-key" });
  });
  it("retries exact same input and key after uncertain persistence", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "connection lost" } });
    await expect(runAccountingCommand("DRAFT_CREATE", input, "same-key")).rejects.toThrow("connection lost");
    await runAccountingCommand("DRAFT_CREATE", input, "same-key");
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });
  it.each(["PAY", "CLOSE", "SENIOR"])("keeps %s read permission separate from draft mutation", async permission => {
    mocks.identity.mockResolvedValue({ ...member, permissions: [permission] });
    mocks.rpc.mockResolvedValue({ data: { vouchers: [], accounts: [], bank_accounts: [], sources: [] }, error: null });
    expect((await loadAccountingWorkspace()).viewer.permissions).toEqual([permission]);
    mocks.db.mockClear();
    await expect(runAccountingCommand("DRAFT_CREATE", input, "key")).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects inactive/unauthenticated/ordinary users before privileged DB access", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("로그인 필요")); await expect(loadAccountingWorkspace()).rejects.toThrow("로그인");
    mocks.identity.mockResolvedValueOnce({ ...member, active: false }); await expect(runAccountingCommand("DRAFT_CREATE", input, "key")).rejects.toThrow("권한");
    mocks.identity.mockResolvedValueOnce({ ...member, permissions: [] }); await expect(loadAccountingWorkspace()).rejects.toThrow("권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each(["organization_id", "actor_id", "p_org", "p_actor"])("rejects forged identity field %s", async key => {
    await expect(runAccountingCommand("DRAFT_CREATE", { ...input, [key]: "forged" }, "key")).rejects.toThrow("형식");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("blocks confirmation and stale/missing version inputs before DB access", async () => {
    await expect(runAccountingCommand("CONFIRM" as AccountingCommand, input, "key")).rejects.toThrow("정책");
    await expect(runAccountingCommand("DRAFT_SAVE", { ...input, id: "voucher" }, "key")).rejects.toThrow("버전");
    await expect(runAccountingCommand("DRAFT_CREATE", { ...input, source_signature: "" }, "key")).rejects.toThrow("원본");
    await expect(runAccountingCommand("DRAFT_CREATE", input, " ")).rejects.toThrow("처리키");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("reads persisted vouchers and keeps confirmation disabled and Auth viewer authoritative", async () => {
    const data = { vouchers: [{ id: "persisted", voucher_no: "OLD-1", lines: [] }], accounts: [], bank_accounts: [], sources: [], viewer: { permissions: ["ADMIN"] }, policy: { confirmation_enabled: true } };
    mocks.rpc.mockResolvedValue({ data, error: null });
    const result = await loadAccountingWorkspace();
    expect(result.vouchers).toEqual(data.vouchers);
    expect(result.viewer.permissions).toEqual(["APPROVE"]);
    expect(result.policy.confirmation_enabled).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("accounting_workspace_v2", { p_org: member.organization_id, p_actor: member.user_id });
  });
  it("resolves the first organization-scoped voucher from a resolution id", async () => {
    await expect(findAccountingVoucherIdByResolutionId("resolution-1")).resolves.toBe("first-voucher");
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", member.organization_id);
    expect(mocks.eq).toHaveBeenCalledWith("expense_resolution_id", "resolution-1");
    expect(mocks.order).toHaveBeenCalledWith("voucher_no", { ascending: true });
  });
  it("confirms a validated batch with the verified actor and organization", async () => {
    mocks.rpc.mockResolvedValue({ data: { confirmed_count: 1, confirmed_ids: ["voucher"] }, error: null });
    const confirmation = { items: [{ id: "voucher", lock_version: 2 }], reason: "원본과 분개 대조 완료" };
    await expect(confirmAccountingDrafts(confirmation, "confirm-key")).resolves.toEqual({ confirmed_count: 1, confirmed_ids: ["voucher"] });
    expect(mocks.rpc).toHaveBeenCalledWith("accounting_batch_confirm", { p_org: "verified-org", p_actor: "verified-user", p_data: confirmation, p_key: "confirm-key" });
  });
  it("creates a bank-backed account subject only with verified admin identity", async () => {
    mocks.identity.mockResolvedValueOnce({ ...member, permissions: ["ADMIN"] });
    mocks.rpc.mockResolvedValueOnce({ data: { bank_account_id: "bank", account_subject_id: "subject", account_subject_name: "신협 보통예금(0467)" }, error: null });
    await expect(createAccountingBankAccountSubject("bank", " 신협 보통예금(0467) ", "bank-key")).resolves.toEqual({ bank_account_id: "bank", account_subject_id: "subject", account_subject_name: "신협 보통예금(0467)" });
    expect(mocks.rpc).toHaveBeenCalledWith("accounting_create_bank_account_subject", { p_org: "verified-org", p_actor: "verified-user", p_bank_account_id: "bank", p_name: "신협 보통예금(0467)", p_key: "bank-key" });
    await expect(createAccountingBankAccountSubject("bank", "신협 보통예금", "bank-key-2")).rejects.toThrow("관리자");
  });
  it("corrects confirmed voucher accounts with verified IDs and an audit reason", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { corrected_count: 2, corrected_ids: ["v1", "v2"] }, error: null });
    const correction = { voucher_ids: ["v1", "v2"], bank_account_id: "bank", debit_account_subject_id: "expense", credit_account_subject_id: "deposit", reason: " 은행거래 대조 완료 " };
    await expect(correctAccountingVoucherAccounts(correction, "correction-key")).resolves.toEqual({ corrected_count: 2, corrected_ids: ["v1", "v2"] });
    expect(mocks.rpc).toHaveBeenCalledWith("accounting_correct_voucher_accounts", { p_org: "verified-org", p_actor: "verified-user", p_data: { ...correction, reason: "은행거래 대조 완료" }, p_key: "correction-key" });
  });
  it("rejects incomplete or duplicate correction requests before DB access", async () => {
    await expect(correctAccountingVoucherAccounts({ voucher_ids: ["v1", "v1"], bank_account_id: "bank", debit_account_subject_id: "expense", credit_account_subject_id: "deposit", reason: "확인 완료" }, "key")).rejects.toThrow("다시 선택");
    await expect(correctAccountingVoucherAccounts({ voucher_ids: ["v1"], bank_account_id: "", debit_account_subject_id: "expense", credit_account_subject_id: "deposit", reason: "확인 완료" }, "key")).rejects.toThrow("모두 확인");
    await expect(correctAccountingVoucherAccounts({ voucher_ids: ["v1"], bank_account_id: "bank", debit_account_subject_id: "expense", credit_account_subject_id: "deposit", reason: " " }, "key")).rejects.toThrow("정정 근거");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects invalid batch confirmation before privileged DB access", async () => {
    await expect(confirmAccountingDrafts({ items: [], reason: "확인" }, "key")).rejects.toThrow("1건 이상");
    await expect(confirmAccountingDrafts({ items: [{ id: "voucher", lock_version: 1 }], reason: " " }, "key")).rejects.toThrow("확인 근거");
    await expect(confirmAccountingDrafts({ items: [{ id: "voucher", lock_version: 1 }, { id: "voucher", lock_version: 1 }], reason: "확인 완료" }, "key")).rejects.toThrow("버전");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("does not turn DB failure into an empty ledger or accept incomplete results", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "schema unavailable" } });
    await expect(loadAccountingWorkspace()).rejects.toThrow("schema unavailable");
    mocks.rpc.mockResolvedValueOnce({ data: { vouchers: [], accounts: null, bank_accounts: [], sources: [] }, error: null });
    await expect(loadAccountingWorkspace()).rejects.toThrow("조회 결과");
    mocks.rpc.mockResolvedValueOnce({ data: { id: "voucher" }, error: null });
    await expect(runAccountingCommand("DRAFT_CREATE", input, "key")).rejects.toThrow("같은 처리키");
  });
});
