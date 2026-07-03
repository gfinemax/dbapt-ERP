"use client";

import { Download, FileSpreadsheet, Landmark, Plus, RefreshCw, Search, Upload } from "lucide-react";
import { useState } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import {
  bankCardConnections,
  financeFilters,
  financeTransactions,
  formatKrw,
  getFinanceSummary,
} from "./finance-data";
import { createDocumentNo } from "./finance-numbering";

const statusClasses: Record<string, string> = {
  수입: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  지출: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  지출결의: "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]",
  환불: "bg-[var(--color-lilac-mist)] text-[var(--color-amethyst)]",
  승인완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  승인대기: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  작성중: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  반려: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  지급대기: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  지급완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  보류: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  검토중: "bg-[var(--color-lilac-mist)] text-[var(--color-amethyst)]",
  첨부완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  증빙미첨부: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  검토필요: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  매칭완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  입금미매칭: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  수기입력: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  정상: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  확인필요: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
};

const voucherMenuPath = ["전표·증빙관리", "수입·지출 전표관리", "추가", "내용입력", "저장", "증빙선택"];
const voucherWorkflows = [
  {
    title: "수입/지출 전표등록",
    description: "조합원 분담금 수납, 업체 지급, 토지매입비, 환불금 등 조합 자금거래를 구분해 입력합니다.",
  },
  {
    title: "조합원 미납금·업체 미지급금 확인",
    description: "조합원별 미납금과 협력업체 미지급금을 확인해 수납 예정표와 지급 예정표로 연결합니다.",
  },
  {
    title: "운영비·용역비 지출등록",
    description: "법무비, 세무비, 감정평가비, 업무대행비 등 조합 운영 지출을 계정과목 기준으로 등록합니다.",
  },
];
const addVoucherActions = [
  {
    description: "조합원 분담금, 이자수입 등 입금 전표를 작성합니다.",
    documentNo: createDocumentNo("INCOME_VOUCHER", 1, 2026),
    label: "수입전표",
  },
  {
    description: "지출 전 결재를 위한 결의서를 작성합니다.",
    documentNo: createDocumentNo("EXPENSE_RESOLUTION", 1, 2026),
    label: "지출결의서",
  },
  {
    description: "승인 완료 지출의 전표 초안을 확인하거나 수기 지출전표를 작성합니다.",
    documentNo: createDocumentNo("EXPENSE_VOUCHER", 1, 2026),
    label: "지출전표",
  },
  {
    description: "조합원 납입금 반환 등 환불 결의를 작성합니다.",
    documentNo: createDocumentNo("REFUND_RESOLUTION", 1, 2026),
    label: "환불결의",
  },
] as const;

