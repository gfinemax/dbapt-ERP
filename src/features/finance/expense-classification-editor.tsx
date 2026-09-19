"use client";

import { useRef, useState, useTransition } from "react";
import { loadExpenseClassificationAction, saveExpenseClassificationAction } from "@/app/finance/expenses/actions";
import { classificationOptions, validateClassification, type ExpenseClassificationAxes, type ExpenseClassificationContext, type ExpenseClassificationInput, type ExpenseClassification } from "./expense-classification";

const labels: Record<keyof ExpenseClassificationAxes, string> = { cost_category: "비용 성격", payment_method: "결제수단", funding_origin: "돈의 출처", processing_route: "처리 방식" };
export function ExpenseClassificationEditor({ transactionId, load = (id) => loadExpenseClassificationAction(id), save = (input, key) => saveExpenseClassificationAction(input, key) }: {
  transactionId: string;
  load?: (id: string) => Promise<ExpenseClassificationContext>;
  save?: (input: ExpenseClassificationInput, key: string) => Promise<ExpenseClassification>;
}) {
  const [input, setInput] = useState<ExpenseClassificationInput | null>(null);
  const [context, setContext] = useState<ExpenseClassificationContext | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const attempt = useRef<{ serialized: string; key: string } | null>(null);
  function open() {
    setMessage("");
    startTransition(async () => {
      try {
        const data = await load(transactionId);
        setContext(data);
        setInput({ transaction_id: transactionId, source_signature: data.sourceSignature, expected_version: data.classification?.version ?? 0,
          cost_category: data.classification?.cost_category ?? "UNKNOWN", payment_method: data.classification?.payment_method ?? "UNKNOWN",
          funding_origin: data.classification?.funding_origin ?? "UNKNOWN", processing_route: data.classification?.processing_route ?? "UNKNOWN",
          advance_transaction_id: data.classification?.advance_transaction_id ?? null, reason: "" });
      } catch (error) { setMessage(error instanceof Error ? error.message : "분류 정보를 불러오지 못했어."); }
    });
  }
  function submit() {
    if (!input) return;
    const errors = validateClassification(input);
    if (errors.length) { setMessage(errors.join(" ")); return; }
    const serialized = JSON.stringify(input);
    if (attempt.current?.serialized !== serialized) attempt.current = { serialized, key: crypto.randomUUID() };
    const key = attempt.current.key;
    startTransition(async () => {
      try {
        const result = await save(input, key);
        setInput(null); setContext(null); attempt.current = null;
        setMessage(`분류를 저장했어 (버전 ${result.version}). 승인·지급 상태는 변경하지 않았어.`);
      } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했어."); }
    });
  }
  return <section aria-label="지출 분류" className="my-4 rounded-xl border border-slate-200 p-4">
    <h3 className="font-semibold">지출 분류</h3>
    <p className="mt-1 text-xs text-slate-600">결제수단과 돈의 출처를 따로 확인해. 분류 저장은 승인·예산 확정·지급 처리가 아니야.</p>
    {!input ? <button className="mt-3 rounded-lg border px-3 py-2 text-sm disabled:opacity-40" type="button" disabled={pending} onClick={open}>분류 확인·수정</button> : <form className="mt-3 space-y-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(labels) as (keyof ExpenseClassificationAxes)[]).map((key) => <label className="text-sm" key={key}>{labels[key]}<select className="mt-1 w-full rounded-lg border bg-white p-2" value={input[key]} onChange={(event) => {
          const value = event.target.value;
          setInput((current) => current ? { ...current, [key]: value, ...(key === "funding_origin" && value !== "ADVANCE" ? { advance_transaction_id: null } : {}) } : current);
        }}>{Object.entries(classificationOptions[key]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
        {input.funding_origin === "ADVANCE" ? <label className="text-sm sm:col-span-2">받은 선지급금<select required className="mt-1 w-full rounded-lg border bg-white p-2" value={input.advance_transaction_id ?? ""} onChange={(event) => setInput({ ...input, advance_transaction_id: event.target.value || null })}><option value="">실제 지급 내역 선택</option>{context?.advances.map((advance) => <option key={advance.id} value={advance.id}>{advance.title}</option>)}</select></label> : null}
        <label className="text-sm sm:col-span-2">분류 확인 사유<textarea required maxLength={2000} className="mt-1 w-full rounded-lg border p-2" value={input.reason} onChange={(event) => setInput({ ...input, reason: event.target.value })} /></label>
      </fieldset>
      <p className="text-xs text-slate-600">예산 상태는 서버 검증 후 확정돼. 분류를 변경하면 예산 상태를 다시 확인해야 해.</p>
      <div className="flex gap-2"><button disabled={pending} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40">분류 저장</button><button disabled={pending} className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => { setInput(null); setContext(null); setMessage(""); }}>취소</button></div>
    </form>}
    {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
  </section>;
}
