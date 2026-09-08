"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { executeTrustCommand, attachTrustFile, downloadTrustFile } from "@/app/finance/trust/actions";
import { connectTrustSource, refreshTrustSource } from "@/app/finance/trust/source-actions";
import { itemStatusLabel, requestStatusLabel } from "./fund-workflow-domain";
import type { TrustReadResult, TrustRequestRow, TrustCommand, TrustCommandResult } from "./fund-trust-repository";
import type { WorkflowReadResult } from "./fund-workflow-repository";
import type { FundSourceOption } from "./fund-source-options";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";
const money = (amount: number | null) => amount === null ? "확인 필요" : `${Number(amount).toLocaleString("ko-KR")}원`;
const sourceLabels = { RESOLUTION: "지출결의", QUICK: "간편지출", PERSONAL: "개인 대납" };
const actionLabels: Record<string, string> = { REQUEST_SAVE: "요청 초안 저장", REQUEST_SUBMIT: "제출본 보관", REVIEW_START: "심사 시작", REPLY_RECORD: "회신 기록", WITHDRAW_REQUEST: "철회 요청", WITHDRAW_CONFIRM: "철회 확인", FILE_REGISTER: "첨부 등록" };

function useTrustOperation() {
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
      try { await action(key); setMessage("저장했어. 최신 처리 내역을 다시 불러왔어."); router.refresh(); }
      catch (error) { setMessage(error instanceof Error ? error.message : "처리하지 못했어. 입력 내용을 확인해줘."); }
      finally { busy.current = false; }
    });
  }
  function command(command: Exclude<TrustCommand, "FILE_REGISTER">, input: Record<string, unknown>, done?: (result: TrustCommandResult) => void) {
    run(`${command}:${JSON.stringify(input)}`, async key => { const result = await executeTrustCommand(command, input, key); done?.(result); });
  }
  return { run, command, pending, message };
}

function UploadRequestFile({ requestId, canEdit }: { requestId: string; canEdit: boolean }) {
  const op = useTrustOperation();
  const [uploadId, setUploadId] = useState(() => crypto.randomUUID());
  if (!canEdit) return null;
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">요청 서류·신탁사 회신 첨부</summary>
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onChange={() => setUploadId(crypto.randomUUID())} onSubmit={event => {
      event.preventDefault(); const element = event.currentTarget; const data = new FormData(element);
      data.set("request_id", requestId); data.set("upload_id", uploadId);
      op.run(`upload:${uploadId}`, async key => { data.set("operation_key", key); await attachTrustFile(data); element.reset(); setUploadId(crypto.randomUUID()); });
    }}>
      <label>서류 구분<select className={field} name="purpose"><option value="REQUEST">요청 첨부</option><option value="REPLY">신탁사 회신</option><option value="EVIDENCE">거래 증빙</option></select></label>
      <label>계약상 서류명<input className={field} name="document_type" placeholder="계약 설정의 필수서류명과 일치하게 입력" /></label>
      <label className="sm:col-span-2">파일 · PDF 또는 이미지, 최대 3MB<input className={field} name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required /></label>
      <button className={button} disabled={op.pending}>첨부 저장</button>
    </form><p role="status" className="mt-2 text-sm">{op.message}</p>
  </details>;
}

