import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import type { CleanupCategory, CleanupItem, DataCleanupWorkspace } from "./data-cleanup-domain";

function sourceHref(sourceKind: string, sourceId: string) {
  return `/finance/expenses?source_kind=${encodeURIComponent(sourceKind)}&source_id=${encodeURIComponent(sourceId)}`;
}

export async function loadDataCleanupWorkspace(): Promise<DataCleanupWorkspace> {
  const member = await requireReimbursementIdentity();
  if (!member.permissions.some((permission) => ["ADMIN", "APPROVE", "CLOSE", "PAY", "SENIOR"].includes(permission))) {
    throw new Error("기존 자료 정리는 회계·자금 담당자만 볼 수 있어.");
  }
  const finance = reimbursementDb().schema("finance");
  const org = member.organization_id;
  const [quick, routes, budget] = await Promise.all([
    finance.from("quick_expense_records")
      .select("id,usage_description,counterparty,amount,occurred_at,record_status,budget_item,evidence_review_status")
      .eq("organization_id", org).in("record_status", ["SOURCE_PENDING", "EVIDENCE_PENDING", "NEEDS_RESOLUTION"])
      .order("occurred_at", { ascending: false }).limit(500),
    finance.from("workflow_transactions").select("id,source_kind,source_id,title,amount,updated_at")
      .eq("organization_id", org).eq("route", "UNKNOWN").order("updated_at", { ascending: false }).limit(500),
    finance.rpc("budget_review_queue", { p_org: org }),
  ]);
  const failure = [quick, routes, budget].find((result) => result.error)?.error;
  if (failure) throw new Error(`기존 자료 점검 실패: ${failure.message}`);
  const quickRows = (quick.data ?? []) as { id: string; usage_description: string; counterparty: string; amount: number; occurred_at: string; record_status: string; budget_item: string; evidence_review_status: string | null }[];
  const routeRows = (routes.data ?? []) as { id: string; source_kind: string; source_id: string; title: string; amount: number; updated_at: string }[];
  const budgetRows = (Array.isArray(budget.data) ? budget.data : []) as { source_kind: string; source_id: string; title: string; amount: number; suggested_month: string | null; suggested_budget: string | null; paid_at: string | null; needs_review: boolean; reason: string }[];
  const items: CleanupItem[] = quickRows.map((row) => {
    const category: CleanupCategory = row.record_status === "SOURCE_PENDING" ? "CARD_LINK" : row.record_status === "EVIDENCE_PENDING" ? "EVIDENCE" : "RESOLUTION";
    return {
      id: `${category}:QUICK:${row.id}`,
      category,
      sourceKind: "QUICK",
      sourceId: row.id,
      title: row.usage_description,
      detail: [row.counterparty, row.budget_item, category === "EVIDENCE" && row.evidence_review_status === "SUPPLEMENT_REQUIRED" ? "보완 요청됨" : null].filter(Boolean).join(" · "),
      amount: Number(row.amount),
      date: row.occurred_at,
      href: category === "CARD_LINK" ? "/finance/quick-expenses?method=corporate-card" : category === "RESOLUTION" ? `/finance/expense-resolutions?quickExpenseId=${encodeURIComponent(row.id)}` : sourceHref("QUICK", row.id),
      actionLabel: category === "CARD_LINK" ? "카드내역 연결" : category === "EVIDENCE" ? "증빙 확인" : "지출결의 작성",
    };
  });
  for (const row of budgetRows.filter((item) => item.needs_review)) items.push({
    id: `BUDGET:${row.source_kind}:${row.source_id}`,
    category: "BUDGET",
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    title: row.title,
    detail: `${row.reason}${row.suggested_budget ? ` · 추천 ${row.suggested_budget}` : " · 예산항목 미지정"}${row.suggested_month ? ` · ${row.suggested_month.slice(0, 7)}` : " · 귀속월 미지정"}`,
    amount: Number(row.amount),
    date: row.paid_at ?? row.suggested_month,
    href: "/finance/reimbursements?tab=budgets",
    actionLabel: "예산 귀속 확인",
  });
  for (const row of routeRows) items.push({
    id: `ROUTE:${row.id}`,
    category: "ROUTE",
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    title: row.title,
    detail: `${row.source_kind} 원본 · 회사 직접지급/신탁 직접집행/월 운영비 경로 확인 필요`,
    amount: Number(row.amount),
    date: row.updated_at,
    href: sourceHref(row.source_kind, row.source_id),
    actionLabel: "처리경로 확인",
  });
  items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id));
  return { items, truncated: (quick.data?.length ?? 0) === 500 || (routes.data?.length ?? 0) === 500 };
}
