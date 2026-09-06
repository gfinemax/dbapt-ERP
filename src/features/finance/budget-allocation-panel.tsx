"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignBudgetSource } from "@/app/finance/reimbursements/actions";
import { hasReimbursementPermission, type BudgetAllocationLine, type BudgetAllocationSource } from "./reimbursement-domain";
import type { ReimbursementWorkspace } from "./reimbursement-repository";

const input="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm";
const button="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40";
export const budgetSourceLabels:Record<string,string>={RESOLUTION:"지출결의",RESERVATION:"기안 예약",QUICK:"간편지출",MANUAL:"수기 집행액",PERSONAL:"개인 정산"};
export const budgetStateLabels:Record<string,string>={PENDING:"심사 중",RESERVED:"집행 예약",USED:"실제 사용",CANCELLED:"예산 반영 취소"};
const money=(n:number)=>Number(n).toLocaleString("ko-KR")+"원";

export function BudgetAllocationPanel({workspace:w}:{workspace:ReimbursementWorkspace}) {
  const [selection,setSelection]=useState("");
  const sources=w.allocationSources??[];
  const source=sources.find(s=>`${s.source_kind}:${s.source_id}`===selection);
  const unresolved=sources.filter(s=>s.needs_review).length;
  return <section className="rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-bold">예산 귀속 확인·수정</h2>
    <p className="my-3 text-sm text-slate-600">확인 필요 {unresolved}건 · 원본의 예산항목과 사용월을 확인해줘. 여러 월·항목으로 나눌 수 있어. 배정 변경은 실제 지급일을 바꾸지 않아.</p>
    <label className="block">원본 선택<select className={input} value={selection} onChange={e=>setSelection(e.target.value)}>
      <option value="">확인할 원본 선택</option>
      {[...sources].sort((a,b)=>Number(b.needs_review)-Number(a.needs_review)).map(s=><option key={`${s.source_kind}:${s.source_id}`} value={`${s.source_kind}:${s.source_id}`}>{s.needs_review?"[확인 필요]":"[확인 완료]"} {budgetSourceLabels[s.source_kind]} · {s.title} · {money(s.amount)}</option>)}
    </select></label>
    {!w.periods.length&&<p className="mt-3 text-sm text-amber-800">아직 개설한 월이 없어. 운영 기준을 저장한 다음 아래 월 마감 관리에서 필요한 월을 먼저 개설해줘.</p>}
    {source&&<AllocationForm key={`${selection}:${source.revision}:${source.signature}`} source={source} workspace={w}/>}
    {!sources.length&&<p className="mt-3 text-sm">수동 귀속을 확인할 원본이 없어.</p>}
  </section>;
}

