import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ReimbursementMember } from "@/features/finance/reimbursement-domain";
import type { SmallExpense, SmallExpenseBudget, SmallExpenseMember, SmallExpenseRoles, SmallExpenseSource } from "./small-expense-domain";

export function smallExpenseDb() {
  const db = getSupabaseServerClient();
  if (!db) throw new Error("소액지출 저장소가 설정되지 않았습니다.");
  return db;
}
export async function smallExpenseCommand(member: ReimbursementMember, command: string, data: Record<string, unknown>) {
  const { data: result, error } = await smallExpenseDb().schema("approval").rpc("small_expense_command", {
    p_org: member.organization_id, p_actor: member.user_id, p_command: command, p_data: data,
  });
  if (error) throw new Error(error.code === "23505" ? "이미 등록·처리된 거래입니다. 새로고침 후 확인해주세요." : error.message);
  return result;
}
export type SmallExpenseWorkspace = {
  member: ReimbursementMember; roles: SmallExpenseRoles | null; members: SmallExpenseMember[]; rows: SmallExpense[];
  budgets: SmallExpenseBudget[]; sources: SmallExpenseSource[]; month: string; limit: number;
  audits: { id: string; expense_id: string | null; actor_label: string; action: string; reason: string; created_at: string }[];
};
export async function loadSmallExpenseWorkspace(member: ReimbursementMember, month: string): Promise<SmallExpenseWorkspace> {
  const db = smallExpenseDb(); const org = member.organization_id;
  const roleResult = await db.schema("approval").from("small_expense_roles").select("director_id,chair_id").eq("organization_id", org).maybeSingle();
  if (roleResult.error) throw new Error("소액지출 확인 기능의 DB 업데이트가 필요합니다. 관리자에게 확인해주세요.");
  const roles = roleResult.data as SmallExpenseRoles | null;
  if (!member.permissions.includes("ADMIN") && ![roles?.director_id, roles?.chair_id].includes(member.user_id)) throw new Error("소액지출 담당자로 지정되지 않았습니다. 관리자에게 역할 지정을 요청해주세요.");
  const start = `${month}-01`; const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const results = await Promise.all([
    db.schema("approval").from("small_expenses").select("*", { count: "exact" }).eq("organization_id", org).is("deleted_at", null).gte("expense_date", start).lt("expense_date", end).order("expense_date", { ascending: false }),
    db.schema("finance").from("reimbursement_members").select("user_id,display_name").eq("organization_id", org).eq("active", true),
    db.schema("approval").from("budgets").select("id,budget_item,fiscal_year").eq("organization_id", org).eq("fiscal_year", Number(month.slice(0, 4))),
    db.schema("approval").from("settings").select("small_expense_limit").eq("organization_id", org).maybeSingle(),
    db.schema("approval").from("small_expense_audit").select("id,expense_id,actor_label,action,reason,created_at").eq("organization_id", org).order("created_at", { ascending: false }).limit(50),
    db.schema("finance").from("bank_transactions").select("id,transacted_at,withdrawal_amount,counterparty,description").eq("organization_id", org).is("deleted_at", null).gte("transacted_at", `${start}T00:00:00+09:00`).lt("transacted_at", `${end}T00:00:00+09:00`).gt("withdrawal_amount", 0).order("transacted_at", { ascending: false }),
    db.schema("finance").from("corporate_card_transactions").select("id,approved_at,amount,merchant_name").eq("organization_id", org).is("linked_resolution_id", null).gte("approved_at", `${start}T00:00:00+09:00`).lt("approved_at", `${end}T00:00:00+09:00`).order("approved_at", { ascending: false }),
  ]);
  for (const result of results) if (result.error) throw new Error(`소액지출 조회 실패: ${result.error.message}`);
  if ((results[0].count ?? 0) > (results[0].data?.length ?? 0)) throw new Error("조회 한도를 넘는 월별 내역이 있어 정확한 집계를 표시할 수 없습니다. 관리자에게 조회 범위 확장을 요청해주세요.");
  const rows: SmallExpense[] = (results[0].data ?? []).map(row => ({
    id: row.id, expenseDate: row.expense_date, partnerName: row.partner_name, description: row.description,
    projectName: row.project_name, accountSubjectName: row.account_subject_name, amount: Number(row.amount), payerLabel: row.payer_label,
    memo: row.memo, batchResolutionId: row.batch_resolution_id ?? undefined, reviewStatus: row.review_status,
    registeredBy: row.registered_by, spenderId: row.spender_id, confirmedLabel: row.confirmed_label, confirmedAt: row.confirmed_at,
    reviewReason: row.review_reason, revision: row.revision, budgetId: row.budget_id, paymentMethod: row.payment_method,
    bankTransactionId: row.bank_transaction_id, cardTransactionId: row.corporate_card_transaction_id, hasEvidence: !!row.evidence_path,
  }));
  const date = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value));
  const sources: SmallExpenseSource[] = [
    ...(results[5].data ?? []).map(row => ({ id: row.id, date: date(row.transacted_at), amount: Number(row.withdrawal_amount), label: row.counterparty || row.description, method: "BANK_TRANSFER" as const })),
    ...(results[6].data ?? []).map(row => ({ id: row.id, date: date(row.approved_at), amount: Number(row.amount), label: row.merchant_name, method: "CORPORATE_CARD" as const })),
  ];
  return { member, roles, month, rows, members: results[1].data ?? [], budgets: results[2].data ?? [], limit: Number(results[3].data?.small_expense_limit ?? 50000), audits: results[4].data ?? [], sources };
}
