"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAccountingDraft } from "@/app/finance/accounting-actions";
import type { AccountingWorkspace } from "./accounting-workspace-repository";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const primary = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";
const money = (value: number | null) => value === null ? "금액 확인 필요" : `${Number(value).toLocaleString("ko-KR")}원`;
const sourceLabels = { RECOGNITION: "거래 발생", PAYMENT: "실제 지급·회수", TRANSFER: "계좌 간 이체" };
type Voucher = AccountingWorkspace["vouchers"][number];
type Source = AccountingWorkspace["sources"][number];
type LineInput = { key: string; account_subject_id: string | null; description: string; debit_amount: number; credit_amount: number };

function DraftEditor({ workspace, voucher, initialSource, onSaved, onClose }: { workspace: AccountingWorkspace; voucher?: Voucher; initialSource?: Source; onSaved: (id: string) => void; onClose: () => void }) {
  const router = useRouter();
  const [baseVoucher] = useState(voucher);
  const [source, setSource] = useState<Source | undefined>(() => initialSource ?? workspace.sources.find(s => s.kind === voucher?.source_kind && s.id === voucher?.source_id));
  const [lines, setLines] = useState<LineInput[]>(() => (voucher?.lines ?? []).map(l => ({ key: l.id, account_subject_id: l.account_subject_id, description: l.description, debit_amount: Number(l.debit_amount), credit_amount: Number(l.credit_amount) })));
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const keys = useRef(new Map<string, string>());
  const busy = useRef(false);
  const currentSource = workspace.sources.find(s => s.kind === source?.kind && s.id === source?.id);
  const conflict = (baseVoucher && voucher?.lock_version !== baseVoucher.lock_version) || (source && currentSource?.signature !== source.signature);
  function editLine(index: number, field: keyof Omit<LineInput, "key">, value: string | number | null) { setLines(lines.map((l, i) => i === index ? { ...l, [field]: value } : l)); }
  const debit = lines.reduce((total, l) => total + l.debit_amount, 0);
  const credit = lines.reduce((total, l) => total + l.credit_amount, 0);
  return <section className={`${card} space-y-4`} aria-label="전표 초안 작성"><h2 className="text-xl font-bold">{voucher ? `${voucher.voucher_no} 초안 수정` : "원본에서 전표 초안 작성"}</h2>
    <p className="text-sm text-slate-600">계정은 원본의 회계 처리 근거를 확인해서 선택해. 빈 계정이나 분개 차이는 초안으로 보관할 수 있고, 확정 실적에는 반영되지 않아.</p>
    {conflict && <p role="alert" className="rounded-lg bg-amber-50 p-3">다른 변경이 저장됐어. 입력 내용은 유지했으니 편집을 닫고 최신 원본·전표를 확인한 뒤 다시 열어줘.</p>}
    <form className="space-y-4" onSubmit={event => {
      event.preventDefault(); if (busy.current || !source || source.blocked_reason || conflict) return;
      const data = new FormData(event.currentTarget);
      const command = baseVoucher ? "DRAFT_SAVE" : "DRAFT_CREATE";
      const input = { ...(baseVoucher ? { id: baseVoucher.id, lock_version: baseVoucher.lock_version } : { source_kind: source.kind, source_id: source.id }), source_signature: source.signature, voucher_date: String(data.get("voucher_date")), memo: String(data.get("memo")), lines: lines.map(line => ({ account_subject_id: line.account_subject_id, description: line.description, debit_amount: line.debit_amount, credit_amount: line.credit_amount })) };
      const signature = JSON.stringify({ command, input }); const key = keys.current.get(signature) ?? crypto.randomUUID(); keys.current.set(signature, key);
      busy.current = true; setError("");
      start(async () => { try { const result = await saveAccountingDraft(command, input, key); router.refresh(); onSaved(result.id); } catch(cause) { setError(cause instanceof Error ? cause.message : "초안 저장 실패"); } finally { busy.current = false; } });
    }}>
      <div className="grid gap-3 sm:grid-cols-2"><label className="sm:col-span-2">연결할 원본<select className={field} value={source ? `${source.kind}:${source.id}` : ""} disabled={Boolean(baseVoucher)} onChange={e => setSource(workspace.sources.find(s => `${s.kind}:${s.id}` === e.target.value))} required><option value="">거래·지급·이체 원본 선택</option>{workspace.sources.filter(s => !s.blocked_reason && (!s.existing_voucher_id || s.existing_voucher_id === voucher?.id)).map(s => <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>{sourceLabels[s.kind]} · {s.number} · {s.title} · {money(s.amount)}</option>)}</select></label>
      <label>회계 귀속일<input type="date" className={field} name="voucher_date" defaultValue={voucher?.voucher_date ?? ""} required /></label><label>검토 메모·처리 근거<input className={field} name="memo" defaultValue={voucher?.memo ?? ""} required /></label></div>
      {source && <p className="text-sm text-slate-600">원본: {source.title} · {money(source.amount)} · 발생·지급일 {source.occurred_at || "원본 일자 확인 필요"}</p>}
      <div className="space-y-3">{lines.map((line, index) => <fieldset key={line.key} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-4"><legend className="px-2 text-sm font-semibold">분개 {index + 1}</legend>
        <label>계정과목<select className={field} value={line.account_subject_id ?? ""} onChange={e => editLine(index, "account_subject_id", e.target.value || null)}><option value="">계정 검토 필요</option>{workspace.accounts.filter(a => a.is_active || a.id === line.account_subject_id).map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}{a.is_active ? "" : " · 사용 중지"}</option>)}</select></label>
        <label>적요<input className={field} value={line.description} onChange={e => editLine(index, "description", e.target.value)} /></label><label>차변<input className={field} type="number" min="0" step="1" value={line.debit_amount || ""} onChange={e => editLine(index, "debit_amount", Number(e.target.value))} /></label><label>대변<input className={field} type="number" min="0" step="1" value={line.credit_amount || ""} onChange={e => editLine(index, "credit_amount", Number(e.target.value))} /></label>
        <button className={secondary} type="button" onClick={() => setLines(lines.filter(l => l.key !== line.key))}>분개 {index + 1} 삭제</button></fieldset>)}</div>
      <button type="button" className={secondary} onClick={() => setLines([...lines, { key: crypto.randomUUID(), account_subject_id: null, description: "", debit_amount: 0, credit_amount: 0 }])}>분개 추가</button>
      <p className="rounded-lg bg-slate-50 p-3">차변 {money(debit)} · 대변 {money(credit)} · 차이 {money(debit - credit)}</p>
      <div className="flex gap-3"><button className={primary} disabled={pending || !source || Boolean(source.blocked_reason) || Boolean(conflict)}>초안 저장</button><button type="button" className={secondary} onClick={onClose} disabled={pending}>편집 닫기</button></div><p role="status">{error}</p>
    </form>
  </section>;
}

