import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), download: vi.fn() }));
vi.mock("@/features/finance/reimbursement-auth", () => ({ reimbursementIdentity: mocks.identity }));
vi.mock("@/features/finance/finance-review-repository", async original => ({ ...await original<object>(), financeEvidenceDownload: mocks.download }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.identity.mockResolvedValue({ active: true, permissions: ["ADMIN"] }); mocks.download.mockResolvedValue("https://storage.example/signed"); });
it("requires authentication and an active administrator before signing", async () => {
  for (const [member, status] of [[null, 401], [{ active: false, permissions: ["ADMIN"] }, 403], [{ active: true, permissions: ["PAY"] }, 403]] as const) {
    mocks.identity.mockResolvedValue(member);
    expect((await GET(new Request("https://example.test/finance/evidence/file/download"), { params: Promise.resolve({ id: "file" }) })).status).toBe(status);
  }
  expect(mocks.download).not.toHaveBeenCalled();
});
it("passes the selected evidence source and keeps redirects private and uncached", async () => {
  const result = await GET(new Request("https://example.test/finance/evidence/file/download?source=TRUST"), { params: Promise.resolve({ id: "file" }) });
  expect(mocks.download).toHaveBeenCalledWith(expect.anything(), "file", "TRUST");
  expect(result.status).toBe(303);
  expect(result.headers.get("location")).toBe("https://storage.example/signed");
  expect(result.headers.get("cache-control")).toBe("private, no-store");
});
it("does not redirect missing or unauthorized files", async () => {
  mocks.download.mockRejectedValue(new Error("Missing"));
  const result = await GET(new Request("https://example.test/finance/evidence/file/download"), { params: Promise.resolve({ id: "file" }) });
  expect(result.status).toBe(404); expect(result.headers.get("location")).toBeNull();
});
