import { requireReimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { hasReimbursementPermission, type ReimbursementPermission } from "@/features/finance/reimbursement-domain";
import { reimbursementDb } from "@/features/finance/reimbursement-repository";

export type LiveFinancialReport = {
  generated_at: string;
  source: string;
  monthly: {
    period_start: string; period_end: string; opening_balance: number; deposit_total: number;
    withdrawal_total: number; closing_balance: number; unclassified_count: number;
    categories: Array<{ category: string; deposit_amount: number; withdrawal_amount: number; transaction_count: number }>;
    transactions: Array<{ id: string; date: string; description: string; counterparty: string | null;
      deposit_amount: number; withdrawal_amount: number; category: string; classification_status: string }>;
  };
  quarterly: { period_start: string; period_end: string; deposit_total: number; withdrawal_total: number;
    closing_balance: number; assessment_total: number; receipt_total: number; external_recognition_total: number;
    satisfied_total: number; active_member_count: number };
};
export type FinancialReportRun = { id: string; report_type: "MONTHLY_CASH" | "QUARTERLY_PERFORMANCE";
  period_start: string; period_end: string; version: number; status: string; reason: string; created_at: string };
export type FinancialReportWorkspace = { live: LiveFinancialReport; history: FinancialReportRun[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function actor() {
  const member = await requireReimbursementIdentity();
  const allowed = ["ADMIN","CLOSE","PAY","APPROVE","SENIOR"].some((permission) =>
    hasReimbursementPermission(member, permission as ReimbursementPermission));
  if (!member.active || !allowed) throw new Error("보고서 조회 권한이 필요해.");
  return member;
}
export async function loadFinancialReportWorkspace(): Promise<FinancialReportWorkspace> {
  const member = await actor();
  const [liveResponse, historyResponse] = await Promise.all([
    reimbursementDb().schema("finance").rpc("financial_report_live", { p_org: member.organization_id, p_actor: member.user_id }),
    reimbursementDb().schema("finance").rpc("financial_report_history", { p_org: member.organization_id, p_actor: member.user_id }),
  ]);
  if (liveResponse.error) throw new Error(liveResponse.error.message);
  if (historyResponse.error) throw new Error(historyResponse.error.message);
  if (!isRecord(liveResponse.data) || !isRecord(liveResponse.data.monthly) || !isRecord(liveResponse.data.quarterly)
      || !Array.isArray(historyResponse.data)) throw new Error("실제 보고서 자료를 확인하지 못했어.");
  return { live: liveResponse.data as LiveFinancialReport, history: historyResponse.data as FinancialReportRun[] };
}
export async function generateFinancialReportSnapshots(reason: string) {
  const member = await actor();
  if (!reason.trim() || reason.length > 500) throw new Error("보고서 생성 사유를 확인해줘.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("generate_financial_reports", {
    p_org: member.organization_id,p_actor: member.user_id,p_reason: reason.trim(),
    p_report_types: ["MONTHLY_CASH","QUARTERLY_PERFORMANCE"],
  });
  if (error) throw new Error(error.message);
  return data as { reports: Array<{ id: string; report_type: string; version: number; created: boolean }> };
}

export async function generateScheduledFinancialReports(reportTypes: Array<"MONTHLY_CASH" | "QUARTERLY_PERFORMANCE">) {
  const { data: members,error } = await reimbursementDb().schema("finance").from("reimbursement_members")
    .select("organization_id,user_id,permissions,active").eq("active",true);
  if (error) throw new Error(error.message);
  const actors=new Map<string,{organization_id:string;user_id:string}>();
  for(const member of members??[]) if(Array.isArray(member.permissions)&&member.permissions.some((permission:string)=>["ADMIN","CLOSE","APPROVE"].includes(permission))&&!actors.has(member.organization_id)) actors.set(member.organization_id,member);
  const results=[];
  for(const selected of actors.values()) {
    const response=await reimbursementDb().schema("finance").rpc("generate_financial_reports",{p_org:selected.organization_id,p_actor:selected.user_id,
      p_reason:"예약 자동 생성",p_report_types:reportTypes});
    if(response.error) throw new Error(response.error.message);
    results.push({organization_id:selected.organization_id,result:response.data});
  }
  return results;
}
