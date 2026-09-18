"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { configureSmallExpenseRoles, createSmallExpenseAction, reviewSmallExpenses } from "@/app/approval/small-expense/actions";
import { reimbursementLogin } from "@/app/finance/reimbursements/actions";
import { SmallExpenseForm } from "./small-expense-form";
import { canConfirmSmallExpense, smallExpenseStatusLabels, summarizeSmallExpenses, type SmallExpense } from "./small-expense-domain";
import type { SmallExpenseWorkspace } from "./small-expense-repository";

const box = "rounded-2xl border border-[var(--color-soft-border)] bg-white p-5";
const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const button = "rounded-full bg-[var(--color-deep-cobalt)] px-5 py-2 text-sm font-bold text-white disabled:opacity-40";
const money = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const dateTime = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

export function SmallExpenseLogin({ error }: { error?: string }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [message, setMessage] = useState("");
  return <section className={`${box} mx-auto max-w-lg`}><h1 className="text-2xl font-bold">소액지출 로그인</h1><p className="my-4 text-sm">사무국장은 등록하고 조합장은 확인·확정합니다. 개인 지출 정산과 같은 계정을 사용합니다.</p>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); start(async () => { try { await reimbursementLogin(data); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "로그인하지 못했습니다."); } }); }}>
      <label>이메일<input className={`${input} w-full`} name="email" type="email" autoComplete="username" required /></label>
      <label>비밀번호<input className={`${input} w-full`} name="password" type="password" autoComplete="current-password" required /></label>
      <button className={button} disabled={pending}>로그인</button>
    </form><p role="alert" className="mt-3 text-sm">{message || error}</p></section>;
}

