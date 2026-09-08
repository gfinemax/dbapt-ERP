"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectExpenseOriginal } from "@/app/finance/expenses/actions";
import type { ExpenseWorkspace, ExpenseWorkspaceRecord } from "./expense-workspace-repository";

const kinds = { RESOLUTION: "지출결의", QUICK: "간편지출", PERSONAL: "개인 대납 정산" };
const labels: Record<string, string> = { RECORDED: "기록 완료", NEEDS_RESOLUTION: "결의 필요", CONVERTED: "결의·정산 연결", SUBMITTED: "승인대기", APPROVED: "승인완료", PAID: "지급완료", REJECTED: "반려", CANCELLED: "취소", PENDING: "요청 준비", REVIEWING: "심사 중", PARTIAL: "일부 승인", SUPPLEMENT: "보완 요청", WITHDRAWAL_PENDING: "철회 확인 대기", WITHDRAWN: "철회" };
const card = "rounded-2xl border border-slate-200 bg-white p-5";
const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2";
const money = (value: number | null) => value === null ? "확인 필요" : `${Number(value).toLocaleString("ko-KR")}원`;
const day = (value: string | null) => !value ? "미지정" : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
const keyOf = (r: ExpenseWorkspaceRecord) => `${r.source_kind}:${r.source_id}`;

export function filterExpenseRecords(records: ExpenseWorkspaceRecord[], kind: string, connection: string, search: string) {
  const query = search.trim().toLocaleLowerCase();
  return records.filter(r => (kind === "ALL" || r.source_kind === kind) && (connection === "ALL" || (connection === "CONNECTED" ? !!r.transaction_id : !r.transaction_id)) &&
    (!query || `${r.title} ${r.number ?? ""} ${r.counterparty ?? ""}`.toLocaleLowerCase().includes(query)));
}

function ExpenseStart({ staff }: { staff: boolean }) {
  const [scenario, setScenario] = useState("");
  return <section className={card}><h2 className="text-xl font-bold">지출 등록 시작</h2><p className="mt-2 text-sm text-slate-600">진행 상황을 선택한 다음 기존 작성 화면에서 등록해. 이미 등록한 건은 아래 원본 목록에서 연결해줘.</p>
    <div className="my-4 flex flex-wrap gap-2">{[["FUTURE", "앞으로 지급할 거래"], ["USED", "이미 사용하거나 지급한 거래"], ["ADVANCE", "먼저 지급한 돈의 정산"]].map(([value, label]) => <button key={value} className={scenario === value ? button : secondary} aria-pressed={scenario === value} onClick={() => setScenario(value)}>{label}</button>)}</div>
    {scenario === "FUTURE" && <div className="space-y-3"><p>기안이 필요 없는 일상 지출도 지출결의 승인은 별개야. 승인 근거와 지급 대상을 확인한 뒤 결의서를 작성해.</p>{staff ? <Link className={secondary} href="/finance/expense-resolutions">기존 지출결의 작성·관리로 이동</Link> : <p>조합의 지급 요청은 담당자에게 전달하고, 본인이 먼저 사용한 경비는 개인 대납 정산으로 신청해줘.</p>}</div>}
    {scenario === "USED" && <div className="space-y-3"><p>개인 돈으로 먼저 지출한 경우와 조합 계좌·카드에서 이미 지급한 경우를 구분해. 예산 안이라는 사실만으로 결의 생략을 확정하지 않아.</p><div className="flex flex-wrap gap-3"><Link className={secondary} href="/finance/reimbursements">개인이 먼저 쓴 경비 정산 신청</Link>{staff && <><Link className={secondary} href="/finance/quick-expenses">결의 생략 근거가 있는 간편지출 등록</Link><Link className={secondary} href="/finance/expense-resolutions">사후 승인이 필요한 결의 작성·관리</Link></>}</div></div>}
    {scenario === "ADVANCE" && <div className="space-y-3"><p>원래 지급한 금액과 사용내역을 연결하고, 잔액 반납이나 추가 지급을 구분해야 해.</p><p className="rounded-lg bg-amber-50 p-3">실제 원지급과 사용내역을 연결하는 정산 초안을 저장할 수 있어. 정산 확정·예산 반영·추가 지급 실행은 정책 확인 전까지 제한돼.</p>{staff && <div className="flex flex-wrap gap-3"><Link className={secondary} href="/finance/advance-settlements">선지급 정산 초안 작성·조회</Link><Link className={secondary} href="/finance/payments">실제 지급 내역 확인</Link><Link className={secondary} href="/finance/expense-resolutions">기존 결의 자료 확인</Link></div>}</div>}
  </section>;
}

