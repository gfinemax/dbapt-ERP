import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import { hasReimbursementPermission } from "./reimbursement-domain";

export type MonthCloseCheck = { key: string; label: string; count: number; href: string; blocking: boolean };
export type MonthCloseWorkspace = { month: string; period_status: "OPEN" | "SUPPLEMENT" | "CLOSED" | null; checks: MonthCloseCheck[]; ready: boolean };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function closeMonth(value: string | undefined, today: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") ? `${value}-01` : `${today.slice(0, 7)}-01`;
}

export async function loadMonthClose(month?: string): Promise<MonthCloseWorkspace> {
  const member = await requireReimbursementIdentity();
  if (!member.active || !hasReimbursementPermission(member, "CLOSE")) throw new Error("월 마감 점검 권한이 필요합니다.");
  const selected = closeMonth(month, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()));
  const { data, error } = await reimbursementDb().schema("finance").rpc("month_close_read", {
    p_org: member.organization_id,
    p_actor: member.user_id,
    p_month: selected,
  });
  if (error) throw new Error(error.message);
  if (!record(data) || typeof data.month !== "string" || !Array.isArray(data.checks) || typeof data.ready !== "boolean") throw new Error("월 마감 점검 결과를 확인해주세요.");
  return data as unknown as MonthCloseWorkspace;
}
