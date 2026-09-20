"use client";

import { BudgetAllocationPanel } from "./budget-allocation-panel";
import { UnifiedBudgetTable } from "./unified-budget-table";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { analyzeReimbursementEvidence, changeReimbursementPassword, reimbursementLogin, reimbursementLogout, runReimbursementCommand, saveReimbursementMember, saveReimbursementPolicy, submitReimbursement } from "@/app/finance/reimbursements/actions";
import { updatePersonalReimbursementDetailsAction } from "@/app/finance/expenses/actions";
import { budgetUsed, hasReimbursementPermission, koreaDate, periodLabel, reimbursementCommandLabels, reimbursementPermissions, reimbursementStatusLabels, requestActions, type Reimbursement, type ReimbursementReport } from "./reimbursement-domain";
import type { ReimbursementWorkspace } from "./reimbursement-repository";
import { buildReimbursementOcrDraft } from "./reimbursement-ocr";
import type { EvidenceOcrData } from "./expense-evidence";

const card="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5";
const input="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const button="rounded-lg bg-[var(--color-deep-cobalt)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";
const money=(n:number)=>Number(n).toLocaleString("ko-KR")+"원";
const dateTime=(s:string|null)=>s ? new Date(s).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}) : "—";
const permissionLabels={ADMIN:"관리자",APPROVE:"정산·지연 승인",SENIOR:"장기 지연·예산 초과 승인",CLOSE:"월 마감·과거 월 수정",PAY:"지급 연결"};
const paymentMethodLabels={PERSONAL_CARD:"개인카드",PERSONAL_TRANSFER:"개인계좌 이체",CASH:"현금 직접 지급"};
const evidenceKindLabels={RECEIPT:"영수증",CARD_STATEMENT:"개인카드 승인내역",BANK_TRANSFER:"계좌이체 확인증",ORDER_DETAILS:"주문내역",TRANSACTION_STATEMENT:"거래명세서",ITEM_PHOTO:"물품·사용 사진",OTHER_ALTERNATIVE:"기타 대체증빙"};
function autoSubmissionDeadline(usedOn:string,submissionDay:number) {
  const [year,month]=usedOn.split("-").map(Number);
  const deadlineYear=month===12?year+1:year;
  const deadlineMonth=month===12?1:month+1;
  return `${deadlineYear}-${String(deadlineMonth).padStart(2,"0")}-${String(submissionDay).padStart(2,"0")}`;
}