function RequestEditor({ existing, workspace, workflow, onSaved }: { existing?: TrustRequestRow; workspace: TrustReadResult; workflow: WorkflowReadResult; onSaved: (id: string) => void }) {
  const op = useTrustOperation();
  const [base] = useState(existing);
  const [oldItems] = useState(() => workspace.items.filter(row => row.request_id === existing?.id && row.status === "PENDING"));
  const [selected, setSelected] = useState(() => oldItems.map(row => row.transaction_id));
  return <form className={`${card} space-y-4`} onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const input = { ...(base ? { id: base.id, lock_version: base.lock_version } : {}), title: String(data.get("title") ?? ""), request_date: String(data.get("request_date") ?? ""),
      contract_version_id: String(data.get("contract_version_id") ?? "") || null,
      items: selected.map(id => ({ transaction_id: id, requested_amount: Number(data.get(`amount:${id}`)) })) };
    op.command("REQUEST_SAVE", input, result => onSaved(result.id));
  }}>
    <h2 className="text-lg font-bold">{existing ? `${existing.request_no} 초안 수정` : "신탁 요청 준비"}</h2>
    {base && existing?.lock_version !== base.lock_version && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">다른 변경이 저장됐어. 입력 내용은 유지했어. 최신 초안을 편집하려면 편집을 닫고 다시 열어줘.</p>}
    <p className="text-sm text-slate-600">계약 조건이 미확정이어도 초안을 보관할 수 있어. 제출 시 승인·계약·요청 가능액을 다시 확인해.</p>
    <div className="grid gap-3 sm:grid-cols-2"><label>요청명<input className={field} name="title" defaultValue={existing?.title ?? ""} /></label>
      <label>요청일<input className={field} name="request_date" type="date" defaultValue={existing?.request_date ?? ""} /></label>
      <label className="sm:col-span-2">계약 버전<select className={field} name="contract_version_id" defaultValue={existing?.contract_version_id ?? ""}><option value="">설정 필요 · 초안 저장 가능</option>{workspace.contracts.filter(row => row.status !== "RETIRED").map(row => <option key={row.id} value={row.id}>{row.name || "계약명 미입력"} · {row.version}차 · {row.status === "VERIFIED" ? "확인 완료" : "확인 필요"}</option>)}</select></label></div>
    <fieldset className="space-y-2"><legend className="mb-2 font-semibold">요청에 포함할 연결 지출</legend>{workflow.transactions.map(tx => <div key={tx.id} className="grid items-center gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_10rem]">
      <label className="flex items-start gap-2"><input type="checkbox" checked={selected.includes(tx.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, tx.id] : previous.filter(id => id !== tx.id))} /><span>{tx.title}<span className="block text-xs text-slate-600">확정 {money(tx.amount)} · 요청 가능 {money(tx.amounts.requestable)}</span></span></label>
      {selected.includes(tx.id) && <label className="text-sm">이번 요청액<input className={field} name={`amount:${tx.id}`} type="number" min="1" step="1" required defaultValue={oldItems.find(row => row.transaction_id === tx.id)?.requested_amount ?? ""} /></label>}
    </div>)}{!workflow.transactions.length && <p className="text-sm text-slate-600">아래에서 기존 지출을 먼저 연결해줘. 항목 없는 초안도 저장할 수 있어.</p>}</fieldset>
    <button className={button} disabled={op.pending}>초안 저장</button><p role="status" className="text-sm">{op.message}</p>
  </form>;
}

