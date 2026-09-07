// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReimbursementMember, ReimbursementPermission } from "./reimbursement-domain";

const mocks = vi.hoisted(() => ({
  identity: vi.fn(), db: vi.fn(), command: vi.fn(), schema: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(),
  storageFrom: vi.fn(), upload: vi.fn(), download: vi.fn(), signed: vi.fn(), remove: vi.fn(),
}));
vi.mock("./reimbursement-auth", () => ({ requireReimbursementIdentity: mocks.identity }));
vi.mock("./reimbursement-repository", () => ({ reimbursementDb: mocks.db }));
vi.mock("./fund-trust-repository", () => ({ runFundTrust: mocks.command }));
import { trustFileDownload, trustFileSizeLimit, uploadTrustFile } from "./fund-trust-files";

const org = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const uploadId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const transactionId = "55555555-5555-4555-8555-555555555555";
const contractId = "66666666-6666-4666-8666-666666666666";
const fileId = "77777777-7777-4777-8777-777777777777";
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const storedPath = `${org}/${actor}/${uploadId}/${hash(pdf)}`;
const member: ReimbursementMember = { organization_id: org, user_id: actor, display_name: "증빙 담당자", active: true, permissions: ["ADMIN"] };
const storedFile = { bucket: "finance-workflow", path: storedPath, file_name: "집행 증빙.pdf" };

function asRole(permission: ReimbursementPermission | null) {
  mocks.identity.mockResolvedValue({ ...member, permissions: permission ? [permission] : [] });
}
function form(bytes: Uint8Array = pdf, type = "application/pdf", name = "집행 증빙.pdf") {
  const input = new FormData();
  input.set("purpose", "REQUEST");
  input.set("upload_id", uploadId);
  input.set("operation_key", "same-upload-operation");
  input.set("request_id", requestId);
  input.set("file", new File([new Uint8Array(bytes)], name, { type }));
  return input;
}
function blob(bytes: Uint8Array) { return new Blob([new Uint8Array(bytes)]); }
function expectNoStorage() {
  expect(mocks.storageFrom).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.signed).not.toHaveBeenCalled();
  expect(mocks.command).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle };
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.schema.mockReturnValue({ from: mocks.from });
  mocks.maybeSingle.mockResolvedValue({ data: { id: requestId, status: "DRAFT" }, error: null });
  mocks.storageFrom.mockReturnValue({ upload: mocks.upload, download: mocks.download, createSignedUrl: mocks.signed, remove: mocks.remove });
  mocks.db.mockReturnValue({ schema: mocks.schema, storage: { from: mocks.storageFrom } });
  mocks.identity.mockResolvedValue(member);
  mocks.upload.mockResolvedValue({ data: { path: storedPath }, error: null });
  mocks.download.mockResolvedValue({ data: blob(pdf), error: null });
  mocks.signed.mockResolvedValue({ data: { signedUrl: "https://storage.example.test/signed-file" }, error: null });
  mocks.command.mockResolvedValue({ id: fileId });
});

