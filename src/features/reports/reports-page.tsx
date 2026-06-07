import { Download, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  cashFlowStatement,
  generatedReportRuns,
  getReportSummary,
  operatingBudget,
  quarterlyPerformanceReport,
  reportAutomationRules,
  reportFontFamily,
  type ReportSection,
  type ReportTableSection,
} from "./report-data";

const detailLabels: Record<ReportSection, string> = {
  overview: "보고서 목록",
  performance: "실적보고서",
  "cash-flow": "자금입출금명세서",
  budget: "운영비 예산",
};

export function ReportsPage({ initialSection = "overview" }: { initialSection?: ReportSection }) {
  const activeDetailLabel = detailLabels[initialSection];

  return (
    <ErpShell activeDetailLabel={activeDetailLabel} activeLabel="회계/자금" activeWorkspaceLabel="보고서">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6" style={{ fontFamily: reportFontFamily }}>
        {initialSection === "performance" ? (
          <PerformanceSection />
        ) : initialSection === "cash-flow" ? (
          <CashFlowSection />
        ) : initialSection === "budget" ? (
          <BudgetSection />
        ) : (
          <ReportOverviewSection />
        )}
      </div>
    </ErpShell>
  );
}

function ReportOverviewSection() {
  const summary = getReportSummary();

  return (
    <>
      <ReportHero
        actions={
          <>
            <Button className="rounded-full" size="lg" variant="outline">
              <RefreshCw className="size-4" />
              자동 생성 확인
            </Button>
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" size="lg">
              <Download className="size-4" />
              공개용 묶음 내보내기
            </Button>
          </>
        }
        badge="자동 생성 관리"
        description="분기별 실적보고서와 월별 자금입출금명세서를 생성일 기준으로 누적 관리하고, 누락 지출 수정 시 영향받는 보고서를 새 버전으로 재생성합니다."
        route="회계/자금 > 보고서 > 보고서 목록"
        subtitle="홈페이지/정보몽땅 공개"
        title="보고서 목록"
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <SummaryTile label="수정필요" value={`${generatedReportRuns.filter((report) => report.status === "수정필요").length}건`} />
        <SummaryTile label="공개대기" value={`${generatedReportRuns.filter((report) => report.publicationStatus === "공개대기").length}건`} />
        <SummaryTile label="분기말 잔액" value={summary.cashFlowClosingBalance} />
        <SummaryTile label="월 운영비 집행" value={summary.monthlyOperatingExpense} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {reportAutomationRules.map((rule) => (
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5" key={rule.title}>
            <p className="text-sm font-bold text-[var(--color-deep-cobalt)]">{rule.title}</p>
            <p className="mt-2 text-xl font-bold">{rule.schedule}</p>
            <p className="mt-3 text-sm leading-6 text-[var(--color-stone)]">{rule.description}</p>
            <p className="mt-4 rounded-full bg-[var(--color-cloud-veil)] px-3 py-1 text-center text-xs font-bold text-[var(--color-stone)]">{rule.target}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">자동 생성 보고서 목록</h2>
            <p className="mt-1 text-sm text-[var(--color-stone)]">승인된 최신 버전만 홈페이지와 정보몽땅 공개 대상으로 관리합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold text-[var(--color-stone)]">
            <span className="rounded-full bg-[var(--color-butter-soft)] px-3 py-1">수정필요</span>
            <span className="rounded-full bg-[var(--color-morning-tint)] px-3 py-1">검토/승인</span>
            <span className="rounded-full bg-[var(--color-sprout)] px-3 py-1">공개완료</span>
          </div>
        </div>
        <ReportRunTable />
      </section>
    </>
  );
}

function PerformanceSection() {
  const summary = getReportSummary();

  return (
    <>
      <ReportHero
        actions={
          <>
            <a className={buttonVariants({ className: "rounded-full", size: "lg", variant: "outline" })} href={quarterlyPerformanceReport.sourceDocument.href}>
              <FileText className="size-4" />
              {quarterlyPerformanceReport.sourceDocument.label}
            </a>
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" size="lg">
              <Download className="size-4" />
              DOCX 내보내기
            </Button>
          </>
        }
        badge={quarterlyPerformanceReport.status}
        description={quarterlyPerformanceReport.basis}
        route="회계/자금 > 보고서 > 실적보고서"
        subtitle={quarterlyPerformanceReport.period}
        title={quarterlyPerformanceReport.title}
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <SummaryTile label="조합원 합계" value={summary.memberTotal} />
        <SummaryTile label="분기 수입/지출" value="20,728천원" />
        <SummaryTile label="분기말 잔액" value={summary.cashFlowClosingBalance} />
        <SummaryTile label="월 운영비 집행" value={summary.monthlyOperatingExpense} />
      </section>

      {quarterlyPerformanceReport.sections.slice(0, 4).map((section, index) => (
        <ReportTableCard index={index + 1} key={section.title} section={section} />
      ))}

      <ReportTableCard compact index={5} section={quarterlyPerformanceReport.sections[4]} />
    </>
  );
}

function CashFlowSection() {
  return (
    <>
      <ReportHero
        actions={
          <>
            <Button className="rounded-full" size="lg" variant="outline">
              <RefreshCw className="size-4" />
              월별 자료 갱신
            </Button>
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" size="lg">
              <FileSpreadsheet className="size-4" />
              XLSX 내보내기
            </Button>
          </>
        }
        badge="월별 작성"
        description="월별 자금 입출금명세서와 운영비 세부내역을 같은 화면에서 확인합니다."
        route="회계/자금 > 보고서 > 자금입출금명세서"
        subtitle={cashFlowStatement.unit}
        title={cashFlowStatement.title}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <SummaryTile label="작성월" value={cashFlowStatement.month} />
        <SummaryTile label="당월 수입/지출 합계" value="20,728,000원" />
        <SummaryTile label="운영비 세부 합계" value="8,266,110원" />
      </section>

      <SimpleTable ariaLabel="월별 자금 입출금명세서" rows={cashFlowStatement.rows} />

      <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
        <h2 className="text-lg font-bold">3월 운영비 세부내역</h2>
        <div className="mt-4">
          <SimpleTable ariaLabel="3월 운영비 세부내역" rows={cashFlowStatement.detailRows} />
        </div>
      </section>
    </>
  );
}

function BudgetSection() {
  const summary = getReportSummary();

  return (
    <>
      <ReportHero
        actions={
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" size="lg">
            <FileSpreadsheet className="size-4" />
            예산표 내보내기
          </Button>
        }
        badge="연간 기준"
        description={`${operatingBudget.currentPeriod} ${operatingBudget.previousPeriod}`}
        route="회계/자금 > 보고서 > 운영비 예산"
        subtitle={operatingBudget.unit}
        title={operatingBudget.title}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <SummaryTile label="2026년 연간예산" value={summary.annualBudget} />
        <SummaryTile label="월 운영비 집행" value={summary.monthlyOperatingExpense} />
        <SummaryTile label="기준" value="운영비 예산(안)" />
      </section>

      <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
        <p className="text-sm font-semibold text-[var(--color-stone)]">{operatingBudget.currentPeriod}</p>
        <p className="mt-1 text-sm text-[var(--color-stone)]">{operatingBudget.previousPeriod}</p>
        <div className="mt-4">
          <SimpleTable ariaLabel="운영비 예산표" rows={[operatingBudget.headers, ...operatingBudget.rows]} />
        </div>
      </section>
    </>
  );
}

function statusClassName(status: string) {
  if (status === "수정필요") {
    return "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]";
  }

  if (status === "공개완료" || status === "승인완료") {
    return "bg-[var(--color-sprout)] text-[var(--color-green-ink)]";
  }

  if (status === "작성예정") {
    return "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]";
  }

  return "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]";
}

function ReportRunTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-soft-border)]">
      <table aria-label="자동 생성 보고서 목록" className="min-w-full border-collapse bg-white text-sm">
        <thead className="bg-[var(--color-cloud-veil)] text-[var(--color-stone)]">
          <tr>
            {["보고서명", "대상기간", "생성예정일", "버전", "상태", "공개상태", "공개대상", "작업"].map((header) => (
              <th className="whitespace-nowrap border-b border-[var(--color-soft-border)] px-4 py-3 text-center font-bold" key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {generatedReportRuns.map((report) => (
            <tr className="border-t border-[var(--color-soft-border)]" key={report.id}>
              <td className="min-w-64 px-4 py-3">
                <p className="font-bold">{report.title}</p>
                <p className="mt-1 text-xs text-[var(--color-stone)]">{report.kind}</p>
                {report.updatedReason ? <p className="mt-1 text-xs font-semibold text-[var(--color-tangerine)]">{report.updatedReason}</p> : null}
              </td>
              <td className="whitespace-nowrap px-4 py-3">{report.period}</td>
              <td className="whitespace-nowrap px-4 py-3 text-center">{report.generationDate}</td>
              <td className="whitespace-nowrap px-4 py-3 text-center">{`v${report.version}`}</td>
              <td className="whitespace-nowrap px-4 py-3 text-center">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClassName(report.status)}`}>{report.status}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-center">{report.publicationStatus}</td>
              <td className="whitespace-nowrap px-4 py-3">{report.publicationTargets.join(", ")}</td>
              <td className="whitespace-nowrap px-4 py-3">
                <div className="flex justify-end gap-2">
                  {report.status === "수정필요" ? (
                    <Button className="rounded-full" size="sm" variant="outline">
                      재생성
                    </Button>
                  ) : null}
                  <Button className="rounded-full bg-[var(--color-pressed-charcoal)] text-white hover:bg-[var(--color-midnight-ink)]" size="sm">
                    상세
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportHero({
  actions,
  badge,
  description,
  route,
  subtitle,
  title,
}: {
  actions: ReactNode;
  badge: string;
  description: string;
  route: string;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
      <div>
        <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
          {route}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-normal">{title}</h1>
          <span className="rounded-full bg-[var(--color-butter-soft)] px-3 py-1 text-xs font-bold text-[var(--color-mustard)]">{badge}</span>
        </div>
        <p className="mt-2 text-sm font-semibold text-[var(--color-stone)]">{subtitle}</p>
        <p className="mt-3 max-w-4xl text-base leading-7 text-[var(--color-stone)]">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
      <p className="text-sm font-semibold text-[var(--color-stone)]">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ReportTableCard({ compact = false, index, section }: { compact?: boolean; index: number; section: ReportTableSection }) {
  return (
    <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-bold">
          {index}. {section.title}
        </h2>
        {section.asOf ? <p className="text-sm font-semibold text-[var(--color-stone)]">({section.asOf})</p> : null}
      </div>
      <SimpleTable ariaLabel={section.title} compact={compact} rows={section.rows} />
    </section>
  );
}

function SimpleTable({ ariaLabel, compact = false, rows }: { ariaLabel: string; compact?: boolean; rows: string[][] }) {
  const [headers, ...bodyRows] = rows;
  const maxColumns = Math.max(...rows.map((row) => row.length));

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-soft-border)]">
      <table aria-label={ariaLabel} className="min-w-full border-collapse bg-white text-sm">
        <thead className="bg-[var(--color-cloud-veil)] text-[var(--color-stone)]">
          <tr>
            {Array.from({ length: maxColumns }).map((_, index) => (
              <th className="whitespace-nowrap border-b border-[var(--color-soft-border)] px-4 py-3 text-center font-bold" key={`${ariaLabel}-header-${index}`} scope="col">
                {headers[index] ?? ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr className="border-t border-[var(--color-soft-border)]" key={`${ariaLabel}-row-${rowIndex}`}>
              {Array.from({ length: maxColumns }).map((_, cellIndex) => (
                <td className={`${compact ? "px-3 py-2" : "px-4 py-3"} align-top`} key={`${ariaLabel}-row-${rowIndex}-cell-${cellIndex}`}>
                  {row[cellIndex] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