function SubmissionForm({ request, workspace, workflow }: { request: TrustRequestRow; workspace: TrustReadResult; workflow: WorkflowReadResult }) {
  const op = useTrustOperation();
  const items = workspace.items.filter(row => row.request_id === request.id && ["PENDING", "SUPPLEMENT"].includes(row.status));
  const contract = workspace.contracts.find(row => row.id === request.contract_version_id);
  const docs = workspace.files.filter(row => ["REQUEST", "EVIDENCE", "CONTRACT"].includes(row.purpose) && (row.request_id === request.id || row.contract_version_id === contract?.id || workspace.items.some(item => item.request_id === request.id && item.transaction_id === row.transaction_id)));
  const roles = Array.isArray(contract?.conditions.consent_roles) ? contract.conditions.consent_roles.filter((value): value is string => typeof value === "string") : [];
  if (!items.length) return null;
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">{request.revision ? "보완 항목 재제출 기록" : "신탁사 제출 기록"}</summary>
    <form className="mt-4 space-y-3" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      op.command("REQUEST_SUBMIT", { id: request.id, lock_version: request.lock_version, receipt_reference: String(data.get("receipt_reference") ?? ""),
        items: data.getAll("item_id").map(id => ({ id: String(id), requested_amount: Number(data.get(`amount:${id}`)) })), file_ids: data.getAll("file_id").map(String),
        consents: roles.map((role, index) => ({ role, name: String(data.get(`consent_name:${index}`) ?? ""), file_id: String(data.get(`consent_file:${index}`) ?? "") })) });
    }}>
      <p className="text-sm text-slate-600">외부 신탁사에 실제 제출한 내용과 접수정보를 기록해. 선택한 첨부와 요청 내용은 새 제출본으로 보존돼.</p>
      {items.map(item => <div key={item.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2"><label><input type="checkbox" name="item_id" value={item.id} defaultChecked />{workflow.transactions.find(tx => tx.id === item.transaction_id)?.title || "원본 확인 필요"}<span className="block text-xs">{itemStatusLabel[item.status]}</span></label><label>심사 요청액 · 기지급 {money(item.paid_amount)}<input className={field} type="number" name={`amount:${item.id}`} min={Math.max(1, item.paid_amount)} step="1" defaultValue={item.requested_amount} required /></label></div>)}
      <fieldset><legend className="font-semibold">이번 제출 첨부</legend>{docs.map(file => <label key={file.id} className="mt-2 flex gap-2 text-sm"><input type="checkbox" name="file_id" value={file.id} />{file.file_name} · {file.document_type || "서류명 미지정"}</label>)}{!docs.length && <p className="mt-2 text-sm">먼저 제출할 서류를 첨부해줘.</p>}</fieldset>
      {roles.map((role, index) => <div key={`${role}:${index}`} className="grid gap-2 sm:grid-cols-2"><label>{role} 동의자<input className={field} name={`consent_name:${index}`} required /></label><label>동의 근거<select className={field} name={`consent_file:${index}`} required><option value="">첨부 선택</option>{docs.map(file => <option key={file.id} value={file.id}>{file.file_name}</option>)}</select></label></div>)}
      <label className="block">접수번호·접수 확인 내용<input className={field} name="receipt_reference" required /></label>
      {contract?.status !== "VERIFIED" && <p className="text-sm text-amber-800">계약 조건 확인 후 제출할 수 있어. 초안과 첨부는 보관돼.</p>}
      <button className={button} disabled={op.pending || contract?.status !== "VERIFIED"}>제출 기록 저장</button><p role="status" className="text-sm">{op.message}</p>
    </form>
  </details>;
}

function ReplyForm({ request, workspace, workflow }: { request: TrustRequestRow; workspace: TrustReadResult; workflow: WorkflowReadResult }) {
  const op = useTrustOperation();
  const items = workspace.items.filter(row => row.request_id === request.id && (row.status === "REVIEWING" || (row.needs_review && ["APPROVED", "PARTIAL"].includes(row.status))));
  const replies = workspace.files.filter(row => row.request_id === request.id && row.purpose === "REPLY");
  if (!items.length) return null;
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">항목별 회신·재검토 기록</summary><form className="mt-4 space-y-3" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    op.command("REPLY_RECORD", { id: request.id, lock_version: request.lock_version, reason: String(data.get("reason") ?? ""), reply_file_id: String(data.get("reply_file_id") ?? ""),
      items: items.filter(item => data.get(`status:${item.id}`)).map(item => ({ id: item.id, status: String(data.get(`status:${item.id}`)), approved_amount: Number(data.get(`approved:${item.id}`) || 0), reason: String(data.get(`reason:${item.id}`) ?? "") })) });
  }}>
    <label className="block">신탁사 회신 첨부<select className={field} name="reply_file_id" required><option value="">회신 선택</option>{replies.map(file => <option key={file.id} value={file.id}>{file.file_name}</option>)}</select></label>
    {items.map(item => <fieldset key={item.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3"><legend className="px-1 text-sm">{workflow.transactions.find(tx => tx.id === item.transaction_id)?.title || "원본 확인 필요"} · 요청 {money(item.requested_amount)}</legend>
      <label>회신 결과<select className={field} name={`status:${item.id}`}><option value="">이번 처리에서 제외</option>{(item.status === "REVIEWING" ? ["APPROVED", "PARTIAL", "SUPPLEMENT", "REJECTED"] as const : ["SUPPLEMENT", "REJECTED"] as const).map(status => <option key={status} value={status}>{itemStatusLabel[status]}</option>)}</select></label>
      <label>승인액<input className={field} name={`approved:${item.id}`} type="number" min="0" max={item.requested_amount} step="1" placeholder="보완·반려는 0원" /></label>
      <label>항목별 사유<input className={field} name={`reason:${item.id}`} /></label>
    </fieldset>)}
    <label className="block">회신 기록 사유<textarea className={field} name="reason" required rows={2} /></label>
    <button className={button} disabled={op.pending}>항목별 결과 저장</button><p role="status" className="text-sm">{op.message}</p>
  </form></details>;
}

