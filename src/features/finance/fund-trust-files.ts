import { createHash } from "node:crypto";
import { requireReimbursementIdentity } from "./reimbursement-auth";
import { hasReimbursementPermission } from "./reimbursement-domain";
import { reimbursementDb } from "./reimbursement-repository";
import { runFundTrust, type TrustFilePurpose, type TrustFileRecordInput } from "./fund-trust-repository";

const bucket = "finance-workflow";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const filePurposes: TrustFilePurpose[] = ["CONTRACT", "REQUEST", "REPLY", "EVIDENCE", "PAYMENT"];
export const trustFileSizeLimit = 3 * 1024 * 1024;

function fileType(bytes: Buffer) {
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

/** Caller retains upload_id and operation_key for retries; objects are never overwritten or removed here. */
export async function uploadTrustFile(form: FormData) {
  const member = await requireReimbursementIdentity();
  if (!member.active || !["ADMIN", "APPROVE", "PAY"].some(permission => member.permissions.includes(permission as "ADMIN" | "APPROVE" | "PAY"))) throw new Error("증빙 등록 권한이 필요합니다.");
  const purpose = String(form.get("purpose") ?? "") as TrustFilePurpose;
  const uploadId = String(form.get("upload_id") ?? "");
  const operationKey = String(form.get("operation_key") ?? "");
  const file = form.get("file");
  if (!filePurposes.includes(purpose) || !uuid.test(uploadId) || !operationKey.trim() || operationKey.length > 200) throw new Error("증빙 처리 정보를 확인해주세요.");
  if (purpose === "CONTRACT" && !hasReimbursementPermission(member, "ADMIN")) throw new Error("계약 원본은 관리자만 등록할 수 있습니다.");
  if (!(file instanceof File) || !file.size || file.size > trustFileSizeLimit) throw new Error("3MB 이하의 PDF·PNG·JPEG·WebP 파일을 첨부해주세요.");
  const input: TrustFileRecordInput = { purpose, bucket, path: "", file_name: file.name.replace(/[\u0000-\u001f]/g, "").slice(0, 240), content_hash: "", document_type: String(form.get("document_type") ?? "").trim().slice(0, 120) };
  const db = reimbursementDb();
  const parents = [
    ["request_id", "workflow_trust_requests"], ["transaction_id", "workflow_transactions"], ["contract_version_id", "workflow_contract_versions"],
  ] as const;
  // Validate parent ownership before writing an object, even though the DB command rechecks it.
  for (const [field, table] of parents) {
    const id = String(form.get(field) ?? "");
    if (!id) continue;
    if (!uuid.test(id)) throw new Error("연결할 문서 번호를 확인해주세요.");
    const result = field === "contract_version_id"
      ? await db.schema("finance").from("workflow_contract_versions").select("id,status").eq("organization_id", member.organization_id).eq("id", id).maybeSingle()
      : await db.schema("finance").from(table).select("id").eq("organization_id", member.organization_id).eq("id", id).maybeSingle();
    if (result.error) throw new Error("연결 문서를 확인하지 못했습니다.");
    if (!result.data || (field === "contract_version_id" && (!("status" in result.data) || result.data.status !== "DRAFT"))) throw new Error("조합의 현재 문서를 선택해주세요.");
    input[field] = id;
  }
  if (purpose === "CONTRACT" && !input.contract_version_id) throw new Error("계약 초안을 먼저 저장해주세요.");
  if (["REQUEST", "REPLY"].includes(purpose) && !input.request_id) throw new Error("신탁 요청을 먼저 저장해주세요.");
  if (!input.file_name) throw new Error("파일명이 필요합니다.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = fileType(bytes);
  if (!contentType) throw new Error("실제 PDF·PNG·JPEG·WebP 파일만 첨부할 수 있습니다.");
  input.content_hash = createHash("sha256").update(bytes).digest("hex");
  input.path = `${member.organization_id}/${member.user_id}/${uploadId}/${input.content_hash}`;
  const storage = db.storage.from(bucket);
  const uploaded = await storage.upload(input.path, bytes, { contentType, upsert: false });
  if (uploaded.error) {
    // A timeout can occur after persistence. Compare bytes before treating a retry as successful.
    const existing = await storage.download(input.path);
    if (existing.error || !existing.data) throw new Error("증빙을 저장하지 못했습니다. 같은 처리로 다시 시도해주세요.");
    const existingHash = createHash("sha256").update(Buffer.from(await existing.data.arrayBuffer())).digest("hex");
    if (existingHash !== input.content_hash) throw new Error("기존 파일 내용이 다릅니다. 증빙을 덮어쓰지 않았습니다.");
  }
  return runFundTrust("FILE_REGISTER", input, operationKey);
}

export async function trustFileDownload(id: string) {
  const member = await requireReimbursementIdentity();
  if (!member.active || !member.permissions.some(permission => ["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"].includes(permission))) throw new Error("증빙 조회 권한이 필요합니다.");
  if (!uuid.test(id)) throw new Error("증빙 번호를 확인해주세요.");
  const db = reimbursementDb();
  const result = await db.schema("finance").from("workflow_files").select("bucket,path,file_name").eq("organization_id", member.organization_id).eq("id", id).maybeSingle();
  if (result.error || !result.data || result.data.bucket !== bucket || !result.data.path.startsWith(`${member.organization_id}/`)) throw new Error("조합 증빙을 찾지 못했습니다.");
  const signed = await db.storage.from(bucket).createSignedUrl(result.data.path, 60, { download: result.data.file_name });
  if (signed.error || !signed.data?.signedUrl) throw new Error("증빙 다운로드 링크를 만들지 못했습니다.");
  return signed.data.signedUrl;
}
