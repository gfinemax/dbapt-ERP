import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import type { FinanceTask, FinanceTaskKind } from "./finance-workspace-domain";

export const financeSourceTaskKinds = ["MY_APPROVAL", "SETTLEMENT_OVERDUE", "EVIDENCE_REVIEW", "BANK_UNMATCHED", "TRUST_READY"] as const;
export const financeDashboardTaskKinds = [
  ...financeSourceTaskKinds,
  "UNCONNECTED",
  "APPROVAL",
  "TRUST_SUPPLEMENT",
  "PAYABLE",
  "PAYMENT_REVIEW",
  "ACCOUNTING_REVIEW",
] as const satisfies readonly FinanceTaskKind[];
export type FinanceSourceTask = { id: string; kind: typeof financeSourceTaskKinds[number]; title: string; detail: string; href: string };

function validatedTasks(data: unknown, kinds: readonly string[], errorMessage: string): FinanceTask[] {
  if (!Array.isArray(data) || data.some(row => !row || typeof row !== "object"
    || !kinds.includes((row as Record<string, unknown>).kind as string)
    || !["id", "title", "detail", "href"].every(key => typeof (row as Record<string, unknown>)[key] === "string")
    || !(row as Record<string, string>).href.startsWith("/")
    || (row as Record<string, string>).href.startsWith("//"))) throw new Error(errorMessage);
  return data.map(row => {
    const task = row as FinanceTask;
    const href = ["PAYABLE", "PAYMENT_REVIEW"].includes(task.kind)
      ? `${task.href}&q=${encodeURIComponent(task.title)}`
      : task.href;
    return { id: task.id, kind: task.kind, title: task.title, detail: task.detail, href };
  });
}

export async function loadFinanceTaskSources(): Promise<FinanceSourceTask[]> {
  const member = await requireReimbursementIdentity();
  if (!member.active) throw new Error("활성 조직 권한이 필요합니다.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("finance_task_sources", { p_org: member.organization_id, p_actor: member.user_id });
  if (error) throw new Error("업무 점검 자료를 불러오지 못했습니다.");
  return validatedTasks(data, financeSourceTaskKinds, "업무 점검 자료 형식을 확인해주세요.") as FinanceSourceTask[];
}

export async function loadFinanceDashboardTasks(): Promise<FinanceTask[]> {
  const member = await requireReimbursementIdentity();
  if (!member.active) throw new Error("활성 조직 권한이 필요합니다.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("finance_dashboard_tasks", { p_org: member.organization_id, p_actor: member.user_id });
  if (error) throw new Error("업무현황 자료를 불러오지 못했습니다.");
  return validatedTasks(data, financeDashboardTaskKinds, "업무현황 자료 형식을 확인해주세요.");
}