function WithdrawalForm({ request, workspace, workflow }: { request: TrustRequestRow; workspace: TrustReadResult; workflow: WorkflowReadResult }) {
  const op = useTrustOperation();
  const items = workspace.items.filter(row => row.request_id === request.id && row.paid_amount === 0 && ["REVIEWING", "SUPPLEMENT", "APPROVED", "PARTIAL", "WITHDRAWAL_PENDING"].includes(row.status));
  if (!request.revision || !items.length) return null;
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">철회 요청·확인</summary><form className="mt-4 space-y-3" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const command = data.get("command") as "WITHDRAW_REQUEST" | "WITHDRAW_CONFIRM";
    op.command(command, { id: request.id, lock_version: request.lock_version, reason: String(data.get("reason") ?? ""), reply_file_id: String(data.get("reply_file_id") ?? "") || null, items: data.getAll("item_id").map(id => ({ id: String(id) })) });
  }}>
    <p className="text-sm text-slate-600">철회 요청 중에는 예약을 유지해. 신탁사 확인을 기록해야 해제돼. 기지급 항목은 지급 정정·회수 근거를 먼저 확인해줘.</p>
    <label className="block">처리<select className={field} name="command"><option value="WITHDRAW_REQUEST">철회 요청</option><option value="WITHDRAW_CONFIRM">신탁사 철회 확인</option></select></label>
    {items.map(item => <label key={item.id} className="flex gap-2 text-sm"><input type="checkbox" name="item_id" value={item.id} />{workflow.transactions.find(tx => tx.id === item.transaction_id)?.title || "원본 확인 필요"} · {itemStatusLabel[item.status]} · {money(item.requested_amount)}</label>)}
    <label className="block">확인 회신<select className={field} name="reply_file_id"><option value="">철회 요청 단계 · 회신 미첨부</option>{workspace.files.filter(row => row.request_id === request.id && row.purpose === "REPLY").map(file => <option key={file.id} value={file.id}>{file.file_name}</option>)}</select></label>
    <label className="block">철회 사유<textarea className={field} name="reason" required rows={2} /></label><button className={button} disabled={op.pending}>철회 처리 저장</button><p role="status" className="text-sm">{op.message}</p>
  </form></details>;
}

