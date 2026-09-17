"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireReimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { smallExpenseCommand, smallExpenseDb } from "@/features/approval/small-expense-repository";

function refresh() {
  for (const path of ["/approval/small-expense", "/finance/reimbursements", "/finance/quick-expenses"]) revalidatePath(path);
}
export async function createSmallExpenseAction(form: FormData) {
  const member = await requireReimbursementIdentity(); const db = smallExpenseDb();
  const { data: roles, error } = await db.schema("approval").from("small_expense_roles").select("director_id").eq("organization_id", member.organization_id).single();
  if (error || roles?.director_id !== member.user_id) throw new Error("소액지출은 지정된 사무국장만 등록할 수 있습니다.");
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new Error("등록 번호가 올바르지 않습니다.");
  const file = form.get("evidence");
  let path: string; let hash: string;
  if (!(file instanceof File) || !file.size) {
    const { data: existing } = await db.schema("approval").from("small_expenses").select("evidence_path,evidence_hash,registered_by,review_status").eq("id", id).eq("organization_id", member.organization_id).single();
    if (!existing?.evidence_path || !existing.evidence_hash || existing.registered_by !== member.user_id || !["PENDING", "RETURNED"].includes(existing.review_status)) throw new Error("영수증 PDF 또는 이미지를 첨부해주세요.");
    path = existing.evidence_path; hash = existing.evidence_hash;
  } else {
  if (file.size > 3 * 1024 * 1024) throw new Error("3MB 이하의 영수증 PDF 또는 이미지를 첨부해주세요.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
  if (!type) throw new Error("실제 PDF·PNG·JPEG·WebP 파일만 첨부할 수 있습니다.");
  hash = createHash("sha256").update(bytes).digest("hex");
  path = `${member.organization_id}/${member.user_id}/${id}/${hash}`;
  const upload = await db.storage.from("small-expense-evidence").upload(path, bytes, { contentType: type, upsert: false });
  if (upload.error && !["409", "Duplicate"].includes(String(upload.error.statusCode)) && !upload.error.message.includes("already exists")) throw new Error("증빙을 저장하지 못했습니다.");
  }
  const data: Record<string, unknown> = { id, evidence_path: path, evidence_hash: hash };
  const fields = { expenseDate: "expense_date", partnerName: "partner_name", description: "description", projectName: "project_name", accountSubjectName: "account_subject_name", memo: "memo", spenderId: "spender_id", budgetId: "budget_id", paymentMethod: "payment_method", bankTransactionId: "bank_transaction_id", cardTransactionId: "corporate_card_transaction_id" };
  for (const [key, name] of Object.entries(fields)) data[name] = String(form.get(key) ?? "").trim() || null;
  data.amount = Number(form.get("amount")); data.revision = Number(form.get("revision") ?? 0);
  await smallExpenseCommand(member, "SUBMIT", data); refresh();
}
export async function reviewSmallExpenses(command: "CONFIRM" | "RETURN" | "CANCEL", data: Record<string, unknown>) {
  if (!["CONFIRM", "RETURN", "CANCEL"].includes(command)) throw new Error("지원하지 않는 처리입니다.");
  await smallExpenseCommand(await requireReimbursementIdentity(), command, data); refresh();
}
export async function configureSmallExpenseRoles(form: FormData) {
  await smallExpenseCommand(await requireReimbursementIdentity(), "CONFIGURE", { director_id: form.get("director_id"), chair_id: form.get("chair_id"), reason: form.get("reason") }); refresh();
}
export async function smallExpenseEvidence(id: string) {
  const member = await requireReimbursementIdentity(); const db = smallExpenseDb();
  const { data: roles } = await db.schema("approval").from("small_expense_roles").select("director_id,chair_id").eq("organization_id", member.organization_id).maybeSingle();
  if (!member.permissions.includes("ADMIN") && ![roles?.director_id, roles?.chair_id].includes(member.user_id)) throw new Error("증빙 열람 권한이 없습니다.");
  const { data, error } = await db.schema("approval").from("small_expenses").select("evidence_bucket,evidence_path").eq("organization_id", member.organization_id).eq("id", id).is("deleted_at", null).single();
  if (error || !data?.evidence_path || !["small-expense-evidence", "approval-attachments"].includes(data.evidence_bucket)) throw new Error("증빙을 찾지 못했습니다.");
  const result = await db.storage.from(data.evidence_bucket).createSignedUrl(data.evidence_path, 60);
  if (result.error) throw new Error("증빙 링크를 만들지 못했습니다.");
  return result.data.signedUrl;
}
