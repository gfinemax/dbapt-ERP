"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { changeReimbursementPassword, reimbursementLogin, reimbursementLogout, runReimbursementCommand, saveReimbursementMember, submitReimbursement } from "@/app/finance/reimbursements/actions";
import { budgetRemaining, budgetUsed, hasReimbursementPermission, koreaDate, periodLabel, reimbursementCommandLabels, reimbursementPermissions, reimbursementStatusLabels, requestActions, type Reimbursement, type ReimbursementBudget, type ReimbursementReport } from "./reimbursement-domain";
import type { ReimbursementWorkspace } from "./reimbursement-repository";

const card="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5";
const input="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const button="rounded-lg bg-[var(--color-deep-cobalt)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";
const money=(n:number)=>Number(n).toLocaleString("ko-KR")+"원";
const dateTime=(s:string|null)=>s ? new Date(s).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}) : "—";
const permissionLabels={ADMIN:"관리자",APPROVE:"정산·지연 승인",SENIOR:"장기 지연·예산 초과 승인",CLOSE:"월 마감·과거 월 수정",PAY:"지급 연결"};

function useOperation() {
  const router=useRouter(); const [message,setMessage]=useState(""); const [pending,start]=useTransition();
  function run(fn:()=>Promise<unknown>,success="처리했어. 최신 자료를 다시 불러왔어.") {
    setMessage(""); start(async()=>{try{await fn();setMessage(success);router.refresh();}catch(e){setMessage(e instanceof Error?e.message:"처리하지 못했어. 다시 확인해줘.");}});
  }
  return {run,message,pending};
}
export function ReimbursementLogin({error}:{error?:string}) {
  const op=useOperation();
  return <section className={`${card} mx-auto max-w-lg`}><h1 className="text-2xl font-bold">개인 지출 정산·월 마감</h1>
    <p className="my-4 text-sm text-slate-600">사용월의 예산과 실제 지급일을 구분해서 관리해. 마감과 승인 이력을 남기기 위해 본인 계정으로 로그인해줘.</p>
    <form className="space-y-4" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);op.run(()=>reimbursementLogin(form),"로그인했어.");}}>
      <label className="block">이메일<input className={input} name="email" type="email" autoComplete="username" required /></label>
      <label className="block">비밀번호<input className={input} name="password" type="password" autoComplete="current-password" required /></label>
      <button className={button} disabled={op.pending}>로그인</button>
    </form><p role="status" className="mt-4 text-sm">{op.message || error}</p>
    <p className="mt-3 text-sm text-slate-600">계정이 없으면 정산 관리자에게 계정과 권한 등록을 요청해줘.</p>
  </section>;
}
function BudgetTable({budgets}:{budgets:ReimbursementBudget[]}) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-3 text-left">예산항목</th><th>월 예산</th><th>간편지출</th><th>개인 정산 승인액</th><th>사용액 합계</th><th>집행 예약액</th><th>가용액</th></tr></thead><tbody>
    {budgets.map(b=><tr className="border-b" key={b.id}><th className="p-3 text-left font-medium">{b.budget_item}</th><td>{money(b.monthly_amount)}</td><td>{money(b.quick_amount)}</td><td>{money(b.personal_amount)}</td><td>{money(budgetUsed(b))}</td><td>{money(b.reserved_amount)}</td><td className={budgetRemaining(b)<0?"font-bold text-red-700":""}>{money(budgetRemaining(b))}</td></tr>)}
  </tbody></table>{!budgets.length&&<p className="p-4">이 연도에 등록된 예산이 없어.</p>}</div>;
}
function Report({report,previous}:{report:ReimbursementReport;previous?:ReimbursementReport}) {
  return <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">{report.month.slice(0,7)} · {report.revision===1?"최초 마감":`수정 ${report.revision-1}차`} · {dateTime(report.created_at)}</summary>
    <p className="my-3 text-sm">사유: {report.reason}</p>
    {previous&&<p className="mb-3 text-sm">직전 보고 대비 사용액 변경: {money(report.snapshot.budgets.reduce((s,b)=>s+budgetUsed(b),0)-previous.snapshot.budgets.reduce((s,b)=>s+budgetUsed(b),0))}</p>}
    <BudgetTable budgets={report.snapshot.budgets} />
    <a className="mt-3 inline-block text-sm text-blue-700 underline" href={`/finance/reimbursements/report?month=${report.month}&revision=${report.revision}`} target="_blank" rel="noreferrer">보고서 열기·인쇄</a>
  </details>;
}
export function ReimbursementPage({workspace:w}:{workspace:ReimbursementWorkspace}) {
  const op=useOperation(); const router=useRouter(); const today=koreaDate();
  const [tab,setTab]=useState("requests"); const [selected,setSelected]=useState<Reimbursement|null>(null); const [action,setAction]=useState("");
  const [source,setSource]=useState(""); const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [usedOn,setUsedOn]=useState(today); const [amount,setAmount]=useState(""); const [merchant,setMerchant]=useState(""); const [purpose,setPurpose]=useState(""); const [budgetId,setBudgetId]=useState("");
  const [status,setStatus]=useState("ALL");
  const period=w.periods.find(p=>p.month===w.month);
  const usedPeriod=w.periods.find(p=>p.month===`${usedOn.slice(0,7)}-01`);
  const late=Boolean(usedPeriod&&(today>usedPeriod.submission_deadline||usedPeriod.status==="CLOSED"||Math.floor((Date.parse(today)-Date.parse(usedOn))/86400000)>usedPeriod.long_delay_days));
  const isAdmin=hasReimbursementPermission(w.member,"ADMIN"); const canClose=hasReimbursementPermission(w.member,"CLOSE");
  const names=Object.fromEntries(w.members.map(m=>[m.user_id,m.display_name]));
  const visible=w.requests.filter(r=>status==="ALL"||r.status===status);
  function command(command:string,data:Record<string,unknown>){op.run(async()=>{await runReimbursementCommand(command,data);setSelected(null);setAction("");});}
  function selectSource(id:string){setSource(id);const s=w.sources.find(s=>s.id===id);if(s){setUsedOn(koreaDate(new Date(s.occurred_at)));setAmount(String(s.amount));setMerchant(s.counterparty);setPurpose(s.usage_description);setBudgetId(w.budgets.find(b=>b.budget_item===s.budget_item)?.id??"");}}
  return <>
    <header className={card}><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">개인 지출 정산·월 마감</h1><p className="mt-2 text-sm text-slate-600">사용월 예산에 한 번 반영하고, 지급일은 실제 출금일로 기록해.</p></div><div className="text-sm">{w.member.display_name}<button className={`${secondary} ml-3`} onClick={()=>op.run(reimbursementLogout)} disabled={op.pending}>로그아웃</button></div></div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><label>조회 월 <input aria-label="조회 월" className="rounded-lg border p-2" type="month" value={w.month.slice(0,7)} onChange={e=>{if(e.target.value)router.push(`/finance/reimbursements?month=${e.target.value}`);}} /></label><span className="rounded-full bg-blue-50 px-3 py-2 text-sm">{period?periodLabel(period,today):"접수월 미개설"}</span>{period&&<span className="text-sm text-slate-600">제출 {period.submission_deadline} · 보완 {period.completion_deadline}</span>}</div>
    </header>
    <nav aria-label="정산 업무" className="flex flex-wrap gap-2">{[["requests","정산 신청·처리"],["budgets","예산·마감 보고서"],["settings","운영 기준·권한"]].map(([id,label])=><button key={id} aria-pressed={tab===id} className={tab===id?button:secondary} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {op.message&&<p role="status" className="rounded-lg border bg-blue-50 p-4">{op.message}</p>}
    {tab==="requests"&&<>
      <details className={card}><summary className="cursor-pointer text-lg font-bold">개인 지출 정산 신청</summary>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const el=e.currentTarget;const data=new FormData(el);op.run(async()=>{await submitReimbursement(data);el.reset();setRequestId(crypto.randomUUID());setSource("");setAmount("");setMerchant("");setPurpose("");setBudgetId("");},"신청했어. 사용월을 선택하면 처리 상태를 확인할 수 있어.");}}>
          <input type="hidden" name="id" value={requestId}/>
          <label className="sm:col-span-2">기존 개인 선지출 연결<select className={input} name="source_quick_id" value={source} onChange={e=>selectSource(e.target.value)}><option value="">새 지출 신청</option>{w.sources.map(s=><option key={s.id} value={s.id}>{koreaDate(new Date(s.occurred_at))} · {s.counterparty} · {money(s.amount)}</option>)}</select><span className="text-xs text-slate-600">기존 간편지출이면 해당 기록을 연결해줘. 승인 시 중복 집계를 방지해.</span></label>
          <label>실제 사용일<input className={input} name="used_on" type="date" required min={`${today.slice(0,4)}-01-01`} max={today} value={usedOn} onChange={e=>setUsedOn(e.target.value)}/></label>
          <label>예산 귀속월<input className={input} readOnly value={usedOn.slice(0,7)}/></label>
          <label>예산항목<select className={input} name="budget_id" required value={budgetId} onChange={e=>setBudgetId(e.target.value)}><option value="">예산항목 선택</option>{w.budgets.map(b=><option key={b.id} value={b.id}>{b.budget_item}</option>)}</select></label>
          <label>개인 결제 금액<input className={input} type="number" name="amount" min="1" step="1" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
          <label>사용처<input className={input} name="merchant" required value={merchant} onChange={e=>setMerchant(e.target.value)}/></label>
          <label>업무 목적<input className={input} name="purpose" required value={purpose} onChange={e=>setPurpose(e.target.value)}/></label>
          <label className="sm:col-span-2">영수증·개인 결제 증빙<input className={input} type="file" name="evidence" accept="application/pdf,image/png,image/jpeg,image/webp" required/><span className="text-xs text-slate-600">관련 증빙을 하나의 PDF 또는 이미지로 첨부해줘. 최대 3MB.</span></label>
          <label className="sm:col-span-2">지연 사유{late?" (필수)":" (지연 신청 시)"}<textarea className={input} name="delay_reason" rows={3} required={late}/></label>
          <p className="text-sm text-slate-600 sm:col-span-2">{!usedPeriod?"해당 사용월이 아직 개설되지 않았어. 마감 담당자가 접수월을 먼저 개설해야 해.":late?"지연 신청이므로 예외 승인이나 장기 지연 검토가 필요해.":"신청일과 승인일은 실제 처리한 시점으로 남겨."}</p>
          <button className={button} disabled={op.pending||!usedPeriod}>정산 신청</button>
        </form>
      </details>
      <section className={card}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{w.month.slice(0,7)} 사용분 · {visible.length}건</h2><select aria-label="정산 상태" className="rounded-lg border p-2" value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">전체 상태</option>{Object.entries(reimbursementStatusLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>
        <div className="space-y-4">{visible.map(r=><article key={r.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{r.merchant} · {money(r.amount)}</h3><span className="text-sm font-semibold">{reimbursementStatusLabels[r.status]}</span></div>
          <p className="mt-2 text-sm">{r.purpose}</p><p className="mt-2 text-sm text-slate-600">신청자 {names[r.applicant_id]??"등록 사용자"} · 사용일 {r.used_on} · 예산 귀속 {r.budget_month.slice(0,7)}</p>
          <p className="mt-1 text-xs text-slate-600">신청 {dateTime(r.submitted_at)} · 예산 승인 {dateTime(r.approved_at)} · 실제 지급 {dateTime(r.paid_at)}</p>
          {r.delay_reason&&<p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm">지연 사유: {r.delay_reason}</p>}
          <div className="my-2 flex flex-wrap gap-3 text-xs">{r.needs_exception&&<span>지연 승인: {r.exception_approved_at?"완료":"대기"}</span>}{r.needs_senior&&<span>장기 지연 승인: {r.senior_approved_at?"완료":"대기"}</span>}{r.over_budget_approved_at&&<span>예산 초과 승인 완료</span>}</div>
          <div className="flex flex-wrap gap-2"><a className={secondary} href={`/finance/reimbursements/evidence?id=${r.id}`} target="_blank" rel="noreferrer">증빙 보기</a>
            {requestActions(r,w.member,period).map(a=><button key={a} className={secondary} disabled={op.pending} onClick={()=>{setSelected(r);setAction(a);}}>{reimbursementCommandLabels[a]}</button>)}
          </div>
        </article>)}{!visible.length&&<p className="py-6 text-center text-slate-500">이 조건에 해당하는 신청이 없어.</p>}</div>
      </section>
    </>}
    {tab==="budgets"&&<>
      <section className={card}><h2 className="mb-3 text-lg font-bold">월 예산 사용 현황</h2><p className="mb-4 text-sm text-slate-600">간편지출과 개인 정산 승인액, 기안의 집행 예약액을 표시해. 회계장부의 전체 지출 실적과는 별도야. 지급 완료는 사용액을 다시 차감하지 않아.</p><BudgetTable budgets={w.budgets}/></section>
      {canClose&&<section className={card}><h2 className="text-lg font-bold">월 마감 관리</h2><form className="mt-3 flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);command(String(data.get("command")),{month:w.month,reason:String(data.get("reason"))});}}><select className="rounded-lg border p-2" name="command">{!period?<option value="OPEN">접수월 개설</option>:period.status!=="CLOSED"?<><option value="SUPPLEMENT">보완 접수 전환</option><option value="CLOSE">월 마감·보고서 확정</option></>:<option value="">이미 마감된 월</option>}</select><input className={`${input} max-w-md`} aria-label="마감 처리 사유" name="reason" placeholder="처리 사유" required/><button className={button} disabled={op.pending||period?.status==="CLOSED"}>처리</button></form><p className="mt-3 text-sm text-slate-600">마감 후 신청은 예산 반영 승인 시 수정 보고서가 자동으로 추가돼. 기존 보고서는 보존돼.</p></section>}
      <section className={`${card} space-y-3`}><h2 className="text-lg font-bold">마감 보고서 원본·수정본</h2>{w.reports.map((report,i)=><Report key={report.revision} report={report} previous={w.reports[i+1]}/>)}{!w.reports.length&&<p className="text-sm text-slate-600">확정된 마감 보고서가 없어.</p>}</section>
      <section className={card}><h2 className="mb-3 text-lg font-bold">최근 처리 이력</h2><ul className="space-y-3 text-sm">{w.audits.map(a=><li key={a.id} className="border-b pb-2">{dateTime(a.created_at)} · {names[a.actor_id]??"등록 사용자"} · {reimbursementCommandLabels[a.action]??a.action}<p className="text-slate-600">{a.reason}</p></li>)}</ul></section>
    </>}
    {tab==="settings"&&<>
      <section className={card}><h2 className="text-lg font-bold">제출·보완 마감 기준</h2><p className="my-3 text-sm text-slate-600">설정은 새로 개설하는 월부터 적용돼. 이미 개설한 월의 기한은 유지돼.</p>
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);command("POLICY",{submission_day:Number(data.get("submission_day")),completion_day:Number(data.get("completion_day")),long_delay_days:Number(data.get("long_delay_days"))});}}>
          <label>다음 달 제출 마감일<input className={input} name="submission_day" type="number" min="1" max="28" required defaultValue={w.policy?.submission_day} disabled={!isAdmin}/></label>
          <label>다음 달 보완 마감일<input className={input} name="completion_day" type="number" min="1" max="28" required defaultValue={w.policy?.completion_day} disabled={!isAdmin}/></label>
          <label>장기 지연 기준 (사용 후 일수)<input className={input} name="long_delay_days" type="number" min="1" required defaultValue={w.policy?.long_delay_days} disabled={!isAdmin}/></label>
          {isAdmin&&<button className={button} disabled={op.pending}>기준 저장</button>}
        </form>
      </section>
      {isAdmin&&<section className={card}><h2 className="text-lg font-bold">담당자 등록·권한</h2><p className="my-3 text-sm text-slate-600">본인 신청은 본인이 승인할 수 없어. 계정 생성 시 이메일은 발송하지 않아. 초기 비밀번호를 담당자에게 별도로 전달해줘.</p>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);op.run(()=>saveReimbursementMember(data));}}>
          <label>기존 사용자 ID (새 계정이면 비워둠)<input className={input} name="user_id"/></label><label>담당자 이름<input className={input} name="display_name" required/></label>
          <label>새 계정 이메일<input className={input} name="email" type="email"/></label><label>초기 비밀번호<input className={input} name="password" type="password" minLength={12} autoComplete="new-password"/></label>
          <fieldset className="flex flex-wrap gap-3 sm:col-span-2"><legend className="mb-2">권한 (선택하지 않으면 신청만 가능)</legend>{reimbursementPermissions.map(p=><label key={p}><input name="permissions" value={p} type="checkbox"/> {permissionLabels[p]}</label>)}</fieldset>
          <label><input type="checkbox" name="active" defaultChecked/> 활성 계정</label><button className={button} disabled={op.pending}>담당자 저장</button>
        </form><ul className="mt-4 space-y-2 text-sm">{w.members.map(m=><li key={m.user_id} className="border-t pt-2">{m.display_name} · {m.active?"활성":"비활성"} · {m.permissions.map(p=>permissionLabels[p]).join(", ")||"신청자"}<p className="break-all text-xs text-slate-500">{m.user_id}</p></li>)}</ul>
      </section>}
      <section className={card}><h2 className="mb-3 text-lg font-bold">내 비밀번호 변경</h2><form className="flex gap-3" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);op.run(()=>changeReimbursementPassword(data),"비밀번호를 변경했어.");}}><input aria-label="새 비밀번호" className={input} type="password" name="password" required minLength={12} autoComplete="new-password"/><button className={`${button} shrink-0`} disabled={op.pending}>변경</button></form></section>
      <Link href="/basic-info/approval" className="text-sm text-blue-700 underline">예산 편성·결재 설정으로 이동</Link>
    </>}
    {selected&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="reimbursement-dialog-title" className={`${card} max-h-[85vh] w-full max-w-lg overflow-y-auto`}>
      <h2 id="reimbursement-dialog-title" className="text-xl font-bold">{reimbursementCommandLabels[action]}</h2><p className="my-3">{selected.merchant} · {money(selected.amount)} · {selected.budget_month.slice(0,7)} 예산</p>
      {action==="APPROVE"&&period?.status==="CLOSED"&&<p className="mb-3 text-sm text-amber-800">마감 보고서의 수정본이 추가돼. 이미 보고한 곳에는 수정 내역을 공유해줘.</p>}
      {action==="REVERSE_PAYMENT"&&<p className="mb-3 text-sm">잘못 연결한 기록만 취소해. 실제 은행 이체를 취소하거나 환급하는 기능은 아니야.</p>}
      <form className="space-y-3" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);command(action,{id:selected.id,reason:String(data.get("reason")),bank_transaction_id:String(data.get("bank_transaction_id")??"")});}}>
        {action==="PAY"&&<label className="block">실제 출금거래<select className={input} name="bank_transaction_id" required defaultValue=""><option value="">동일 금액 출금거래 선택</option>{w.banks.filter(b=>Number(b.withdrawal_amount)===Number(selected.amount)&&koreaDate(new Date(b.transacted_at))>=selected.used_on&&!w.requests.some(r=>r.bank_transaction_id===b.id)).map(b=><option value={b.id} key={b.id}>{dateTime(b.transacted_at)} · {b.counterparty||b.description} · {money(b.withdrawal_amount)}</option>)}</select><span className="text-xs text-slate-600">받는 사람과 이체 내역을 확인해줘. 지급일은 선택한 거래 날짜로 기록돼. 최근 출금 200건에서 표시해.</span></label>}
        <label className="block">처리 사유<textarea className={input} name="reason" rows={3} required autoFocus/></label>
        <div className="flex gap-3"><button className={button} disabled={op.pending}>확인·처리</button><button className={secondary} type="button" onClick={()=>setSelected(null)} disabled={op.pending}>닫기</button></div>
        {op.message&&<p role="alert" className="text-sm text-red-700">{op.message}</p>}
      </form>
    </section></div>}
  </>;
}
