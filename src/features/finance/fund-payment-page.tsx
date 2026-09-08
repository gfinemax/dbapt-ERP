"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { executePaymentCommand, attachPaymentEvidence } from "@/app/finance/payments/actions";
import { downloadTrustFile } from "@/app/finance/trust/actions";
import type { PaymentWorkspace } from "./fund-payment-repository";
import type { TrustReadResult } from "./fund-trust-repository";
import { paymentRows, paymentTabs, paymentUnallocated, type PaymentTab } from "./fund-payment-domain";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2";
const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";
const money = (value: number | null) => value === null ? "확인 필요" : `${Number(value).toLocaleString("ko-KR")}원`;
const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
type Command = Parameters<typeof executePaymentCommand>[0];

function usePaymentOperation() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const keys = useRef(new Map<string, string>());
  function run(signature: string, action: (key: string) => Promise<unknown>) {
    if (busy.current) return;
    busy.current = true;
    const key = keys.current.get(signature) ?? crypto.randomUUID();
    keys.current.set(signature, key);
    setMessage("");
    start(async () => {
      try { await action(key); setMessage("저장했어. 최신 지급 내역을 다시 불러왔어."); router.refresh(); }
      catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했어. 입력 내용을 확인해줘."); }
      finally { busy.current = false; }
    });
  }
  function command(command: Command, input: Record<string, unknown>, done?: () => void) {
    run(`${command}:${JSON.stringify(input)}`, async key => { await executePaymentCommand(command, input, key); done?.(); });
  }
  return { run, command, pending, message };
}

function PaymentRecordForm({ workspace, trust }: { workspace: PaymentWorkspace; trust: TrustReadResult }) {
  const op = usePaymentOperation();
  const [method, setMethod] = useState("BANK");
  const [uploadId, setUploadId] = useState(() => crypto.randomUUID());
  const [cashEvidence, setCashEvidence] = useState("");
  return <details className={card}><summary className="cursor-pointer text-lg font-bold">실제 입출금 기록 연결</summary>
    <p className="my-3 text-sm text-slate-600">은행 내역 또는 실제 현금 증빙을 기록한 다음, 아래에서 지출에 배분해. 이 작업은 송금을 실행하지 않아.</p>
    <label>근거 종류<select className={field} value={method} onChange={e => setMethod(e.target.value)}><option value="BANK">은행 입출금</option><option value="CASH">현금 지급·반납</option></select></label>
    {method === "CASH" && <form className="my-4 grid gap-3 rounded-lg bg-slate-50 p-4" onChange={() => setUploadId(crypto.randomUUID())} onSubmit={event => {
      event.preventDefault(); const element = event.currentTarget; const data = new FormData(element); data.set("upload_id", uploadId);
      op.run(`file:${uploadId}`, async key => { data.set("operation_key", key); const result = await attachPaymentEvidence(data); setCashEvidence(result.id); element.reset(); setUploadId(crypto.randomUUID()); });
    }}><label>현금 증빙 · PDF 또는 이미지, 최대 3MB<input name="file" type="file" className={field} accept="application/pdf,image/png,image/jpeg,image/webp" required /></label><button className={secondary} disabled={op.pending}>현금 증빙 저장</button></form>}
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault(); const element = event.currentTarget; const data = new FormData(element);
      const input = method === "BANK" ? { method, bank_transaction_id: String(data.get("bank_transaction_id")), reason: String(data.get("reason")) }
        : { method, flow: String(data.get("flow")), amount: Number(data.get("amount")), paid_at: new Date(`${String(data.get("paid_at"))}:00+09:00`).toISOString(), counterparty: String(data.get("counterparty")), evidence_file_id: String(data.get("evidence_file_id")), reason: String(data.get("reason")) };
      op.command("PAYMENT_RECORD", input, () => element.reset());
    }}>
      {method === "BANK" ? <label className="sm:col-span-2">미연결 은행 거래 · 최근 200건<select name="bank_transaction_id" className={field} required defaultValue=""><option value="">거래 선택</option>{workspace.banks.map(b => <option key={b.id} value={b.id}>{date(b.transacted_at)} · {b.account_label} · {b.withdrawal_amount > 0 ? "출금" : "입금"} {money(Math.max(b.withdrawal_amount, b.deposit_amount))} · {b.counterparty || b.description}</option>)}</select></label>
        : <><label>현금 구분<select name="flow" className={field}><option value="OUT">지급</option><option value="IN">반납·회수 입금</option></select></label><label>실제 수취인·반납자<input name="counterparty" className={field} required /></label><label>실제 지급·반납 시각<input name="paid_at" type="datetime-local" className={field} required /></label><label>실제 금액<input name="amount" type="number" min="1" step="1" className={field} required /></label><label className="sm:col-span-2">현금 증빙<select name="evidence_file_id" value={cashEvidence} onChange={e => setCashEvidence(e.target.value)} className={field} required><option value="">저장한 지급 증빙 선택</option>{trust.files.filter(f => f.purpose === "PAYMENT").map(f => <option key={f.id} value={f.id}>{f.file_name} · {date(f.uploaded_at)}</option>)}</select></label></>}
      <label className="sm:col-span-2">근거 확인 사유<input name="reason" className={field} required /></label><button className={button} disabled={op.pending}>실제 입출금 저장</button>
    </form><p role="status" className="mt-3">{op.message}</p>
  </details>;
}

