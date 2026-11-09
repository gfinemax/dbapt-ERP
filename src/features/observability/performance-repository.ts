import type { ReimbursementMember } from "@/features/finance/reimbursement-domain";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { PerformanceDashboard } from "./performance-metrics";

export async function loadPerformanceDashboard(actor: ReimbursementMember, days = 7): Promise<PerformanceDashboard> {
  if (!actor.permissions.includes("ADMIN")) throw new Error("성능 현황은 관리자만 확인할 수 있어.");
  const db = getSupabaseServerClient();
  if (!db) throw new Error("성능 측정 저장소가 설정되지 않았어.");
  const { data, error } = await db.schema("finance").rpc("performance_dashboard", {
    p_actor: actor.user_id,
    p_days: Math.min(Math.max(Math.trunc(days), 1), 30),
    p_org: actor.organization_id,
  });
  if (error) throw new Error("성능 측정 결과를 불러오지 못했어.");
  return data as PerformanceDashboard;
}
