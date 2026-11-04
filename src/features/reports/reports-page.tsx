"use client";

import { Download, FileSpreadsheet, FileText, RefreshCw, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTransition } from "react";
import { generateCurrentFinancialReports } from "@/app/finance/reports/actions";

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
  statutoryFundReportDocuments,
  type ReportSection,
  type ReportTableSection,
  type StatutoryFundReportDocument,
  type StatutoryFundReportDocumentKey,
} from "./report-data";
import type { FinancialReportRun, FinancialReportWorkspace } from "./financial-report-repository";

const detailLabels: Record<ReportSection, string> = {
  overview: "보고서 목록",
  performance: "실적보고서",
  "cash-flow": "자금입출금명세서",
  budget: "운영비 예산",
};

export function ReportsPage({ initialSection = "overview", workspace, loadError }: {
  initialSection?: ReportSection; workspace?: FinancialReportWorkspace; loadError?: string;
}) {
  const activeDetailLabel = detailLabels[initialSection];

  return (
    <ErpShell activeDetailLabel={activeDetailLabel} activeLabel="회계/자금" activeWorkspaceLabel="보고서">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6" style={{ fontFamily: reportFontFamily }}>
        {initialSection === "performance" ? (
          <PerformanceSection workspace={workspace} />
        ) : initialSection === "cash-flow" ? (
          <CashFlowSection workspace={workspace} />
        ) : initialSection === "budget" ? (
          <BudgetSection />
        ) : (
          <ReportOverviewSection workspace={workspace} loadError={loadError} />
        )}
      </div>
    </ErpShell>
  );
}

function ReportOverviewSection({ workspace, loadError }: { workspace?: FinancialReportWorkspace; loadError?: string }) {
  const fallback = getReportSummary();
  const summary = workspace ? {
    cashFlowClosingBalance: formatMoney(workspace.live.monthly.closing_balance),
    monthlyOperatingExpense: formatMoney(workspace.live.monthly.withdrawal_total),
  } : fallback;
  const [activePrintDocumentKey, setActivePrintDocumentKey] = useState<StatutoryFundReportDocumentKey | null>(null);
  const [message,setMessage] = useState(""); const [pending,startTransition] = useTransition();
  const printDocuments = workspace ? buildActualReportDocuments(workspace) : statutoryFundReportDocuments;
  const activePrintDocument = printDocuments.find((document) => document.key === activePrintDocumentKey);

  return (
    <>
      <ReportHero
        actions={
          <>
            <Button className="rounded-full" disabled={pending || !workspace} onClick={() => startTransition(async()=>{try{const result=await generateCurrentFinancialReports();setMessage(`ERP 실데이터 보고서 ${result.reports.length}종을 확인했어.`);window.location.reload();}catch(error){setMessage(error instanceof Error?error.message:"보고서를 생성하지 못했어.");}})} size="lg" variant="outline">
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
      {loadError ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">{loadError} · 아래 샘플 양식은 참고용으로만 표시해.</p> : null}
      {message ? <p className="rounded-xl border bg-white p-3 text-sm" role="status">{message}</p> : null}

      <section className="grid gap-4 lg:grid-cols-4">
        <SummaryTile label="미분류 거래" value={workspace ? `${workspace.live.monthly.unclassified_count}건` : `${generatedReportRuns.filter((report) => report.status === "수정필요").length}건`} />
        <SummaryTile label="보고서 보관본" value={workspace ? `${workspace.history.length}건` : `${generatedReportRuns.filter((report) => report.publicationStatus === "공개대기").length}건`} />
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
            <h2 className="text-lg font-bold">필수 출력 문서</h2>
            <p className="mt-1 text-sm text-[var(--color-stone)]">월별, 연간, 분기별 자금·사업 보고서를 종이 보관용으로 바로 출력합니다.</p>
          </div>
          <span className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-1 text-xs font-bold text-[var(--color-stone)]">내부 보관 / 감사 대응</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {printDocuments.map((document) => (
            <div className="rounded-xl border border-[var(--color-soft-border)] bg-white p-4" key={document.key}>
              <p className="text-sm font-bold text-[var(--color-deep-cobalt)]">{document.dialogLabel}</p>
              <h3 className="mt-2 text-xl font-bold">{document.title}</h3>
              <p className="mt-2 text-sm font-semibold text-[var(--color-stone)]">{document.period}</p>
              <p className="mt-3 min-h-12 text-sm leading-6 text-[var(--color-stone)]">{document.description}</p>
              <Button className="mt-4 rounded-full" onClick={() => setActivePrintDocumentKey(document.key)} size="sm" variant="outline">
                <FileSpreadsheet className="size-4" />
                {document.dialogLabel} 출력
              </Button>
            </div>
          ))}
        </div>
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
        <ReportRunTable actualRuns={workspace?.history} />
      </section>

      {activePrintDocument ? <StatutoryFundReportPrintModal document={activePrintDocument} onClose={() => setActivePrintDocumentKey(null)} /> : null}
    </>
  );
}