function useOperation() {
  const router=useRouter(); const [message,setMessage]=useState(""); const [pending,start]=useTransition();
  function run(fn:()=>Promise<unknown>,success="처리했어. 최신 자료를 다시 불러왔어.") {
    setMessage(""); start(async()=>{try{await fn();setMessage(success);router.refresh();}catch(e){setMessage(e instanceof Error?e.message:"처리하지 못했어. 다시 확인해줘.");}});
  }
  return {run,message,pending};
}
export function ReimbursementLogin({error,title="개인 지출 정산·월 마감",description="사용월의 예산과 실제 지급일을 구분해서 관리해. 마감과 승인 이력을 남기기 위해 본인 계정으로 로그인해줘."}:{error?:string;title?:string;description?:string}) {
  const op=useOperation();
  return <section className={`${card} mx-auto max-w-lg`}><h1 className="text-2xl font-bold">{title}</h1>
    <p className="my-4 text-sm text-slate-600">{description}</p>
    <form className="space-y-4" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);op.run(async()=>{const result=await reimbursementLogin(form);if(!result.ok)throw new Error(result.message);},"로그인했어.");}}>
      <label className="block">이메일<input className={input} name="email" type="email" autoComplete="username" required /></label>
      <label className="block">비밀번호<input className={input} name="password" type="password" autoComplete="current-password" required /></label>
      <button className={button} disabled={op.pending}>로그인</button>
    </form><p role="status" className="mt-4 text-sm">{op.message || error}</p>
    <p className="mt-3 text-sm text-slate-600">계정이 없으면 정산 관리자에게 계정과 권한 등록을 요청해줘.</p>
  </section>;
}
function Report({report,previous}:{report:ReimbursementReport;previous?:ReimbursementReport}) {
  return <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">{report.month.slice(0,7)} · {report.revision===1?"최초 마감":`수정 ${report.revision-1}차`} · {dateTime(report.created_at)}</summary>
    <p className="my-3 text-sm">사유: {report.reason}</p>
    {previous&&<p className="mb-3 text-sm">직전 보고 대비 사용액 변경: {money(report.snapshot.budgets.reduce((s,b)=>s+budgetUsed(b),0)-previous.snapshot.budgets.reduce((s,b)=>s+budgetUsed(b),0))}</p>}
    <UnifiedBudgetTable budgets={report.snapshot.budgets} entries={report.snapshot.entries} />
    <a className="mt-3 inline-block text-sm text-blue-700 underline" href={`/finance/reimbursements/report?month=${report.month}&revision=${report.revision}`} target="_blank" rel="noreferrer">보고서 열기·인쇄</a>
  </details>;
}
function ReimbursementDetail({record:r,applicantName,budgetName,canEdit,onClose,onSaved}:{record:Reimbursement;applicantName:string;budgetName:string;canEdit:boolean;onClose:()=>void;onSaved:()=>void}) {
  const [editing,setEditing]=useState(false); const [merchant,setMerchant]=useState(r.merchant); const [purpose,setPurpose]=useState(r.purpose); const [reason,setReason]=useState(""); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  const evidenceHref=`/finance/reimbursements/evidence?id=${encodeURIComponent(r.id)}`;
  async function save() {
    if(!r.updated_at){setMessage("원본 수정 시각을 확인할 수 없어. 새로고침 후 다시 시도해줘.");return;}
    setBusy(true);setMessage("");
    try {
      const result=await updatePersonalReimbursementDetailsAction({id:r.id,merchant,purpose,reason,expectedUpdatedAt:r.updated_at});
      if(!result.ok){setMessage(result.message);return;}
      onSaved();
    } catch(error) {setMessage(error instanceof Error?error.message:"개인 정산 원본을 수정하지 못했어.");}
    finally {setBusy(false);}
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-6">
    <section aria-labelledby="reimbursement-detail-title" aria-modal="true" className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog">
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6"><div><p className="text-sm font-semibold text-blue-700">개인 지출 정산 상세</p><h2 className="mt-1 text-xl font-bold" id="reimbursement-detail-title">{r.merchant} · {money(r.amount)}</h2><p className="mt-1 text-sm text-slate-600">{reimbursementStatusLabels[r.status]} · 신청 {dateTime(r.submitted_at)}</p></div><button aria-label="정산 상세 닫기" className={secondary} onClick={onClose} type="button">닫기</button></header>
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:overflow-hidden">
        <div className="space-y-5 p-5 sm:p-6 lg:overflow-y-auto">
          <section aria-label="신청 내용"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">신청 내용</h3>{canEdit&&<button className={secondary} onClick={()=>{setEditing(value=>!value);setMessage("");}} type="button">{editing?"수정 닫기":"거래처·사용내용 수정"}</button>}</div>
            {editing?<div className="mt-4 space-y-3"><label className="block">거래처<input className={input} maxLength={200} value={merchant} onChange={event=>setMerchant(event.target.value)}/></label><label className="block">사용내용<input className={input} maxLength={500} value={purpose} onChange={event=>setPurpose(event.target.value)}/></label><label className="block">수정 사유<input className={input} maxLength={500} placeholder="예: 거래처명 오기 수정" value={reason} onChange={event=>setReason(event.target.value)}/></label><button className={button} disabled={busy||!merchant.trim()||!purpose.trim()||!reason.trim()} onClick={()=>void save()} type="button">수정 저장</button></div>:<dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">사용처</dt><dd className="mt-1 font-semibold">{r.merchant}</dd></div><div><dt className="text-slate-500">금액</dt><dd className="mt-1 font-semibold">{money(r.amount)}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">업무 목적</dt><dd className="mt-1 font-semibold">{r.purpose}</dd></div><div><dt className="text-slate-500">실제 사용일</dt><dd className="mt-1">{r.used_on}</dd></div><div><dt className="text-slate-500">예산 귀속월</dt><dd className="mt-1">{r.budget_month.slice(0,7)}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">예산항목</dt><dd className="mt-1">{budgetName}</dd></div><div><dt className="text-slate-500">결제수단</dt><dd className="mt-1">{paymentMethodLabels[r.payment_method??"CASH"]}</dd></div><div><dt className="text-slate-500">증빙 종류</dt><dd className="mt-1">{evidenceKindLabels[r.evidence_kind??"OTHER_ALTERNATIVE"]}</dd></div></dl>}
            {message&&<p aria-live="polite" className="mt-3 text-sm text-red-700" role="status">{message}</p>}
          </section>
          <section aria-label="처리 정보" className="border-t pt-5"><h3 className="font-bold">처리 정보</h3><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">신청자</dt><dd className="mt-1">{applicantName}</dd></div><div><dt className="text-slate-500">처리 상태</dt><dd className="mt-1 font-semibold">{reimbursementStatusLabels[r.status]}</dd></div><div><dt className="text-slate-500">예산 승인</dt><dd className="mt-1">{dateTime(r.approved_at)}</dd></div><div><dt className="text-slate-500">실제 지급</dt><dd className="mt-1">{dateTime(r.paid_at)}</dd></div></dl>{r.missing_receipt_reason&&<p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm">영수증 미첨부 사유: {r.missing_receipt_reason}</p>}{r.delay_reason&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">지연 사유: {r.delay_reason}</p>}</section>
          {canEdit&&<p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">심사 중에는 거래처와 사용내용을 수정할 수 있어. 금액·사용일·예산·증빙을 바꾸려면 현재 신청을 취소하고 다시 신청해야 해.</p>}
        </div>
        <section aria-label="첨부 증빙" className="flex min-h-[520px] flex-col border-t bg-slate-50 p-4 lg:min-h-0 lg:border-l lg:border-t-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">첨부 증빙</h3><p className="mt-1 text-xs text-slate-600">신청 내용과 원본을 같은 화면에서 비교해.</p></div><a className={secondary} href={evidenceHref} rel="noreferrer" target="_blank">새 창에서 열기</a></div><iframe className="min-h-[440px] w-full flex-1 rounded-xl border bg-white" src={evidenceHref} title={`${r.merchant} 첨부 증빙`}/></section>
      </div>
    </section>
  </div>;
}
export function ReimbursementPage({workspace:w,initialTab="requests",initialRequestId,initialAction}:{workspace:ReimbursementWorkspace;initialTab?:string;initialRequestId?:string;initialAction?:"APPROVE"|"PAY"}) {
  const op=useOperation(); const router=useRouter(); const today=koreaDate();
  const period=w.periods.find(p=>p.month===w.month);
  const initialRequest=initialRequestId?w.requests.find(request=>request.id===initialRequestId):undefined;
  const allowedInitialAction=initialRequest&&initialAction&&requestActions(initialRequest,w.member,period).includes(initialAction)?initialAction:"";
  const [tab,setTab]=useState(initialRequestId?"requests":initialTab); const [selected,setSelected]=useState<Reimbursement|null>(allowedInitialAction&&initialRequest?initialRequest:null); const [detail,setDetail]=useState<Reimbursement|null>(null); const [action,setAction]=useState(allowedInitialAction);
  const [requestFormOpen,setRequestFormOpen]=useState(false);
  const [source,setSource]=useState(""); const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [usedOn,setUsedOn]=useState(today); const [amount,setAmount]=useState(""); const [merchant,setMerchant]=useState(""); const [purpose,setPurpose]=useState(""); const [budgetId,setBudgetId]=useState("");
  const [evidenceKind,setEvidenceKind]=useState("RECEIPT");
  const [entryMode,setEntryMode]=useState<"OCR"|"SOURCE"|"MANUAL">("OCR");
  const [ocrData,setOcrData]=useState<EvidenceOcrData|null>(null); const [ocrMessage,setOcrMessage]=useState(""); const [ocrPending,startOcr]=useTransition();
  const [fileInputKey,setFileInputKey]=useState(0); const [evidenceFile,setEvidenceFile]=useState<File|null>(null); const [evidenceFileName,setEvidenceFileName]=useState(""); const [dragActive,setDragActive]=useState(false);
  const fileInputRef=useRef<HTMLInputElement|null>(null);
  const editedFields=useRef({amount:false,budgetId:false,evidenceKind:false,merchant:false,purpose:false,usedOn:false}); const ocrRequest=useRef(0);
  const [status,setStatus]=useState("ALL");
  const [listScope,setListScope]=useState<"ACTIVE"|"MONTH"|"CLOSED">(()=>initialRequest&&(initialRequest.status==="PAID"||initialRequest.status==="REJECTED"||initialRequest.status==="CANCELLED")?"CLOSED":"ACTIVE");
  const usedPeriod=w.periods.find(p=>p.month===`${usedOn.slice(0,7)}-01`);
  const submissionDeadline=usedPeriod?.submission_deadline ?? (w.policy?autoSubmissionDeadline(usedOn,w.policy.submission_day):null);
  const longDelayDays=usedPeriod?.long_delay_days ?? w.policy?.long_delay_days;
  const late=Boolean((submissionDeadline&&today>submissionDeadline)||usedPeriod?.status==="CLOSED"||(longDelayDays!==undefined&&Math.floor((Date.parse(today)-Date.parse(usedOn))/86400000)>longDelayDays));
  const canAutoOpen=Boolean(usedPeriod||w.policy);
  const isAdmin=hasReimbursementPermission(w.member,"ADMIN"); const canClose=hasReimbursementPermission(w.member,"CLOSE");
  const names=Object.fromEntries(w.members.map(m=>[m.user_id,m.display_name]));
  const activeRequests=w.requests.filter(r=>r.status==="SUBMITTED"||r.status==="APPROVED");
  const monthRequests=w.requests.filter(r=>r.budget_month===w.month);
  const closedMonthRequests=monthRequests.filter(r=>r.status==="PAID"||r.status==="REJECTED"||r.status==="CANCELLED");
  const scopedRequests=listScope==="ACTIVE"?activeRequests:listScope==="MONTH"?monthRequests:closedMonthRequests;
  const visible=scopedRequests.filter(r=>status==="ALL"||r.status===status);
  const scopeTitle=listScope==="ACTIVE"?"처리 중인 신청":listScope==="MONTH"?`${w.month.slice(0,7)} 사용분`:`${w.month.slice(0,7)} 완료·종료`;
  const offMonthActiveCount=activeRequests.filter(r=>r.budget_month!==w.month).length;
  function changeListScope(scope:"ACTIVE"|"MONTH"|"CLOSED"){setListScope(scope);setStatus("ALL");}
  function command(command:string,data:Record<string,unknown>){op.run(async()=>{await runReimbursementCommand(command,data);setSelected(null);setAction("");});}
  function selectSource(id:string){setSource(id);const s=w.sources.find(s=>s.id===id);if(s){setUsedOn(koreaDate(new Date(s.occurred_at)));setAmount(String(s.amount));setMerchant(s.counterparty);setPurpose(s.usage_description);setBudgetId(w.budgets.find(b=>b.budget_item===s.budget_item)?.id??"");setOcrData(null);setOcrMessage("기존 지출의 값과 저장된 증빙을 재사용해. 제출 전에 내용을 확인해줘.");}else{setUsedOn(today);setAmount("");setMerchant("");setPurpose("");setBudgetId("");setOcrMessage("");}}
  function selectEntryMode(mode:"OCR"|"SOURCE"|"MANUAL") {
    setEntryMode(mode); setOcrMessage(""); setOcrData(null); setEvidenceFile(null); setEvidenceFileName(""); setDragActive(false); setFileInputKey(key=>key+1); ocrRequest.current+=1;
    if(mode==="OCR"){setEvidenceKind("RECEIPT");editedFields.current.evidenceKind=false;}
    if(mode==="MANUAL"){setEvidenceKind("OTHER_ALTERNATIVE");editedFields.current.evidenceKind=false;}
    if(mode!=="SOURCE") {
      setSource("");
      if(entryMode==="SOURCE") {setUsedOn(today);setAmount("");setMerchant("");setPurpose("");setBudgetId("");editedFields.current={amount:false,budgetId:false,evidenceKind:false,merchant:false,purpose:false,usedOn:false};}
    }
  }
  function openReceiptPicker() {
    if(entryMode==="OCR"){openEvidencePicker();return;}
    selectEntryMode("OCR");
    window.setTimeout(openEvidencePicker,0);
  }
  function openEvidencePicker() {
    if(!fileInputRef.current)return;
    fileInputRef.current.value="";
    fileInputRef.current.click();
  }
  function analyzeEvidence(file?:File) {
    setEvidenceFile(file??null); setEvidenceFileName(file?.name??""); setOcrData(null); setOcrMessage("");
    if(!file) return;
    if(entryMode!=="OCR") {setOcrMessage(entryMode==="MANUAL"?"대체증빙을 선택했어. 지출 내용과 영수증 미첨부 사유를 입력해줘.":"새 증빙을 선택했어. 기존 지출 내용과 함께 제출해.");return;}
    const request=++ocrRequest.current; const form=new FormData(); form.set("evidence",file);
    startOcr(async()=>{try{
      const result=await analyzeReimbursementEvidence(form); if(request!==ocrRequest.current)return;
      const draft=buildReimbursementOcrDraft(result.ocrData,w.budgets); const applied:string[]=[];
      if(draft.usedOn&&draft.usedOn<=today&&!editedFields.current.usedOn){setUsedOn(draft.usedOn);applied.push("사용일");}
      if(draft.amount&&!editedFields.current.amount){setAmount(draft.amount);applied.push("금액");}
      if(draft.merchant&&!editedFields.current.merchant){setMerchant(draft.merchant);applied.push("사용처");}
      if(draft.purpose&&!editedFields.current.purpose){setPurpose(draft.purpose);applied.push("업무 목적");}
      if(draft.budgetId&&!editedFields.current.budgetId){setBudgetId(draft.budgetId);applied.push("예산항목");}
      if(draft.evidenceKind&&!editedFields.current.evidenceKind){setEvidenceKind(draft.evidenceKind);applied.push("증빙 종류");}
      setOcrData(result.ocrData); setOcrMessage(applied.length?`${applied.join("·")} 항목을 자동입력했어. 제출 전에 확인해줘.`:"인식 결과를 확인했지만 자동입력할 항목이 없어. 직접 입력해줘.");
    }catch(error){if(request===ocrRequest.current){const detail=error instanceof Error?error.message:"분석 오류가 발생했어.";setOcrMessage(`OCR 분석을 완료하지 못했어. 영수증은 선택된 상태야. 아래 항목을 직접 입력하거나 다시 선택해줘. ${detail}`);}}});
  }
  function resetRequestForm() {
    setRequestId(crypto.randomUUID());setSource("");setUsedOn(today);setAmount("");setMerchant("");setPurpose("");setBudgetId("");setEvidenceKind("RECEIPT");setEntryMode("OCR");setOcrData(null);setOcrMessage("");setEvidenceFile(null);setEvidenceFileName("");setDragActive(false);setFileInputKey(key=>key+1);editedFields.current={amount:false,budgetId:false,evidenceKind:false,merchant:false,purpose:false,usedOn:false};
  }
  return <>
    <header className={card}><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{tab==="budgets"?"예산집행 현황":"대납·선지급 정산"}</h1><p className="mt-2 text-sm text-slate-600">개인 대납은 사용월 예산에 한 번 반영하고 지급일은 실제 출금일로 기록해. 이 화면의 월 마감은 개인 경비 정산 범위야.</p></div><div className="text-sm">{w.member.display_name}<button className={`${secondary} ml-3`} onClick={()=>op.run(reimbursementLogout)} disabled={op.pending}>로그아웃</button></div></div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><label>조회 월 <input aria-label="조회 월" className="rounded-lg border p-2" type="month" value={w.month.slice(0,7)} onChange={e=>{if(e.target.value)router.push(`/finance/reimbursements?month=${e.target.value}&tab=${tab}`);}} /></label><span className="rounded-full bg-blue-50 px-3 py-2 text-sm">{period?periodLabel(period,today):"접수월 미개설"}</span>{period&&<span className="text-sm text-slate-600">제출 {period.submission_deadline} · 보완 {period.completion_deadline}</span>}</div>
    </header>
    {w.member.permissions.some(p=>["ADMIN","APPROVE","PAY","CLOSE","SENIOR"].includes(p))&&<div className="flex flex-wrap gap-3"><Link className={secondary} href="/finance/advance-settlements">선지급 사용내역·잔액 정산</Link><Link className={secondary} href="/finance/month-close">전체 회계 월 점검</Link></div>}
    <nav aria-label="정산 업무" className="flex flex-wrap gap-2">{[["requests","정산 신청·처리"],["budgets","예산·마감 보고서"],["settings","운영 기준·권한"]].map(([id,label])=><button key={id} aria-pressed={tab===id} className={tab===id?button:secondary} onClick={()=>{setTab(id);if(id==="requests")setRequestFormOpen(true);router.push(`/finance/reimbursements?month=${w.month.slice(0,7)}&tab=${id}`,{scroll:false});}}>{label}</button>)}</nav>
    {op.message&&<p role="status" className="rounded-lg border bg-blue-50 p-4">{op.message}</p>}
    {tab==="requests"&&<>
      <details className={card} open={requestFormOpen} onToggle={event=>setRequestFormOpen(event.currentTarget.open)}><summary className="cursor-pointer text-lg font-bold">개인 지출 정산 신청</summary>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const el=e.currentTarget;if(entryMode!=="SOURCE"&&!evidenceFile){setOcrMessage(entryMode==="OCR"?"정산할 영수증을 먼저 선택해줘.":"영수증을 대신할 대체증빙을 선택해줘.");return;}const data=new FormData(el);if(evidenceFile)data.set("evidence",evidenceFile,evidenceFile.name);op.run(async()=>{await submitReimbursement(data);el.reset();resetRequestForm();},"신청했어. 사용월을 선택하면 처리 상태를 확인할 수 있어.");}}>
          <input type="hidden" name="id" value={requestId}/>
          <fieldset className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50/50 p-4"><legend className="px-2 font-bold text-blue-950">1. 정산 시작 방법</legend>
            <p className="mb-3 text-sm text-blue-900">영수증을 분석해 날짜·금액·사용처·업무 목적·예산항목을 채워줘. 자동입력된 값은 모두 수정할 수 있어.</p>
            <div className="flex flex-wrap gap-2">
              <button aria-pressed={entryMode==="OCR"} className={entryMode==="OCR"?button:secondary} onClick={openReceiptPicker} type="button">영수증으로 정산</button>
              <button aria-pressed={entryMode==="SOURCE"} className={entryMode==="SOURCE"?button:secondary} disabled={!w.sources.length} onClick={()=>selectEntryMode("SOURCE")} type="button">기존 지출 불러오기</button>
              <button aria-pressed={entryMode==="MANUAL"} className={entryMode==="MANUAL"?button:secondary} onClick={()=>selectEntryMode("MANUAL")} type="button">영수증 없음·예외 접수</button>
            </div>
            {entryMode==="SOURCE"?<label className="mt-4 block">기존 개인 선지출<select aria-label="기존 개인 선지출" className={input} name="source_quick_id" required value={source} onChange={e=>selectSource(e.target.value)}><option value="">연결할 지출 선택</option>{w.sources.map(s=><option key={s.id} value={s.id}>{koreaDate(new Date(s.occurred_at))} · {s.counterparty} · {money(s.amount)}</option>)}</select><span className="text-xs text-slate-600">저장된 값과 증빙을 재사용해서 중복 집계를 막아. 새 파일을 선택하면 그 증빙으로 교체해.</span></label>:<input name="source_quick_id" type="hidden" value=""/>}
            <input aria-label={entryMode==="OCR"?"영수증 파일":entryMode==="SOURCE"?"새 증빙 파일 (선택)":"대체증빙 파일"} key={fileInputKey} ref={fileInputRef} className="sr-only" type="file" name="evidence" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e=>analyzeEvidence(e.target.files?.[0])}/>
            <button aria-label={entryMode==="OCR"?"영수증을 끌어놓거나 클릭해서 선택":entryMode==="SOURCE"?"새 증빙을 끌어놓거나 클릭해서 선택":"대체증빙을 끌어놓거나 클릭해서 선택"} className={`mt-4 w-full rounded-xl border-2 border-dashed px-4 py-6 text-left transition ${dragActive?"border-blue-500 bg-blue-100":"border-blue-200 bg-white hover:border-blue-400"}`} onClick={openEvidencePicker} onDragEnter={event=>{event.preventDefault();setDragActive(true);}} onDragOver={event=>{event.preventDefault();setDragActive(true);}} onDragLeave={()=>setDragActive(false)} onDrop={event=>{event.preventDefault();setDragActive(false);analyzeEvidence(event.dataTransfer.files?.[0]);}} type="button">
              <strong className="block text-blue-950">{evidenceFileName?evidenceFileName:entryMode==="OCR"?"영수증을 여기에 놓거나 클릭해서 선택":entryMode==="SOURCE"?"교체할 증빙을 여기에 놓거나 클릭해서 선택":"대체증빙을 여기에 놓거나 클릭해서 선택"}</strong>
              <span className="mt-1 block text-xs text-slate-600">PDF·PNG·JPG·WEBP, 최대 3MB. {entryMode==="OCR"?"파일이 들어오면 바로 OCR 분석을 시작해.":entryMode==="SOURCE"?"기존 증빙이 없거나 교체할 때만 선택해.":"카드 승인내역·주문내역·이체 확인증 등 결제 사실을 확인할 자료가 필요해."}</span>
            </button>
            {(ocrPending||ocrMessage)&&<div aria-live="polite" className={`mt-3 rounded-lg p-3 text-sm ${ocrPending?"bg-white text-blue-900":ocrData?"bg-emerald-50 text-emerald-900":entryMode!=="OCR"&&evidenceFile?"bg-white text-blue-900":"bg-amber-50 text-amber-950"}`} role="status"><strong>{ocrPending?"OCR 분석 중":ocrData?"OCR 분석 완료":entryMode==="SOURCE"&&evidenceFile?"새 증빙 선택됨":entryMode==="MANUAL"&&evidenceFile?"대체증빙 선택됨":entryMode==="OCR"&&evidenceFile?"OCR 분석 확인 필요":"확인 필요"}</strong><p className="mt-1">{ocrPending?`${evidenceFileName}에서 정보를 읽고 있어. 직접 입력한 값은 덮어쓰지 않아.`:ocrData?`${ocrMessage} 자동입력된 값도 아래에서 수정할 수 있어.`:ocrMessage}</p>{ocrData&&<p className="mt-1 text-xs">인식 결과 · {ocrData.documentDate??"날짜 미인식"} · {ocrData.issuer??"사용처 미인식"} · {ocrData.totalAmount===undefined?"금액 미인식":money(ocrData.totalAmount)}</p>}</div>}
          </fieldset>
          <div className="sm:col-span-2"><p className="font-bold">2. {entryMode==="OCR"?"OCR 자동입력 결과 확인·수정":entryMode==="SOURCE"?"기존 지출 내용 확인·수정":"예외 지출 내용 직접 입력"}</p>{entryMode==="OCR"&&<p className="mt-1 text-sm text-slate-600">OCR 결과는 초안이야. 실제 영수증과 비교해서 모든 항목을 자유롭게 수정해줘.</p>}</div>
          <label>실제 사용일<input className={input} name="used_on" type="date" required min={`${today.slice(0,4)}-01-01`} max={today} value={usedOn} onChange={e=>{editedFields.current.usedOn=true;setUsedOn(e.target.value);}}/></label>
          <label>예산 귀속월<input className={input} readOnly value={usedOn.slice(0,7)}/></label>
          <label>예산항목<select className={input} name="budget_id" required value={budgetId} onChange={e=>{editedFields.current.budgetId=true;setBudgetId(e.target.value);}}><option value="">예산항목 선택</option>{w.budgets.map(b=><option key={b.id} value={b.id}>{b.budget_item}</option>)}</select></label>
          <label>개인 결제 금액<input className={input} type="number" name="amount" min="1" step="1" required value={amount} onChange={e=>{editedFields.current.amount=true;setAmount(e.target.value);}}/></label>
          <label>사용처<input className={input} name="merchant" required value={merchant} onChange={e=>{editedFields.current.merchant=true;setMerchant(e.target.value);}}/></label>
          <label>업무 목적<input className={input} name="purpose" required value={purpose} onChange={e=>{editedFields.current.purpose=true;setPurpose(e.target.value);}}/></label>
          <label>개인 결제수단<select className={input} name="payment_method" required defaultValue="PERSONAL_CARD"><option value="PERSONAL_CARD">개인카드</option><option value="PERSONAL_TRANSFER">개인계좌 이체</option><option value="CASH">현금 직접 지급</option></select></label>
          <label>제출 증빙 종류<select className={input} name="evidence_kind" required value={evidenceKind} onChange={e=>{editedFields.current.evidenceKind=true;setEvidenceKind(e.target.value);}}><option value="RECEIPT" disabled={entryMode==="MANUAL"}>영수증</option><option value="CARD_STATEMENT">개인카드 승인내역</option><option value="BANK_TRANSFER">계좌이체 확인증</option><option value="ORDER_DETAILS">주문내역</option><option value="TRANSACTION_STATEMENT">거래명세서</option><option value="ITEM_PHOTO">물품·사용 사진</option><option value="OTHER_ALTERNATIVE">기타 대체증빙</option></select></label>
          {evidenceKind!=="RECEIPT"&&<label className="sm:col-span-2">영수증 미첨부 사유<textarea className={input} name="missing_receipt_reason" rows={3} required placeholder="예: 구매 후 영수증을 분실하여 카드 승인내역과 주문내역을 제출합니다."/></label>}
          {late&&<label className="sm:col-span-2">지연 사유 (필수)<textarea className={input} name="delay_reason" rows={3} required/></label>}
          {!late&&<input name="delay_reason" type="hidden" value=""/>}
          <p className="text-sm text-slate-600 sm:col-span-2">{!usedPeriod&&!w.policy?"접수월 자동 개설에 필요한 운영 기준을 관리자가 먼저 저장해야 해.":!usedPeriod&&late?`${usedOn.slice(0,7)} 접수월은 신청과 함께 자동 개설돼. 지연 사유를 입력하면 예외 승인 대상으로 접수해.`:!usedPeriod?`${usedOn.slice(0,7)} 접수월은 신청과 함께 자동 개설돼. 적용된 제출·보완 기한과 자동 개설 이력도 보존해.`:late?"지연 신청이므로 예외 승인이나 장기 지연 검토가 필요해.":"신청일과 승인일은 실제 처리한 시점으로 남겨."}</p>
          <button className={button} disabled={op.pending||ocrPending||!canAutoOpen}>내용 확인 후 정산 신청</button>
        </form>
      </details>
      <section className={card}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{scopeTitle} · {visible.length}건</h2><p className="mt-1 text-sm text-slate-600">처리 중 전체는 사용월과 관계없이 심사 중·지급 대기 신청을 모아 보여줘.</p></div><select aria-label="정산 상태" className="rounded-lg border p-2" value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">전체 상태</option>{Object.entries(reimbursementStatusLabels).filter(([id])=>scopedRequests.some(r=>r.status===id)).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>
        <div aria-label="정산 목록 범위" className="mb-4 flex flex-wrap gap-2">
          <button aria-pressed={listScope==="ACTIVE"} className={listScope==="ACTIVE"?button:secondary} onClick={()=>changeListScope("ACTIVE")} type="button">처리 중 전체 {activeRequests.length}</button>
          <button aria-pressed={listScope==="MONTH"} className={listScope==="MONTH"?button:secondary} onClick={()=>changeListScope("MONTH")} type="button">{w.month.slice(0,7)} 사용분 {monthRequests.length}</button>
          <button aria-pressed={listScope==="CLOSED"} className={listScope==="CLOSED"?button:secondary} onClick={()=>changeListScope("CLOSED")} type="button">완료·종료 {closedMonthRequests.length}</button>
        </div>
        {listScope!=="ACTIVE"&&offMonthActiveCount>0&&<button className="mb-4 w-full rounded-lg bg-blue-50 p-3 text-left text-sm text-blue-900" onClick={()=>changeListScope("ACTIVE")} type="button">다른 사용월에 처리 중인 신청 {offMonthActiveCount}건이 있어. 전체 보기 →</button>}
        <div className="space-y-4">{visible.map(r=><article id={`reimbursement-request-${r.id}`} key={r.id} className={`rounded-xl border p-4 ${initialRequestId===r.id?"border-blue-400 bg-blue-50/30":""}`}><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{r.merchant} · {money(r.amount)}</h3><span className="text-sm font-semibold">{reimbursementStatusLabels[r.status]}</span></div>
          <p className="mt-2 text-sm">{r.purpose}</p><p className="mt-2 text-sm text-slate-600">신청자 {names[r.applicant_id]??"등록 사용자"} · {r.budget_month.slice(0,7)} 사용 · {koreaDate(new Date(r.submitted_at))} 신청</p>
          <p className="mt-1 text-xs text-slate-600">실제 사용일 {r.used_on} · 예산 승인 {dateTime(r.approved_at)} · 실제 지급 {dateTime(r.paid_at)}</p>
          {r.delay_reason&&<p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm">지연 사유: {r.delay_reason}</p>}
          <p className="mt-2 text-xs text-slate-600">결제수단 {r.payment_method==="PERSONAL_CARD"?"개인카드":r.payment_method==="PERSONAL_TRANSFER"?"개인계좌 이체":"현금"} · 증빙 {r.evidence_kind==="RECEIPT"?"영수증":r.evidence_kind} · {r.evidence_review_status==="READY"?"증빙 확인 가능":r.evidence_review_status==="APPROVED"?"대체증빙 승인 완료":r.evidence_review_status==="SUPPLEMENT_REQUIRED"?"증빙 보완 필요":"대체증빙 승인대기"}</p>
          {r.missing_receipt_reason&&<p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">영수증 미첨부 사유: {r.missing_receipt_reason}</p>}
          <div className="my-2 flex flex-wrap gap-3 text-xs">{r.needs_exception&&<span>지연 승인: {r.exception_approved_at?"완료":"대기"}</span>}{r.needs_senior&&<span>장기 지연 승인: {r.senior_approved_at?"완료":"대기"}</span>}{r.over_budget_approved_at&&<span>예산 초과 승인 완료</span>}</div>
          <div className="flex flex-wrap gap-2"><button className={secondary} onClick={()=>setDetail(r)} type="button">상세 보기</button><a className={secondary} href={`/finance/reimbursements/evidence?id=${r.id}`} target="_blank" rel="noreferrer">증빙만 보기</a>
            {requestActions(r,w.member,period).map(a=><button key={a} className={secondary} disabled={op.pending} onClick={()=>{setSelected(r);setAction(a);}}>{reimbursementCommandLabels[a]}</button>)}
          </div>
        </article>)}{!visible.length&&<p className="py-6 text-center text-slate-500">이 조건에 해당하는 신청이 없어.</p>}</div>
      </section>
    </>}
    {tab==="budgets"&&<>
      <section className={card}><h2 className="mb-3 text-lg font-bold">월 예산 사용 현황</h2><p className="mb-4 text-sm text-slate-600">귀속이 확인된 간편지출·개인 정산·지출결의·수기 집행액을 함께 표시해. 가용액은 월 예산에서 사용액과 집행 예약을 뺀 금액이야. 심사 중 금액과 지급대기는 중복 차감하지 않아.</p><UnifiedBudgetTable budgets={w.budgets} entries={w.budgetEntries}/></section>
      {w.member.permissions.length>0&&<BudgetAllocationPanel workspace={w}/>}
      {canClose&&<section className={card}><h2 className="text-lg font-bold">개인 경비 월별 정산 마감</h2><form className="mt-3 flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);command(String(data.get("command")),{month:w.month,reason:String(data.get("reason"))});}}><select className="rounded-lg border p-2" name="command">{!period?<option value="OPEN">접수월 수동 개설 (복구용)</option>:period.status!=="CLOSED"?<><option value="SUPPLEMENT">보완 접수 전환</option><option value="CLOSE">월 마감·보고서 확정</option></>:<option value="">이미 마감된 월</option>}</select><input className={`${input} max-w-md`} aria-label="마감 처리 사유" name="reason" placeholder="처리 사유" required/><button className={button} disabled={op.pending||period?.status==="CLOSED"}>처리</button></form><p className="mt-3 text-sm text-slate-600">첫 정산 신청 시 접수월이 자동 개설돼. 수동 개설은 신청 전에 월을 준비하거나 자동 처리를 복구할 때만 사용해. 마감 후 신청은 예산 반영 승인 시 수정 보고서가 자동으로 추가되고 기존 보고서는 보존돼.</p></section>}
      <section className={`${card} space-y-3`}><h2 className="text-lg font-bold">마감 보고서 원본·수정본</h2>{w.reports.map((report,i)=><Report key={report.revision} report={report} previous={w.reports[i+1]}/>)}{!w.reports.length&&<p className="text-sm text-slate-600">확정된 마감 보고서가 없어.</p>}</section>
      <section className={card}><h2 className="mb-3 text-lg font-bold">최근 처리 이력</h2><ul className="space-y-3 text-sm">{w.audits.map(a=><li key={a.id} className="border-b pb-2">{dateTime(a.created_at)} · {names[a.actor_id]??"등록 사용자"} · {reimbursementCommandLabels[a.action]??a.action}<p className="text-slate-600">{a.reason}</p></li>)}</ul></section>
    </>}
    {tab==="settings"&&<>
      <section className={card}><h2 className="text-lg font-bold">제출·보완 마감 기준</h2><p className="my-3 text-sm text-slate-600">설정은 새로 개설하는 월부터 적용돼. 이미 개설한 월의 기한은 유지돼.</p>
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);op.run(async()=>{const result=await saveReimbursementPolicy({submission_day:Number(data.get("submission_day")),completion_day:Number(data.get("completion_day")),long_delay_days:Number(data.get("long_delay_days"))});if(!result.ok)throw new Error(result.message);},"운영 기준을 저장했어. 이제 첫 정산 신청 때 접수월이 자동 개설돼.");}}>
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
    {detail&&<ReimbursementDetail applicantName={names[detail.applicant_id]??"등록 사용자"} budgetName={w.budgets.find(b=>b.id===detail.budget_id)?.budget_item??"예산항목 확인 필요"} canEdit={detail.status==="SUBMITTED"&&Boolean(detail.updated_at)&&(detail.applicant_id===w.member.user_id||isAdmin)} onClose={()=>setDetail(null)} onSaved={()=>{setDetail(null);router.refresh();}} record={detail}/>}
  </>;
}