export function FundTrustPage({ workspace, workflow, sources, initialStatus = "ALL", initialRequestId = "" }: { workspace: TrustReadResult; workflow: WorkflowReadResult; sources: FundSourceOption[]; initialStatus?: string; initialRequestId?: string }) {
  const router = useRouter(); const op = useTrustOperation();
  const [selectedId, setSelectedId] = useState(initialRequestId);
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState(initialStatus === "ALL" || Object.hasOwn(requestStatusLabel, initialStatus) ? initialStatus : "ALL");
  const [sourceFilter, setSourceFilter] = useState("");
  const admin = workspace.viewer.permissions.includes("ADMIN");
  const canReview = admin || workspace.viewer.permissions.includes("APPROVE");
  const canAttach = canReview || workspace.viewer.permissions.includes("PAY");
  const selected = workspace.requests.find(row => row.id === selectedId);
  const visible = workspace.requests.filter(row => status === "ALL" || (status === "SUPPLEMENT" ? workspace.items.some(item => item.request_id === row.id && item.status === "SUPPLEMENT") : row.status === status));
  const choose = (id: string) => { setSelectedId(id); router.replace(`/finance/trust?status=${encodeURIComponent(status)}&request=${encodeURIComponent(id)}`, { scroll: false }); };
  return <div className="space-y-5">
    <header className={card}><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">신탁 집행관리</h1><p className="mt-2 text-sm text-slate-600">기존 지출을 묶어 요청하고 항목별 회신과 실제 지급을 연결해.</p></div><Link className={secondary} href="/finance/workflow-settings">지출·신탁 설정</Link></div>
      <div className="mt-4 flex flex-wrap gap-2">{canReview && <button className={button} onClick={() => setEditing(`new:${crypto.randomUUID()}`)}>신탁 요청 준비</button>}<Link className={secondary} href="/finance/expense-resolutions">기존 지출결의서</Link><Link className={secondary} href="/finance/payments?tab=READY">지급 가능한 거래 확인</Link></div>
    </header>
    {op.message && <p className="rounded-lg border bg-blue-50 p-3 text-sm" role="status">{op.message}</p>}
    {editing && canReview && <div><RequestEditor key={editing} existing={workspace.requests.find(row => row.id === editing)} workspace={workspace} workflow={workflow} onSaved={id => { setEditing(null); choose(id); }} /><button className={`${secondary} mt-2`} onClick={() => setEditing(null)}>편집 닫기</button></div>}
    <section className={card}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">신탁 요청 · {visible.length}건</h2><label>조회 상태<select className={field} value={status} onChange={event => { const next = event.target.value; setStatus(next); router.replace(`/finance/trust?status=${encodeURIComponent(next)}${selectedId ? `&request=${encodeURIComponent(selectedId)}` : ""}`, { scroll: false }); }}><option value="ALL">전체</option>{Object.entries(requestStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <div className="mt-4 space-y-2">{visible.map(request => <button key={request.id} className={`w-full rounded-xl border p-4 text-left ${selectedId === request.id ? "border-blue-500 bg-blue-50" : "bg-white"}`} aria-pressed={selectedId === request.id} onClick={() => choose(request.id)}><span className="flex flex-wrap justify-between gap-2 font-semibold"><span>{request.request_no} · {request.title || "요청명 미입력"}</span><span>{requestStatusLabel[request.status]}</span></span><span className="mt-2 block text-sm text-slate-600">요청일 {request.request_date || "미입력"} · 제출 {request.revision}회 · {workspace.items.filter(row => row.request_id === request.id && row.status !== "WITHDRAWN").length}항목</span></button>)}{!visible.length && <p className="py-6 text-center text-slate-500">이 조건에 해당하는 요청이 없어.</p>}</div>
    </section>
    {selected && <section className={`${card} space-y-4`} aria-label="신탁 요청 상세"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-bold">{selected.request_no} · {selected.title}</h2>{canReview && selected.revision === 0 && <button className={secondary} onClick={() => setEditing(selected.id)}>초안 수정</button>}</div>
      <p className="text-sm">{requestStatusLabel[selected.status]} · 접수정보 {selected.receipt_reference || "미입력"}</p>
      {canReview && selected.status === "SUBMITTED" && <button className={secondary} disabled={op.pending} onClick={() => op.command("REVIEW_START", { id: selected.id, lock_version: selected.lock_version })}>신탁사 심사 시작 기록</button>}
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b text-left">{["지출", "요청액", "승인액", "실제 지급", "상태"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{workspace.items.filter(row => row.request_id === selected.id).map(item => { const tx = workflow.transactions.find(row => row.id === item.transaction_id); return <tr className="border-b" key={item.id}><td className="p-2">{tx?.title || "원본 확인 필요"}<span className="block text-xs text-slate-500">항목 {item.id.slice(0, 8)}</span></td><td className="p-2">{money(item.requested_amount)}</td><td className="p-2">{money(item.approved_amount)}</td><td className="p-2">{money(item.paid_amount)}</td><td className="p-2">{itemStatusLabel[item.status]}{item.needs_review && <strong className="block text-amber-800">원본 변경 · 재검토 필요</strong>}{item.reason && <span className="block text-xs">{item.reason}</span>}</td></tr>; })}</tbody></table></div>
      <div className="flex flex-wrap gap-2">{selected.revision === 0 && <a className={secondary} href={`/finance/trust/${selected.id}/print?revision=0`} target="_blank" rel="noreferrer">요청 준비본 인쇄</a>}{workspace.submissions.filter(row => row.request_id === selected.id).map(row => <a key={row.id} className={secondary} href={`/finance/trust/${selected.id}/print?revision=${row.revision}`} target="_blank" rel="noreferrer">제출 {row.revision}차 열기·인쇄</a>)}</div>
      <div className="space-y-2">{workspace.files.filter(row => row.request_id === selected.id).map(file => <button className={secondary} key={file.id} disabled={op.pending} onClick={() => op.run(`download:${file.id}`, async () => { window.location.assign(await downloadTrustFile(file.id)); })}>{file.purpose === "REPLY" ? "회신" : "첨부"} · {file.file_name}</button>)}</div>
      <UploadRequestFile requestId={selected.id} canEdit={canAttach} key={selected.id} />
      {canReview && <><SubmissionForm key={`submit:${selected.id}:${selected.lock_version}`} request={selected} workspace={workspace} workflow={workflow} /><ReplyForm key={`reply:${selected.id}:${selected.lock_version}`} request={selected} workspace={workspace} workflow={workflow} /><WithdrawalForm key={`withdraw:${selected.id}:${selected.lock_version}`} request={selected} workspace={workspace} workflow={workflow} /></>}
      <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">변경 이력</summary>{workspace.events.filter(row => row.entity_id === selected.id).map(row => <p className="mt-2 text-sm" key={row.id}>{new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · {actionLabels[row.action.replace("TRUST:", "")] || "처리 기록"} · {row.reason || "저장"}</p>)}</details>
    </section>}
    <details className={card}><summary className="cursor-pointer text-lg font-bold">기존 지출 연결·계약 적용</summary><p className="mt-3 text-sm text-slate-600">원본별 최근 100건에서 선택해. 연결은 원본을 복사하거나 결의서를 추가로 만들지 않아.</p><input className={field} aria-label="연결할 원본 검색" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)} placeholder="문서번호 또는 지출 내용" />
      <div className="mt-3 space-y-3">{sources.filter(source => `${source.number} ${source.title}`.toLowerCase().includes(sourceFilter.toLowerCase())).map(source => {
        const tx = workflow.transactions.find(row => row.source_kind === source.source_kind && row.source_id === source.source_id);
        return <article className="rounded-xl border p-3" key={`${source.source_kind}:${source.source_id}`}><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{sourceLabels[source.source_kind]} · {source.number} · {source.title}</h3><p className="mt-1 text-sm">{money(source.amount)} · {source.status}</p></div>{!tx && canReview && <button className={secondary} disabled={op.pending} onClick={() => op.run(`connect:${source.source_kind}:${source.source_id}`, key => connectTrustSource(source.source_kind, source.source_id, key))}>원본 연결</button>}</div>
          {tx && <><p className="mt-2 text-sm">{tx.route === "UNKNOWN" ? "계약·집행 경로 확인 필요" : tx.route === "TRUST_DIRECT" ? "신탁사 직접 집행" : "계약상 운영계좌 집행"} · 총 미지급 {money(tx.amounts.remaining)} · 승인 중 미지급 {money(tx.amounts.approved_unpaid)} · 추가 요청 가능 {money(tx.amounts.requestable)}</p>
            {admin && <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); op.command("ROUTE_ASSIGN", { id: tx.id, revision: tx.revision, contract_version_id: String(data.get("contract_version_id")), route: String(data.get("route")), reason: String(data.get("reason")) }); }}><label>적용 계약<select className={field} name="contract_version_id" defaultValue={tx.contract_version_id ?? ""} required><option value="">확인된 계약 선택</option>{workspace.contracts.filter(row => row.status === "VERIFIED").map(row => <option key={row.id} value={row.id}>{row.name} · {row.version}차</option>)}</select></label><label>집행 경로<select className={field} name="route" defaultValue={tx.route === "UNKNOWN" ? "" : tx.route} required><option value="">계약 조건에 따라 선택</option><option value="TRUST_DIRECT">신탁사 직접 집행</option><option value="OPERATING">계약상 운영계좌 집행</option></select></label><label>계약 적용 근거<input className={field} name="reason" required /></label><button className={secondary} disabled={op.pending}>계약 적용 저장</button></form>}
            {canReview && <form className="mt-3 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const reason = String(data.get("reason")); op.run(`refresh:${tx.id}:${tx.revision}:${reason}`, key => refreshTrustSource(tx.id, reason, key)); }}><input className={`${field} max-w-md`} aria-label={`${source.number} 원본 변경 확인 사유`} name="reason" required placeholder="원본 변경 확인 사유" /><button className={secondary} disabled={op.pending}>변경된 원본 확인</button></form>}
          </>}
        </article>;
      })}</div>
    </details>
  </div>;
}
