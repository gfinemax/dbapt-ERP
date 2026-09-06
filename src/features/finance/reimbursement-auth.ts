import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ReimbursementMember } from "./reimbursement-domain";

export const reimbursementCookie = "erp-reimbursement-access";
export async function reimbursementIdentity(): Promise<ReimbursementMember | null> {
  const token = (await cookies()).get(reimbursementCookie)?.value;
  if (!token) return null;
  const db = getSupabaseServerClient();
  if (!db) throw new Error("저장소가 설정되지 않았습니다.");
  // getUser validates with Auth on every call. Never accept actor IDs from a form.
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: member, error: memberError } = await db.schema("finance").from("reimbursement_members")
    .select("organization_id,user_id,display_name,permissions,active").eq("user_id",data.user.id).eq("active",true).limit(2);
  if (memberError) throw new Error("정산 권한을 확인하지 못했습니다.");
  if (member?.length !== 1) throw new Error("활성 조합 정산 권한이 지정되지 않았거나 중복되어 있습니다. 관리자에게 확인해주세요.");
  return member[0] as ReimbursementMember;
}
export async function requireReimbursementIdentity() {
  const member = await reimbursementIdentity();
  if (!member) throw new Error("정산 업무 로그인이 필요합니다.");
  return member;
}
