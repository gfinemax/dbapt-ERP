"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmAccountingDraftBatch, saveAccountingDraft } from "@/app/finance/accounting-actions";
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

function confirmationBlockReason(voucher: Voucher, workspace: AccountingWorkspace) {
  if (!voucher.managed || voucher.approval_status !== "승인대기" || !voucher.lock_version) return "확정 대상 초안이 아니야.";
  if (voucher.source_stale) return "원본이 변경돼 다시 검토해야 해.";
  const source = workspace.sources.find(item => item.kind === voucher.source_kind && item.id === voucher.source_id);
  if (!source || source.amount === null) return "연결 원본의 금액을 확인해야 해.";
  if (voucher.lines.length < 2) return "차변·대변 분개가 모두 필요해.";
  const activeAccounts = new Set(workspace.accounts.filter(account => account.is_active).map(account => account.id));
  if (voucher.lines.some(line => !line.account_subject_id || !activeAccounts.has(line.account_subject_id))) return "활성 계정과목이 지정되지 않은 분개가 있어.";
  if (voucher.lines.some(line => (Number(line.debit_amount) > 0) === (Number(line.credit_amount) > 0))) return "각 분개행은 차변 또는 대변 한쪽에 금액이 있어야 해.";
  const debit = voucher.lines.reduce((total, line) => total + Number(line.debit_amount), 0);
  const credit = voucher.lines.reduce((total, line) => total + Number(line.credit_amount), 0);
  if (debit <= 0 || debit !== credit) return "차변과 대변 합계가 일치하지 않아.";
  if (debit !== Number(source.amount)) return "분개 합계와 원본 금액이 일치하지 않아.";
  return null;
}

function voucherTotals(voucher: Voucher) {
  const debit = voucher.lines.reduce((total, line) => total + Number(line.debit_amount), 0);
  const credit = voucher.lines.reduce((total, line) => total + Number(line.credit_amount), 0);
  return { debit, credit, amount: Math.max(debit, credit) };
}

function voucherHasAccountIssue(voucher: Voucher, workspace: AccountingWorkspace) {
  const accountMap = new Map(workspace.accounts.map(account => [account.id, account]));
  return voucher.lines.some(line => !line.account_subject_id || !accountMap.get(line.account_subject_id)?.is_active);
}

function voucherReviewIssue(voucher: Voucher, workspace: AccountingWorkspace) {
  if (voucher.source_stale) return "원본 변경";
  if (voucher.lines.length < 2) return "분개 확인 필요";
  if (voucherHasAccountIssue(voucher, workspace)) return "계정 확인 필요";
  if (voucher.lines.some(line => (Number(line.debit_amount) > 0) === (Number(line.credit_amount) > 0))) return "차대 구분 확인";
  const totals = voucherTotals(voucher);
  if (totals.debit <= 0 || totals.debit !== totals.credit) return "차대 불일치";
  return null;
}