export function AccountingWorkspacePage({ workspace, initialVoucherId = "" }: { workspace: AccountingWorkspace; initialVoucherId?: string }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialVoucherId);
  const [editing, setEditing] = useState<string | null>(null);
  const [newSource, setNewSource] = useState<Source | undefined>();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const canDraft = workspace.viewer.permissions.some(p => p === "ADMIN" || p === "APPROVE");
  const selected = workspace.vouchers.find(v => v.id === selectedId);
  const visible = workspace.vouchers.filter(v => `${v.voucher_no} ${v.memo ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (filter === "ALL" || (filter === "MANAGED" ? v.managed : filter === "LEGACY" ? !v.managed : v.source_stale)));
  function choose(id: string) { setSelectedId(id); router.replace(`/finance?voucherId=${encodeURIComponent(id)}`, { scroll: false }); }
  return <div className="space-y-5"><header className={card}><h1 className="text-3xl font-bold">수입·지출 전표관리</h1><p className="mt-2 text-slate-600">실제 저장된 차변·대변 전표와 연결 원본을 확인해. 거래 발생과 실제 지급은 각각 구분해 기록해.</p><div className="mt-3 flex flex-wrap gap-3"><Link className={secondary} href="/finance/expense-resolutions">지출 등록·조회</Link><Link className={secondary} href="/finance/payments">실제 지급 내역</Link><Link className={secondary} href="/basic-info?section=account-subjects">계정과목 관리</Link>{canDraft && <button className={primary} onClick={() => { setNewSource(undefined); setEditing(`new:${crypto.randomUUID()}`); }}>원본 연결 초안 작성</button>}</div></header>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">회계 확정·정정 권한과 처리 정책을 확인 중이야. 현재 연결 초안은 저장·검토할 수 있고 확정 실적에는 포함되지 않아. 기존 전표의 번호·분개·승인 상태는 보존돼.</p>
    {editing && canDraft && <DraftEditor key={editing} workspace={workspace} voucher={workspace.vouchers.find(v => v.id === editing)} initialSource={newSource} onClose={() => setEditing(null)} onSaved={id => { setEditing(null); choose(id); }} />}
    <section className={card}><div className="grid gap-3 sm:grid-cols-2"><label>전표 검색<input className={field} value={search} onChange={e => setSearch(e.target.value)} placeholder="전표번호·검토 메모" /></label><label>조회 구분<select className={field} value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">전체</option><option value="MANAGED">연결 전표</option><option value="LEGACY">기존 전표</option><option value="STALE">원본 변경 확인 필요</option></select></label></div><h2 className="my-4 font-bold">전표 {visible.length}건</h2><div className="space-y-2">{visible.map(v => <button className={`w-full rounded-xl border p-4 text-left ${v.id === selectedId ? "border-blue-500 bg-blue-50" : ""}`} key={v.id} aria-pressed={v.id === selectedId} onClick={() => choose(v.id)}><span className="flex flex-wrap justify-between gap-2"><strong>{v.voucher_no}</strong><span>{v.voucher_date} · {v.approval_status}</span></span><span className="mt-2 block text-sm">{v.memo || "메모 없음"} · {v.managed ? "원본 연결" : "기존 기록"}{v.source_stale ? " · 원본 변경 확인 필요" : ""}</span></button>)}{!visible.length && <p className="py-4">해당 조건의 전표가 없어.</p>}</div></section>
    {selected && <section className={`${card} space-y-3`} aria-label="전표 상세"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-bold">{selected.voucher_no}</h2>{canDraft && selected.managed && selected.approval_status === "승인대기" && <button className={secondary} onClick={() => { setNewSource(undefined); setEditing(selected.id); }}>연결 초안 수정</button>}</div><p>{selected.source_kind ? sourceLabels[selected.source_kind] : "기존 원본 연결·회계 분류 확인 필요"} · {selected.memo}</p><div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead><tr><th className="p-2">계정</th><th>적요</th><th>차변</th><th>대변</th></tr></thead><tbody>{selected.lines.map(l => <tr className="border-t" key={l.id}><td className="p-2">{workspace.accounts.find(a => a.id === l.account_subject_id)?.name ?? "계정 확인 필요"}</td><td>{l.description}</td><td>{money(l.debit_amount)}</td><td>{money(l.credit_amount)}</td></tr>)}</tbody></table></div></section>}
    <section className={card}><h2 className="text-lg font-bold">회계 연결할 원본</h2><p className="my-3 text-sm text-slate-600">이미 연결된 원본은 기존 전표로 이동해. 지급과 계좌이체의 실제 금액을 사용하고 계정을 자동 분류하지 않아.</p><div className="space-y-2">{workspace.sources.map(s => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" key={`${s.kind}:${s.id}`}><p>{sourceLabels[s.kind]} · {s.number} · {s.title} · {money(s.amount)}</p>{s.existing_voucher_id ? <button className={secondary} onClick={() => choose(s.existing_voucher_id!)}>연결 전표 확인</button> : s.blocked_reason ? <p role="status" className="text-sm text-amber-800">{s.blocked_reason}</p> : canDraft && <button className={secondary} onClick={() => { setNewSource(s); setEditing(`new:${crypto.randomUUID()}`); }}>이 원본으로 초안 작성</button>}</div>)}</div></section>
  </div>;
}
