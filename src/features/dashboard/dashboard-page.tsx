"use client";

import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Download,
  ExternalLink,
  Landmark,
  MoreVertical,
  Settings2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import {
  cashFlowWidget,
  dashboardActivity,
  dashboardModules,
  dashboardStats,
  dashboardTasks,
  dashboardWarnings,
  depositBalanceWidget,
  integrationStatuses,
  type Tone,
} from "./dashboard-data";

const toneClasses: Record<Tone, string> = {
  blue: "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]",
  orange: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  purple: "bg-[var(--color-lilac-mist)] text-[var(--color-amethyst)]",
  mustard: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  green: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  neutral: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
};

const statusClasses = {
  정상: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  지연: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  확인: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
};

export function DashboardPage() {
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);

  return (
    <ErpShell>
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-[28px] border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 shadow-[var(--shadow-air)] lg:flex-row lg:items-end lg:justify-between lg:p-7">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
              ERP Core + 읽기 중심 연동 대시보드
            </p>
            <h1 className="text-3xl font-bold tracking-normal sm:text-4xl">
              대방동 지역주택조합 ERP
            </h1>
            <p className="mt-3 text-base leading-7 text-[var(--color-stone)]">
              조합원, 총회, 토지, 수지분석 현황을 한 화면에서 확인하고 외부
              모듈의 연동 상태를 추적합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]"
              size="lg"
            >
              <Download className="size-4" />
              보고서 내보내기
            </Button>
            <Button className="rounded-full" size="lg" variant="outline">
              연동 설정
              <ArrowUpRight className="size-4" />
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboardStats.map((stat) => (
            <article
              className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5"
              key={stat.label}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--color-stone)]">
                  {stat.label}
                </p>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[stat.tone]}`}
                >
                  {stat.description}
                </span>
              </div>
              <p className="mt-4 text-3xl font-bold tracking-normal">{stat.value}</p>
            </article>
          ))}
        </section>

        <CashFlowProcessingWidget onOpenSettings={() => setIsPeriodModalOpen(true)} />
        <DepositBalanceWidget />

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">주의 필요</h2>
                <p className="text-sm text-[var(--color-stone)]">
                  오늘 바로 확인해야 할 운영 리스크입니다.
                </p>
              </div>
              <TriangleAlert className="size-5 text-[var(--color-tangerine)]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {dashboardWarnings.map((warning) => (
                <article
                  className="rounded-xl border border-[var(--color-soft-border)] bg-white p-4"
                  key={warning.title}
                >
                  <span
                    className={`mb-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[warning.tone]}`}
                  >
                    {warning.title}
                  </span>
                  <p className="text-sm leading-6 text-[var(--color-stone)]">
                    {warning.detail}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">연동 상태</h2>
                <p className="text-sm text-[var(--color-stone)]">
                  5개 외부 모듈의 읽기 연동 기준입니다.
                </p>
              </div>
              <DatabaseZap className="size-5 text-[var(--color-deep-cobalt)]" />
            </div>
            <div className="space-y-3">
              {integrationStatuses.map((item) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3"
                  key={item.source}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.source}</p>
                    <p className="text-xs text-[var(--color-fog)]">
                      {item.module} · {item.lastSync}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[item.status]}`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <div className="mb-4">
              <h2 className="text-xl font-bold">모듈 요약</h2>
              <p className="text-sm text-[var(--color-stone)]">
                기존 앱은 전문 모듈로 유지하고 ERP에서 상태를 관제합니다.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {dashboardModules.map((module) => (
                <article
                  className="group rounded-2xl border border-[var(--color-soft-border)] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-air)]"
                  key={module.name}
                >
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <span
                      className={`rounded-2xl px-3 py-2 text-xs font-bold ${toneClasses[module.tone]}`}
                    >
                      {module.source}
                    </span>
                    <ExternalLink className="size-4 text-[var(--color-fog)] transition group-hover:text-[var(--color-midnight-ink)]" />
                  </div>
                  <h3 className="text-lg font-bold">{module.name}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-[var(--color-stone)]">
                    {module.description}
                  </p>
                  <p className="mt-4 text-sm font-semibold text-[var(--color-midnight-ink)]">
                    {module.metric}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <aside className="grid gap-6">
            <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
              <h2 className="text-xl font-bold">오늘의 업무</h2>
              <div className="mt-4 space-y-3">
                {dashboardTasks.map((task) => (
                  <div className="rounded-xl bg-white p-4" key={task.title}>
                    <p className="text-sm font-semibold">{task.title}</p>
                    <p className="mt-1 text-xs text-[var(--color-stone)]">
                      {task.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
              <h2 className="text-xl font-bold">최근 변경 이력</h2>
              <div className="mt-4 space-y-4">
                {dashboardActivity.map((activity) => (
                  <div className="flex gap-3" key={`${activity.time}-${activity.text}`}>
                    <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-morning-tint)]">
                      {activity.text.includes("지연") ? (
                        <Clock3 className="size-3.5 text-[var(--color-tangerine)]" />
                      ) : (
                        <CheckCircle2 className="size-3.5 text-[var(--color-deep-cobalt)]" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-fog)]">
                        {activity.time}
                      </p>
                      <p className="text-sm leading-6 text-[var(--color-stone)]">
                        {activity.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>

      {isPeriodModalOpen ? <PeriodSettingsDialog onClose={() => setIsPeriodModalOpen(false)} /> : null}
    </ErpShell>
  );
}

function CashFlowProcessingWidget({ onOpenSettings }: { onOpenSettings: () => void }) {
  const monthlyPoints = cashFlowWidget.chart.monthly;
  const maxAmount = Math.max(...monthlyPoints.flatMap((point) => [point.income, point.expense]), 1);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
      <div className="flex flex-col gap-3 border-b border-[var(--color-soft-border)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xl font-bold">2026.06.07 <span className="text-sm">(일)</span></p>
          <h2 className="mt-3 text-lg font-bold">{cashFlowWidget.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-stone)]">
          <span>조회기준일시 : {cashFlowWidget.generatedAt}</span>
          <Button className="rounded-full" size="sm" variant="outline">
            위젯설정
          </Button>
          <MoreVertical className="size-5 text-[var(--color-fog)]" />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.6fr_0.9fr]">
        <div className="border-b border-[var(--color-soft-border)] p-5 lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2 text-xs">
              <Legend color="bg-[#ef3f6b]" label="수입" value="102,753천원" />
              <Legend color="bg-[#2878e5]" label="지출" value="20,238천원" />
              <Legend color="bg-[var(--color-green-ink)]" label="순증감" value="82,515천원" />
            </div>
            <div className="flex overflow-hidden rounded-md border border-[var(--color-soft-border)] bg-white">
              {cashFlowWidget.viewModes.map((mode) => (
                <button
                  aria-pressed={mode === "월별"}
                  className={`min-h-8 px-3 text-xs font-bold ${mode === "월별" ? "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]" : "text-[var(--color-stone)]"}`}
                  key={mode}
                  type="button"
                >
                  {mode}
                </button>
              ))}
              <button aria-label="조회기간 설정" className="min-h-8 border-l border-[var(--color-soft-border)] px-3 text-[var(--color-deep-cobalt)]" onClick={onOpenSettings} type="button">
                <Settings2 className="size-4" />
              </button>
            </div>
          </div>

          <div className="mt-10 h-56">
            <div className="flex h-full items-end justify-between gap-4 border-b border-[var(--color-soft-border)] px-2">
              {monthlyPoints.map((point) => {
                const incomeHeight = Math.max((point.income / maxAmount) * 170, point.income > 0 ? 24 : 0);
                const expenseHeight = Math.max((point.expense / maxAmount) * 170, point.expense > 0 ? 18 : 0);
                return (
                  <div className="flex h-full min-w-16 flex-1 flex-col justify-end" key={point.label}>
                    <div className="flex h-44 items-end justify-center gap-1 border-l border-[var(--color-soft-border)]">
                      <div className="w-5 bg-[#ef3f6b]" style={{ height: `${incomeHeight}px` }} />
                      <div className="w-8 bg-[#2878e5]" style={{ height: `${expenseHeight}px` }} />
                    </div>
                    <p className="mt-2 text-center text-xs font-semibold text-[var(--color-stone)]">{point.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-5">
          <p className="text-xs font-bold text-[var(--color-fog)]">{cashFlowWidget.periodLabel}</p>
          <div className="mt-4 space-y-5">
            {cashFlowWidget.statusGroups.map((group) => (
              <div className="border-b border-[var(--color-soft-border)] pb-4 last:border-b-0 last:pb-0" key={group.title}>
                <h3 className={`border-l-2 pl-3 text-sm font-bold ${group.tone === "income" ? "border-[#ef3f6b] text-[#e3234f]" : "border-[#2878e5] text-[#1160ce]"}`}>
                  {group.title}
                </h3>
                <div className="mt-3 space-y-2">
                  {group.items.map((item) => (
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-xs" key={`${group.title}-${item.label}`}>
                      <span className="font-semibold">{item.label}</span>
                      <span className="text-right text-[var(--color-stone)]">{item.amount}</span>
                      <span className="text-right font-semibold text-[var(--color-deep-cobalt)]">
                        {item.status} {item.countLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DepositBalanceWidget() {
  return (
    <section className="grid min-h-28 overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] sm:grid-cols-[280px_1fr_auto]">
      <div className="border-b border-[var(--color-soft-border)] px-5 py-5 sm:border-b-0 sm:border-r">
        <h2 className="text-sm font-bold">{depositBalanceWidget.title}</h2>
        <p className="mt-3 text-lg font-bold text-[var(--color-deep-cobalt)]">{depositBalanceWidget.totalAmount}</p>
      </div>
      <div className="flex flex-wrap items-center gap-8 px-5 py-5">
        {depositBalanceWidget.accounts.map((account) => (
          <div className="flex min-w-52 items-center gap-4" key={account.bankName}>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]">
              <Landmark className="size-6" />
            </div>
            <div>
              <p className="text-xs text-[var(--color-stone)]">{account.bankName}</p>
              <p className="mt-1 text-sm font-bold">{account.amount}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-start justify-end px-4 py-5 text-[var(--color-fog)]">
        <MoreVertical className="size-5" />
      </div>
    </section>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2.5 ${color}`} />
      <span className="font-semibold">{label}</span>
      <span className="text-[var(--color-stone)]">{value}</span>
    </div>
  );
}

function PeriodSettingsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <section aria-label="조회기간 설정" aria-modal="true" className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-[0_24px_80px_rgba(16,20,24,0.28)]" role="dialog">
        <div className="flex items-center justify-between bg-[#4b5968] px-5 py-4 text-white">
          <h2 className="text-base font-bold">조회기간 설정</h2>
          <button aria-label="닫기" onClick={onClose} type="button">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-5">
          <div className="flex flex-col gap-3 bg-[#f4f4f5] p-4 sm:flex-row sm:items-center">
            <span className="text-sm font-bold">기준연도</span>
            <div className="flex items-center rounded-md border border-[var(--color-soft-border)] bg-white">
              <button className="px-3 py-1 text-lg text-[var(--color-stone)]" type="button">‹</button>
              <span className="px-4 text-sm font-bold">2026</span>
              <button className="px-3 py-1 text-lg text-[var(--color-stone)]" type="button">›</button>
            </div>
            <span className="text-sm font-bold">{cashFlowWidget.periodRange}</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {["1년", "상반기", "하반기", "분기별", "1/4분기", "2/4분기", "3/4분기", "4/4분기"].map((label) => (
              <button className={`min-h-11 border border-[var(--color-soft-border)] text-sm font-bold ${label === "1년" ? "bg-[var(--color-deep-cobalt)] text-white" : "bg-white text-[var(--color-stone)]"}`} key={label} type="button">
                {label}
              </button>
            ))}
          </div>

          <div className="mt-7">
            <p className="text-sm font-bold">대시보드 조회 기준을 설정합니다.</p>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              {["세금계산서 등", "거래명세표", "은행/카드 거래내역", "전표 처리일 기준"].map((label) => (
                <label className="flex items-center gap-2" key={label}>
                  <input defaultChecked={label === "은행/카드 거래내역"} type="radio" name="dashboard-period-source" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-5 flex justify-center gap-2 border-t border-[var(--color-soft-border)] pt-4">
            <Button className="bg-[var(--color-deep-cobalt)] text-white hover:bg-[var(--color-midnight-ink)]" size="sm">
              적용
            </Button>
            <Button onClick={onClose} size="sm" variant="outline">
              취소
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