describe("trust upload authentication and parent ownership", () => {
  it("authenticates before reading the form or accessing storage", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("로그인 필요"));
    await expect(uploadTrustFile(null as unknown as FormData)).rejects.toThrow("로그인 필요");
    expect(mocks.db).not.toHaveBeenCalled();
    expectNoStorage();
  });
  it.each<ReimbursementPermission | null>([null, "CLOSE", "SENIOR"])("rejects nonupload role %s before privileged access", async (permission) => {
    asRole(permission);
    await expect(uploadTrustFile(form())).rejects.toThrow("증빙 등록 권한");
    expect(mocks.db).not.toHaveBeenCalled();
    expectNoStorage();
  });
  it("rejects inactive administrators before privileged access", async () => {
    mocks.identity.mockResolvedValueOnce({ ...member, active: false });
    await expect(uploadTrustFile(form())).rejects.toThrow("증빙 등록 권한");
    expect(mocks.db).not.toHaveBeenCalled();
    expectNoStorage();
  });
  it.each<ReimbursementPermission>(["ADMIN", "APPROVE", "PAY"])("allows %s to upload request evidence", async (permission) => {
    asRole(permission);
    await expect(uploadTrustFile(form())).resolves.toEqual({ id: fileId });
    expect(mocks.upload).toHaveBeenCalledOnce();
  });
  it.each<ReimbursementPermission>(["APPROVE", "PAY"])("requires ADMIN for contract originals, including %s staff", async (permission) => {
    asRole(permission);
    const input = form(); input.set("purpose", "CONTRACT"); input.set("contract_version_id", contractId);
    await expect(uploadTrustFile(input)).rejects.toThrow("관리자만");
    expect(mocks.db).not.toHaveBeenCalled();
    expectNoStorage();
  });
  it("checks every supplied parent within the authenticated organization before uploading", async () => {
    const input = form();
    input.set("transaction_id", transactionId); input.set("contract_version_id", contractId);
    input.set("organization_id", "forged-organization"); input.set("actor_id", "forged-actor");
    await uploadTrustFile(input);
    expect(mocks.schema.mock.calls).toEqual([["finance"], ["finance"], ["finance"]]);
    expect(mocks.from.mock.calls).toEqual([["workflow_trust_requests"], ["workflow_transactions"], ["workflow_contract_versions"]]);
    expect(mocks.select.mock.calls).toEqual([["id"], ["id"], ["id,status"]]);
    expect(mocks.eq.mock.calls).toEqual([["organization_id", org], ["id", requestId], ["organization_id", org], ["id", transactionId], ["organization_id", org], ["id", contractId]]);
    expect(mocks.maybeSingle.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.storageFrom.mock.invocationCallOrder[0]);
    expect(mocks.command).toHaveBeenCalledWith("FILE_REGISTER", expect.objectContaining({ request_id: requestId, transaction_id: transactionId, contract_version_id: contractId, path: storedPath }), "same-upload-operation");
    expect(mocks.command.mock.calls[0][1]).not.toHaveProperty("organization_id");
    expect(mocks.command.mock.calls[0][1]).not.toHaveProperty("actor_id");
  });
  it.each([
    { data: null, error: null },
    { data: null, error: { message: "database unavailable" } },
  ])("blocks missing or unreadable parent before writing an object", async (result) => {
    mocks.maybeSingle.mockResolvedValueOnce(result);
    await expect(uploadTrustFile(form())).rejects.toThrow(/문서/);
    expectNoStorage();
  });
  it.each(["VERIFIED", "RETIRED"])("prevents adding an original to %s contract versions", async (status) => {
    const input = form(); input.set("purpose", "CONTRACT"); input.delete("request_id"); input.set("contract_version_id", contractId);
    mocks.maybeSingle.mockResolvedValueOnce({ data: { id: contractId, status }, error: null });
    await expect(uploadTrustFile(input)).rejects.toThrow("현재 문서");
    expectNoStorage();
  });
  it.each(["REQUEST", "REPLY", "CONTRACT"])("requires a saved parent for %s files", async (purpose) => {
    const input = form(); input.set("purpose", purpose); input.delete("request_id");
    await expect(uploadTrustFile(input)).rejects.toThrow("먼저 저장");
    expectNoStorage();
  });
  it("rejects malformed parent IDs before querying or uploading", async () => {
    const input = form(); input.set("request_id", "../another-org");
    await expect(uploadTrustFile(input)).rejects.toThrow("문서 번호");
    expect(mocks.from).not.toHaveBeenCalled();
    expectNoStorage();
  });
});