function AllocationForm({ workspace, trust }: { workspace: PaymentWorkspace; trust: TrustReadResult }) {
  const op = usePaymentOperation();
  const [paymentId, setPaymentId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const payment = workspace.payments.find(p => p.id === paymentId);
  const isReturn = payment?.flow === "IN";
  const candidates = isReturn ? workspace.transactions.filter(t => workspace.allocations.some(a => a.transaction_id === t.id && a.purpose === "DISBURSEMENT" && !a.reversed)) : paymentRows(workspace, "READY", "");
  return <section className={card}><h2 className="text-lg font-bold">지급 배분·반납 연결</h2><p className="mt-2 text-sm text-slate-600">하나의 실제 지급을 여러 지출에 나눠 연결할 수 있어. 저장 시 최신 잔액·계좌·신탁 승인 조건을 다시 확인해.</p>
    <form className="mt-4 space-y-4" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      const items = selected.map(id => ({ transaction_id: id, purpose: isReturn ? "RETURN" : "DISBURSEMENT", amount: Number(data.get(`amount:${id}`)), ...(isReturn ? { original_allocation_id: String(data.get(`original:${id}`)) } : { trust_item_id: String(data.get(`trust:${id}`) ?? "") || null }) }));
      op.command("PAYMENT_ALLOCATE", { payment_id: paymentId, reason: String(data.get("reason")), items }, () => setSelected([]));
    }}><label>실제 지급·입금<select className={field} value={paymentId} onChange={e => { setPaymentId(e.target.value); setSelected([]); }} required><option value="">지급 내역 선택</option>{workspace.payments.filter(p => paymentUnallocated(workspace, p.id) > 0).map(p => <option key={p.id} value={p.id}>{date(p.paid_at)} · {p.flow === "OUT" ? "지급" : "반납·회수 입금"} · {p.counterparty} · 미배분 {money(paymentUnallocated(workspace, p.id))}</option>)}</select></label>
      {payment && <div className="space-y-3">{candidates.map(t => <div key={t.id} className="rounded-xl border p-3"><label className="flex items-center gap-2"><input type="checkbox" checked={selected.includes(t.id)} onChange={e => setSelected(e.target.checked ? [...selected, t.id] : selected.filter(id => id !== t.id))} />{String(t.source_snapshot.number ?? "")} · {t.title}</label>{selected.includes(t.id) && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label>배분금액<input className={field} type="number" min="1" step="1" name={`amount:${t.id}`} required /></label>{isReturn ? <label>원지급 배분<select className={field} name={`original:${t.id}`} required defaultValue=""><option value="">반납할 원지급 선택</option>{workspace.allocations.filter(a => a.transaction_id === t.id && a.purpose === "DISBURSEMENT" && !a.reversed).map(a => <option key={a.id} value={a.id}>{date(workspace.payments.find(p => p.id === a.payment_id)!.paid_at)} · 원지급 {money(a.amount)}</option>)}</select></label> : t.route === "TRUST_DIRECT" ? <label>유효한 신탁 승인<select className={field} name={`trust:${t.id}`} required defaultValue=""><option value="">승인 항목 선택</option>{trust.items.filter(i => i.transaction_id === t.id && ["APPROVED", "PARTIAL"].includes(i.status) && !i.needs_review && i.source_revision === t.revision && trust.requests.some(r => r.id === i.request_id && r.contract_version_id === t.contract_version_id && !["DRAFT", "WITHDRAWN", "REJECTED"].includes(r.status))).map(i => <option key={i.id} value={i.id}>{trust.requests.find(r => r.id === i.request_id)?.request_no} · 승인 미지급 {money(Math.max(0, i.approved_amount - i.paid_amount))}</option>)}</select></label> : <p className="self-center text-sm">계약상 운영계좌 집행 · 지급 가능 {money(workspace.eligibility.find(e => e.transaction_id === t.id)?.available ?? 0)}</p>}</div>}</div>)}{!candidates.length && <p>현재 연결할 수 있는 지출이 없어. 승인·집행 경로 또는 원지급을 확인해줘.</p>}</div>}
      <label className="block">배분 확인 사유<input className={field} name="reason" required /></label><button className={button} disabled={op.pending || !selected.length}>배분 저장</button>
    </form><p role="status" className="mt-3">{op.message}</p></section>;
}

