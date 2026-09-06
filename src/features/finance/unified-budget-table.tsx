"use client";

import { useState } from "react";
import { budgetRemaining,budgetUsed,type BudgetEntry,type ReimbursementBudget } from "./reimbursement-domain";
import { budgetSourceLabels,budgetStateLabels } from "./budget-allocation-panel";

const money=(n:number)=>Number(n).toLocaleString("ko-KR")+"원";
export function UnifiedBudgetTable({budgets,entries}:{budgets:ReimbursementBudget[];entries?:BudgetEntry[]}) {
  const [selection,setSelection]=useState<{budgetId:string;state:string}|null>(null);
  const unresolved=Math.max(0,...budgets.map(b=>Number(b.unresolved_count??0)));
  const details=selection?(entries??[]).filter(e=>e.budget_id===selection.budgetId&&e.state===selection.state):[];
  function amount(b:ReimbursementBudget,state:string,value:number) {
    const selected=selection?.budgetId===b.id&&selection.state===state;
    return entries?<button type="button" aria-pressed={selected} aria-label={`${b.budget_item} ${budgetStateLabels[state]} 내역`} onClick={()=>setSelection({budgetId:b.id,state})} className={`rounded px-2 py-1 underline ${selected?"bg-blue-100 font-bold":"text-blue-700"}`}>{money(value)}</button>:money(value);
  }
  return <>
    {unresolved>0&&<p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm">귀속 확인 필요 {unresolved}건이 있어. 아래 금액은 확인된 내역만 집계한 값이며 가용액 확정과 신규 집행 전에 예산 배정을 마쳐줘.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-right text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-3 text-left">예산항목</th><th>월 예산</th><th>간편지출</th><th>개인 정산</th><th>지출결의</th><th>수기 확인분</th><th>사용액 합계</th><th>집행 예약</th><th>심사 중</th><th>{unresolved?"확인분 잔액":"가용액"}</th></tr></thead><tbody>
      {budgets.map(b=><tr key={b.id} className="border-b"><th className="p-3 text-left font-medium">{b.budget_item}</th><td>{money(b.monthly_amount)}</td><td>{money(b.quick_amount)}</td><td>{money(b.personal_amount)}</td><td>{money(b.resolution_amount??0)}</td><td>{money(b.manual_amount??0)}</td><td>{amount(b,"USED",budgetUsed(b))}</td><td>{amount(b,"RESERVED",b.reserved_amount)}</td><td>{amount(b,"PENDING",b.pending_amount??0)}</td><td className={budgetRemaining(b)<0?"font-bold text-red-700":""}>{money(budgetRemaining(b))}</td></tr>)}
    </tbody></table>{!budgets.length&&<p className="p-4">이 연도에 등록된 예산이 없어.</p>}</div>
    {selection&&<section className="mt-4 rounded-xl border p-4" aria-label="선택한 예산 내역"><div className="flex justify-between gap-3"><h3 className="font-bold">{budgets.find(b=>b.id===selection.budgetId)?.budget_item} · {budgetStateLabels[selection.state]}</h3><button type="button" className="rounded border px-3 py-1 text-sm" onClick={()=>setSelection(null)}>선택 해제</button></div>
      <ul className="mt-3 space-y-3">{details.map((e,i)=><li key={`${e.source_kind}:${e.source_id}:${i}`} className="border-t pt-2 text-sm"><p>{budgetSourceLabels[e.source_kind]??e.source_kind} · {e.title} · {money(e.amount)}</p><p className="break-all text-xs text-slate-500">원본 번호 {e.source_id} · 귀속 {e.month.slice(0,7)} · 실제 지급 {e.paid_at?new Date(e.paid_at).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"}):"미지급 또는 지급정보 없음"}</p></li>)}</ul>{!details.length&&<p className="mt-3 text-sm">해당 상태의 내역이 없어.</p>}
    </section>}
  </>;
}
