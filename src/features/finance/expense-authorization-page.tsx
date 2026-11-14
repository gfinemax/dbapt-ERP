"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bindExpenseAuthorization } from "@/app/finance/expense-authorizations/actions";
import type { ManagedExpenseResolution } from "./expense-resolution-page";
import { expenseResolutionHref } from "./expense-entry";

type Member = { user_id: string; display_name: string; permissions: string[] };
const field = "mt-2 w-full rounded-lg border bg-white p-3";
const button = "rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-50";
const automaticReason = "고유 이름이 일치하는 활성 로그인 계정 자동 선택 후 관리자 확인";

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueMemberId(members: Member[], displayName: string) {
  const name = normalizedName(displayName);
  if (!name) return "";
  const matches = members.filter(member => normalizedName(member.display_name) === name);
  return matches.length === 1 ? matches[0].user_id : "";
}

function BindingForm({ record, members }: { record: ManagedExpenseResolution; members: Member[] }) {
  const router = useRouter();
  const eligible = members.filter(m => m.permissions.some(p => ["ADMIN", "APPROVE", "PAY"].includes(p)));
  const suggestedAuthor = uniqueMemberId(eligible, record.author);
  const suggestedSteps = record.approvalLine.map(step => uniqueMemberId(eligible, step.approver));
  const initialAuthor = record.authorization?.author_user_id ?? suggestedAuthor;
  const initialSteps = record.approvalLine.map((step, index) => {
    const saved = record.authorization?.steps.find(s => s.order === index + 1
      && s.legacy_step.approver === step.approver
      && s.legacy_step.role === step.role
      && s.legacy_step.order === step.order)?.approver_user_id;
    return saved ?? suggestedSteps[index];
  });
  const usedAutomaticSuggestion = (!record.authorization?.author_user_id && Boolean(suggestedAuthor))
    || initialSteps.some((id, index) => Boolean(id) && !record.authorization?.steps.some(step => step.order === index + 1 && step.approver_user_id === id));
  const [author, setAuthor] = useState(initialAuthor);
  const [steps, setSteps] = useState(initialSteps);
  const [reason, setReason] = useState(usedAutomaticSuggestion ? automaticReason : "");
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const busy = useRef(false); const operationKey = useRef<string | null>(null);
  const duplicateApprovers = steps.some((id, index) => Boolean(id) && steps.indexOf(id) !== index);
  const unresolved = [!author ? `작성자 ${record.author}` : "", ...record.approvalLine.map((step, index) => !steps[index] ? `${index + 1}차 ${step.approver}` : "")].filter(Boolean);
  const unregisteredApprovers = [...new Set(record.approvalLine.flatMap((step, index) => !steps[index] ? [step.approver] : []))];
  const returnTo = `/finance/expense-authorizations?id=${encodeURIComponent(record.id)}`;
  const label = (id: string) => { const member = members.find(m => m.user_id === id); return member ? `${member.display_name} · ${member.user_id}` : "미연결"; };
  function changed() { setPreview(false); setMessage(""); operationKey.current = null; }
  function submit() {
    if (busy.current || !preview) return;
    busy.current = true; operationKey.current ??= crypto.randomUUID();
    start(async () => {
      try {
        await bindExpenseAuthorization({ id: record.id, expected: record, version: record.authorization?.version ?? 0,
          author, steps: steps.flatMap((approver_user_id, i) => approver_user_id ? [{ order: i + 1, approver_user_id }] : []), reason, key: operationKey.current! });
        setMessage("확인된 계정 연결을 저장했어. 나머지 계정은 등록 후 이어서 연결할 수 있어."); setPreview(false); router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "계정 연결을 저장하지 못했어."); }
      finally { busy.current = false; }
    });
  }
  return <section className="mt-5 rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">{record.resolutionNo} · {record.subject || record.reason}</h2>
    <p className="mt-2">현재 상태: {record.approvalStatus} · 금액: {record.totalPaymentAmount.toLocaleString("ko-KR")}원</p>
    <p className="mt-2 text-sm text-slate-600">기존 연결을 우선하고, 정확히 같은 이름의 활성 계정이 하나뿐이면 자동 선택해. 작성자가 결재 순서에도 참여하면 같은 로그인 계정을 사용할 수 있어.</p>
    {unresolved.length
      ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p>자동 연결하지 못한 항목: {unresolved.join(", ")}. 로그인 계정을 등록하거나 직접 선택해.</p><div className="mt-3 flex flex-wrap gap-2">{unregisteredApprovers.map(name=><Link className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-bold" href={{pathname:"/finance/reimbursements",query:{tab:"settings",member:name,approval:"1",returnTo}}} key={name}>{name} 결재 계정 만들기</Link>)}<Link className="rounded-lg px-3 py-2 font-bold underline" href={{pathname:"/finance/reimbursements",query:{tab:"settings",returnTo}}}>직접 계정 등록</Link></div></div>
      : <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">현재 결재선의 로그인 계정을 모두 선택했어. 연결 내용을 확인해.</p>}
    <fieldset disabled={pending} className="mt-4 space-y-4"><label className="block">작성자 계정 · 기존 표시: {record.author}<select className={field} value={author} onChange={e => { setAuthor(e.target.value); changed(); }}><option value="">직접 선택</option>{eligible.map(m => <option key={m.user_id} value={m.user_id}>{label(m.user_id)}</option>)}</select></label>
      {record.approvalLine.map((step, index) => <label key={index} className="block">{index + 1}차 결재 계정 · 기존 표시: {step.approver} {step.role}<select className={field} value={steps[index]} onChange={e => { setSteps(current => current.map((value, i) => i === index ? e.target.value : value)); changed(); }}><option value="">직접 선택</option>{eligible.map(m => <option key={m.user_id} value={m.user_id}>{label(m.user_id)}</option>)}</select></label>)}
      <label className="block">연결 확인 근거<textarea className={field} value={reason} onChange={e => { setReason(e.target.value); changed(); }} /></label>
      {duplicateApprovers ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">같은 계정을 여러 결재 순서에 중복 연결할 수 없어.</p> : null}
      <button className={button} disabled={!author || !reason.trim() || duplicateApprovers} onClick={() => setPreview(true)}>연결 내용 확인</button>
    </fieldset>
    {preview && <div className="mt-5 rounded-xl border bg-slate-50 p-4"><h3 className="font-bold">저장할 계정 연결</h3><p className="mt-2 break-all">작성자: {label(author)}</p>{steps.map((id, i) => <p className="mt-2 break-all" key={i}>{i + 1}차 결재자: {label(id)}</p>)}<p className="my-3">확인 근거: {reason}</p><button className={button} disabled={pending} onClick={submit}>{pending ? "저장 중…" : "확인한 계정 연결 저장"}</button></div>}
    <p role="status" className="my-3">{message}</p><Link className="underline" href={expenseResolutionHref({ resolutionId: record.id })}>기존 결의서 상세로 이동</Link>
  </section>;
}

export function ExpenseAuthorizationPage({ records, members, initialId }: { records: ManagedExpenseResolution[]; members: Member[]; initialId?: string }) {
  const [id, setId] = useState(records.some(record => record.id === initialId) ? initialId! : ""); const record = records.find(r => r.id === id);
  return <div><h1 className="text-2xl font-bold">작성자·결재선 계정 연결</h1><p className="mt-3">기존 연결을 우선하고, 정확히 같은 이름의 활성 로그인 계정이 하나일 때만 자동 선택해. 동명이인과 미등록 계정은 직접 확인해.</p>
    <label className="mt-4 block">지출결의 원본<select className={field} value={id} onChange={e => setId(e.target.value)}><option value="">원본 선택</option>{records.map(r => <option key={r.id} value={r.id}>{r.resolutionNo} · {r.subject || r.reason}</option>)}</select></label>
    {record && <BindingForm key={`${record.id}:${record.authorization?.version ?? 0}`} record={record} members={members} />}
  </div>;
}
