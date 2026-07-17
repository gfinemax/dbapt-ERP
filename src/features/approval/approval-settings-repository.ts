import { getSupabaseServerClient } from "@/lib/supabase/server";

export type ApprovalSettings = { meetingThresholdAmount: number; smallExpenseLimit: number; materialChangeFields: string[]; organizationId?: string };
export const defaultApprovalSettings: ApprovalSettings = { meetingThresholdAmount: 100_000_000, smallExpenseLimit: 50_000, materialChangeFields: ["amount","counterparty_id","payment_method","budget_item","project_name","meeting_status","has_member_burden"] };

function client() { const value = getSupabaseServerClient(); if (!value) throw new Error("Supabase 서버 연결이 설정되지 않았어."); return value; }
export async function getApprovalSettings(): Promise<ApprovalSettings> {
  const { data: org } = await client().schema("finance").from("expense_compliance_settings").select("organization_id").limit(1).maybeSingle();
  if (!org?.organization_id) return defaultApprovalSettings;
  const { data, error } = await client().schema("approval").from("settings").select("*").eq("organization_id",org.organization_id).maybeSingle();
  if (error) throw new Error(`기안 설정을 불러오지 못했어: ${error.message}`);
  return data ? { materialChangeFields: data.material_change_fields, meetingThresholdAmount: Number(data.meeting_threshold_amount), organizationId: org.organization_id, smallExpenseLimit: Number(data.small_expense_limit) } : { ...defaultApprovalSettings, organizationId: org.organization_id };
}
export async function saveApprovalSettings(settings: ApprovalSettings) {
  if (!settings.organizationId) throw new Error("설정을 저장할 조직이 없어.");
  const { error } = await client().schema("approval").from("settings").upsert({ material_change_fields: settings.materialChangeFields, meeting_threshold_amount: settings.meetingThresholdAmount, organization_id: settings.organizationId, small_expense_limit: settings.smallExpenseLimit, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
  if (error) throw new Error(`기안 설정을 저장하지 못했어: ${error.message}`);
}
export async function listMeetingRules() { const { data, error } = await client().schema("approval").from("meeting_rules").select("*").order("priority"); if (error) throw new Error(error.message); return data ?? []; }
export async function addMeetingRule(input: { keyword: string; organizationId?: string; reason: string; regulationReference: string; recommendedBody: string; ruleName: string }) { const { error } = await client().schema("approval").from("meeting_rules").insert({ keyword: input.keyword, organization_id: input.organizationId || null, reason: input.reason, recommended_body: input.recommendedBody, regulation_reference: input.regulationReference, rule_name: input.ruleName }); if (error) throw new Error(`의결규칙을 저장하지 못했어: ${error.message}`); }
