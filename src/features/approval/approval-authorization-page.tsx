"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bindApprovalAuthorization } from "@/app/approval/authorizations/actions";
import type { ApprovalDocument } from "./approval-domain";


type Member = { user_id: string; display_name: string; permissions: string[] };
const field = "mt-2 w-full rounded-lg border bg-white p-3";
const button = "rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-50";

function BindingForm({ record, members }: { record: ApprovalDocument; members: Member[] }) {
  const router = useRouter();
  const [author, setAuthor] = useState(record.authorization?.drafter_user_id ?? "");
  const [steps, setSteps] = useState(record.approvalSteps.map(step => record.authorization?.steps.find(s => s.order === step.order)?.user_id ?? ""));
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const busy = useRef(false); const operationKey = useRef<string | null>(null);
  const eligible = members.filter(m => m.permissions.some(p => ["ADMIN", "APPROVE", "PAY"].includes(p)));
  const approvers = members.filter(m => m.permissions.some(p => ["ADMIN", "APPROVE"].includes(p)));
  const label = (id: string) => { const member = members.find(m => m.user_id === id); return member ? `${member.display_name} · ${member.user_id}` : "미연결"; };
  function changed() { setPreview(false); setMessage(""); operationKey.current = null; }
  function submit() {
    if (busy.current || !preview) return;
    busy.current = true; operationKey.current ??= crypto.randomUUID();
    start(async () => {
      try {
        await bindApprovalAuthorization({ id: record.id, version: record.authorization?.version ?? 0,
          author, steps: steps.map((approver_user_id, i) => ({ order: record.approvalSteps[i].order, user_id: approver_user_id })), reason, key: operationKey.current! });
        setMessage("계정 연결을 저장했어. 원본 금액과 과거 이력은 유지돼."); setPreview(false); router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "계정 연결을 저장하지 못했어."); }
      finally { busy.current = false; }
    });
  }
  return <section className="mt-5 rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">{record.documentNo} · {record.title}</h2>
    <p className="mt-2">현재 상태: {record.approvalStatus} · 금액: {record.amount.toLocaleString("ko-KR")}원</p>
    <p className="mt-2 text-sm text-slate-600">기존 이름과 이력은 유지돼. 과거 승인 서명을 소급 생성하지 않아. 실제 담당 계정을 확인해서 선택해줘. 계정 연결 자체로 승인되거나 지급되지는 않아.</p>
    <fieldset disabled={pending} className="mt-4 space-y-4"><label className="block">기안자 계정 · 기존 표시: {record.drafterLabel}<select className={field} value={author} onChange={e => { setAuthor(e.target.value); changed(); }}><option value="">직접 선택</option>{eligible.map(m => <option key={m.user_id} value={m.user_id}>{label(m.user_id)}</option>)}</select></label>
      {record.approvalSteps.map((step, index) => <label key={index} className="block">{index + 1}차 결재 계정 · 기존 표시: {step.approverLabel} {step.approverRole}<select className={field} value={steps[index]} onChange={e => { setSteps(current => current.map((value, i) => i === index ? e.target.value : value)); changed(); }}><option value="">직접 선택</option>{approvers.map(m => <option key={m.user_id} value={m.user_id}>{label(m.user_id)}</option>)}</select></label>)}
      <label className="block">연결 확인 근거<textarea className={field} value={reason} onChange={e => { setReason(e.target.value); changed(); }} /></label>
      <button className={button} disabled={!author || !steps.length || steps.some(s => !s) || !reason.trim()} onClick={() => setPreview(true)}>연결 내용 확인</button>
    </fieldset>
    {preview && <div className="mt-5 rounded-xl border bg-slate-50 p-4"><h3 className="font-bold">저장할 계정 연결</h3><p className="mt-2 break-all">기안자: {label(author)}</p>{steps.map((id, i) => <p className="mt-2 break-all" key={i}>{i + 1}차 결재자: {label(id)}</p>)}<p className="my-3">확인 근거: {reason}</p><button className={button} disabled={pending} onClick={submit}>{pending ? "저장 중…" : "확인한 계정 연결 저장"}</button></div>}
    <p role="status" className="my-3">{message}</p><Link className="underline" href={`/approval/${record.id}`}>기존 기안 상세로 이동</Link>
  </section>;
}

export function ApprovalAuthorizationPage({ records, members }: { records: ApprovalDocument[]; members: Member[] }) {
  const [id, setId] = useState(""); const record = records.find(r => r.id === id);
  return <div><h1 className="text-2xl font-bold">기안자·결재선 계정 연결</h1><p className="mt-3">같은 조합의 원본과 로그인 계정을 직접 연결해. 이름으로 자동 연결하지 않아.</p>
    <label className="mt-4 block">기안 원본<select className={field} value={id} onChange={e => setId(e.target.value)}><option value="">원본 선택</option>{records.map(r => <option key={r.id} value={r.id}>{r.documentNo} · {r.title}</option>)}</select></label>
    {record && <BindingForm key={`${record.id}:${record.authorization?.version ?? 0}`} record={record} members={members} />}
  </div>;
}