function TransferForm({ workspace }: { workspace: PaymentWorkspace }) {
  const op = usePaymentOperation();
  return <details className={card}><summary className="cursor-pointer text-lg font-bold">조합 계좌 간 이체 연결</summary><p className="my-3 text-sm text-slate-600">관리계좌와 운영계좌 등 조합 계좌 간 실제 이체를 연결해. 비용이나 조합원 신규 납부로 집계하지 않아. 운영비 선교부 승인·정산은 별도 근거가 필요해.</p>
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); op.command("TRANSFER", { withdrawal_id: String(data.get("withdrawal_id")), deposit_id: String(data.get("deposit_id")), reason: String(data.get("reason")) }); }}>
      {(["withdrawal", "deposit"] as const).map(flow => <label key={flow}>{flow === "withdrawal" ? "출금 거래" : "입금 거래"}<select className={field} name={`${flow}_id`} required defaultValue=""><option value="">거래 선택</option>{workspace.banks.filter(b => b[`${flow}_amount`] > 0).map(b => <option key={b.id} value={b.id}>{date(b.transacted_at)} · {b.account_label} · {money(b[`${flow}_amount`])}</option>)}</select></label>)}
      <label className="sm:col-span-2">계좌이체 확인 근거<input name="reason" className={field} required /></label><button className={button} disabled={op.pending}>계좌이체 연결 저장</button>
    </form><p role="status" className="mt-3">{op.message}</p>
  </details>;
}

