"use client";

import type { ApprovalDocumentCandidate } from "@/features/approval/approval-domain";
import { formatExpenseResolutionAmount } from "./expense-resolution-data";
import type { BudgetSnapshot } from "./expense-resolution-page";

export function getBudgetSourcePresentation(input: { budgetDataError?: string; budgetLinked: boolean; hasApproval: boolean; isOutOfBudget: boolean; reservedAmount: number }) {
  if (input.budgetDataError) return ["예산 조회 실패", "공식 예산 확인 필요", input.budgetDataError] as const;
  if (input.budgetLinked) {
    if (input.hasApproval && input.reservedAmount > 0) return ["기안예약 연계", "승인기안 예산예약", "예약액과 연결 결의를 한 체인으로 실시간 계산합니다."] as const;
    if (input.hasApproval) return ["기안연결", input.isOutOfBudget ? "예산 외 기안 → 예산 연결" : "승인기안 연계 예산", input.isOutOfBudget ? "예산 외 기안이 공식 예산에 연결되어 계산됩니다." : "승인기안과 공식 예산을 함께 계산합니다."] as const;
    return ["기존예산", "기존 편성예산", "공식 예산과 귀속월을 실시간 합산합니다."] as const;
  }
  if (input.isOutOfBudget) return ["예산 외 집행", "예산 외 집행", "공식 예산에서 차감하지 않고 기안·의결 상태로 관리합니다."] as const;
  return ["예산 미편성", input.hasApproval ? "기안 연결 · 예산 미편성" : "예산 미편성", input.hasApproval ? "기안은 연결됐지만 공식 예산이 없습니다. 예산 조정 후 연결해주세요." : "공식 예산이 없습니다. 예산 편성·조정 후 항목과 귀속월을 연결해주세요."] as const;
}

function Status({ value }: { value: string }) {
  const warning = value === "예산 미편성" || value === "예산 조회 실패" || value === "주의";
  const danger = value === "예산 외 집행" || value === "예산초과";
  const normal = value === "정상" || value === "기존예산";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${danger ? "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]" : warning ? "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]" : normal ? "bg-[var(--color-sprout)] text-[var(--color-green-ink)]" : "bg-blue-100 text-blue-900"}`}>{value}</span>;
}

function Row({ emphasized = false, label, value }: { emphasized?: boolean; label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><dt className="text-[var(--color-stone)]">{label}</dt><dd className={`text-right ${emphasized ? "text-base font-black" : "font-bold"}`}>{value}</dd></div>;
}

export function ExpenseBudgetInspector({ approvalDocumentId, approvalDocumentNo, budget, budgetDataError, budgetItem, budgetOverReason, linkedApproval }: { approvalDocumentId?: string; approvalDocumentNo?: string; budget: BudgetSnapshot; budgetDataError?: string; budgetItem: string; budgetOverReason?: string; linkedApproval?: ApprovalDocumentCandidate }) {
  const budgetLinked = budget.monthlyBudgetAmount > 0 || budget.currentAnnualBudgetAmount > 0;
  const usageRate = Number.isFinite(budget.budgetUsageRate) ? Math.max(0, budget.budgetUsageRate) : 0;
  const [badge, label, description] = getBudgetSourcePresentation({ budgetDataError, budgetLinked, hasApproval: Boolean(approvalDocumentId), isOutOfBudget: Boolean(linkedApproval?.isOutOfBudget || budgetOverReason?.trim()), reservedAmount: linkedApproval?.reservedAmount ?? 0 });
  return <section className="mt-4 border-t border-[var(--color-soft-border)] pt-4" aria-labelledby="budget-inspector-title">
    <div className="flex items-center justify-between gap-2"><h3 className="text-base font-black" id="budget-inspector-title">예산 판단</h3><div className="flex flex-wrap justify-end gap-1"><Status value={badge} />{budgetLinked ? <Status value={budget.budgetCheckStatus} /> : null}</div></div>
    {budgetLinked ? <><dl className="mt-3 grid gap-2 text-sm"><Row label="처리구분" value={label} />{approvalDocumentNo ? <Row label="승인기안" value={approvalDocumentNo} /> : null}{(linkedApproval?.reservedAmount ?? 0) > 0 ? <Row label="기안 예약잔액" value={formatExpenseResolutionAmount(linkedApproval?.reservedAmount ?? 0)} /> : null}<Row label="예산기간" value={budget.budgetPeriod} /><Row label="예산항목" value={budgetItem || "-"} /><Row label="월 예산" value={formatExpenseResolutionAmount(budget.monthlyBudgetAmount)} /><Row emphasized label="이번 결의" value={formatExpenseResolutionAmount(budget.currentRequestAmount)} /><Row emphasized label="월 예상 누계" value={formatExpenseResolutionAmount(budget.expectedUsedAmount)} /><Row emphasized label="월 예상 잔액" value={formatExpenseResolutionAmount(budget.remainingBudgetAmount)} /><Row label="집행률" value={`${usageRate}%`} /></dl><p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-950">{description}</p><div aria-label={`예산 집행률 ${usageRate}%`} className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--color-cloud-veil)]"><div className={`h-full rounded-full ${usageRate >= 100 ? "bg-red-500" : usageRate >= 80 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${Math.min(100, usageRate)}%` }} /></div></> : <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><p className="font-black">{label}</p><p className="mt-1 font-semibold leading-6">{description}</p>{approvalDocumentNo ? <p className="mt-2 text-xs font-bold">연결 기안: {approvalDocumentNo}</p> : null}</div>}
  </section>;
}