function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[value] ?? "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]"}`}>
      {value}
    </span>
  );
}

export function FinanceListPage() {
  const summary = getFinanceSummary();
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  return (
    <ErpShell activeDetailLabel="수입·지출 전표관리" activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
              회계/자금 &gt; 전표·증빙관리 &gt; 수입·지출 전표관리
            </p>
            <h1 className="text-3xl font-bold tracking-normal">수입·지출 전표관리</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
              조합원 분담금 수납, 협력업체 지급, 운영비 지출, 토지매입비, 환불금 등 조합의 자금거래를 전표와 증빙자료 기준으로 관리합니다.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <Button className="rounded-full" size="lg" variant="outline">
              <Upload className="size-4" />
              엑셀 가져오기
            </Button>
            <Button
              aria-expanded={isAddMenuOpen}
              aria-haspopup="menu"
              className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]"
              onClick={() => setIsAddMenuOpen((current) => !current)}
              size="lg"
            >
              <Plus className="size-4" />
              추가
            </Button>
            {isAddMenuOpen ? (
              <div
                aria-label="전표 추가 선택"
                className="absolute right-0 top-14 z-20 grid w-[360px] gap-2 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-3 shadow-[0_18px_45px_rgba(16,20,24,0.16)]"
                role="menu"
              >
                {addVoucherActions.map((action) => (
                  <button
                    className="rounded-xl border border-[var(--color-soft-border)] bg-white px-4 py-3 text-left transition hover:bg-[var(--color-cloud-veil)]"
                    key={action.label}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold">{action.label}</span>
                      <span className="rounded-full bg-[var(--color-morning-tint)] px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
                        {action.documentNo}
                      </span>
                    </span>
                    <span className="mt-1 block break-keep text-xs leading-5 text-[var(--color-stone)]">{action.description}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-lg font-bold">업무흐름</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {voucherWorkflows.map((workflow) => (
                <div className="rounded-xl border border-[var(--color-soft-border)] bg-white p-4" key={workflow.title}>
                  <p className="text-sm font-bold">{workflow.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">{workflow.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {voucherMenuPath.map((step, index) => (
                <span className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-1.5 text-xs font-semibold text-[var(--color-stone)]" key={step}>
                  {index + 1}. {step}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-lg font-bold">조합 회계 처리 사례</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-stone)]">
              법무법인 ○○에 동작구청 대응 및 업무대행계약 검토 관련 법무비 3,300,000원(부가세 포함)을 지급하고 세금계산서를 첨부했습니다.
            </p>
            <dl className="mt-4 grid gap-3 text-sm">
              <InfoLine label="증빙" value="세금계산서" />
              <InfoLine label="거래처" value="법무법인 ○○" />
              <InfoLine label="금액" value="3,300,000원" />
            </dl>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <SummaryTile
            description="이번 달 또는 선택 기간 내 조합원 분담금 수납액"
            label="분담금 수납액"
            value={formatKrw(summary.totalInflow)}
          />
          <SummaryTile
            description="선택 기간 내 지급 완료된 지출 총액"
            label="지출 집행액"
            value={formatKrw(summary.totalOutflow)}
          />
          <SummaryTile
            description="승인 필요 상태의 지출결의서"
            label="지출결의 승인대기"
            value={`${summary.pendingApprovals}건`}
          />
          <SummaryTile
            description="은행 입금내역 중 조합원과 아직 연결되지 않은 건"
            label="입금 미매칭"
            value={`${summary.unmatchedIntegrations}건`}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)] xl:w-[420px]">
                  <Search className="size-4 shrink-0" />
                  <span>조합원명, 업체명, 전표번호, 결의서번호, 증빙, 계정과목 검색</span>
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
                <span className="font-semibold text-[var(--color-midnight-ink)]">수입·지출 전표관리</span>
                <span>기간검색 · 추가 · 내용입력 · 저장 · 증빙선택 · 출력 · 엑셀</span>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-soft-border)] p-4">
                <h2 className="text-lg font-bold">수입·지출 전표자료</h2>
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
                      <th className="px-4 py-3 text-center">날짜</th>
                      <th className="px-4 py-3 text-center">구분</th>
                      <th className="px-4 py-3 text-center">조합원/업체</th>
                      <th className="px-4 py-3 text-center">계정과목</th>
                      <th className="px-4 py-3 text-center">적요</th>
                      <th className="px-4 py-3 text-center">공급가액</th>
                      <th className="px-4 py-3 text-center">부가세</th>
                      <th className="px-4 py-3 text-center">합계</th>
                      <th className="px-4 py-3 text-center">자금계좌</th>
                      <th className="px-4 py-3 text-center">승인</th>
                      <th className="px-4 py-3 text-center">증빙</th>
                      <th className="px-4 py-3 text-center">연동</th>
                      <th className="px-4 py-3 text-center">작업</th>
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
                <h2 className="text-lg font-bold">은행·카드 연동</h2>
                <p className="mt-1 text-sm text-[var(--color-stone)]">등록된 계좌와 카드의 거래내역을 불러와 수입·지출 전표와 매칭합니다.</p>
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

function SummaryTile({ description, label, value }: { description: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
      <p className="break-keep text-sm font-semibold text-[var(--color-stone)]">{label}</p>
      <p className="mt-3 whitespace-nowrap text-2xl font-bold">{value}</p>
      <p className="mt-2 break-keep text-sm leading-5 text-[var(--color-stone)]">{description}</p>
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
