import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Download,
  ExternalLink,
  TriangleAlert,
} from "lucide-react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import {
  dashboardActivity,
  dashboardModules,
  dashboardStats,
  dashboardTasks,
  dashboardWarnings,
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
    </ErpShell>
  );
}
