"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cleanupCategoryLabels, type CleanupCategory, type DataCleanupWorkspace } from "./data-cleanup-domain";

const categories = Object.keys(cleanupCategoryLabels) as ("ALL" | CleanupCategory)[];
const styles: Record<CleanupCategory, string> = {
  CARD_LINK: "bg-amber-100 text-amber-900",
  EVIDENCE: "bg-orange-100 text-orange-900",
  RESOLUTION: "bg-violet-100 text-violet-900",
  BUDGET: "bg-blue-100 text-blue-900",
  ROUTE: "bg-slate-200 text-slate-800",
};

export function DataCleanupPage({ workspace }: { workspace: DataCleanupWorkspace }) {
  const [category, setCategory] = useState<"ALL" | CleanupCategory>("ALL");
  const [search, setSearch] = useState("");
  const counts = useMemo(() => Object.fromEntries(categories.map((key) => [key, key === "ALL" ? workspace.items.length : workspace.items.filter((item) => item.category === key).length])), [workspace.items]);
  const normalized = search.trim().toLocaleLowerCase();
  const items = workspace.items.filter((item) => (category === "ALL" || item.category === category) && `${item.title} ${item.detail} ${item.sourceKind} ${item.sourceId}`.toLocaleLowerCase().includes(normalized));
  return <main className="space-y-5">
    <header className="rounded-2xl border bg-white p-6"><p className="text-sm font-bold text-blue-700">원본 보존형 점검</p><h1 className="mt-1 text-3xl font-bold">기존 자료 정리</h1><p className="mt-2 text-sm text-slate-600">자동 수정하거나 숨기지 않고, 원본에서 확인할 항목과 해결 화면만 모아 보여줘. 같은 원본은 서로 다른 확인 사유로 여러 번 표시될 수 있어.</p></header>
    <section aria-label="정리 항목 필터" className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap gap-2">{categories.map((key) => <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)} className={`rounded-full border px-3 py-2 text-sm font-semibold ${category === key ? "border-slate-900 bg-slate-900 text-white" : "bg-white"}`}>{cleanupCategoryLabels[key]} {counts[key]}</button>)}</div><label className="mt-4 block max-w-xl text-sm font-semibold">원본 검색<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="제목·거래처·원본번호" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label></section>
    {workspace.truncated ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">항목이 많아 최근 자료부터 표시하고 있어. 검색 범위 확장이 필요하면 기간별 조회를 추가해줘.</p> : null}
    <section aria-label="기존 자료 확인 목록" className="overflow-hidden rounded-2xl border bg-white"><div className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-xl font-bold">확인 목록</h2><span className="text-sm text-slate-600">조회 결과 {items.length}건</span></div>{items.length ? <ul className="divide-y">{items.map((item) => <li key={item.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-bold ${styles[item.category]}`}>{cleanupCategoryLabels[item.category]}</span><span className="text-xs text-slate-500">{item.sourceKind} · {item.sourceId}</span></div><h3 className="mt-2 font-bold">{item.title}</h3><p className="mt-1 text-sm text-slate-600">{item.detail}</p><p className="mt-1 text-sm">{item.amount === null ? "금액 확인 필요" : `${item.amount.toLocaleString("ko-KR")}원`}{item.date ? ` · ${item.date.slice(0, 10)}` : " · 날짜 미지정"}</p></div><Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:border-blue-600 hover:text-blue-700" href={item.href}>{item.actionLabel} →</Link></li>)}</ul> : <p className="p-8 text-center text-slate-600">현재 조건에서 확인할 원본이 없어.</p>}</section>
  </main>;
}
