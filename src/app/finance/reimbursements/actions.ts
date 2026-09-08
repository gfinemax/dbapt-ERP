"use server";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { reimbursementCookie, requireReimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { reimbursementCommand, reimbursementDb } from "@/features/finance/reimbursement-repository";
import { getSupabaseServerConfig } from "@/lib/supabase/config";
import { hasReimbursementPermission } from "@/features/finance/reimbursement-domain";

function refresh() {
  for (const path of ["/finance/reimbursements","/basic-info/approval","/approval","/finance/quick-expenses","/finance/expense-resolutions"]) revalidatePath(path);
}
export async function assignBudgetSource(data: Record<string,unknown>) {
  const member=await requireReimbursementIdentity();
  if(!hasReimbursementPermission(member,"APPROVE")) throw new Error("예산 배정 승인 권한이 필요합니다.");
  const {error}=await reimbursementDb().schema("finance").rpc("budget_assign_source",{p_org:member.organization_id,p_actor:member.user_id,p_data:data});
  if(error) throw new Error(error.message);
  refresh();
}
export async function reimbursementLogin(form: FormData) {
  const config = getSupabaseServerConfig();
  if (!config) throw new Error("로그인 연결이 설정되지 않았습니다.");
  // Dedicated client: signing in must never alter the shared service client.
  const auth = createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
  const { data,error } = await auth.auth.signInWithPassword({email:String(form.get("email") ?? "").trim(),password:String(form.get("password") ?? "")});
  if (error || !data.session) throw new Error("이메일과 비밀번호를 확인해주세요.");
  (await cookies()).set(reimbursementCookie,data.session.access_token,{httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"lax",path:"/",maxAge:data.session.expires_in});
  refresh();
}
export async function reimbursementLogout() {
  (await cookies()).delete(reimbursementCookie);
  refresh();
}
export async function runReimbursementCommand(command: string, data: Record<string,unknown>) {
  const member = await requireReimbursementIdentity();
  if (!["POLICY","OPEN","SUPPLEMENT","CLOSE","EVIDENCE_APPROVE","EVIDENCE_SUPPLEMENT","EXCEPTION","SENIOR","OVER_BUDGET","APPROVE","REJECT","CANCEL","PAY","REVERSE_PAYMENT"].includes(command)) throw new Error("지원하지 않는 처리입니다.");
  if (command.startsWith("EVIDENCE_")) {
    const { error } = await reimbursementDb().schema("finance").rpc("reimbursement_evidence_command", { p_org: member.organization_id, p_actor: member.user_id, p_id: String(data.id), p_decision: command === "EVIDENCE_APPROVE" ? "APPROVE" : "SUPPLEMENT", p_reason: String(data.reason ?? "") });
    if (error) throw new Error(error.message);
  } else await reimbursementCommand(member,command,data);
  refresh();
}
export async function submitReimbursement(form: FormData) {
  const member = await requireReimbursementIdentity();
  const file = form.get("evidence");
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("신청 번호가 올바르지 않습니다.");
  if (!(file instanceof File) || !file.size || file.size > 3*1024*1024) throw new Error("3MB 이하의 영수증 PDF 또는 이미지를 첨부해주세요.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const isPdf = bytes.subarray(0,5).toString() === "%PDF-";
  const isPng = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isJpeg = bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const isWebp = bytes.subarray(0,4).toString()==="RIFF" && bytes.subarray(8,12).toString()==="WEBP";
  const type = isPdf ? "application/pdf" : isPng ? "image/png" : isJpeg ? "image/jpeg" : isWebp ? "image/webp" : null;
  if (!type) throw new Error("실제 PDF·PNG·JPEG·WebP 파일만 첨부할 수 있습니다.");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = `${member.organization_id}/${member.user_id}/${id}/${hash}`;
  const db = reimbursementDb();
  const upload = await db.storage.from("personal-reimbursements").upload(path,bytes,{contentType:type,upsert:false});
  if (upload.error && !["409","Duplicate"].includes(String(upload.error.statusCode)) && !upload.error.message.includes("already exists")) throw new Error("증빙을 저장하지 못했습니다. 입력 내용은 유지됩니다.");
  const data: Record<string,unknown> = {id,evidence_path:path,evidence_hash:hash};
  for (const key of ["used_on","budget_id","merchant","purpose","delay_reason","source_quick_id","payment_method","evidence_kind","missing_receipt_reason"]) data[key]=String(form.get(key) ?? "").trim();
  data.amount=Number(form.get("amount"));
  if (!Number.isSafeInteger(data.amount) || Number(data.amount)<=0) throw new Error("금액은 1원 이상의 정수로 입력해주세요.");
  // Keep uploaded evidence on retry/failure; never delete evidence after an ambiguous commit.
  const { error } = await reimbursementDb().schema("finance").rpc("reimbursement_submit_with_evidence", { p_org: member.organization_id, p_actor: member.user_id, p_data: data });
  if (error) throw new Error(error.message);
  refresh();
}
export async function reimbursementEvidence(id: string) {
  const member=await requireReimbursementIdentity();
  const {data,error}=await reimbursementDb().schema("finance").from("personal_reimbursements").select("evidence_path,applicant_id").eq("id",id).eq("organization_id",member.organization_id).single();
  if (error || !data) throw new Error("증빙을 찾지 못했습니다.");
  if (data.applicant_id!==member.user_id && member.permissions.length===0) throw new Error("본인 신청의 증빙만 열람할 수 있습니다.");
  const result=await reimbursementDb().storage.from("personal-reimbursements").createSignedUrl(data.evidence_path,60);
  if(result.error) throw new Error("증빙 열람 링크를 만들지 못했습니다.");
  return result.data.signedUrl;
}
export async function saveReimbursementMember(form: FormData) {
  const member=await requireReimbursementIdentity();
  if(!hasReimbursementPermission(member,"ADMIN")) throw new Error("관리자 권한이 필요합니다.");
  const email=String(form.get("email") ?? "").trim().toLowerCase();
  const displayName=String(form.get("display_name") ?? "").trim();
  if(!displayName) throw new Error("담당자 이름이 필요합니다.");
  const db=reimbursementDb(); let userId=String(form.get("user_id") ?? "");
  let created=false;
  if(!userId) {
    // Admin creates an account without sending email. The individual changes the initial password after login.
    const password=String(form.get("password") ?? "");
    if(password.length<12) throw new Error("초기 비밀번호는 12자 이상으로 설정해주세요.");
    const result=await db.auth.admin.createUser({email,password,email_confirm:true});
    if(result.error) throw new Error("계정 생성 실패. 기존 계정이면 사용자 ID로 권한을 지정해주세요.");
    userId=result.data.user.id;
    created=true;
  }
  try {
    await reimbursementCommand(member,"MEMBER",{user_id:userId,display_name:displayName,permissions:form.getAll("permissions"),active:form.get("active")==="on"});
  } catch(error) {
    if(created) throw new Error(`계정은 생성됐지만 권한 저장을 확인하지 못했습니다. 기존 사용자 ID ${userId}로 다시 저장해주세요.`);
    throw error;
  }
  refresh();
}
export async function changeReimbursementPassword(form: FormData) {
  await requireReimbursementIdentity();
  const token=(await cookies()).get(reimbursementCookie)?.value;
  const password=String(form.get("password") ?? "");
  if(password.length<12) throw new Error("비밀번호는 12자 이상이어야 합니다.");
  const cfg=getSupabaseServerConfig()!;
  const response=await fetch(`${cfg.url}/auth/v1/user`,{method:"PUT",headers:{apikey:cfg.key,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({password})});
  if(!response.ok) throw new Error("비밀번호를 변경하지 못했습니다.");
}