function AllocationHistory({ workspace, canPay }: { workspace: PaymentWorkspace; canPay: boolean }) {
  const op = usePaymentOperation();
  return <section className={card}><h2 className="text-lg font-bold">지급 배분 이력</h2><p className="mt-2 text-sm text-slate-600">잘못 연결한 배분은 사유와 함께 정정해. 실제 은행·현금 지급 기록은 보존돼.</p>
    <div className="mt-4 space-y-3">{workspace.allocations.map(a => <div className="rounded-xl border p-3" key={a.id}><p>{workspace.transactions.find(t => t.id === a.transaction_id)?.title} · {a.purpose === "RETURN" ? "반납·회수" : "지급"} {money(a.amount)} · {a.reversed ? "배분 취소" : "연결됨"}</p>{workspace.reversals.filter(r => r.allocation_id === a.id).map(r => <p key={r.allocation_id} className="text-sm text-slate-600">정정 사유: {r.reason} · {date(r.created_at)}</p>)}{canPay && !a.reversed && <form className="mt-2 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); op.command("ALLOCATION_REVERSE", { id: a.id, reason: String(data.get("reason")) }); }}><input aria-label={`${workspace.transactions.find(t => t.id === a.transaction_id)?.title} 배분 정정 사유`} className="min-w-0 flex-1 rounded-lg border px-3 py-2" name="reason" placeholder="배분 정정 사유" required /><button className={secondary} disabled={op.pending}>배분 취소 이력 저장</button></form>}</div>)}{!workspace.allocations.length && <p>등록된 지급 배분이 없어.</p>}</div><p role="status" className="mt-3">{op.message}</p></section>;
}

export function FundPaymentPage({ workspace, trust, initialTab = "ALL", initialSearch = "" }: { workspace: PaymentWorkspace; trust: TrustReadResult; initialTab?: string; initialSearch?: string }) {
  const [tab, setTab] = useState<PaymentTab>(Object.hasOwn(paymentTabs, initialTab) ? initialTab as PaymentTab : "ALL");
  const [search, setSearch] = useState(initialSearch);
  const canPay = workspace.viewer.permissions.some(p => p === "ADMIN" || p === "PAY");
  const rows = paymentRows(workspace, tab, search);
  const [downloadError, setDownloadError] = useState("");
  function updateQuery(nextTab: PaymentTab, nextSearch: string) {
    const params = new URLSearchParams(window.location.search); params.set("tab", nextTab); if (nextSearch) params.set("q", nextSearch); else params.delete("q");
    window.history.replaceState(null, "", `?${params}`);
  }
  return <div className="space-y-5"><header className={card}><h1 className="text-3xl font-bold">지급관리</h1><p className="mt-2 text-slate-600">내부 승인·신탁 조건과 실제 지급을 구분해서 확인해. 날짜는 한국 시간 기준이야.</p><div className="mt-3 flex flex-wrap gap-3"><Link href="/finance/trust" className={secondary}>신탁 요청·집행 경로 확인</Link><Link href="/finance/reimbursements" className={secondary}>개인 대납 정산</Link></div></header>
    <section className={card}><label>지출 검색<input type="search" className={field} value={search} onChange={e => { setSearch(e.target.value); updateQuery(tab, e.target.value); }} placeholder="제목·문서번호" /></label><nav aria-label="지급 상태" className="my-4 flex flex-wrap gap-2">{(Object.keys(paymentTabs) as PaymentTab[]).map(key => <button key={key} aria-pressed={tab === key} className={tab === key ? button : secondary} onClick={() => { setTab(key); updateQuery(key, search); }}>{paymentTabs[key]} {paymentRows(workspace, key, search).length}</button>)}</nav>
      <p className="mb-3 text-sm text-slate-600">통합 연결된 지출 {rows.length}건 · 기존 지급완료는 유지하고, 금액 근거가 없으면 확인 필요로 표시해.</p><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead><tr><th className="p-2">지출</th><th>확정액</th><th>누적 지급</th><th>미지급</th><th>현재 지급 가능</th><th>다음 확인</th></tr></thead><tbody>{rows.map(t => { const eligibility = workspace.eligibility.find(e => e.transaction_id === t.id); return <tr className="border-t" key={t.id}><td className="p-2"><p className="font-semibold">{t.title}</p><p>{String(t.source_snapshot.number ?? "")} · {t.source_kind === "PERSONAL" ? "개인 대납" : t.source_kind === "QUICK" ? "간편지출" : "지출결의"}</p></td><td>{money(t.amount)}</td><td>{money(t.amounts.paid)}</td><td>{money(t.amounts.remaining)}</td><td>{money(eligibility?.available ?? 0)}</td><td>{eligibility?.reason || "실제 지급 내역 연결"}</td></tr>; })}</tbody></table>{!rows.length && <p className="py-6 text-center">해당 조건의 지출이 없어.</p>}</div>
    </section>
    {canPay && <><PaymentRecordForm workspace={workspace} trust={trust} /><AllocationForm workspace={workspace} trust={trust} /><TransferForm workspace={workspace} /></>}
    <section className={card}><h2 className="text-lg font-bold">실제 입출금 내역</h2><ul className="mt-3 space-y-2">{workspace.payments.map(p => <li key={p.id}>{date(p.paid_at)} · {p.method === "BANK" ? "은행" : "현금"} {p.flow === "OUT" ? "출금" : "반납·회수 입금"} · {p.counterparty} · {money(p.amount)} · 미배분 {money(paymentUnallocated(workspace, p.id))}</li>)}</ul>{!workspace.payments.length && <p className="mt-3">등록된 실제 입출금이 없어.</p>}</section>
    <section className={card}><h2 className="text-lg font-bold">계좌이체 내역</h2><ul className="mt-3 space-y-2">{workspace.transfers.map(t => <li key={t.id}>{date(t.paid_at)} · {money(t.amount)} · {t.reason}</li>)}</ul>{!workspace.transfers.length && <p className="mt-3">연결된 계좌이체가 없어.</p>}</section>
    <AllocationHistory workspace={workspace} canPay={canPay} />
    <section className={card}><h2 className="text-lg font-bold">지급 증빙</h2><ul className="mt-3 space-y-2">{trust.files.filter(f => f.purpose === "PAYMENT").map(f => <li key={f.id}><button className={secondary} onClick={async () => { try { setDownloadError(""); window.location.assign(await downloadTrustFile(f.id)); } catch(error) { setDownloadError(error instanceof Error ? error.message : "증빙 조회 실패"); } }}>{f.file_name} · {date(f.uploaded_at)}</button></li>)}</ul><p role="status">{downloadError}</p></section>
  </div>;
}
