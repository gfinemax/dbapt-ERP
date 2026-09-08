import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { BudgetAllocationSource, BudgetEntry, Reimbursement, ReimbursementAudit, ReimbursementBank, ReimbursementBudget, ReimbursementMember, ReimbursementPeriod, ReimbursementPolicy, ReimbursementReport, ReimbursementSource } from "./reimbursement-domain";
export type ReimbursementWorkspace = {
  member: ReimbursementMember; members: ReimbursementMember[]; policy: ReimbursementPolicy | null;
  periods: ReimbursementPeriod[]; requests: Reimbursement[]; budgets: ReimbursementBudget[];
  reports: ReimbursementReport[]; audits: ReimbursementAudit[]; banks: ReimbursementBank[]; sources: ReimbursementSource[]; month: string;
  allocationSources?: BudgetAllocationSource[]; budgetEntries?: BudgetEntry[]; allocationBudgets?: {id:string;budget_item:string;fiscal_year:number}[];
};
export function reimbursementDb() {
  const db = getSupabaseServerClient();
  if (!db) throw new Error("정산 저장소가 설정되지 않았습니다.");
  return db;
}
export async function reimbursementCommand(member: ReimbursementMember, command: string, data: Record<string,unknown>) {
  const { data: result, error } = await reimbursementDb().schema("finance").rpc("reimbursement_command", {
    p_org: member.organization_id, p_actor: member.user_id, p_command: command, p_data: data,
  });
  if (error) throw new Error(error.code === "23505" ? "이미 등록·처리된 내역입니다. 새로고침 후 확인해주세요." : error.message);
  return result;
}
export async function loadReimbursementWorkspace(member: ReimbursementMember, month: string): Promise<ReimbursementWorkspace> {
  const db = reimbursementDb(); const finance = db.schema("finance"); const org = member.organization_id;
  const staff=member.permissions.length>0;
  let requests=finance.from("personal_reimbursements").select("id,applicant_id,budget_id,used_on,budget_month,amount,merchant,purpose,delay_reason,source_quick_id,status,needs_exception,needs_senior,exception_approved_at,senior_approved_at,over_budget_approved_at,submitted_at,approved_at,paid_at,bank_transaction_id,payment_method,evidence_kind,missing_receipt_reason,evidence_review_status,evidence_reviewed_at,evidence_review_note").eq("organization_id",org).eq("budget_month",month);
  if(!staff) requests=requests.eq("applicant_id",member.user_id);
  const results = await Promise.all([
    finance.from("reimbursement_policies").select("submission_day,completion_day,long_delay_days").eq("organization_id",org).maybeSingle(),
    finance.from("reimbursement_periods").select("*").eq("organization_id",org).order("month",{ascending:false}),
    requests.order("submitted_at",{ascending:false}),
    finance.rpc("reimbursement_budget_rows",{p_org:org,p_month:month}),
    staff?finance.from("reimbursement_reports").select("month,revision,created_at,reason,snapshot").eq("organization_id",org).eq("month",month).order("revision",{ascending:false}):Promise.resolve({data:[],error:null}),
    staff?finance.from("reimbursement_members").select("organization_id,user_id,display_name,permissions,active").eq("organization_id",org):Promise.resolve({data:[member],error:null}),
    staff?finance.from("reimbursement_audit").select("id,request_id,actor_id,action,reason,created_at").eq("organization_id",org).order("created_at",{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
    staff?finance.from("bank_transactions").select("id,transacted_at,withdrawal_amount,counterparty,description").eq("organization_id",org).is("deleted_at",null).gt("withdrawal_amount",0).order("transacted_at",{ascending:false}).limit(200):Promise.resolve({data:[],error:null}),
    staff?finance.from("quick_expense_records").select("id,occurred_at,amount,counterparty,budget_item,usage_description").eq("organization_id",org).eq("payment_method","PERSONAL_PREPAID").neq("record_status","CONVERTED").is("linked_resolution_id",null).order("occurred_at",{ascending:false}).limit(200):Promise.resolve({data:[],error:null}),
    staff?finance.rpc("budget_review_queue",{p_org:org}):Promise.resolve({data:[],error:null}),
    staff?finance.rpc("budget_month_entries",{p_org:org,p_month:month}):Promise.resolve({data:[],error:null}),
    staff?db.schema("approval").from("budgets").select("id,budget_item,fiscal_year").eq("organization_id",org):Promise.resolve({data:[],error:null}),
  ]);
  for (const r of results) if (r.error) throw new Error(`정산 자료 조회 실패: ${r.error.message}`);
  return { member, month, policy: results[0].data as ReimbursementPolicy | null, periods: results[1].data as ReimbursementPeriod[], requests: results[2].data as Reimbursement[], budgets: results[3].data as ReimbursementBudget[], reports: results[4].data as ReimbursementReport[], members: results[5].data as ReimbursementMember[], audits: results[6].data as ReimbursementAudit[], banks: results[7].data as ReimbursementBank[], sources: results[8].data as ReimbursementSource[], allocationSources:results[9].data as BudgetAllocationSource[], budgetEntries:results[10].data as BudgetEntry[], allocationBudgets:results[11].data as {id:string;budget_item:string;fiscal_year:number}[] };
}
