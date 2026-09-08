import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";

export const financeSourceTaskKinds = ["MY_APPROVAL", "SETTLEMENT_OVERDUE", "EVIDENCE_REVIEW", "BANK_UNMATCHED", "TRUST_READY"] as const;
export type FinanceSourceTask = { id: string; kind: typeof financeSourceTaskKinds[number]; title: string; detail: string; href: string };
export async function loadFinanceTaskSources(): Promise<FinanceSourceTask[]> {
  const member = await requireReimbursementIdentity();
  if (!member.active) throw new Error("활성 조직 권한이 필요합니다.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("finance_task_sources", { p_org: member.organization_id, p_actor: member.user_id });
  if (error) throw new Error("업무 점검 자료를 불러오지 못했습니다.");
  if (!Array.isArray(data) || data.some(row => !row || !financeSourceTaskKinds.includes(row.kind) || !["id", "title", "detail", "href"].every(key => typeof row[key] === "string") || !row.href.startsWith("/") || row.href.startsWith("//"))) throw new Error("업무 점검 자료 형식을 확인해주세요.");
  return data.map(row => ({ id: row.id, kind: row.kind, title: row.title, detail: row.detail, href: row.href }));
}