function AllocationForm({source:s,workspace:w}:{source:BudgetAllocationSource;workspace:ReimbursementWorkspace}) {
  const router=useRouter(); const [pending,start]=useTransition(); const [message,setMessage]=useState("");
  const [state,setState]=useState(s.paid_at?"USED":s.state==="PENDING"&&s.source_state==="APPROVED"?"RESERVED":s.state??(s.source_kind==="MANUAL"?"USED":s.source_state==="PENDING"?"PENDING":"RESERVED"));
  const [lines,setLines]=useState<BudgetAllocationLine[]>(s.revision>0?s.lines:[{budget_id:"",month:"",amount:Number(s.amount),used_on:""}]);
  const [covered,setCovered]=useState(Number(s.covered_amount));
  const budgets=w.allocationBudgets??[];
  const editable=hasReimbursementPermission(w.member,"APPROVE");
  const difference=Number(s.amount)-covered-lines.reduce((sum,l)=>sum+Number(l.amount),0);
  const closed=[...lines,...s.lines].some(l=>w.periods.some(p=>p.month===l.month&&p.status==="CLOSED"));
  function change(index:number,value:Partial<BudgetAllocationLine>) {setLines(old=>old.map((l,i)=>i===index?{...l,...value}:l));}
  return <form className="mt-4 space-y-4" onSubmit={e=>{
    e.preventDefault();const form=new FormData(e.currentTarget);setMessage("");
    start(async()=>{try{await assignBudgetSource({source_kind:s.source_kind,source_id:s.source_id,signature:s.signature,revision:s.revision,state,lines,covered_amount:covered,reason:String(form.get("reason")??""),evidence_verified:form.get("evidence_verified")==="on",approve_over_budget:form.get("approve_over_budget")==="on"});setMessage("배정을 저장했어. 최신 집계와 처리 이력에 반영했어.");router.refresh();}catch(error){setMessage(error instanceof Error?error.message:"저장하지 못했어. 입력 내용을 확인해줘.");}});
  }}>
    <p className="break-all text-xs text-slate-500">원본 번호: {s.source_id} · 확인 버전 {s.revision}</p>
    <p className="text-sm">원본 금액 {money(s.amount)} · 원본 예산항목 {s.suggested_budget||"미입력"} · 원본 사용월 {s.suggested_month?.slice(0,7)||"미입력"}</p>
    {s.paid_at&&<p className="text-sm">실제 지급: {new Date(s.paid_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</p>}
    {closed&&<p className="rounded-lg bg-amber-50 p-3 text-sm">마감된 월의 수정이야. 저장하면 수정 보고서가 추가되고 기존 보고서는 보존돼. 마감 수정 권한이 필요해.</p>}
    <fieldset disabled={pending||!editable} className="space-y-4">
      <label className="block">예산 반영 상태<select className={input} value={state} onChange={e=>setState(e.target.value)}>
        {Object.entries(budgetStateLabels).filter(([key])=>s.source_kind==="MANUAL"||s.paid_at?key==="USED":key==="CANCELLED"||(s.source_state==="PENDING"?key==="PENDING":key==="RESERVED"||(key==="USED"&&s.source_kind!=="RESERVATION"))).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
      {lines.map((line,index)=><div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2" key={index}>
        <label>귀속월 {index+1}<select className={input} value={line.month} required onChange={e=>change(index,{month:e.target.value,budget_id:""})}><option value="">개설된 월 선택</option>{w.periods.map(p=><option key={p.month} value={p.month}>{p.month.slice(0,7)}{p.status==="CLOSED"?" · 마감":""}</option>)}</select></label>
        <label>예산항목 {index+1}<select className={input} value={line.budget_id} required onChange={e=>change(index,{budget_id:e.target.value})}><option value="">항목 선택</option>{budgets.filter(b=>b.fiscal_year===Number(line.month.slice(0,4))).map(b=><option key={b.id} value={b.id}>{b.budget_item}</option>)}</select></label>
        <label>배정액 {index+1}<input className={input} type="number" min="1" step="1" required value={line.amount||""} onChange={e=>change(index,{amount:Number(e.target.value)})}/></label>
        {state==="USED"&&s.source_kind!=="MANUAL"&&<label>실제 사용일 {index+1}<input className={input} type="date" required value={line.used_on??""} onChange={e=>change(index,{used_on:e.target.value})}/></label>}
        <button className={button} type="button" onClick={()=>setLines(old=>old.filter((_,i)=>i!==index))}>배정 {index+1} 삭제</button>
      </div>)}
      <button className={button} type="button" onClick={()=>setLines(old=>[...old,{budget_id:"",month:"",amount:0,used_on:""}])}>배정 추가</button>
      {s.source_kind==="MANUAL"&&<label className="block">기존 지출과 중복 확인한 금액<input className={input} type="number" min="0" step="1" max={s.amount} value={covered} onChange={e=>setCovered(Number(e.target.value))}/><span className="text-xs text-slate-600">이미 집계된 원본을 사유에 적어줘. 중복 금액을 제외한 나머지만 월별로 배정해.</span></label>}
      <p className={difference?"text-sm text-red-700":"text-sm text-green-700"}>미배정 차액: {money(difference)}</p>
      {state==="USED"&&<label className="block text-sm"><input name="evidence_verified" type="checkbox" required/> 원본 증빙과 실제 사용내역을 확인했어.</label>}
      {hasReimbursementPermission(w.member,"SENIOR")&&<label className="block text-sm"><input name="approve_over_budget" type="checkbox"/> 월·연간 예산 초과가 있으면 사유를 검토하고 추가 승인해.</label>}
      <label className="block">배정·수정 사유<textarea className={input} name="reason" rows={3} required placeholder="확인한 증빙, 귀속 근거, 수정 사유"/></label>
      <button className={`${button} bg-blue-700 text-white`} disabled={difference!==0}>배정 확인·저장</button>
    </fieldset>
    {!editable&&<p className="text-sm">예산 배정 승인 권한이 있는 담당자가 저장할 수 있어.</p>}
    {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
  </form>;
}