function statusBadge(value: string, tone: "blue" | "green" | "amber" | "slate" = "slate") {
  const tones = {
    blue: "bg-blue-100 text-blue-800",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-900",
    slate: "bg-slate-100 text-slate-700",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{value}</span>;
}

function VoucherDetailPanel({ canDraft, onEdit, selected, workspace }: { canDraft: boolean; onEdit: () => void; selected?: Voucher; workspace: AccountingWorkspace }) {
  const [tab, setTab] = useState<"LINES" | "SOURCE">("LINES");
  if (!selected) return <section className={`${card} flex min-h-72 items-center justify-center text-center text-sm text-slate-500`} aria-label="전표 상세"><p>왼쪽 목록에서 전표를 선택하면<br />분개와 연결 원본을 바로 확인할 수 있어.</p></section>;
  const totals = voucherTotals(selected);
  const issue = voucherReviewIssue(selected, workspace);
  const hasAccountIssue = voucherHasAccountIssue(selected, workspace);
  const source = workspace.sources.find(item => item.kind === selected.source_kind && item.id === selected.source_id);
  return <section className={`${card} space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto`} aria-label="전표 상세" key={selected.id}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">선택 전표</p><h2 className="mt-1 text-xl font-bold">{selected.voucher_no}</h2><p className="mt-1 text-sm text-slate-600">{selected.voucher_date} · {selected.memo || "메모 없음"}</p></div><div className="flex flex-wrap gap-2">{statusBadge(selected.approval_status, selected.approval_status === "승인완료" ? "green" : "blue")}{issue ? statusBadge(issue, "amber") : statusBadge("분개 정상", "green")}</div></div>
    <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-sm"><div><p className="text-xs text-slate-500">전표금액</p><strong>{money(totals.amount)}</strong></div><div><p className="text-xs text-slate-500">차변</p><strong>{money(totals.debit)}</strong></div><div><p className="text-xs text-slate-500">대변</p><strong>{money(totals.credit)}</strong></div></div>
    <div className="flex gap-2 border-b border-slate-200" role="tablist" aria-label="전표 상세 구분"><button className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === "LINES" ? "border-slate-900 text-slate-950" : "border-transparent text-slate-500"}`} onClick={() => setTab("LINES")} role="tab" aria-selected={tab === "LINES"}>분개</button><button className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === "SOURCE" ? "border-slate-900 text-slate-950" : "border-transparent text-slate-500"}`} onClick={() => setTab("SOURCE")} role="tab" aria-selected={tab === "SOURCE"}>원본·상태</button></div>
    {tab === "LINES" ? <div className="min-w-0 space-y-3" role="tabpanel"><table className="w-full table-fixed text-left text-xs sm:text-sm"><colgroup><col className="w-[25%]" /><col className="w-[37%]" /><col className="w-[19%]" /><col className="w-[19%]" /></colgroup><thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="px-1.5 py-2 sm:px-2">계정</th><th className="px-1.5 py-2 sm:px-2">적요</th><th className="px-1.5 py-2 text-right sm:px-2">차변</th><th className="px-1.5 py-2 text-right sm:px-2">대변</th></tr></thead><tbody>{selected.lines.map(line => <tr className="border-t border-slate-100 align-top" key={line.id}><td className="break-keep px-1.5 py-2 font-medium sm:px-2">{workspace.accounts.find(account => account.id === line.account_subject_id)?.name ?? <span className="text-amber-800">계정 확인 필요</span>}</td><td className="break-words px-1.5 py-2 sm:px-2">{line.description}</td><td className="whitespace-nowrap px-1.5 py-2 text-right tabular-nums sm:px-2">{money(line.debit_amount)}</td><td className="whitespace-nowrap px-1.5 py-2 text-right tabular-nums sm:px-2">{money(line.credit_amount)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 border-slate-200 font-bold"><td className="px-1.5 py-2 sm:px-2" colSpan={2}>합계</td><td className="whitespace-nowrap px-1.5 py-2 text-right sm:px-2">{money(totals.debit)}</td><td className="whitespace-nowrap px-1.5 py-2 text-right sm:px-2">{money(totals.credit)}</td></tr></tfoot></table>{hasAccountIssue ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">계정과목 연결이 필요해</p><p className="mt-1 leading-6">{selected.managed && selected.approval_status === "승인대기" ? "아래 ‘연결 초안 수정’에서 각 분개행의 계정과목을 선택해. 차변에는 지출 성격에 맞는 계정을, 대변에는 실제 결제수단과 연결된 예금·카드·미지급금 계정을 지정하면 돼." : "이 전표는 이미 확정된 기존 기록이므로 여기서 바로 덮어쓰지 않아. 계정과목을 등록한 뒤 변경 사유와 전후 값을 남기는 계정과목 정정 절차로 처리해야 해."}</p><Link className="mt-2 inline-flex font-bold text-blue-700 underline underline-offset-2" href="/basic-info?section=account-subjects">계정과목 관리 열기</Link></div> : null}</div> : <div className="space-y-3 text-sm" role="tabpanel"><dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-2"><dt className="text-slate-500">기록 구분</dt><dd className="font-semibold">{selected.managed ? "원본 연결 전표" : "기존 회계 기록"}</dd><dt className="text-slate-500">원본 종류</dt><dd>{selected.source_kind ? sourceLabels[selected.source_kind] : "기존 원본 연결 확인 필요"}</dd><dt className="text-slate-500">원본 자료</dt><dd>{source ? `${source.number ?? "번호 없음"} · ${source.title}` : "연결 원본 정보 없음"}</dd><dt className="text-slate-500">원본 금액</dt><dd>{source ? money(source.amount) : "확인 필요"}</dd><dt className="text-slate-500">원본 상태</dt><dd>{selected.source_stale ? "원본 변경 · 재검토 필요" : "변경 없음"}</dd></dl>{selected.managed && selected.approval_status === "승인대기" && issue ? <p className="rounded-lg bg-amber-50 p-3 font-semibold text-amber-900">확정 전 확인: {confirmationBlockReason(selected, workspace)}</p> : null}</div>}
    {canDraft && selected.managed && selected.approval_status === "승인대기" ? <button className={`${secondary} w-full`} onClick={onEdit}>연결 초안 수정</button> : null}
  </section>;
}

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
        <label>계정과목<select className={field} value={line.account_subject_id ?? ""} onChange={e => editLine(index, "account_subject_id", e.target.value || null)}><option value="">계정 검토 필요</option>{workspace.accounts.filter(a => a.is_active || a.id === line.account_subject_id).map(a => <option key={a.id} value={a.id}>{a.name}{a.is_active ? "" : " · 사용 중지"}</option>)}</select></label>
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
  const [selectedId, setSelectedId] = useState(initialVoucherId || workspace.vouchers[0]?.id || "");
  const [editing, setEditing] = useState<string | null>(null);
  const [newSource, setNewSource] = useState<Source | undefined>();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [workspaceTab, setWorkspaceTab] = useState<"VOUCHERS" | "SOURCES">("VOUCHERS");
  const [batchMode, setBatchMode] = useState(false);
  const [confirmationReason, setConfirmationReason] = useState("");
  const [confirmationError, setConfirmationError] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [selectedForConfirmation, setSelectedForConfirmation] = useState<string[]>([]);
  const [confirmationPending, startConfirmation] = useTransition();
  const confirmationKeys = useRef(new Map<string, string>());
  const confirmationBusy = useRef(false);
  const canDraft = workspace.viewer.permissions.some(p => p === "ADMIN" || p === "APPROVE");
  const canConfirm = canDraft && workspace.policy.confirmation_enabled;
  const selected = workspace.vouchers.find(v => v.id === selectedId);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visible = useMemo(() => workspace.vouchers.filter(voucher => {
    const source = workspace.sources.find(item => item.kind === voucher.source_kind && item.id === voucher.source_id);
    const searchable = `${voucher.voucher_no} ${voucher.memo ?? ""} ${source?.number ?? ""} ${source?.title ?? ""} ${voucher.lines.map(line => line.description).join(" ")}`.toLocaleLowerCase();
    const issue = voucherReviewIssue(voucher, workspace);
    const matchesFilter = filter === "ALL"
      || (filter === "CONFIRMED" && voucher.approval_status === "승인완료")
      || (filter === "DRAFT" && voucher.approval_status === "승인대기")
      || (filter === "REVIEW" && Boolean(issue))
      || (filter === "MANAGED" && voucher.managed)
      || (filter === "LEGACY" && !voucher.managed)
      || (filter === "STALE" && voucher.source_stale);
    return (!normalizedSearch || searchable.includes(normalizedSearch)) && matchesFilter;
  }), [filter, normalizedSearch, workspace]);
  const summary = useMemo(() => ({
    total: workspace.vouchers.length,
    confirmed: workspace.vouchers.filter(voucher => voucher.approval_status === "승인완료").length,
    drafts: workspace.vouchers.filter(voucher => voucher.approval_status === "승인대기").length,
    review: workspace.vouchers.filter(voucher => voucherReviewIssue(voucher, workspace)).length,
    sources: workspace.sources.filter(source => !source.existing_voucher_id).length,
  }), [workspace]);
  const selectedAmount = selectedForConfirmation.reduce((total, id) => {
    const voucher = workspace.vouchers.find(candidate => candidate.id === id);
    return total + (voucher ? voucherTotals(voucher).amount : 0);
  }, 0);
  function choose(id: string) { setSelectedId(id); router.replace(`/finance?voucherId=${encodeURIComponent(id)}`, { scroll: false }); }
  function toggleConfirmation(id: string) { setSelectedForConfirmation(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  function toggleBatchMode() {
    setBatchMode(current => {
      if (current) setSelectedForConfirmation([]);
      return !current;
    });
    setConfirmationError("");
    setConfirmationMessage("");
  }
  function submitConfirmation() {
    if (confirmationBusy.current || !canConfirm || !confirmationReason.trim() || selectedForConfirmation.length === 0) return;
    const items = selectedForConfirmation.map(id => {
      const voucher = workspace.vouchers.find(candidate => candidate.id === id);
      return { id, lock_version: voucher?.lock_version ?? 0 };
    });
    const input = { items, reason: confirmationReason.trim() };
    const signature = JSON.stringify(input);
    const key = confirmationKeys.current.get(signature) ?? crypto.randomUUID();
    confirmationKeys.current.set(signature, key);
    confirmationBusy.current = true;
    setConfirmationError("");
    setConfirmationMessage("");
    startConfirmation(async () => {
      try {
        const result = await confirmAccountingDraftBatch(input, key);
        setSelectedForConfirmation([]);
        setBatchMode(false);
        setConfirmationReason("");
        setConfirmationMessage(`${result.confirmed_count}건의 전표를 일괄 확인·확정했어.`);
        router.refresh();
      } catch (cause) {
        setConfirmationError(cause instanceof Error ? cause.message : "전표 일괄 확정에 실패했어.");
      } finally {
        confirmationBusy.current = false;
      }
    });
  }
  return <div className="space-y-4"><header className={card}><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">수입·지출 전표관리</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">저장된 회계 전표를 빠르게 비교하고, 분개·원본·확정 상태를 한 화면에서 확인해.</p></div>{canDraft ? <button className={primary} onClick={() => { setNewSource(undefined); setEditing(`new:${crypto.randomUUID()}`); }}>원본으로 전표 작성</button> : null}</div><div className="mt-4 flex flex-wrap gap-2"><Link className={secondary} href="/finance/expenses">지출 등록·조회</Link><Link className={secondary} href="/finance/payments">실제 지급 내역</Link><Link className={secondary} href="/basic-info?section=account-subjects">계정과목 관리</Link></div></header>
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" aria-label="전표 현황"><button className={`${card} p-4 text-left ${filter === "ALL" && workspaceTab === "VOUCHERS" ? "border-blue-400 bg-blue-50" : ""}`} onClick={() => { setWorkspaceTab("VOUCHERS"); setFilter("ALL"); }}><span className="text-xs text-slate-500">전체 전표</span><strong className="mt-1 block text-2xl">{summary.total}</strong></button><button className={`${card} p-4 text-left ${filter === "CONFIRMED" ? "border-emerald-300 bg-emerald-50" : ""}`} onClick={() => { setWorkspaceTab("VOUCHERS"); setFilter("CONFIRMED"); }}><span className="text-xs text-slate-500">확정</span><strong className="mt-1 block text-2xl">{summary.confirmed}</strong></button><button className={`${card} p-4 text-left ${filter === "DRAFT" ? "border-blue-300 bg-blue-50" : ""}`} onClick={() => { setWorkspaceTab("VOUCHERS"); setFilter("DRAFT"); }}><span className="text-xs text-slate-500">초안</span><strong className="mt-1 block text-2xl">{summary.drafts}</strong></button><button className={`${card} p-4 text-left ${filter === "REVIEW" ? "border-amber-300 bg-amber-50" : ""}`} onClick={() => { setWorkspaceTab("VOUCHERS"); setFilter("REVIEW"); }}><span className="text-xs text-slate-500">검토 필요</span><strong className="mt-1 block text-2xl">{summary.review}</strong></button><button className={`${card} col-span-2 p-4 text-left sm:col-span-1 ${workspaceTab === "SOURCES" ? "border-violet-300 bg-violet-50" : ""}`} onClick={() => setWorkspaceTab("SOURCES")}><span className="text-xs text-slate-500">원본 연결 대기</span><strong className="mt-1 block text-2xl">{summary.sources}</strong></button></section>
    {editing && canDraft && <DraftEditor key={editing} workspace={workspace} voucher={workspace.vouchers.find(v => v.id === editing)} initialSource={newSource} onClose={() => setEditing(null)} onSaved={id => { setEditing(null); choose(id); }} />}
    <section className={card}><div className="flex flex-wrap gap-2 border-b border-slate-200" role="tablist" aria-label="전표 업무 구분"><button className={`border-b-2 px-3 py-2 text-sm font-bold ${workspaceTab === "VOUCHERS" ? "border-slate-900" : "border-transparent text-slate-500"}`} onClick={() => setWorkspaceTab("VOUCHERS")} role="tab" aria-selected={workspaceTab === "VOUCHERS"}>전표 목록</button><button className={`border-b-2 px-3 py-2 text-sm font-bold ${workspaceTab === "SOURCES" ? "border-slate-900" : "border-transparent text-slate-500"}`} onClick={() => setWorkspaceTab("SOURCES")} role="tab" aria-selected={workspaceTab === "SOURCES"}>원본 연결 대기 <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{summary.sources}</span></button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end"><label className="text-sm font-semibold">검색<input className={field} value={search} onChange={event => setSearch(event.target.value)} placeholder={workspaceTab === "VOUCHERS" ? "전표번호·내용·원본 검색" : "원본번호·거래내용 검색"} /></label>{workspaceTab === "VOUCHERS" ? <label className="text-sm font-semibold">조회 구분<select className={field} value={filter} onChange={event => setFilter(event.target.value)}><option value="ALL">전체</option><option value="CONFIRMED">확정</option><option value="DRAFT">초안</option><option value="REVIEW">검토 필요</option><option value="MANAGED">원본 연결 전표</option><option value="LEGACY">기존 기록</option><option value="STALE">원본 변경</option></select></label> : <div />}{workspaceTab === "VOUCHERS" && canConfirm ? <button className={batchMode ? primary : secondary} onClick={toggleBatchMode} type="button">{batchMode ? "일괄 선택 종료" : "일괄 선택"}</button> : null}</div>
    </section>
    {workspaceTab === "VOUCHERS" ? <div className="grid items-start gap-4 xl:grid-cols-2"><section className={`${card} order-2 min-w-0 xl:order-1`} aria-label="전표 목록"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">전표 {visible.length}건</h2><p className="text-xs text-slate-500">전표를 선택하면 오른쪽에서 분개와 원본을 바로 확인할 수 있어.</p></div>{batchMode ? statusBadge("확정 가능한 초안만 선택", "blue") : null}</div><div className="space-y-2">{visible.map(voucher => { const blocked = confirmationBlockReason(voucher, workspace); const issue = voucherReviewIssue(voucher, workspace); const totals = voucherTotals(voucher); const selectable = batchMode && canConfirm && voucher.managed && voucher.approval_status === "승인대기"; return <div className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${voucher.id === selectedId ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`} key={voucher.id}>{selectable ? <input aria-label={`${voucher.voucher_no} 일괄 확정 선택`} checked={selectedForConfirmation.includes(voucher.id)} className="mt-1 size-4" disabled={Boolean(blocked) || confirmationPending} onChange={() => toggleConfirmation(voucher.id)} type="checkbox" /> : null}<button className="min-w-0 flex-1 text-left" aria-pressed={voucher.id === selectedId} onClick={() => choose(voucher.id)}><span className="flex flex-wrap items-start justify-between gap-2"><span><strong className="block">{voucher.voucher_no}</strong><span className="mt-0.5 block text-xs text-slate-500">{voucher.voucher_date} · {voucher.managed ? "원본 연결" : "기존 기록"}</span></span><strong className="tabular-nums">{money(totals.amount)}</strong></span><span className="mt-2 block truncate text-sm">{voucher.memo || "메모 없음"}</span><span className="mt-2 flex flex-wrap gap-1.5">{statusBadge(voucher.approval_status, voucher.approval_status === "승인완료" ? "green" : "blue")}{issue ? statusBadge(issue, "amber") : statusBadge("정상", "green")}</span>{selectable && blocked ? <span className="mt-2 block text-xs font-semibold text-amber-800">확정 제외 · {blocked}</span> : null}</button></div>; })}{!visible.length ? <p className="py-12 text-center text-sm text-slate-500">검색 조건에 맞는 전표가 없어.</p> : null}</div></section><div className="order-1 min-w-0 xl:order-2"><VoucherDetailPanel key={selected?.id ?? "empty"} canDraft={canDraft} onEdit={() => { if (!selected) return; setNewSource(undefined); setEditing(selected.id); }} selected={selected} workspace={workspace} /></div></div> : <section className={card} aria-label="원본 연결 대기"><div className="mb-4"><h2 className="text-lg font-bold">회계 연결할 원본</h2><p className="mt-1 text-sm text-slate-600">지급과 계좌이체의 실제 금액을 확인한 뒤 전표 초안을 작성해. 이미 연결된 원본은 기존 전표로 이동해.</p></div><div className="space-y-2">{workspace.sources.filter(source => `${source.number ?? ""} ${source.title}`.toLocaleLowerCase().includes(normalizedSearch)).map(source => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4" key={`${source.kind}:${source.id}`}><div><p className="font-semibold">{source.title}</p><p className="mt-1 text-sm text-slate-600">{sourceLabels[source.kind]} · {source.number ?? "번호 없음"} · {money(source.amount)} · {source.occurred_at ?? "일자 확인 필요"}</p></div>{source.existing_voucher_id ? <button className={secondary} onClick={() => { setWorkspaceTab("VOUCHERS"); choose(source.existing_voucher_id!); }}>연결 전표 확인</button> : source.blocked_reason ? <p role="status" className="max-w-md text-sm font-semibold text-amber-800">{source.blocked_reason}</p> : canDraft ? <button className={secondary} onClick={() => { setNewSource(source); setEditing(`new:${crypto.randomUUID()}`); }}>이 원본으로 초안 작성</button> : null}</div>)}</div></section>}
    {batchMode && selectedForConfirmation.length > 0 ? <section className="sticky bottom-3 z-20 rounded-2xl border border-slate-300 bg-white/95 p-4 shadow-xl backdrop-blur" aria-label="선택 전표 일괄 확정"><div className="grid gap-3 lg:grid-cols-[auto_minmax(260px,1fr)_auto] lg:items-end"><div><p className="text-sm font-bold">선택 {selectedForConfirmation.length}건</p><p className="text-xs text-slate-500">합계 {money(selectedAmount)}</p></div><label className="text-sm font-semibold">일괄 확인 근거<input className={field} value={confirmationReason} onChange={event => setConfirmationReason(event.target.value)} placeholder="예: 은행거래 및 증빙 대조 완료" /></label><button className={primary} disabled={confirmationPending || confirmationReason.trim().length < 2} onClick={submitConfirmation} type="button">{confirmationPending ? "확정 처리 중..." : `선택 ${selectedForConfirmation.length}건 전표 확정`}</button></div><p className="mt-2 text-xs text-slate-600">선택한 전표는 한 번에 검증하며, 한 건이라도 조건이 맞지 않으면 전체 확정을 취소해.</p>{confirmationMessage ? <p className="mt-2 text-sm font-semibold text-green-800" role="status">{confirmationMessage}</p> : null}{confirmationError ? <p className="mt-2 text-sm font-semibold text-red-700" role="alert">{confirmationError}</p> : null}</section> : confirmationMessage ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{confirmationMessage}</p> : null}
  </div>;
}
