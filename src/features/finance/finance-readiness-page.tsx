import Link from "next/link";
import type { FinanceReadiness } from "./finance-readiness";

const card = "rounded-xl border border-slate-200 bg-white p-4";
const queueItems = [
  ["cardLinkPending", "카드내역 연결 대기", "/finance/quick-expenses?method=corporate-card"],
  ["evidencePending", "증빙 보완 대기", "/finance/evidence"],
  ["resolutionRequired", "지출결의 전환 필요", "/finance/expenses?type=quick"],
  ["personalPaymentPending", "개인 선지출 지급 대기", "/finance/payments?tab=UNPAID"],
  ["advanceSettlementOpen", "선지급 사용정산 진행 중", "/finance/advance-settlements"],
  ["operatingPeriodOpen", "월 운영비 정산 진행 중", "/finance/trust?view=operating-settlement"],
  ["routeUnclassified", "처리경로 미분류", "/finance/expenses"],
] as const;

function SetupCard({ ready, title, detail, href }: { ready: boolean; title: string; detail: string; href: string }) {
  return <article className={card}>
    <div className="flex items-start justify-between gap-3"><h2 className="font-bold">{title}</h2><span className={`rounded-full px-2 py-1 text-xs font-bold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{ready ? "준비됨" : "확인 필요"}</span></div>
    <p className="mt-2 text-sm text-slate-600">{detail}</p>
    <Link className="mt-3 inline-block text-sm font-semibold text-blue-700 underline" href={href}>{ready ? "설정 보기" : "설정하러 가기"}</Link>
  </article>;
}

export function FinanceReadinessPage({ readiness }: { readiness: FinanceReadiness }) {
  const { configuration, queues } = readiness;
  return <main className="space-y-5">
    <header className="rounded-2xl border bg-white p-6"><p className="text-sm font-bold text-blue-700">회계/자금 운영 점검</p><h1 className="mt-1 text-3xl font-bold">운영 준비 점검</h1><p className="mt-2 text-sm text-slate-600">설정 누락과 현재 처리 대기를 구분해서 보여줘. 대기 건수는 오류가 아니라 담당자가 이어서 처리할 업무야.</p></header>
    <section aria-labelledby="setup-heading"><h2 id="setup-heading" className="mb-3 text-xl font-bold">필수 설정</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SetupCard ready={configuration.missingRoles.length === 0} title="담당 역할" detail={`${configuration.activeStaff}명 활성 · ${configuration.missingRoles.length ? `${configuration.missingRoles.join("·")} 역할 없음` : "관리·승인·지급·마감 담당 있음"}`} href="/finance/reimbursements?tab=members" />
      <SetupCard ready={configuration.verifiedTrustContracts > 0} title="신탁 계약" detail={`확인 완료 계약 ${configuration.verifiedTrustContracts}건`} href="/finance/workflow-settings" />
      <SetupCard ready={configuration.operatingFundContracts > 0} title="월 운영비 기준" detail={`운영비 사용 가능 계약 ${configuration.operatingFundContracts}건`} href="/finance/workflow-settings" />
      <SetupCard ready={configuration.currentYearBudgets > 0} title={`${readiness.fiscalYear}년 예산`} detail={`등록 예산항목 ${configuration.currentYearBudgets}건`} href="/finance/reimbursements?tab=budgets" />
    </div></section>
    <section aria-labelledby="queue-heading" className="rounded-2xl border bg-white p-5"><div className="flex items-end justify-between gap-3"><div><h2 id="queue-heading" className="text-xl font-bold">처리 대기</h2><p className="mt-1 text-sm text-slate-600">0건이면 현재 확인할 대기가 없는 상태야.</p></div><Link className="text-sm font-semibold text-blue-700 underline" href="/finance/workspace">업무현황 보기</Link></div>
      <div className="mt-4 divide-y">{queueItems.map(([key, label, href]) => <Link key={key} href={href} className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50"><span>{label}</span><strong>{queues[key].toLocaleString("ko-KR")}건 →</strong></Link>)}</div>
    </section>
  </main>;
}