function ExpenseDetail({ record: r, staff }: { record: ExpenseWorkspaceRecord; staff: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition(); const busy = useRef(false); const operationKey = useRef<string | null>(null); const [message, setMessage] = useState("");
  function connect() {
    if (busy.current) return; busy.current = true; operationKey.current ??= crypto.randomUUID(); setMessage("");
    start(async () => { try { await connectExpenseOriginal(r.source_kind, r.source_id, operationKey.current!); setMessage("원본을 연결했어. 최신 내역을 다시 불러왔어."); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "원본을 연결하지 못했어."); } finally { busy.current = false; } });
  }
  return <section aria-label="지출 상세" className={card}><h2 className="text-xl font-bold">{r.title}</h2><p className="mt-2 text-sm">{kinds[r.source_kind]}{r.number ? ` · ${r.number}` : ""}</p>
    <dl className="my-4 grid gap-4 sm:grid-cols-3">{[["원본 금액", money(r.amount)], ["원본 승인·처리 상태", labels[r.approval_status] ?? r.approval_status], ["원본 지급 상태", r.payment_status ?? "별도 지급 확인 필요"], ["작성자", r.author_label ?? "미확인"], ["거래처", r.counterparty || "미확인"], ["작성일", day(r.created_at)], ["실제 사용일", day(r.used_at)], ["회계 귀속일", day(r.accounting_date)], ["개인 정산 예산월", r.budget_month?.slice(0, 7) ?? "해당 없음"]].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
    {r.transaction_id && r.amounts ? <div className="rounded-lg bg-slate-50 p-4"><h3 className="font-semibold">연결된 지급 현황</h3><p className="mt-2">누적 실제 지급 {money(r.amounts.paid)} · 총 미지급 {money(r.amounts.remaining)} · 승인 중 미지급 {money(r.amounts.approved_unpaid)}</p>{r.amounts.legacy_payment_complete && <p className="mt-2 text-sm">기존 지급완료 기록을 보존했어. 금액 근거가 없으면 확인 필요로 표시돼.</p>}</div> : <div className="rounded-lg bg-slate-50 p-4"><p>통합 업무에 아직 연결되지 않은 원본이야. 연결해도 원본을 복제하거나 새 지급·비용을 만들지 않아.</p>{r.can_connect && <button className={`${button} mt-3`} disabled={pending} onClick={connect}>원본 연결</button>}</div>}
    <p role="status" className="my-3">{message}</p>
    <h3 className="mt-4 font-semibold">신탁 요청 연결</h3>{r.trust_items.length ? <ul className="mt-2 space-y-2">{r.trust_items.map(i => <li className="rounded-lg border p-3" key={i.id}>{staff ? <Link className="underline" href={`/finance/trust?request=${encodeURIComponent(i.request_id)}`}>{i.request_no}</Link> : <span>{i.request_no}</span>} · {labels[i.status] ?? i.status} · 요청 {money(i.requested_amount)} · 승인 {money(i.approved_amount)} · 지급 {money(i.paid_amount)}{i.needs_review && <span className="ml-2 text-amber-700">재검토 필요</span>}</li>)}</ul> : <p className="mt-2 text-sm">연결된 신탁 요청이 없어.</p>}
    <h3 className="mt-4 font-semibold">회계전표 연결</h3>{r.vouchers.length ? <ul className="mt-2 space-y-2">{r.vouchers.map(v => <li key={v.id}>{staff ? <Link className="underline" href={`/finance?voucherId=${encodeURIComponent(v.id)}`}>{v.voucher_no}</Link> : <span>{v.voucher_no}</span>} · {v.status} · {v.source_kind === "RECOGNITION" ? "발생 인식" : v.source_kind === "PAYMENT" ? "실제 지급" : "기존 전표"}</li>)}</ul> : <p className="mt-2 text-sm">연결된 전표가 없어.</p>}
    <div className="mt-5 flex flex-wrap gap-3">{staff && <Link className={secondary} href={`/finance/payments?tab=ALL&q=${encodeURIComponent(r.title)}`}>제목으로 지급 목록 확인</Link>}{(staff || r.source_kind === "PERSONAL") && <Link className={secondary} href={r.source_kind === "RESOLUTION" ? "/finance/expense-resolutions" : r.source_kind === "QUICK" ? "/finance/quick-expenses" : `/finance/reimbursements${r.budget_month ? `?month=${r.budget_month.slice(0, 7)}` : ""}`}>기존 {kinds[r.source_kind]} 화면에서 확인</Link>}</div><p className="mt-3 text-xs text-slate-600">기존 작성·승인·출력 기능은 각 원본 화면에 있어. 해당 화면의 목록에서 문서번호나 제목으로 찾아줘.</p>
  </section>;
}

export function ExpenseWorkspacePage({ workspace, initialKind = "ALL", initialConnection = "ALL", initialSearch = "", initialSourceKind, initialSourceId }: { workspace: ExpenseWorkspace; initialKind?: string; initialConnection?: string; initialSearch?: string; initialSourceKind?: string; initialSourceId?: string }) {
  const router = useRouter(); const [kind, setKind] = useState(Object.hasOwn(kinds, initialKind) ? initialKind : "ALL"); const [connection, setConnection] = useState(["CONNECTED", "UNCONNECTED"].includes(initialConnection) ? initialConnection : "ALL"); const [search, setSearch] = useState(initialSearch); const [selected, setSelected] = useState(initialSourceKind && initialSourceId ? `${initialSourceKind}:${initialSourceId}` : "");
  const rows = filterExpenseRecords(workspace.records, kind, connection, search); const detail = workspace.records.find(r => keyOf(r) === selected);
  function navigate(next: { kind?: string; connection?: string; q?: string; source_kind?: string; source_id?: string }) {
    const params = new URLSearchParams(window.location.search); for (const [key, value] of Object.entries(next)) { if (value) params.set(key, value); else params.delete(key); }
    router.replace(`/finance/expenses?${params}`, { scroll: false });
  }
  return <div className="space-y-5"><header className={card}><h1 className="text-3xl font-bold">지출관리</h1><p className="mt-2 text-slate-600">원본 지출과 승인·신탁·지급·회계 연결을 한곳에서 확인해.</p>{!workspace.viewer.staff && <p className="mt-2">본인이 신청한 개인 대납 정산만 표시돼.</p>}</header><ExpenseStart staff={workspace.viewer.staff} />
    <section className={card}><h2 className="text-xl font-bold">지출 원본 목록</h2><p className="mt-2 text-sm text-slate-600">같은 사용을 결의·정산으로 전환한 기록도 원본별로 보존해. 이 목록의 금액을 합산하면 중복될 수 있어.</p><div className="my-4 grid gap-3 sm:grid-cols-3"><label>원본 종류<select className={field} value={kind} onChange={e => { setKind(e.target.value); navigate({ kind: e.target.value }); }}><option value="ALL">전체</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>통합 연결<select className={field} value={connection} onChange={e => { setConnection(e.target.value); navigate({ connection: e.target.value }); }}><option value="ALL">전체</option><option value="CONNECTED">연결됨</option><option value="UNCONNECTED">미연결</option></select></label><label>지출 검색<input className={field} value={search} placeholder="제목·문서번호·거래처" onChange={e => { setSearch(e.target.value); navigate({ q: e.target.value }); }} /></label></div>
      <p className="mb-3">전체 원본 {workspace.records.length}건 · 조회 결과 {rows.length}건</p><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr><th className="p-2">원본</th><th>금액</th><th>원본 상태</th><th>통합 연결</th></tr></thead><tbody>{rows.map(r => <tr key={keyOf(r)} className="border-t"><td className="p-2"><button className="text-left font-semibold underline" aria-pressed={selected === keyOf(r)} onClick={() => { setSelected(keyOf(r)); navigate({ source_kind: r.source_kind, source_id: r.source_id }); }}>{r.title}</button><p className="mt-1 text-xs">{kinds[r.source_kind]}{r.number ? ` · ${r.number}` : ""}</p></td><td>{money(r.amount)}</td><td>{labels[r.approval_status] ?? r.approval_status}{r.payment_status ? ` · ${r.payment_status}` : ""}</td><td>{r.transaction_id ? "연결됨" : "미연결"}</td></tr>)}</tbody></table></div>{!rows.length && <p className="py-6 text-center">조건에 맞는 지출 원본이 없어.</p>}</section>
    {detail ? <ExpenseDetail key={keyOf(detail)} record={detail} staff={workspace.viewer.staff} /> : selected ? <section className={card}><p role="alert">조회 권한이 있는 원본 목록에서 해당 지출을 찾을 수 없어.</p></section> : <p className="p-4 text-slate-600">원본 제목을 선택하면 연결 상세를 확인할 수 있어.</p>}
  </div>;
}
