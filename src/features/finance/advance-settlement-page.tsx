"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAdvanceSettlementDraft } from "@/app/finance/advance-settlements/actions";
import type { AdvanceCandidate, AdvanceDraft, AdvanceWorkspace } from "./advance-settlement-repository";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2";
const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";
const money = (value: number | null) => value === null ? "확인 필요" : `${Number(value).toLocaleString("ko-KR")}원`;
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
const sourceKey = (kind: string, id: string) => `${kind}:${id}`;

function AdvanceEditor({ workspace, draft, close }: { workspace: AdvanceWorkspace; draft?: AdvanceDraft; close: () => void }) {
  const router = useRouter(); const [pending, start] = useTransition(); const busy = useRef(false); const keys = useRef(new Map<string, string>());
  // Preserve the opened version/source snapshot while editing; background refresh is not consent to overwrite.
  const [base] = useState(draft); const [candidate, setCandidate] = useState<AdvanceCandidate | undefined>(() => workspace.candidates.find(c => c.transaction_id === draft?.transaction_id));
  const [sources] = useState(workspace.usage_sources); const [title, setTitle] = useState(draft?.title ?? ""); const [memo, setMemo] = useState(draft?.memo ?? "");
  const [funding, setFunding] = useState<Record<string, string>>(() => Object.fromEntries((draft?.funding ?? []).map(f => [f.allocation_id, f.kind])));
  const [usage, setUsage] = useState<string[]>(() => (draft?.usage ?? []).map(u => sourceKey(u.source_kind, u.source_id)));
  const [evidence, setEvidence] = useState<Record<string, string>>(() => Object.fromEntries((draft?.usage ?? []).map(u => [sourceKey(u.source_kind, u.source_id), u.evidence_file_id ?? ""])));
  const [message, setMessage] = useState("");
  const current = workspace.drafts.find(d => d.id === base?.id);
  const changed = (base && current?.lock_version !== base.lock_version) || (candidate && workspace.candidates.find(c => c.transaction_id === candidate.transaction_id)?.signature !== candidate.signature);
  const options = sources.filter(s => !s.existing_draft_id || s.existing_draft_id === base?.id);
  return <section aria-label="선지급 정산 초안 편집" className={card}><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{draft ? "정산 초안 수정" : "정산 초안 작성"}</h2><button className={secondary} onClick={close} disabled={pending}>편집 닫기</button></div>
    {changed && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3">다른 변경이 있어. 입력 내용은 보존했어. 편집을 닫고 최신 원본을 다시 확인해줘.</p>}
    <form className="mt-4 space-y-4" onSubmit={event => {
      event.preventDefault(); if (busy.current || !candidate || changed) return;
      const selected = usage.map(key => sources.find(s => sourceKey(s.kind, s.id) === key));
      if (selected.some(s => !s)) { setMessage("사용 원본을 다시 조회하고 확인해줘."); return; }
      const input = { ...(base ? { id: base.id, lock_version: base.lock_version } : {}), transaction_id: candidate.transaction_id, source_signature: candidate.signature, title, memo,
        funding: candidate.allocations.map(a => ({ allocation_id: a.id, kind: funding[a.id] ?? "" })),
        usage: selected.map(s => ({ source_kind: s!.kind, source_id: s!.id, signature: s!.signature, evidence_file_id: evidence[sourceKey(s!.kind, s!.id)] || null })) };
      const signature = JSON.stringify(input); const key = keys.current.get(signature) ?? crypto.randomUUID(); keys.current.set(signature, key); busy.current = true; setMessage("");
      start(async () => { try { const result = await saveAdvanceSettlementDraft(input, key); router.replace(`/finance/advance-settlements?draft=${encodeURIComponent(result.id)}`, { scroll: false }); router.refresh(); close(); } catch (error) { setMessage(error instanceof Error ? error.message : "초안을 저장하지 못했어."); } finally { busy.current = false; } });
    }}>
      <label className="block">정산 제목<input className={field} required value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="block">실제 담당자 선지급 원본<select className={field} required value={candidate?.transaction_id ?? ""} disabled={!!base} onChange={e => { setCandidate(workspace.candidates.find(c => c.transaction_id === e.target.value)); setFunding({}); }}><option value="">확인된 실제 원지급 선택</option>{workspace.candidates.filter(c => !c.existing_draft_id || c.existing_draft_id === base?.id).map(c => <option key={c.transaction_id} value={c.transaction_id}>{c.number} · {c.title}</option>)}</select></label>
      {candidate && <div className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">실제 지급 배분 분류</h3><p className="text-sm text-slate-600">각 배분을 최초 선지급 또는 실제 추가 지급으로 직접 구분해. 다른 결의의 추가 지급은 아직 연결하지 않아.</p>{candidate.allocations.map(a => <label className="block" key={a.id}>{date(a.paid_at)} · {a.counterparty} · {money(a.amount)}<select aria-label={`${a.id} 지급 분류`} className={field} required value={funding[a.id] ?? ""} onChange={e => setFunding({ ...funding, [a.id]: e.target.value })}><option value="">분류 선택</option><option value="INITIAL">최초 선지급</option><option value="ADDITIONAL">실제 추가 지급</option></select></label>)}{candidate.legacy_review_required && <p className="text-amber-800">과거 지급 기준액과 현재 실제 배분의 대조가 필요해. 과거 승인금액은 자동 합산하지 않아.</p>}
        <h3 className="font-semibold">연결된 실제 반납</h3>{candidate.returns.length ? candidate.returns.map(r => <p key={r.id}>{date(r.paid_at)} · {money(r.amount)}</p>) : <p>원지급 배분에 연결된 실제 반납이 없어.</p>}
      </div>}
      <div className="space-y-3"><h3 className="font-semibold">기존 사용내역 선택</h3><p className="text-sm text-slate-600">사용일·금액이 확인된 원본을 선택해. 여기서 금액을 임의로 바꾸지 않아. 사용액은 아직 승인·예산 집행된 정산액이 아니야.</p>{options.map(s => { const key = sourceKey(s.kind, s.id); return <div className="rounded-lg border p-3" key={key}><label className="flex items-center gap-2"><input type="checkbox" checked={usage.includes(key)} onChange={e => setUsage(e.target.checked ? [...usage, key] : usage.filter(x => x !== key))} />{s.title} · {money(s.amount)} · 사용 {date(s.used_on)}</label>{usage.includes(key) && <label className="mt-2 block">사용 증빙<select className={field} value={evidence[key] ?? ""} onChange={e => setEvidence({ ...evidence, [key]: e.target.value })}><option value="">증빙 확인 필요 · 초안 저장 가능</option>{workspace.evidence.map(f => <option key={f.id} value={f.id}>{f.file_name}</option>)}</select></label>}</div>; })}{!options.length && <p>현재 선택할 수 있는 사용 원본이 없어.</p>}
        {options.filter(s => s.review_reason && usage.includes(sourceKey(s.kind, s.id))).map(s => <p key={sourceKey(s.kind, s.id)} className="text-amber-800">{s.title} · {s.review_reason}</p>)}
        {usage.filter(key => !options.some(s => sourceKey(s.kind, s.id) === key)).map(key => <p key={key} className="text-amber-800">현재 확인할 수 없는 사용 원본이 있어. <button type="button" className={secondary} onClick={() => setUsage(usage.filter(x => x !== key))}>초안에서 연결 해제</button></p>)}
        <p className="text-xs text-slate-600">증빙 선택은 통합 업무에 등록된 사용 증빙을 참조해. 증빙이 없으면 검토 필요 상태로 저장돼.</p>
      </div>
      <label className="block">검토 메모<textarea className={field} value={memo} onChange={e => setMemo(e.target.value)} /></label>
      <button className={button} disabled={pending || !candidate || !!changed}>정산 초안 저장</button>
    </form><p role="status" className="mt-3">{message}</p>
  </section>;
}

export function AdvanceSettlementPage({ workspace, initialDraftId }: { workspace: AdvanceWorkspace; initialDraftId?: string }) {
  const router = useRouter(); const canEdit = workspace.viewer.permissions.some(p => p === "ADMIN" || p === "APPROVE");
  const [selected, setSelected] = useState(initialDraftId ?? ""); const [editing, setEditing] = useState<string | null>(null);
  const draft = workspace.drafts.find(d => d.id === selected);
  return <div className="space-y-5"><header className={card}><h1 className="text-3xl font-bold">담당자 선지급 정산</h1><p className="mt-2">실제 선지급·반납·추가 지급과 초안 사용액을 구분해서 확인해.</p><div className="mt-4 flex flex-wrap gap-3"><Link className={secondary} href="/finance/reimbursements">개인 대납 정산</Link><Link className={secondary} href="/finance/payments">실제 지급 내역</Link>{canEdit && <button className={button} onClick={() => setEditing("new")}>정산 초안 작성</button>}</div></header>
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p>현재는 원본을 연결하고 초안을 검토하는 단계야. 정산 승인·완료, 예산 반영, 추가 지급 실행은 정책 확인 전까지 제한돼.</p><p className="mt-2 text-sm">실제 지급 배분이 없는 과거 지급완료 기록은 원장 대조가 필요해. 승인금액·작성일로 원금을 채우지 않아. 신탁 운영비 선교부와 담당자 선지급은 별개야.</p></section>
    {editing !== null && <AdvanceEditor key={editing} workspace={workspace} draft={workspace.drafts.find(d => d.id === editing)} close={() => setEditing(null)} />}
    <section className={card}><h2 className="text-xl font-bold">정산 초안 {workspace.drafts.length}건</h2><div className="mt-3 space-y-2">{workspace.drafts.map(d => <button className={`${secondary} block w-full text-left`} key={d.id} aria-pressed={selected === d.id} onClick={() => { setSelected(d.id); router.replace(`/finance/advance-settlements?draft=${encodeURIComponent(d.id)}`, { scroll: false }); }}>{d.title} · 초안 사용액 {money(d.totals.draft_used)} · 초안 차액 {money(d.totals.balance)}{d.needs_review ? " · 재검토 필요" : ""}</button>)}{!workspace.drafts.length && <p>저장된 정산 초안이 없어.</p>}</div></section>
    {draft && <section aria-label="선지급 정산 상세" className={card}><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{draft.title}</h2>{canEdit && <button className={secondary} onClick={() => setEditing(draft.id)}>초안 수정</button>}</div><p className="mt-2">{draft.memo}</p>
      <dl className="my-4 grid gap-4 sm:grid-cols-3">{[["최초 실제 선지급", draft.totals.initial_paid], ["실제 추가 지급", draft.totals.additional_paid], ["실제 반납", draft.totals.returned], ["초안 사용액", draft.totals.draft_used], ["초안 차액", draft.totals.balance]].map(([label, value]) => <div key={String(label)}><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 font-semibold">{money(value as number | null)}</dd></div>)}</dl>
      <p className="text-sm text-slate-600">차액 = 최초 실제 선지급 + 실제 추가 지급 − 실제 반납 − 초안 사용액. 차액이 0이어도 정산 완료가 아니야.</p>{draft.source_stale && <p className="mt-3 text-amber-800">원지급·반납 근거가 변경됐어. 최신 자료로 다시 검토해줘.</p>}{draft.needs_review && <p className="mt-3 text-amber-800">원본·증빙의 재검토가 필요해.</p>}
      <h3 className="mt-4 font-semibold">저장된 사용내역</h3><ul className="mt-2 space-y-2">{draft.usage.map(u => <li key={sourceKey(u.source_kind, u.source_id)}><Link className="underline" href={`/finance/expenses?source_kind=${u.source_kind}&source_id=${encodeURIComponent(u.source_id)}`}>{u.title}</Link> · {money(u.amount)} · {date(u.used_on)} · {u.evidence_file_id ? "증빙 연결" : "증빙 확인 필요"}</li>)}</ul><button disabled className={`${button} mt-4`}>정산 승인·완료 · 정책 확인 필요</button>
    </section>}
  </div>;
}
