"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatExpenseResolutionAmount } from "./expense-resolution-data";
import type { BudgetProfile } from "./expense-resolution-page";

type OperatingBudgetPrintRow = {
  annualAmount: number;
  calculationBasis: string;
  itemLabel: string;
  monthlyAmount: number;
  monthlyAmounts: number[];
  previousAnnualAmount: number;
  quarterlyAmounts: number[];
};

export function getOperatingBudgetPrintRows(budgetProfiles: Record<string, BudgetProfile>): OperatingBudgetPrintRow[] {
  return Object.entries(budgetProfiles).map(([key, profile]) => {
    const monthlyAmounts = Array.from({ length: 12 }, () => profile.monthlyBudgetAmount);

    return {
      annualAmount: profile.currentAnnualBudgetAmount,
      calculationBasis: profile.calculationBasis,
      itemLabel: key.replace("운영비 > ", ""),
      monthlyAmount: profile.monthlyBudgetAmount,
      monthlyAmounts,
      previousAnnualAmount: profile.previousAnnualBudgetAmount,
      quarterlyAmounts: [0, 1, 2, 3].map((quarterIndex) =>
        monthlyAmounts.slice(quarterIndex * 3, quarterIndex * 3 + 3).reduce((sum, amount) => sum + amount, 0),
      ),
    };
  });
}

export function OperatingBudgetPrintModal({
  budgetProfiles,
  onClose,
}: {
  budgetProfiles: Record<string, BudgetProfile>;
  onClose: () => void;
}) {
  const rows = getOperatingBudgetPrintRows(budgetProfiles);
  const monthlyTotals = Array.from({ length: 12 }, (_, monthIndex) => rows.reduce((sum, row) => sum + row.monthlyAmounts[monthIndex], 0));
  const quarterlyTotals = [0, 1, 2, 3].map((quarterIndex) => rows.reduce((sum, row) => sum + row.quarterlyAmounts[quarterIndex], 0));
  const previousAnnualTotal = rows.reduce((sum, row) => sum + row.previousAnnualAmount, 0);
  const annualTotal = rows.reduce((sum, row) => sum + row.annualAmount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/88 px-4 py-8" onClick={onClose}>
      <section
        aria-labelledby="operating-budget-print-title"
        aria-modal="true"
        className="w-full max-w-[1320px] overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold" id="operating-budget-print-title">
              운영비 예산표 출력
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">2026년 조합 운영비 예산을 월별·분기별 내역으로 출력합니다.</p>
          </div>
          <button aria-label="운영비 예산표 출력 닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6">
          <div className="erp-print-page rounded-xl border border-[var(--color-soft-border)] bg-white p-6">
            <header className="border-b-2 border-[var(--color-midnight-ink)] pb-5 text-center">
              <h3 className="text-3xl font-bold tracking-normal">2026년 운영비 예산표</h3>
              <p className="mt-2 font-semibold">당기: 2026/01/01 ~ 2026/12/31</p>
              <p className="mt-1 text-sm text-[var(--color-stone)]">전기: 2025/01/01 ~ 2025/12/31</p>
              <p className="mt-3 text-right text-sm text-[var(--color-stone)]">(단위: 원, VAT포함)</p>
            </header>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-bold">운영비 월별·분기별 내역</h4>
              <div className="flex gap-2 text-sm font-semibold text-[var(--color-stone)]">
                <span className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-1">월 예산 {formatExpenseResolutionAmount(monthlyTotals[0])}</span>
                <span className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-1">연간 {formatExpenseResolutionAmount(annualTotal)}</span>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table aria-label="운영비 월별 분기별 예산표" className="w-full min-w-[1680px] border-collapse text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs font-bold text-[var(--color-stone)]">
                  <tr>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" rowSpan={2}>항목</th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" rowSpan={2}>월 예산</th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" colSpan={12}>월별 내역</th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" colSpan={4}>분기별 합계</th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" rowSpan={2}>2025년(전기)</th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" rowSpan={2}>2026년(당기)</th>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2" rowSpan={2}>내역 및 산출근거</th>
                  </tr>
                  <tr>
                    {Array.from({ length: 12 }, (_, index) => (
                      <th className="border border-[var(--color-soft-border)] px-2 py-2 text-center" key={`month-head-${index + 1}`}>{index + 1}월</th>
                    ))}
                    {["1분기", "2분기", "3분기", "4분기"].map((quarter) => (
                      <th className="border border-[var(--color-soft-border)] px-2 py-2 text-center" key={quarter}>{quarter}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className="bg-white" key={row.itemLabel}>
                      <th className="border border-[var(--color-soft-border)] px-3 py-2 text-left font-bold">{row.itemLabel}</th>
                      <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right font-semibold">{formatExpenseResolutionAmount(row.monthlyAmount)}</td>
                      {row.monthlyAmounts.map((amount, index) => (
                        <td className="border border-[var(--color-soft-border)] px-2 py-2 text-right" key={`${row.itemLabel}-${index + 1}`}>{formatExpenseResolutionAmount(amount)}</td>
                      ))}
                      {row.quarterlyAmounts.map((amount, index) => (
                        <td className="border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-2 py-2 text-right font-semibold" key={`${row.itemLabel}-q${index + 1}`}>{formatExpenseResolutionAmount(amount)}</td>
                      ))}
                      <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right font-semibold">{formatExpenseResolutionAmount(row.previousAnnualAmount)}</td>
                      <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right font-bold">{formatExpenseResolutionAmount(row.annualAmount)}</td>
                      <td className="border border-[var(--color-soft-border)] px-3 py-2 text-left text-[var(--color-stone)]">{row.calculationBasis}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[var(--color-cloud-veil)] font-bold">
                  <tr>
                    <th className="border border-[var(--color-soft-border)] px-3 py-2 text-left">소계</th>
                    <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right">{formatExpenseResolutionAmount(monthlyTotals[0])}</td>
                    {monthlyTotals.map((amount, index) => (
                      <td className="border border-[var(--color-soft-border)] px-2 py-2 text-right" key={`total-month-${index + 1}`}>{formatExpenseResolutionAmount(amount)}</td>
                    ))}
                    {quarterlyTotals.map((amount, index) => (
                      <td className="border border-[var(--color-soft-border)] px-2 py-2 text-right" key={`total-quarter-${index + 1}`}>{formatExpenseResolutionAmount(amount)}</td>
                    ))}
                    <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right">{formatExpenseResolutionAmount(previousAnnualTotal)}</td>
                    <td className="border border-[var(--color-soft-border)] px-3 py-2 text-right">{formatExpenseResolutionAmount(annualTotal)}</td>
                    <td className="border border-[var(--color-soft-border)] px-3 py-2 text-left">운영비 소계</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          <Button className="rounded-full" onClick={onClose} variant="outline">닫기</Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={() => window.print()}>브라우저 프린트</Button>
        </div>
      </section>
    </div>
  );
}
