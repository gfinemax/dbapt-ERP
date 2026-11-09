import { calculatePerformanceScore, performanceStatus, performanceTargetsMs, type PerformanceDashboard, type PerformanceMetricName, type PerformanceMetricSummary } from "./performance-metrics";

const metricLabels: Record<PerformanceMetricName, string> = {
  CLS: "화면 흔들림",
  FCP: "첫 화면 표시",
  INP: "클릭 반응",
  LCP: "주요 화면 표시",
  NAVIGATION: "메뉴 이동",
  ROUTE_READY: "업무 준비 완료",
  TTFB: "서버 첫 응답",
};

const routeLabels: Record<string, string> = {
  "/": "로그인·대시보드",
  "/finance/bank-transactions": "전체 거래내역",
  "/finance/bank-unmatched": "미매칭 거래 검토",
  "/finance/performance": "시스템 속도",
  "/finance/workspace": "업무 홈",
};

function formatValue(value: number, unit: string) {
  if (unit === "score") return value.toFixed(3);
  return `${Math.round(value).toLocaleString("ko-KR")}ms`;
}

function metricTone(metric: PerformanceMetricSummary) {
  if (metric.metricName === "CLS") return metric.p75 <= 0.1 ? "good" : metric.p75 <= 0.25 ? "warning" : "danger";
  const target = performanceTargetsMs[metric.metricName];
  if (!target) return "neutral";
  return metric.p75 <= target ? "good" : metric.p75 <= target * 1.5 ? "warning" : "danger";
}

const toneClasses = {
  danger: "bg-rose-50 text-rose-800",
  good: "bg-emerald-50 text-emerald-800",
  neutral: "bg-slate-100 text-slate-700",
  warning: "bg-amber-50 text-amber-900",
};

export function PerformanceDashboardPage({ dashboard }: { dashboard: PerformanceDashboard }) {
  const score = calculatePerformanceScore(dashboard.metrics);
  const status = performanceStatus(score);
  const routeReady = dashboard.metrics.find((metric) => metric.metricName === "ROUTE_READY");
  const interaction = dashboard.metrics.find((metric) => metric.metricName === "INP");
  return <main className="space-y-5">
    <header className="rounded-2xl border bg-white p-6">
      <p className="text-sm font-bold text-blue-700">회계·자금 · 연동·설정</p>
      <h1 className="mt-1 text-3xl font-bold">시스템 속도</h1>
      <p className="mt-2 text-sm text-slate-600">최근 {dashboard.days}일의 실제 사용 속도를 p50·p75·p95로 비교해. 검색어·계좌·금액 같은 업무자료는 수집하지 않아.</p>
    </header>
    <section aria-label="속도 요약" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">ERP 속도점수</p><div className="mt-2 flex items-end gap-2"><strong className="text-3xl">{score ?? "-"}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold ${toneClasses[status.tone]}`}>{status.label}</span></div></article>
      <article className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">업무 준비 완료 p75</p><strong className="mt-2 block text-3xl">{routeReady ? formatValue(routeReady.p75, routeReady.unit) : "-"}</strong></article>
      <article className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">클릭 반응 p75</p><strong className="mt-2 block text-3xl">{interaction ? formatValue(interaction.p75, interaction.unit) : "-"}</strong></article>
      <article className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">측정 범위</p><strong className="mt-2 block text-3xl">{dashboard.sampleCount.toLocaleString("ko-KR")}건</strong><p className="mt-1 text-xs text-slate-500">{dashboard.routeCount}개 화면</p></article>
    </section>
    {dashboard.sampleCount === 0 ? <section className="rounded-2xl border bg-white p-8 text-center"><h2 className="text-xl font-bold">아직 측정값이 없어</h2><p className="mt-2 text-sm text-slate-600">ERP를 사용하면 화면 표시·메뉴 이동·클릭 반응 시간이 자동으로 쌓여. 20건 이상부터 비교하는 걸 권장해.</p></section> : <>
      <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">전체 지표</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dashboard.metrics.map((metric) => <article className="rounded-xl border p-4" key={metric.metricName}><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{metricLabels[metric.metricName]}</h3><p className="mt-1 text-xs text-slate-500">표본 {metric.sampleCount.toLocaleString("ko-KR")}건</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${toneClasses[metricTone(metric)]}`}>p75 {formatValue(metric.p75, metric.unit)}</span></div><dl className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-slate-500">p50</dt><dd className="font-semibold">{formatValue(metric.p50, metric.unit)}</dd></div><div><dt className="text-slate-500">p75</dt><dd className="font-semibold">{formatValue(metric.p75, metric.unit)}</dd></div><div><dt className="text-slate-500">p95</dt><dd className="font-semibold">{formatValue(metric.p95, metric.unit)}</dd></div></dl></article>)}</div></section>
      <section className="overflow-hidden rounded-2xl border bg-white"><div className="p-5"><h2 className="text-xl font-bold">화면별 측정</h2><p className="mt-1 text-sm text-slate-600">p95가 큰 화면부터 원인을 확인하면 돼.</p></div><div className="overflow-x-auto"><table className="min-w-full border-t text-sm"><thead className="bg-slate-50 text-left"><tr><th className="px-4 py-3">화면</th><th className="px-4 py-3">지표</th><th className="px-4 py-3 text-right">표본</th><th className="px-4 py-3 text-right">p50</th><th className="px-4 py-3 text-right">p75</th><th className="px-4 py-3 text-right">p95</th></tr></thead><tbody className="divide-y">{dashboard.routes.map((row) => <tr key={`${row.route}:${row.metricName}`}><td className="px-4 py-3"><strong>{routeLabels[row.route] ?? row.route}</strong><span className="block text-xs text-slate-500">{row.route}</span></td><td className="px-4 py-3">{metricLabels[row.metricName]}</td><td className="px-4 py-3 text-right">{row.sampleCount.toLocaleString("ko-KR")}</td><td className="px-4 py-3 text-right">{formatValue(row.p50, row.unit)}</td><td className="px-4 py-3 text-right font-semibold">{formatValue(row.p75, row.unit)}</td><td className="px-4 py-3 text-right">{formatValue(row.p95, row.unit)}</td></tr>)}</tbody></table></div></section>
    </>}
  </main>;
}
