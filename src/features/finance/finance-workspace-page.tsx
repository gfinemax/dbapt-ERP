"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { financeTaskLabels, type FinanceTaskKind, type FinanceTaskWorkspace } from "./finance-workspace-domain";

export function FinanceWorkspacePage({ workspace, initialTask = "ALL" }: { workspace: FinanceTaskWorkspace; initialTask?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState(Object.hasOwn(financeTaskLabels, initialTask) ? initialTask : "ALL");
  const [search, setSearch] = useState("");
  const kinds = (Object.keys(financeTaskLabels) as FinanceTaskKind[]).filter(kind => workspace.staff || ["MY_APPROVAL", "UNCONNECTED", "APPROVAL"].includes(kind));
  const rows = workspace.tasks.filter(row => (selected === "ALL" || row.kind === selected) && `${row.title} ${row.detail}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  function select(kind: string) {
    setSelected(kind); const query = new URLSearchParams(window.location.search);
    if (kind === "ALL") query.delete("task"); else query.set("task", kind);
    window.history.replaceState(null, "", `/finance/workspace${query.size ? `?${query}` : ""}`);
  }
  return <div className="space-y-5"><header className="rounded-2xl border bg-white p-5"><h1 className="text-3xl font-bold">업무현황</h1><p className="mt-2 text-slate-600">지출 원본·신탁·지급·회계에서 확인할 업무를 모았어. 항목을 선택하면 해당 목록을 볼 수 있어.</p><p className="mt-2 text-sm">{workspace.staff ? "조직의 처리 대상이야. 승인대기 건수는 나에게 배정된 결재 건수와 달라." : "본인이 신청한 개인 대납 정산과 본인에게 지정된 기안 결재만 표시돼."} 같은 원본에 여러 업무가 있을 수 있어.</p><button className="mt-3 rounded-lg border px-3 py-2" onClick={() => router.refresh()}>최신 자료 새로고침</button></header>
    <section aria-label="처리할 업무" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{kinds.map(kind => {
      const failed = workspace.unavailable.find(item => item.kind === kind);
      const count = workspace.tasks.filter(task => task.kind === kind).length;
      return <button key={kind} onClick={() => select(kind)} aria-label={`${financeTaskLabels[kind]} ${failed ? "조회 실패" : `${count}건`}`} aria-pressed={selected === kind} className={`rounded-2xl border p-5 text-left ${selected === kind ? "border-blue-600 bg-blue-50" : "bg-white"}`}><span>{financeTaskLabels[kind]}</span><strong className="mt-2 block text-2xl">{failed ? "조회 실패" : `${count}건`}</strong></button>;
    })}</section>
    <section className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold">{selected === "ALL" ? "전체 확인 업무" : financeTaskLabels[selected as FinanceTaskKind]}</h2><button className="rounded-lg border px-3 py-2" aria-pressed={selected === "ALL"} onClick={() => { select("ALL"); setSearch(""); }}>전체 보기·검색 초기화</button><label className="ml-auto">업무 검색<input className="ml-2 rounded-lg border px-3 py-2" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      {workspace.unavailable.filter(item => selected === "ALL" || item.kind === selected).map(item => <p key={item.kind} role="alert" className="mt-3 rounded-lg bg-amber-50 p-3">{financeTaskLabels[item.kind]}: {item.message}</p>)}
      <p className="my-3">조회된 업무 중 {rows.length}건</p><ul className="divide-y">{rows.map(row => <li key={row.id} className="py-4"><Link className="font-semibold text-blue-800 underline" href={row.href}>{row.title}</Link><p className="mt-1 text-sm text-slate-600">{financeTaskLabels[row.kind]} · {row.detail}</p></li>)}</ul>{!rows.length && <p className="py-5 text-slate-600">조회된 자료에서 조건에 맞는 업무가 없어.</p>}
    </section><p className="px-2 text-sm text-slate-600">수납·환급 원장, 선지급 통합 정산과 전체 회계 월 마감은 아직 이 집계에 포함되지 않아.</p></div>;
}
