import Link from "next/link";
import type { MonthCloseWorkspace } from "./month-close-repository";

export function MonthClosePage({ workspace }: { workspace: MonthCloseWorkspace }) {
  const month = workspace.month.slice(0, 7);
  const total = workspace.checks.reduce((sum, check) => sum + Number(check.count), 0);
  return <main className="space-y-5">
    <header className="rounded-2xl border bg-white p-6">
      <p className="text-sm font-bold text-blue-700">전체 원본 통합 점검</p>
      <h1 className="mt-1 text-3xl font-bold">월 마감</h1>
      <p className="mt-2 text-sm text-slate-600">지출·계좌·전표·예산·선지급·신탁·수납·환급을 같은 월 기준으로 확인해. 건수는 금액 합계가 아니라 처리할 원본 수야.</p>
      <form className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">점검월<input className="ml-2 rounded-lg border px-3 py-2 font-normal" type="month" name="month" defaultValue={month} required /></label><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">점검 조회</button></form>
    </header>
    <section className={`rounded-2xl border p-5 ${workspace.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{workspace.ready ? "마감 준비 완료" : "마감 전 처리 필요"}</h2><p className="mt-1 text-sm">{workspace.ready ? "현재 연결된 원장에서 차단 항목을 찾지 못했어." : `${total.toLocaleString("ko-KR")}건의 원본을 확인해야 해.`}</p></div><span className="rounded-full bg-white px-3 py-2 text-sm font-bold">개인경비 접수월 상태 · {workspace.period_status ?? "미개설"}</span></div>
      <p className="mt-3 text-xs text-slate-600">이 화면은 원장 전체의 마감 준비 상태를 확인해. 회계기간 잠금은 조합의 확정된 회계정책과 재개방 권한이 정해진 뒤 별도 실행으로 제공해.</p>
    </section>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="월 마감 점검 항목">
      {workspace.checks.map((check) => <article className="rounded-2xl border bg-white p-5" key={check.key}><div className="flex items-start justify-between gap-3"><h2 className="font-bold">{check.label}</h2><span className={`rounded-full px-2 py-1 text-xs font-bold ${check.count ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-700"}`}>{check.count.toLocaleString("ko-KR")}건</span></div><p className="mt-2 text-sm text-slate-600">{check.count ? "연결된 원본에서 확인할 항목이 있어." : "현재 점검월에 확인할 대기가 없어."}</p><Link className="mt-3 inline-block text-sm font-semibold text-blue-700 underline" href={check.href}>{check.count ? "처리 화면으로 이동" : "원장 확인"} →</Link></article>)}
    </section>
  </main>;
}
