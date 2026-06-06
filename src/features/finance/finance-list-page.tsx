import { Download, FileSpreadsheet, Landmark, Plus, RefreshCw, Search, Upload } from "lucide-react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import {
  bankCardConnections,
  financeFilters,
  financeTransactions,
  formatKrw,
  getFinanceSummary,
} from "./finance-data";

const statusClasses: Record<string, string> = {
  입금: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  출금: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  승인완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  승인대기: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  검토중: "bg-[var(--color-lilac-mist)] text-[var(--color-amethyst)]",
  첨부완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  증빙미첨부: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  검토필요: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  매칭완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  연동미매칭: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  수기입력: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  정상: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  확인필요: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
};

function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[value] ?? "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]"}`}>
      {value}
    </span>
  );
}

export function FinanceListPage() {
  const summary = getFinanceSummary();

  return (
    <ErpShell activeLabel="회계/자금">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
              quickguide_4E 회계 흐름 반영
            </p>
            <h1 className="text-3xl font-bold tracking-normal">회계/자금 관리</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
              조합원 분담금, 토지비, 신탁·업무대행·시공 관련 지출을 전표와 은행/카드 거래내역 기준으로 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full" size="lg" variant="outline">
              <Upload className="size-4" />
              통장자료 불러오기
            </Button>
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" size="lg">
              <Plus className="size-4" />
              전표 추가
            </Button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <SummaryTile label="입금 합계" value={formatKrw(summary.totalInflow)} />
          <SummaryTile label="출금 합계" value={formatKrw(summary.totalOutflow)} />
          <SummaryTile label="승인대기 지출" value={`${summary.pendingApprovals}건`} />
          <SummaryTile label="연동 미매칭" value={`${summary.unmatchedIntegrations}건`} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)] xl:w-[420px]">
                  <Search className="size-4 shrink-0" />
                  <span>전표번호, 거래처, 계정 검색</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {financeFilters.map((filter) => (
                    <button
                      className="rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-stone)] first:bg-[var(--color-pressed-charcoal)] first:text-white"
                      key={filter}
                      type="button"
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 rounded-xl bg-[var(--color-cloud-veil)] px-4 py-3 text-sm text-[var(--color-stone)]">
                <span className="font-semibold text-[var(--color-midnight-ink)]">입출금 전표</span>
                <span>기간검색 · 증빙 · 엑셀 가져오기 · 출력 · 전자결재 연동 예정</span>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-soft-border)] p-4">
                <h2 className="text-lg font-bold">전표 목록</h2>
                <div className="flex flex-wrap gap-2">
                  <Button className="rounded-full" size="sm" variant="outline">
                    <FileSpreadsheet className="size-4" />
                    계정과목 관리
                  </Button>
                  <Button className="rounded-full" size="sm" variant="outline">
                    <Download className="size-4" />
                    엑셀
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                  <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
                    <tr>
                      <th className="px-4 py-3">날짜</th>
                      <th className="px-4 py-3">구분</th>
                      <th className="px-4 py-3">거래처</th>
                      <th className="px-4 py-3">계정과목</th>
                      <th className="px-4 py-3">적요</th>
                      <th className="px-4 py-3 text-right">공급가</th>
                      <th className="px-4 py-3 text-right">부가세</th>
                      <th className="px-4 py-3 text-right">합계</th>
                      <th className="px-4 py-3">결제장부</th>
                      <th className="px-4 py-3">승인</th>
                      <th className="px-4 py-3">증빙</th>
                      <th className="px-4 py-3">연동</th>
                      <th className="px-4 py-3 text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-soft-border)]">
                    {financeTransactions.map((transaction) => (
                      <tr className="bg-white/70" key={transaction.id}>
                        <td className="px-4 py-4 text-[var(--color-stone)]">{transaction.date}</td>
                        <td className="px-4 py-4">
                          <Badge value={transaction.type} />
                        </td>
                        <td className="px-4 py-4 font-semibold">{transaction.vendor}</td>
                        <td className="px-4 py-4">{transaction.accountTitle}</td>
                        <td className="px-4 py-4 text-[var(--color-stone)]">{transaction.description}</td>
                        <td className="px-4 py-4 text-right">{formatKrw(transaction.supplyAmount)}</td>
                        <td className="px-4 py-4 text-right">{formatKrw(transaction.vat)}</td>
                        <td className="px-4 py-4 text-right font-bold">{formatKrw(transaction.totalAmount)}</td>
                        <td className="px-4 py-4 text-[var(--color-stone)]">{transaction.paymentBook}</td>
                        <td className="px-4 py-4">
                          <Badge value={transaction.approvalStatus} />
                        </td>
                        <td className="px-4 py-4">
                          <Badge value={transaction.evidenceStatus} />
                        </td>
                        <td className="px-4 py-4">
                          <Badge value={transaction.integrationStatus} />
                        </td>
                        <td className="px-4 py-4 text-right">
                          <a className="font-semibold text-[var(--color-deep-cobalt)]" href={`/finance/${transaction.id}`}>
                            보기
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">은행/카드 연동</h2>
                <p className="mt-1 text-sm text-[var(--color-stone)]">계좌와 카드 승인내역을 전표와 매칭합니다.</p>
              </div>
              <Button aria-label="연동 새로고침" className="size-10 rounded-full p-0" variant="outline">
                <RefreshCw className="size-4" />
              </Button>
            </div>
            <div className="mt-5 space-y-3">
              {bankCardConnections.map((connection) => (
                <div className="rounded-xl border border-[var(--color-soft-border)] bg-white p-4" key={connection.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-bold">
                        <Landmark className="size-4 text-[var(--color-deep-cobalt)]" />
                        {connection.name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-stone)]">
                        {connection.provider} · {connection.accountNo}
                      </p>
                    </div>
                    <Badge value={connection.status} />
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <InfoLine label="잔액/이용액" value={formatKrw(connection.balance)} />
                    <InfoLine label="최근 동기화" value={connection.lastSyncedAt} />
                    <InfoLine label="미매칭" value={`${connection.unmatchedCount}건`} />
                  </dl>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </ErpShell>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
      <p className="text-sm font-semibold text-[var(--color-stone)]">{label}</p>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--color-stone)]">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