describe("trust file bytes and bounded uploads", () => {
  it.each([
    ["pdf", pdf, "application/pdf"],
    ["png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=", "base64"), "image/png"],
    ["jpeg", Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]), "image/jpeg"],
    ["webp", Buffer.from("RIFF\u0010\u0000\u0000\u0000WEBPVP8L", "binary"), "image/webp"],
  ] as const)("uses %s signature bytes rather than filename or declared MIME", async (_kind, bytes, contentType) => {
    await uploadTrustFile(form(bytes, "text/html", "untrusted-name.bin"));
    expect(mocks.upload).toHaveBeenCalledWith(`${org}/${actor}/${uploadId}/${hash(bytes)}`, bytes, { contentType, upsert: false });
  });
  it.each([
    [Buffer.from("<html><script>evil()</script></html>"), "application/pdf", "receipt.pdf"],
    [Buffer.from("<svg onload='evil()'></svg>"), "image/png", "receipt.png"],
    [Buffer.from("RIFF\u0000\u0000\u0000\u0000WAVE"), "image/webp", "receipt.webp"],
    [Buffer.from([255, 216]), "image/jpeg", "receipt.jpg"],
  ] as const)("rejects a spoofed declared file type", async (bytes, contentType, name) => {
    await expect(uploadTrustFile(form(bytes, contentType, name))).rejects.toThrow("실제 PDF");
    expectNoStorage();
  });
  it("rejects empty or oversized files before accessing the DB", async () => {
    for (const bytes of [new Uint8Array(), new Uint8Array(trustFileSizeLimit + 1)]) {
      await expect(uploadTrustFile(form(bytes))).rejects.toThrow("3MB 이하");
    }
    expect(trustFileSizeLimit).toBe(3 * 1024 * 1024);
    expect(mocks.db).not.toHaveBeenCalled();
    expectNoStorage();
  });
  it("accepts exactly the 3 MiB limit without changing the bytes", async () => {
    const bytes = new Uint8Array(trustFileSizeLimit); bytes.set(pdf);
    await uploadTrustFile(form(bytes));
    expect(mocks.upload.mock.calls[0][1].byteLength).toBe(trustFileSizeLimit);
    expect(mocks.command.mock.calls[0][1].content_hash).toBe(hash(bytes));
  });
  it.each([
    ["purpose", "UNKNOWN"], ["upload_id", "../../escape"], ["operation_key", " "], ["operation_key", "x".repeat(201)],
  ])("rejects invalid %s before storage", async (field, value) => {
    const input = form(); input.set(field, value);
    await expect(uploadTrustFile(input)).rejects.toThrow("처리 정보");
    expect(mocks.db).not.toHaveBeenCalled();
    expectNoStorage();
  });
});