export function SmallExpensePage({ workspace: w, mode = "register", initialId }: { workspace: SmallExpenseWorkspace; mode?: "register" | "review"; initialId?: string }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]); const [verified, setVerified] = useState(false); const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<SmallExpense | undefined>(() => mode === "register" ? w.rows.find(r => r.id === initialId && ["PENDING", "RETURNED"].includes(r.reviewStatus) && !r.batchResolutionId) : undefined);
  const summary = summarizeSmallExpenses(w.rows); const director = w.roles?.director_id === w.member.user_id;
  const chair = mode === "review" && w.roles?.chair_id === w.member.user_id;
  const canRegister = mode === "register" && director; const admin = w.member.permissions.includes("ADMIN");
  const selectedRows = w.rows.filter(r => selected.includes(r.id));
  function run(fn: () => Promise<unknown>, success: string) {
    setMessage(""); start(async () => { try { await fn(); setMessage(success); setSelected([]); setVerified(false); setReason(""); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "처리하지 못했습니다."); } });
  }
  function review(command: "CONFIRM" | "RETURN" | "CANCEL") {
    run(() => reviewSmallExpenses(command, { items: selectedRows.map(r => ({ id: r.id, revision: r.revision })), evidence_verified: verified, reason }), command === "CONFIRM" ? "선택한 소액지출을 확정하고 예산에 반영했습니다." : "처리 사유와 이력을 저장했습니다.");
  }
  const canSelect = (r: SmallExpense) => chair ? canConfirmSmallExpense(r, w.member.user_id, w.roles) : canRegister && ["PENDING", "RETURNED"].includes(r.reviewStatus) && !r.batchResolutionId;
  const eligible = w.rows.filter(canSelect);
  return <>
    <header className={box}><div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-bold">{mode === "review" ? "소액지출 확인" : "소액지출 등록·보완"}</h1><p className="mt-2 text-sm text-slate-600">건당 {money(w.limit)} 이하 · 사무국장 등록 → 조합장 확인·확정 → 월별 자동 집계</p><p className="mt-2 text-sm">{w.member.display_name} · {director ? "사무국장" : w.roles?.chair_id === w.member.user_id ? "조합장" : "관리자"}</p></div>
    <form className="flex items-center gap-2">{mode === "review" && <input type="hidden" name="type" value="small" />}<label>사용월 <input aria-label="사용월" className={input} type="month" name="month" defaultValue={w.month} required /></label><button className={button}>조회</button></form></div></header>
    <nav className="flex flex-wrap gap-3 text-sm font-semibold" aria-label="소액지출 업무 이동"><Link className={input} href="/finance/expenses">지출관리</Link><Link className={input} href={`/finance/expenses/small?month=${w.month}`}>등록·보완 내역</Link><Link className={input} href={`/approval/inbox?type=small&month=${w.month}`}>통합 결재함에서 확인</Link></nav>
    {mode === "review" && director && <p className={box}>등록과 보완은 회계/자금의 지출관리에서 처리해줘. 같은 원본의 확인 결과가 이곳에도 반영돼.</p>}
    {!w.roles ? <p className={box}>담당자 지정이 필요합니다. 관리자가 아래에서 사무국장과 조합장 계정을 지정하면 사용할 수 있습니다.</p> : null}
    <section className={`${box} grid gap-4 sm:grid-cols-3`} aria-label="월별 집계"><div>확인·보완 대기<p className="mt-2 text-2xl font-bold">{summary.pendingCount}건</p></div><div>확정 내역<p className="mt-2 text-2xl font-bold">{summary.confirmedCount}건</p></div><div>확정 금액<p className="mt-2 text-2xl font-bold">{money(summary.confirmedAmount)}</p></div></section>
    {canRegister ? <section><h2 className="mb-3 text-lg font-bold">{editing ? "소액지출 보완" : "소액지출 등록"}</h2>{editing ? <button className="mb-3 text-sm underline" onClick={() => setEditing(undefined)}>새 내역 등록으로 돌아가기</button> : null}<SmallExpenseForm key={editing ? `${editing.id}:${editing.revision}` : "new"} initial={editing} limit={w.limit} members={w.members} budgets={w.budgets} sources={w.sources} userId={w.member.user_id} month={w.month} action={async data => { await createSmallExpenseAction(data); setEditing(undefined); router.refresh(); }} /></section> : null}
    <section className={box}><h2 className="text-lg font-bold">사용내역과 증빙</h2>
      {chair ? <p className="mt-2 text-sm text-slate-600">내용과 영수증을 확인한 뒤 여러 건을 선택해 한 번에 확정할 수 있습니다. 본인 사용·등록 건은 직접 확정할 수 없습니다.</p> : null}
      <div className="mt-4 space-y-3">{w.rows.length ? w.rows.map(row => <article id={`small-${row.id}`} className="scroll-mt-40 rounded-xl border border-slate-200 p-4" key={`${row.id}:${row.revision}`}>
        <div className="flex items-start gap-3"><input type="checkbox" className="mt-1" aria-label={`${row.description} 선택`} disabled={pending || !canSelect(row)} checked={selected.includes(row.id)} onChange={e => { setVerified(false); setSelected(ids => e.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id)); }} /><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><p className="font-bold">{row.description} · {money(row.amount)}</p><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{smallExpenseStatusLabels[row.reviewStatus]}</span></div><p className="mt-2 text-sm text-slate-600">{row.expenseDate} · {row.partnerName} · {row.accountSubjectName} · 사용자 {row.payerLabel}</p>
        <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">상세내역·증빙 보기</summary><div className="mt-2 space-y-2"><p>프로젝트: {row.projectName || "—"} / 비고: {row.memo || "—"}</p><p>예산: {w.budgets.find(b => b.id === row.budgetId)?.budget_item ?? "확인 필요"}</p><p>결제수단: {({ CASH: "조합 현금", BANK_TRANSFER: "조합 통장", CORPORATE_CARD: "법인카드" } as Record<string, string>)[row.paymentMethod ?? ""] ?? "확인 필요"}</p>{row.hasEvidence ? <a className="font-semibold underline" target="_blank" rel="noreferrer" href={`/approval/small-expense/evidence?id=${encodeURIComponent(row.id)}`}>영수증 열기</a> : <p>증빙 없음 — 보완 필요</p>}<p>내역번호: {row.id}</p>{row.batchResolutionId ? <Link className="underline" href="/finance/expense-resolutions">기존 일괄결의에서 처리 상태 확인</Link> : null}</div></details>
        {row.confirmedAt ? <p className="mt-2 text-sm text-green-800">확정: {row.confirmedLabel} · {dateTime(row.confirmedAt)}</p> : null}
        {row.reviewReason ? <p className="mt-2 text-sm text-amber-800">처리 사유: {row.reviewReason}</p> : null}
        {chair && row.reviewStatus === "PENDING" && (row.spenderId === w.member.user_id || row.registeredBy === w.member.user_id) ? <p className="mt-2 text-sm text-amber-800">본인 사용·등록 건입니다. 내부규정에 따른 다른 확인자가 필요합니다.</p> : null}
        {canRegister && canSelect(row) ? <button type="button" className="mt-3 text-sm underline" onClick={() => { setEditing(row); window.scrollTo({ top: 0, behavior: "smooth" }); }}>내역 보완</button> : null}
        </div></div></article>) : <p className="py-8 text-center text-slate-600">이 달에 등록된 소액지출이 없습니다.</p>}</div>
      {chair || canRegister ? <div className="mt-5 space-y-3 border-t pt-4"><button className="text-sm underline" disabled={pending || !eligible.length} onClick={() => { setSelected(selected.length ? [] : eligible.map(r => r.id)); setVerified(false); }}>{selected.length ? "선택 해제" : "처리 가능한 내역 전체 선택"}</button><p className="font-bold">선택 {selectedRows.length}건 · {money(selectedRows.reduce((sum, r) => sum + r.amount, 0))}</p>
      {chair ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} />선택한 내역의 업무 목적·금액·영수증을 확인했습니다.</label> : null}
      <input aria-label="처리 사유" className={`${input} w-full`} placeholder="보완 요청·등록 취소 사유" value={reason} onChange={e => setReason(e.target.value)} />
      <div className="flex flex-wrap gap-3">{chair ? <><button className={button} disabled={pending || !selectedRows.length || !verified} onClick={() => review("CONFIRM")}>선택 내역 확정</button><button className={input} disabled={pending || !selectedRows.length || !reason.trim()} onClick={() => review("RETURN")}>보완 요청</button></> : <button className={input} disabled={pending || !selectedRows.length || !reason.trim()} onClick={() => review("CANCEL")}>선택 등록 취소</button>}</div></div> : null}
      <p role="status" className="mt-4 text-sm">{pending ? "처리 중…" : message}</p>
    </section>
    <section className={box}><h2 className="text-lg font-bold">{w.month} 계정과목별 확정 집계</h2><p className="mt-2 text-sm text-slate-600">확정된 내역만 합산합니다. 별도 월별 지출결의서는 생성하지 않습니다.</p><table className="mt-4 w-full text-sm"><thead><tr><th className="text-left">계정과목</th><th>건수</th><th className="text-right">금액</th></tr></thead><tbody>{summary.accounts.map(a => <tr key={a.name}><td className="py-2">{a.name}</td><td className="text-center">{a.count}</td><td className="text-right">{money(a.amount)}</td></tr>)}</tbody></table><a className="mt-4 inline-block text-sm underline" href={`/finance/reimbursements?tab=budgets&month=${w.month}`}>통합 예산·월 마감 확인</a></section>
    <details className={box}><summary className="cursor-pointer font-bold">최근 처리 이력 (50건)</summary>{w.audits.map(a => <p className="mt-3 text-sm" key={a.id}>{dateTime(a.created_at)} · {a.actor_label} · {({ SUBMIT: "등록·보완", CONFIGURE: "담당자 지정", CONFIRM: "확정", RETURN: "보완 요청", CANCEL: "등록 취소" } as Record<string, string>)[a.action] ?? a.action} · {a.reason}{a.expense_id ? ` · ${a.expense_id}` : ""}</p>)}</details>
    {admin ? <details className={box} open={!w.roles}><summary className="cursor-pointer font-bold">소액지출 담당자 지정</summary><p className="my-3 text-sm">서로 다른 활성 계정이 필요합니다. <Link className="underline" href="/finance/reimbursements?tab=settings">계정·권한 관리</Link>에서 계정을 먼저 등록해주세요.</p><form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); run(() => configureSmallExpenseRoles(data), "담당자를 지정했습니다."); }}>
      <label>사무국장 (등록)<select className={`${input} w-full`} name="director_id" defaultValue={w.roles?.director_id ?? ""} required><option value="">선택</option>{w.members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
      <label>조합장 (확인·확정)<select className={`${input} w-full`} name="chair_id" defaultValue={w.roles?.chair_id ?? ""} required><option value="">선택</option>{w.members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
      <input className={input} name="reason" aria-label="담당자 지정 사유" placeholder="내부규정·담당자 지정 근거" required /><button className={button} disabled={pending}>담당자 저장</button>
    </form></details> : null}
  </>;
}