function PerformanceSection({ workspace }: { workspace?: FinancialReportWorkspace }) {
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
        <SummaryTile label="연동 조합원" value={workspace ? `${workspace.live.quarterly.active_member_count}명` : summary.memberTotal} />
        <SummaryTile label="분기 수입/지출" value={workspace ? `${formatMoney(workspace.live.quarterly.deposit_total)} / ${formatMoney(workspace.live.quarterly.withdrawal_total)}` : "20,728천원"} />
        <SummaryTile label="분기말 잔액" value={workspace ? formatMoney(workspace.live.quarterly.closing_balance) : summary.cashFlowClosingBalance} />
        <SummaryTile label="월 운영비 집행" value={summary.monthlyOperatingExpense} />
      </section>

      {quarterlyPerformanceReport.sections.slice(0, 4).map((section, index) => (
        <ReportTableCard index={index + 1} key={section.title} section={section} />
      ))}

      <ReportTableCard compact index={5} section={quarterlyPerformanceReport.sections[4]} />
    </>
  );
}

function CashFlowSection({ workspace }: { workspace?: FinancialReportWorkspace }) {
  const monthly = workspace?.live.monthly;
  const rows = monthly ? [
    ["구분","항목","금액"],
    ["수입","전월말 현금예금 잔액",formatMoney(monthly.opening_balance)],
    ...monthly.categories.filter(row=>Number(row.deposit_amount)>0).map(row=>["수입",row.category,formatMoney(row.deposit_amount)]),
    ["수입","당월 수입 합계",formatMoney(monthly.deposit_total)],
    ...monthly.categories.filter(row=>Number(row.withdrawal_amount)>0).map(row=>["지출",row.category,formatMoney(row.withdrawal_amount)]),
    ["지출","당월 지출 합계",formatMoney(monthly.withdrawal_total)],
    ["잔액","월말 현금예금 잔액",formatMoney(monthly.closing_balance)],
  ] : cashFlowStatement.rows;
  const details = monthly ? [["No","거래일","계정항목","적요","입금","출금","분류상태"],...monthly.transactions.map((row,index)=>[
    String(index+1),row.date.slice(0,10),row.category,row.counterparty||row.description,
    row.deposit_amount?formatMoney(row.deposit_amount):"-",row.withdrawal_amount?formatMoney(row.withdrawal_amount):"-",row.classification_status,
  ])] : cashFlowStatement.detailRows;
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
        title={monthly ? `${monthly.period_start.slice(0,7)} 자금 입출금명세서` : cashFlowStatement.title}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <SummaryTile label="작성월" value={monthly?.period_start.slice(0,7) ?? cashFlowStatement.month} />
        <SummaryTile label="당월 수입/지출" value={monthly ? `${formatMoney(monthly.deposit_total)} / ${formatMoney(monthly.withdrawal_total)}` : "20,728,000원"} />
        <SummaryTile label="미분류" value={monthly ? `${monthly.unclassified_count}건` : "8,266,110원"} />
      </section>

      <SimpleTable ariaLabel="월별 자금 입출금명세서" rows={rows} />

      <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
        <h2 className="text-lg font-bold">{monthly ? "ERP 통장거래 세부내역" : "3월 운영비 세부내역"}</h2>
        <div className="mt-4">
          <SimpleTable ariaLabel="3월 운영비 세부내역" rows={details} />
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

function StatutoryFundReportPrintModal({
  document,
  onClose,
}: {
  document: StatutoryFundReportDocument;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/88 px-4 py-8" onClick={onClose}>
      <section
        aria-labelledby={`statutory-report-${document.key}-title`}
        aria-modal="true"
        className="w-full max-w-[1180px] overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold" id={`statutory-report-${document.key}-title`}>
              {document.dialogLabel}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">{document.description}</p>
          </div>
          <button aria-label={`${document.dialogLabel} 닫기`} className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6">
          <div className="erp-print-page rounded-xl border border-[var(--color-soft-border)] bg-white p-6">
            <header className="border-b-2 border-[var(--color-midnight-ink)] pb-5 text-center">
              <h3 className="text-3xl font-bold tracking-normal">{document.title}</h3>
              <p className="mt-2 font-semibold">{document.period}</p>
              <p className="mt-3 text-right text-sm text-[var(--color-stone)]">{document.unit}</p>
            </header>

            <section className="mt-5 grid gap-3 md:grid-cols-4">
              {document.summary.map((item) => (
                <div className="rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-3" key={item.label}>
                  <p className="text-xs font-bold text-[var(--color-stone)]">{item.label}</p>
                  <p className="mt-2 text-lg font-bold">{item.value}</p>
                </div>
              ))}
            </section>

            <div className="mt-6 grid gap-5">
              {document.sections.map((section) => (
                <section key={section.title}>
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <h4 className="text-lg font-bold">{section.title}</h4>
                    {section.asOf ? <p className="text-sm font-semibold text-[var(--color-stone)]">({section.asOf})</p> : null}
                  </div>
                  <SimpleTable ariaLabel={`${document.dialogLabel} ${section.title}`} rows={section.rows} />
                </section>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          <Button className="rounded-full" onClick={onClose} variant="outline">
            닫기
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={() => window.print()}>
            브라우저 프린트
          </Button>
        </div>
      </section>
    </div>
  );
}

function formatMoney(value: number) { return `${Number(value).toLocaleString("ko-KR")}원`; }

function buildActualReportDocuments(workspace: FinancialReportWorkspace): StatutoryFundReportDocument[] {
  const monthly=workspace.live.monthly,quarterly=workspace.live.quarterly;
  const cashRows=[["구분","항목","금액"],["수입","전월말 현금예금 잔액",formatMoney(monthly.opening_balance)],
    ...monthly.categories.filter(row=>Number(row.deposit_amount)>0).map(row=>["수입",row.category,formatMoney(row.deposit_amount)]),
    ["수입","당월 수입 합계",formatMoney(monthly.deposit_total)],
    ...monthly.categories.filter(row=>Number(row.withdrawal_amount)>0).map(row=>["지출",row.category,formatMoney(row.withdrawal_amount)]),
    ["지출","당월 지출 합계",formatMoney(monthly.withdrawal_total)],
    ["잔액","월말 현금예금 잔액",formatMoney(monthly.closing_balance)]];
  const detailRows=[["No","거래일","계정항목","적요","입금","출금","분류상태"],...monthly.transactions.map((row,index)=>[
    String(index+1),row.date.slice(0,10),row.category,row.counterparty||row.description,
    row.deposit_amount?formatMoney(row.deposit_amount):"-",row.withdrawal_amount?formatMoney(row.withdrawal_amount):"-",row.classification_status])];
  return statutoryFundReportDocuments.map(document=>{
    if(document.key==="monthly-cash-flow") return {...document,period:`${monthly.period_start} ~ ${monthly.period_end}`,
      title:`${monthly.period_start.slice(0,7)} 월별 자금 입출금 명세서`,summary:[
        {label:"작성월",value:monthly.period_start.slice(0,7)},{label:"당월 수입 합계",value:formatMoney(monthly.deposit_total)},
        {label:"당월 지출 합계",value:formatMoney(monthly.withdrawal_total)},{label:"월말 현금예금 잔액",value:formatMoney(monthly.closing_balance)}],
      sections:[{title:"자금 입출금 요약",rows:cashRows},{title:"통장거래 세부내역",rows:detailRows}]};
    if(document.key==="quarterly-business-performance") return {...document,period:`${quarterly.period_start} ~ ${quarterly.period_end}`,
      title:`${quarterly.period_start.slice(0,4)}년 ${Math.ceil(Number(quarterly.period_start.slice(5,7))/3)}분기 사업실적보고서`,summary:[
        {label:"보고분기",value:`${quarterly.period_start} ~ ${quarterly.period_end}`},{label:"연동 조합원",value:`${quarterly.active_member_count}명`},
        {label:"분기 수입 / 지출",value:`${formatMoney(quarterly.deposit_total)} / ${formatMoney(quarterly.withdrawal_total)}`},{label:"분기말 잔액",value:formatMoney(quarterly.closing_balance)}],
      sections:[...document.sections.filter(section=>section.title!=="지급 및 증빙관리"),{title:"지급 및 증빙관리",rows:[
        ["구분","금액/건수","확인상태"],["분담금 부과",formatMoney(quarterly.assessment_total),"ledger 연동"],
        ["수납 배분",formatMoney(quarterly.receipt_total),"ERP 확정"],["미분류 통장거래",`${monthly.unclassified_count}건`,monthly.unclassified_count?"보완 필요":"확인 완료"]]}]};
    return document;
  });
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

function ReportRunTable({ actualRuns }: { actualRuns?: FinancialReportRun[] }) {
  if (actualRuns) return <div className="overflow-x-auto rounded-xl border border-[var(--color-soft-border)]"><table aria-label="자동 생성 보고서 목록" className="min-w-full border-collapse bg-white text-sm"><thead className="bg-[var(--color-cloud-veil)]"><tr>{["보고서","대상기간","생성일","버전","상태","생성 근거"].map(header=><th className="px-4 py-3 text-center" key={header}>{header}</th>)}</tr></thead><tbody>{actualRuns.map(run=><tr className="border-t" key={run.id}><td className="px-4 py-3 font-bold">{run.report_type==="MONTHLY_CASH"?"월별 자금입출금명세서":"분기별 실적보고서"}</td><td className="px-4 py-3">{run.period_start} ~ {run.period_end}</td><td className="px-4 py-3 text-center">{run.created_at.slice(0,10)}</td><td className="px-4 py-3 text-center">v{run.version}</td><td className="px-4 py-3 text-center">{run.status}</td><td className="px-4 py-3">{run.reason}</td></tr>)}{!actualRuns.length?<tr><td className="px-4 py-6 text-center" colSpan={6}>아직 보관된 보고서가 없어. 자동 생성 확인을 눌러줘.</td></tr>:null}</tbody></table></div>;
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