describe("immutable object identity and failed upload retries", () => {
  it("registers the actual hash, server path, cleaned filename and exact operation key", async () => {
    const input = form(pdf, "application/pdf", "집행\u0001증빙.pdf"); input.set("document_type", "  CONTRACT_BASIS  ");
    await uploadTrustFile(input);
    expect(mocks.storageFrom).toHaveBeenCalledWith("finance-workflow");
    expect(mocks.upload).toHaveBeenCalledWith(storedPath, pdf, { contentType: "application/pdf", upsert: false });
    expect(mocks.command).toHaveBeenCalledWith("FILE_REGISTER", {
      purpose: "REQUEST", bucket: "finance-workflow", path: storedPath, file_name: "집행증빙.pdf", content_hash: hash(pdf), document_type: "CONTRACT_BASIS", request_id: requestId,
    }, "same-upload-operation");
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(mocks.command.mock.invocationCallOrder[0]);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("retries with the same path and metadata only after matching persisted bytes", async () => {
    const input = form();
    await uploadTrustFile(input);
    mocks.upload.mockResolvedValueOnce({ data: null, error: { message: "already exists" } });
    await uploadTrustFile(input);
    expect(mocks.upload.mock.calls[0]).toEqual(mocks.upload.mock.calls[1]);
    expect(mocks.download).toHaveBeenCalledWith(storedPath);
    expect(mocks.command.mock.calls[0]).toEqual(mocks.command.mock.calls[1]);
    expect(mocks.download.mock.invocationCallOrder[0]).toBeLessThan(mocks.command.mock.invocationCallOrder[1]);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("recovers from an upload timeout after persistence by verifying its downloaded SHA-256", async () => {
    mocks.upload.mockResolvedValueOnce({ data: null, error: { message: "request timed out" } });
    await expect(uploadTrustFile(form())).resolves.toEqual({ id: fileId });
    expect(mocks.download).toHaveBeenCalledWith(storedPath);
    expect(mocks.command).toHaveBeenCalledOnce();
  });
  it("blocks FILE_REGISTER when existing bytes differ, without overwriting or deleting", async () => {
    mocks.upload.mockResolvedValueOnce({ data: null, error: { message: "already exists" } });
    mocks.download.mockResolvedValueOnce({ data: blob(Buffer.from("%PDF-different-content")), error: null });
    await expect(uploadTrustFile(form())).rejects.toThrow("기존 파일 내용이 다릅니다");
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.upload.mock.calls[0][2]).toEqual({ contentType: "application/pdf", upsert: false });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: null }, { data: null, error: { message: "download failed" } }])("does not register an upload whose persisted bytes cannot be checked", async (result) => {
    mocks.upload.mockResolvedValueOnce({ data: null, error: { message: "upload failed" } });
    mocks.download.mockResolvedValueOnce(result);
    await expect(uploadTrustFile(form())).rejects.toThrow("같은 처리로 다시");
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("retains an uploaded object on metadata failure and permits an identical safe retry", async () => {
    const input = form();
    mocks.command.mockRejectedValueOnce(new Error("metadata transaction failed"));
    await expect(uploadTrustFile(input)).rejects.toThrow("metadata transaction failed");
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.upload.mockResolvedValueOnce({ data: null, error: { message: "already exists" } });
    await expect(uploadTrustFile(input)).resolves.toEqual({ id: fileId });
    expect(mocks.command.mock.calls[0]).toEqual(mocks.command.mock.calls[1]);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("short-lived organization-scoped downloads", () => {
  it("requires authentication before any DB or storage access", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("로그인 필요"));
    await expect(trustFileDownload(fileId)).rejects.toThrow("로그인 필요");
    expect(mocks.db).not.toHaveBeenCalled();
    expectNoStorage();
  });
  it("blocks inactive staff and users without staff permissions", async () => {
    mocks.identity.mockResolvedValueOnce({ ...member, active: false });
    await expect(trustFileDownload(fileId)).rejects.toThrow("증빙 조회 권한");
    asRole(null);
    await expect(trustFileDownload(fileId)).rejects.toThrow("증빙 조회 권한");
    expect(mocks.db).not.toHaveBeenCalled();
    expectNoStorage();
  });
  it.each<ReimbursementPermission>(["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"])("allows %s to obtain only an organization-filtered 60-second URL", async (permission) => {
    asRole(permission);
    mocks.maybeSingle.mockResolvedValueOnce({ data: storedFile, error: null });
    expect(await trustFileDownload(fileId)).toBe("https://storage.example.test/signed-file");
    expect(mocks.schema).toHaveBeenCalledWith("finance");
    expect(mocks.from).toHaveBeenCalledWith("workflow_files");
    expect(mocks.select).toHaveBeenCalledWith("bucket,path,file_name");
    expect(mocks.eq.mock.calls).toEqual([["organization_id", org], ["id", fileId]]);
    expect(mocks.signed).toHaveBeenCalledWith(storedPath, 60, { download: storedFile.file_name });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(mocks.storageFrom.mock.invocationCallOrder[0]);
  });
  it("rejects malformed file IDs before querying", async () => {
    await expect(trustFileDownload("../file")).rejects.toThrow("증빙 번호");
    expect(mocks.db).not.toHaveBeenCalled();
    expectNoStorage();
  });
  it.each([
    { data: null, error: null },
    { data: null, error: { message: "read failed" } },
    { data: { ...storedFile, bucket: "another-bucket" }, error: null },
    { data: { ...storedFile, path: `${requestId}/${actor}/file` }, error: null },
    { data: { ...storedFile, path: `${org}-different/${actor}/file` }, error: null },
  ])("never signs unavailable, foreign or incorrectly bucketed objects", async (result) => {
    mocks.maybeSingle.mockResolvedValueOnce(result);
    await expect(trustFileDownload(fileId)).rejects.toThrow("조합 증빙을 찾지 못했습니다");
    expectNoStorage();
  });
  it.each([{ data: null, error: { message: "sign failed" } }, { data: {}, error: null }])("surfaces signing failures without returning a public or raw storage URL", async (result) => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: storedFile, error: null });
    mocks.signed.mockResolvedValueOnce(result);
    await expect(trustFileDownload(fileId)).rejects.toThrow("다운로드 링크");
  });
});
