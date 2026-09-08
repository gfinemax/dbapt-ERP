import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), db: vi.fn(), rpc: vi.fn(), settings: vi.fn(), rules: vi.fn() }));
vi.mock("@/features/finance/reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.db }));
vi.mock("./approval-settings-repository", () => ({ getApprovalSettings: mocks.settings, listMeetingRules: mocks.rules, listApprovalBudgets: vi.fn() }));
import { commitApprovalCommand, requireApprovalActor, requireApprovalRecord } from "./approval-authorization";
import { createApprovalDocument, decideApprovalDocument } from "./approval-repository";
const actor = { user_id: "actual-user", organization_id: "actual-org", display_name: "현재 사용자", permissions: ["APPROVE"], active: true };
const context = { expectedVersion: 3, key: "same-request-key" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.identity.mockResolvedValue(actor);
  mocks.db.mockReturnValue({ schema: vi.fn().mockReturnValue({ rpc: mocks.rpc }) });
  mocks.rpc.mockResolvedValue({ data: { id: "doc", version: 4 }, error: null });
  mocks.settings.mockResolvedValue({ meetingThresholdAmount: 10000000 }); mocks.rules.mockResolvedValue([]);
});
it("requires Auth and staff permissions before accessing records", async () => {
  mocks.identity.mockRejectedValue(new Error("로그인 필요"));
  await expect(requireApprovalRecord("doc")).rejects.toThrow("로그인"); expect(mocks.db).not.toHaveBeenCalled();
  mocks.identity.mockResolvedValue({ ...actor, permissions: ["APPLY"] });
  await expect(requireApprovalActor()).rejects.toThrow("권한");
  mocks.identity.mockResolvedValue(actor);
  await expect(requireApprovalActor("ADMIN")).rejects.toThrow("권한");
});
it("ignores a forged approver label and sends verified UUID, org and original version/key", async () => {
  await decideApprovalDocument("doc", "위조 관리자", "APPROVE", "확인", context);
  expect(mocks.rpc).toHaveBeenCalledWith("document_command", expect.objectContaining({ p_actor: "actual-user", p_org: "actual-org", p_id: "doc", p_command: "APPROVE", p_expected_version: 3, p_key: "same-request-key", p_payload: { comment: "확인" } }));
});
it("requires a version/key, preserves SQL conflict errors and does not fall back to legacy RPC", async () => {
  await expect(commitApprovalCommand("APPROVE", "doc", {}, { expectedVersion: -1, key: "" })).rejects.toThrow("버전");
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "stale version" } });
  await expect(decideApprovalDocument("doc", "", "APPROVE", "", context)).rejects.toThrow("stale version");
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("creates only a draft with the authenticated drafter and explicit stable operation identity", async () => {
  const draft = { amount: 0, documentType: "GENERAL" as const, title: "새 기안", purpose: "안내", body: "본문", departmentLabel: "담당 부서", drafterLabel: "위조 기안자", approvalSteps: [{ approverLabel: "기존 결재자", approverRole: "담당자" }] };
  await createApprovalDocument(draft, false, { id: "new-doc", key: "create-key" });
  expect(mocks.rpc).toHaveBeenCalledWith("document_command", expect.objectContaining({ p_command: "CREATE", p_id: "new-doc", p_expected_version: 0, p_key: "create-key", p_payload: expect.objectContaining({ document: expect.objectContaining({ drafterLabel: "현재 사용자" }) }) }));
  expect(mocks.settings).toHaveBeenCalledWith("actual-org");
  mocks.rpc.mockClear();
  await expect(createApprovalDocument(draft, true, { id: "new-doc", key: "create-key" })).rejects.toThrow("초안");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("scopes original and binding queries to the actor org and rejects another same-named drafter", async () => {
  const responses = [{ data: { id: "doc", drafter_label: "현재 사용자" }, error: null }, { data: { drafter_user_id: "other-user", steps: [], version: 1 }, error: null }];
  const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn() };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query); query.maybeSingle.mockImplementation(() => Promise.resolve(responses.shift()));
  mocks.db.mockReturnValue({ schema: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(query) }) });
  await expect(requireApprovalRecord("doc", true)).rejects.toThrow("연결된 기안자");
  expect(query.eq.mock.calls.filter(([field]) => field === "organization_id")).toEqual([["organization_id", "actual-org"], ["organization_id", "actual-org"]]);
});
