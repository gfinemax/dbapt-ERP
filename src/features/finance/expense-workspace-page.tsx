"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { attachQuickExpenseEvidenceAction, connectExpenseOriginal, reviewQuickExpenseEvidenceAction, updatePersonalReimbursementDetailsAction, updateQuickExpenseDetailsAction } from "@/app/finance/expenses/actions";
import { createExpenseEvidenceDownloadUrlAction, getExpenseEvidenceOcrJobAction } from "@/app/finance/expense-resolutions/actions";
import type { EvidenceOcrData, ExpenseEvidenceUploadResult } from "./expense-evidence";
import { expenseResolutionHref } from "./expense-entry";
import type { ExpenseWorkspace, ExpenseWorkspaceRecord } from "./expense-workspace-repository";
import type { OperatingExpenseDetail } from "./operating-budget-classification";
import { recommendOperatingExpenseDetail } from "./expense-budget-recommendation";

const kinds = { RESOLUTION: "지출결의", QUICK: "간편지출", PERSONAL: "개인 대납 정산" };
const labels: Record<string, string> = { RECORDED: "간편처리 완료", SOURCE_PENDING: "카드내역 연결대기", EVIDENCE_PENDING: "증빙 확인대기", NEEDS_RESOLUTION: "결의 필요", CONVERTED: "결의·정산 연결", SUBMITTED: "승인대기", APPROVED: "승인완료", PAID: "지급완료", REJECTED: "반려", CANCELLED: "취소", PENDING: "요청 준비", REVIEWING: "심사 중", PARTIAL: "일부 승인", SUPPLEMENT: "보완 요청", WITHDRAWAL_PENDING: "철회 확인 대기", WITHDRAWN: "철회" };
const sourcePendingDescription = "법인카드 승인내역이 들어오면 실제 거래와 연결해줘.";
const card = "rounded-2xl border border-slate-200 bg-white p-5";
const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2";
const money = (value: number | null) => value === null ? "확인 필요" : `${Number(value).toLocaleString("ko-KR")}원`;
const day = (value: string | null) => !value ? "미지정" : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
const keyOf = (r: ExpenseWorkspaceRecord) => `${r.source_kind}:${r.source_id}`;
const noEvidence: NonNullable<ExpenseWorkspaceRecord["evidence_files"]> = [];

async function uploadReceipt(formData: FormData): Promise<ExpenseEvidenceUploadResult> {
  const response = await fetch("/api/finance/expense-evidence", { body: formData, method: "POST" });
  const result = await response.json().catch(() => null) as ExpenseEvidenceUploadResult | null;
  if (result && typeof result === "object" && "ok" in result) return result;
  throw new Error("영수증 업로드 결과를 확인하지 못했어. 다시 시도해줘.");
}

function ocrDescription(data: EvidenceOcrData) {
  const items = data.items?.map(item => item.itemName).filter(Boolean).join(", ");
  return items || data.itemName || "";
}

function QuickExpenseTools({ canApprove, expenseDetails, record: r }: { canApprove: boolean; expenseDetails: OperatingExpenseDetail[]; record: ExpenseWorkspaceRecord }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false); const [description, setDescription] = useState(r.title); const [counterparty, setCounterparty] = useState(r.counterparty ?? "");
  const [expenseDetailId, setExpenseDetailId] = useState(r.expense_detail_id ?? ""); const [budgetItem, setBudgetItem] = useState(r.budget_item ?? "");
  const [detailSelection, setDetailSelection] = useState<"AUTO" | "MANUAL">(r.expense_detail_id ? "MANUAL" : "AUTO"); const [evidenceText, setEvidenceText] = useState("");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [liveOcr, setLiveOcr] = useState<Record<string, { status: string; progress: number; data: EvidenceOcrData; error?: string }>>({});
  const [evidenceType, setEvidenceType] = useState("영수증"); const [reviewReason, setReviewReason] = useState("");
  const editOperationKey = useRef<string | null>(null);
  const evidence = r.evidence_files ?? noEvidence;
  const detailRecommendation = recommendOperatingExpenseDetail(expenseDetails, { counterparty, evidenceText, itemName: description, vendorName: counterparty });
  const effectiveExpenseDetailId = detailSelection === "AUTO" ? detailRecommendation?.detail.id ?? "" : expenseDetailId;
  const effectiveBudgetItem = detailSelection === "AUTO" ? detailRecommendation?.detail.budgetItem ?? "" : budgetItem;
  useEffect(() => {
    const pendingJobs = evidence.filter(file => !["COMPLETED", "FAILED"].includes(liveOcr[file.ocr_job_id]?.status ?? file.status));
    if (!pendingJobs.length) return;
    const timer = window.setTimeout(async () => {
      const updates = await Promise.all(pendingJobs.map(async file => {
        try { const job = await getExpenseEvidenceOcrJobAction(file.ocr_job_id); return [file.ocr_job_id, { status: job.status, progress: job.progress, data: job.resultData, error: job.errorMessage }] as const; }
        catch (error) { return [file.ocr_job_id, { status: "FAILED", progress: 100, data: {}, error: error instanceof Error ? error.message : "OCR 상태를 확인하지 못했어." }] as const; }
      }));
      setLiveOcr(current => ({ ...current, ...Object.fromEntries(updates) }));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [evidence, liveOcr]);
  async function save() {
    if (!r.updated_at) return setMessage("원본 수정 시각을 확인할 수 없어. 새로고침 후 다시 시도해줘.");
    setBusy(true); setMessage("");
    try { editOperationKey.current ??= crypto.randomUUID(); await updateQuickExpenseDetailsAction({ id: r.source_id, usageDescription: description, counterparty, budgetItem: effectiveBudgetItem, expenseDetailId: effectiveExpenseDetailId, expectedUpdatedAt: r.updated_at, operationKey: editOperationKey.current }); editOperationKey.current = null; setMessage("사용내용·거래처·지출 세부항목을 저장했어. 연결된 지급·신탁·회계 화면에서는 원본 변경 확인 후 최신 내용으로 갱신해줘."); setEditing(false); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "간편지출을 수정하지 못했어."); } finally { setBusy(false); }
  }
  async function upload(file: File | undefined) {
    if (!file) return; setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("file", file); form.set("resolutionNo", `QUICK-${r.source_id}`); form.set("evidenceType", evidenceType);
      const result = await uploadReceipt(form); if (!result.ok) throw new Error(result.message);
      await attachQuickExpenseEvidenceAction(r.source_id, result.attachment, `quick-receipt:${r.source_id}:${result.attachment.ocrJobId}`);
      setMessage("영수증을 저장했고 OCR 자동입력을 시작했어."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "영수증을 등록하지 못했어."); } finally { setBusy(false); }
  }
  async function review(decision: "APPROVE_EVIDENCE" | "REQUEST_EVIDENCE_SUPPLEMENT") {
    if (!reviewReason.trim()) return setMessage("증빙 처리 사유를 입력해줘.");
    setBusy(true); setMessage("");
    try { await reviewQuickExpenseEvidenceAction({ id: r.source_id, decision, reason: reviewReason, operationKey: crypto.randomUUID() }); setMessage(decision === "APPROVE_EVIDENCE" ? "증빙을 확인하고 간편처리 상태를 갱신했어." : "증빙 보완을 요청했어."); setReviewReason(""); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "증빙 상태를 처리하지 못했어."); } finally { setBusy(false); }
  }
  async function openReceipt(path: string) { try { window.open(await createExpenseEvidenceDownloadUrlAction(path), "_blank", "noopener,noreferrer"); } catch (error) { setMessage(error instanceof Error ? error.message : "영수증을 열지 못했어."); } }
  function apply(data: EvidenceOcrData) { const next = ocrDescription(data); if (next) setDescription(next); if (data.issuer) setCounterparty(data.issuer); setEvidenceText([data.itemName, data.recognizedText, data.items?.map((item) => item.itemName).join(" ")].filter(Boolean).join(" ")); setDetailSelection("AUTO"); setEditing(true); setMessage("OCR 결과와 추천 세부항목을 편집칸에 넣었어. 확인한 뒤 저장해줘."); }
  return <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4" aria-label="간편지출 수정 및 영수증 OCR">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">내용 수정 · 영수증 OCR</h3><p className="mt-1 text-sm text-slate-600">OCR 결과는 먼저 검토하고 저장해. 원본 금액과 실제 사용일은 지급·예산 연결을 보호하기 위해 여기서 자동 변경하지 않아.</p></div><button className={secondary} onClick={() => setEditing(value => !value)}>{editing ? "수정 닫기" : "내용 수정"}</button></div>
    {editing && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label>사용내용<input className={field} value={description} onChange={e => { editOperationKey.current = null; setDescription(e.target.value); }} /></label><label>거래처<input className={field} value={counterparty} onChange={e => { editOperationKey.current = null; setCounterparty(e.target.value); }} /></label><label className="sm:col-span-2">지출 세부항목<select aria-label="수정 지출 세부항목" className={field} value={effectiveExpenseDetailId} onChange={e => { const detail = expenseDetails.find((item) => item.id === e.target.value); editOperationKey.current = null; setDetailSelection(e.target.value ? "MANUAL" : "AUTO"); setExpenseDetailId(e.target.value); setBudgetItem(detail?.budgetItem ?? ""); }}><option value="">세부항목 선택</option>{expenseDetails.map((detail) => <option key={detail.id} value={detail.id}>{detail.groupName} · {detail.name}{detail.status === "POLICY_REVIEW" ? " (정책 확인 필요)" : !detail.quickExpenseEligible ? " (정식결의)" : ""}</option>)}</select><span className="mt-1 block text-xs text-slate-600">{detailSelection === "AUTO" && detailRecommendation ? `${detailRecommendation.recommendation.reason} · 자동 선택` : "직접 선택한 세부항목은 자동 추천이 덮어쓰지 않아."}</span></label><div className="sm:col-span-2"><button className={button} disabled={busy || !effectiveExpenseDetailId || !effectiveBudgetItem} onClick={save}>수정 저장</button></div></div>}
    <div className="mt-4 grid gap-3 sm:grid-cols-[220px_1fr]"><label className="text-sm font-semibold">증빙 종류<select className={field} value={evidenceType} onChange={e=>setEvidenceType(e.target.value)}><option>영수증</option><option>주문내역</option><option>거래명세서</option><option>카드 승인내역</option><option>계좌이체 확인증</option><option>물품 사진</option><option>기타 대체증빙</option></select></label><label className="text-sm font-semibold" htmlFor={`receipt-${r.source_id}`}>증빙 파일<input id={`receipt-${r.source_id}`} className={`${field} file:mr-3`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.currentTarget.value = ""; }} /><span className="mt-1 block text-xs text-slate-600">PDF·JPG·PNG·WEBP·TXT·CSV, 최대 10MB</span></label></div>
    {evidence.length ? <ul className="mt-4 space-y-3">{evidence.map(file => { const current = liveOcr[file.ocr_job_id]; const status = current?.status ?? file.status; const progress = current?.progress ?? file.progress; const data = current?.data ?? file.result_data; const mismatch = data.totalAmount !== undefined && Number(data.totalAmount) !== Number(r.amount); return <li className="rounded-lg border bg-white p-3" key={file.ocr_job_id}><div className="flex flex-wrap items-center justify-between gap-2"><button className="font-semibold underline" onClick={() => void openReceipt(file.storage_path)}>{file.file_name}</button><span className="text-sm">{status === "COMPLETED" ? "OCR 완료" : status === "FAILED" ? "OCR 실패" : `OCR 처리 중 ${progress}%`}</span></div>{status === "FAILED" && <p className="mt-2 text-sm text-red-700">{current?.error ?? file.error_message ?? "자동인식에 실패했어."}</p>}{status === "COMPLETED" && <div className="mt-3 text-sm"><p>거래처 {data.issuer ?? "미인식"} · 영수증 금액 {data.totalAmount === undefined ? "미인식" : money(data.totalAmount)} · 거래일 {data.documentDate ?? "미인식"}</p>{mismatch && <p className="mt-2 rounded bg-amber-50 p-2 text-amber-800">원본 {money(r.amount)}과 OCR 금액 {money(data.totalAmount!)}이 달라. 금액은 자동 수정하지 않았어.</p>}<button className={`${secondary} mt-2`} onClick={() => apply(data)}>OCR 결과를 내용 수정에 반영</button></div>}</li>; })}</ul> : <p className="mt-4 text-sm text-slate-600">등록된 영수증이 없어.</p>}
    <div className="mt-4 rounded-lg border bg-white p-3"><p className="text-sm font-semibold">증빙 상태: {r.evidence_review_status === "APPROVED" ? "확인 완료" : r.evidence_review_status === "READY" ? "영수증 확인 가능" : r.evidence_review_status === "SUPPLEMENT_REQUIRED" ? "보완 필요" : "검토대기"}</p>{r.missing_evidence_reason?<p className="mt-1 text-sm">영수증 미첨부 사유: {r.missing_evidence_reason}</p>:null}{canApprove?<div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input aria-label="증빙 처리 사유" className={field} value={reviewReason} onChange={e=>setReviewReason(e.target.value)} placeholder="확인·보완 사유"/><button className={secondary} disabled={busy||!evidence.length} onClick={()=>void review("APPROVE_EVIDENCE")}>증빙 확인·완료</button><button className={secondary} disabled={busy} onClick={()=>void review("REQUEST_EVIDENCE_SUPPLEMENT")}>보완 요청</button></div>:null}</div>
    <p role="status" className="mt-3 text-sm">{message}</p>
  </section>;
}

function PersonalReimbursementTools({ record: r }: { record: ExpenseWorkspaceRecord }) {
  const router = useRouter(); const [editing, setEditing] = useState(false); const [merchant, setMerchant] = useState(r.counterparty ?? "");
  const [purpose, setPurpose] = useState(r.personal_purpose ?? ""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function save() {
    if (!r.personal_updated_at) return setMessage("원본 수정 시각을 확인할 수 없어. 새로고침 후 다시 시도해줘.");
    setBusy(true); setMessage("");
    try {
      const result = await updatePersonalReimbursementDetailsAction({ id: r.source_id, merchant, purpose, reason, expectedUpdatedAt: r.personal_updated_at });
      if (!result.ok) return setMessage(result.message);
      setMessage(`${result.message} 연결된 업무가 있다면 원본 변경 여부를 확인해줘.`); setEditing(false); setReason(""); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "개인 정산 원본을 수정하지 못했어."); } finally { setBusy(false); }
  }
  if (!r.personal_can_edit) return null;
  return <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4" aria-label="개인 정산 원본 수정">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">개인 정산 원본 수정</h3><p className="mt-1 text-sm text-slate-600">승인대기 중에는 거래처와 사용내용만 고칠 수 있어. 금액·사용일·예산·증빙은 기존 신청 화면에서 취소 후 다시 신청해야 해.</p></div><button className={secondary} onClick={() => setEditing(value => !value)}>{editing ? "수정 닫기" : "거래처·사용내용 수정"}</button></div>
    {editing && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label>거래처<input className={field} maxLength={200} value={merchant} onChange={e => setMerchant(e.target.value)} /></label><label>사용내용<input className={field} maxLength={500} value={purpose} onChange={e => setPurpose(e.target.value)} /></label><label className="sm:col-span-2">수정 사유<input className={field} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 거래처명 오기 수정" /></label><div className="sm:col-span-2"><button className={button} disabled={busy || !merchant.trim() || !purpose.trim() || !reason.trim()} onClick={() => void save()}>수정 저장</button></div></div>}
    <p role="status" className="mt-3 text-sm">{message}</p>
  </section>;
}

function personalReimbursementHref(r: ExpenseWorkspaceRecord, action?: "APPROVE" | "PAY") {
  const params = new URLSearchParams({ tab: "requests", request: r.source_id });
  if (r.budget_month) params.set("month", r.budget_month.slice(0, 7));
  if (action) params.set("action", action);
  return `/finance/reimbursements?${params.toString()}#reimbursement-request-${r.source_id}`;
}

function PersonalWorkflowAction({ permissions, record: r }: { permissions: ExpenseWorkspace["viewer"]["permissions"]; record: ExpenseWorkspaceRecord }) {
  const canApprove = !r.personal_is_applicant && permissions.some(permission => ["ADMIN", "APPROVE"].includes(permission));
  const canPay = permissions.some(permission => ["ADMIN", "PAY"].includes(permission));
  const action = r.approval_status === "SUBMITTED" && canApprove ? "APPROVE" : r.approval_status === "APPROVED" && canPay ? "PAY" : undefined;
  const label = action === "APPROVE" ? "정산 승인 검토" : action === "PAY" ? "실제 출금 거래 연결" : "개인 정산 신청 화면에서 확인";
  const guidance = r.approval_status === "SUBMITTED"
    ? canApprove ? "증빙과 예산 귀속을 확인한 뒤 승인할 수 있습니다." : "승인 담당자의 처리를 기다리고 있습니다."
    : r.approval_status === "APPROVED"
      ? canPay ? "승인된 정산에 실제 출금 거래를 연결할 수 있습니다." : "지급 담당자의 출금 거래 연결을 기다리고 있습니다."
      : r.approval_status === "PAID" ? "지급 연결과 처리 이력을 확인할 수 있습니다." : "개인 정산 원본에서 처리 상태와 이력을 확인할 수 있습니다.";
  return <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4" aria-label="개인 정산 다음 작업">
    <h3 className="font-bold">다음 작업</h3><p className="mt-1 text-sm text-slate-600">{guidance}</p>
    <Link className={`${action ? button : secondary} mt-3 inline-block`} href={personalReimbursementHref(r, action)}>{label}</Link>
  </section>;
}

function displayPaymentStatus(r: ExpenseWorkspaceRecord) {
  if (r.payment_status) return r.payment_status;
  if (r.source_kind !== "PERSONAL") return "별도 지급 확인 필요";
  if (r.approval_status === "SUBMITTED") return "승인 후 지급 연결";
  if (r.approval_status === "APPROVED") return "지급 거래 연결 대기";
  return "별도 지급 없음";
}

export function filterExpenseRecords(records: ExpenseWorkspaceRecord[], kind: string, connection: string, search: string) {
  const query = search.trim().toLocaleLowerCase();
  return records.filter(r => (kind === "ALL" || r.source_kind === kind) && (connection === "ALL" || (connection === "CONNECTED" ? !!r.transaction_id : !r.transaction_id)) &&
    (!query || `${r.title} ${r.number ?? ""} ${r.counterparty ?? ""}`.toLocaleLowerCase().includes(query)));
}

function ExpenseStart({ staff }: { staff: boolean }) {
  const [scenario, setScenario] = useState("");
  return <section className={card}><h2 className="text-xl font-bold">지출 등록 시작</h2><p className="mt-2 text-sm text-slate-600">진행 상황을 선택한 다음 기존 작성 화면에서 등록해. 이미 등록한 건은 아래 원본 목록에서 연결해줘.</p>
    <div className="my-4 flex flex-wrap gap-2">{[["FUTURE", "앞으로 지급할 거래"], ["USED", "이미 사용하거나 지급한 거래"], ["ADVANCE", "먼저 지급한 돈의 정산"]].map(([value, label]) => <button key={value} className={scenario === value ? button : secondary} aria-pressed={scenario === value} onClick={() => setScenario(value)}>{label}</button>)}</div>
    {scenario === "FUTURE" && <div className="space-y-3"><p>기안이 필요 없는 일상 지출도 지출결의 승인은 별개야. 승인 근거와 지급 대상을 확인한 뒤 결의서를 작성해.</p>{staff ? <Link className={secondary} href={expenseResolutionHref({ start: "advance" })}>사전 지출결의 작성</Link> : <p>조합의 지급 요청은 담당자에게 전달하고, 본인이 먼저 사용한 경비는 개인 대납 정산으로 신청해줘.</p>}</div>}
    {scenario === "USED" && <div className="space-y-3"><p>개인 돈으로 먼저 지출한 경우와 조합 계좌·카드에서 이미 지급한 경우를 구분해. 예산 안이라는 사실만으로 결의 생략을 확정하지 않아.</p><div className="flex flex-wrap gap-3"><Link className={secondary} href="/finance/reimbursements">개인이 먼저 쓴 경비 정산 신청</Link>{staff && <><Link className={secondary} href="/finance/quick-expenses">결의 생략 근거가 있는 간편지출 등록</Link><Link className={secondary} href={expenseResolutionHref({ start: "reimbursement" })}>사후 승인이 필요한 결의 작성</Link></>}</div></div>}
    {scenario === "ADVANCE" && <div className="space-y-3"><p>원래 지급한 금액과 사용내역을 연결하고, 잔액 반납이나 추가 지급을 구분해야 해.</p><p className="rounded-lg bg-amber-50 p-3">실제 원지급과 사용내역을 연결하는 정산 초안을 저장할 수 있어. 정산 확정·예산 반영·추가 지급 실행은 정책 확인 전까지 제한돼.</p>{staff && <div className="flex flex-wrap gap-3"><Link className={secondary} href="/finance/advance-settlements">선지급 정산 초안 작성·조회</Link><Link className={secondary} href="/finance/payments">실제 지급 내역 확인</Link><Link className={secondary} href="/finance/expense-resolutions">기존 결의 자료 확인</Link></div>}</div>}
  </section>;
}

function ExpenseDetail({ canApprove, expenseDetails, onClose, permissions, record: r, staff }: { canApprove: boolean; expenseDetails: OperatingExpenseDetail[]; onClose: () => void; permissions: ExpenseWorkspace["viewer"]["permissions"]; record: ExpenseWorkspaceRecord; staff: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition(); const busy = useRef(false); const operationKey = useRef<string | null>(null); const [message, setMessage] = useState(""); const [tab, setTab] = useState<"DETAIL" | "CONNECTIONS">("DETAIL");
  function connect() {
    if (busy.current) return; busy.current = true; operationKey.current ??= crypto.randomUUID(); setMessage("");
    start(async () => { try { await connectExpenseOriginal(r.source_kind, r.source_id, operationKey.current!); setMessage("원본을 연결했어. 최신 내역을 다시 불러왔어."); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "원본을 연결하지 못했어."); } finally { busy.current = false; } });
  }
  return <section aria-label="지출 상세" className={card}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-blue-700">{kinds[r.source_kind]}{r.number ? ` · ${r.number}` : ""}</p><h2 className="mt-1 break-words text-xl font-bold">{r.title}</h2><div className="mt-3 flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.approval_status === "SOURCE_PENDING" ? "bg-amber-100 text-amber-900" : "bg-blue-50 text-blue-700"}`}>{labels[r.approval_status] ?? r.approval_status}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{r.transaction_id ? "업무흐름 연결됨" : "업무흐름 미연결"}</span>{r.payment_status && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{r.payment_status}</span>}</div>{r.approval_status === "SOURCE_PENDING" && <p className="mt-2 text-sm text-amber-800">{sourcePendingDescription}</p>}</div><button aria-label="지출 상세 닫기" className={`${secondary} shrink-0`} onClick={onClose}>닫기</button></div>
    <p className="mt-5 text-3xl font-bold">{money(r.amount)}</p>
    <div aria-label="지출 상세 구분" className="mt-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist"><button aria-controls="expense-detail-panel" aria-selected={tab === "DETAIL"} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === "DETAIL" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`} id="expense-detail-tab" onClick={() => setTab("DETAIL")} role="tab">원본 정보</button><button aria-controls="expense-connections-panel" aria-selected={tab === "CONNECTIONS"} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === "CONNECTIONS" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`} id="expense-connections-tab" onClick={() => setTab("CONNECTIONS")} role="tab">연결 현황</button></div>
    {tab === "DETAIL" && <div aria-labelledby="expense-detail-tab" id="expense-detail-panel" role="tabpanel"><dl className="my-5 grid gap-4 sm:grid-cols-2">{[["원본 승인·처리 상태", labels[r.approval_status] ?? r.approval_status], ["원본 지급 상태", displayPaymentStatus(r)], ["작성자", r.author_label ?? "미확인"], ["거래처", r.counterparty || "미확인"], ["작성일", day(r.created_at)], ["실제 사용일", day(r.used_at)], ["회계 귀속일", day(r.accounting_date)], ["개인 정산 예산월", r.budget_month?.slice(0, 7) ?? "해당 없음"]].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
      {r.source_kind === "PERSONAL" && <PersonalWorkflowAction permissions={permissions} record={r} />}
      {staff && r.source_kind === "QUICK" && <QuickExpenseTools canApprove={canApprove} expenseDetails={expenseDetails} record={r} />}
      {r.source_kind === "PERSONAL" && <PersonalReimbursementTools record={r} />}
    </div>}
    {tab === "CONNECTIONS" && <div aria-labelledby="expense-connections-tab" className="mt-5" id="expense-connections-panel" role="tabpanel">{r.transaction_id && r.amounts ? <div className="rounded-lg bg-slate-50 p-4"><h3 className="font-semibold">연결된 지급 현황</h3><p className="mt-2">누적 실제 지급 {money(r.amounts.paid)} · 총 미지급 {money(r.amounts.remaining)} · 승인 중 미지급 {money(r.amounts.approved_unpaid)}</p>{r.amounts.legacy_payment_complete && <p className="mt-2 text-sm">기존 지급완료 기록을 보존했어. 금액 근거가 없으면 확인 필요로 표시돼.</p>}</div> : <div className="rounded-lg bg-slate-50 p-4"><p>통합 업무에 아직 연결되지 않은 원본이야. 연결해도 원본을 복제하거나 새 지급·비용을 만들지 않아.</p>{r.can_connect && <button className={`${button} mt-3`} disabled={pending} onClick={connect}>원본 연결</button>}</div>}
      <p role="status" className="my-3">{message}</p>
      <h3 className="mt-4 font-semibold">신탁 요청 연결</h3>{r.trust_items.length ? <ul className="mt-2 space-y-2">{r.trust_items.map(i => <li className="rounded-lg border p-3" key={i.id}>{staff ? <Link className="underline" href={`/finance/trust?request=${encodeURIComponent(i.request_id)}`}>{i.request_no}</Link> : <span>{i.request_no}</span>} · {labels[i.status] ?? i.status} · 요청 {money(i.requested_amount)} · 승인 {money(i.approved_amount)} · 지급 {money(i.paid_amount)}{i.needs_review && <span className="ml-2 text-amber-700">재검토 필요</span>}</li>)}</ul> : <p className="mt-2 text-sm">연결된 신탁 요청이 없어.</p>}
      <h3 className="mt-4 font-semibold">회계전표 연결</h3>{r.vouchers.length ? <ul className="mt-2 space-y-2">{r.vouchers.map(v => <li key={v.id}>{staff ? <Link className="underline" href={`/finance?voucherId=${encodeURIComponent(v.id)}`}>{v.voucher_no}</Link> : <span>{v.voucher_no}</span>} · {v.status} · {v.source_kind === "RECOGNITION" ? "발생 인식" : v.source_kind === "PAYMENT" ? "실제 지급" : "기존 전표"}</li>)}</ul> : <p className="mt-2 text-sm">연결된 전표가 없어.</p>}
      <div className="mt-5 flex flex-wrap gap-3">{staff && <Link className={secondary} href={`/finance/payments?tab=ALL&q=${encodeURIComponent(r.title)}`}>제목으로 지급 목록 확인</Link>}{(staff || r.source_kind === "PERSONAL") && <Link className={secondary} href={r.source_kind === "RESOLUTION" ? expenseResolutionHref({ resolutionId: r.source_id }) : r.source_kind === "QUICK" ? "/finance/quick-expenses" : `/finance/reimbursements${r.budget_month ? `?month=${r.budget_month.slice(0, 7)}` : ""}`}>기존 {kinds[r.source_kind]} 화면에서 확인</Link>}</div><p className="mt-3 text-xs text-slate-600">기존 작성·승인·출력 기능은 각 원본 화면에 있어. 지출결의는 선택한 원본 상세로 바로 열려. 간편지출·개인 정산은 해당 목록에서 확인해줘.</p>
    </div>}
  </section>;
}

export function ExpenseWorkspacePage({ workspace, expenseDetails = [], initialKind = "ALL", initialConnection = "ALL", initialSearch = "", initialSourceKind, initialSourceId }: { workspace: ExpenseWorkspace; expenseDetails?: OperatingExpenseDetail[]; initialKind?: string; initialConnection?: string; initialSearch?: string; initialSourceKind?: string; initialSourceId?: string }) {
  const router = useRouter(); const [kind, setKind] = useState(Object.hasOwn(kinds, initialKind) ? initialKind : "ALL"); const [connection, setConnection] = useState(["CONNECTED", "UNCONNECTED"].includes(initialConnection) ? initialConnection : "ALL"); const [search, setSearch] = useState(initialSearch); const [selected, setSelected] = useState(initialSourceKind && initialSourceId ? `${initialSourceKind}:${initialSourceId}` : "");
  const rows = filterExpenseRecords(workspace.records, kind, connection, search); const detail = workspace.records.find(r => keyOf(r) === selected);
  function navigate(next: { kind?: string; connection?: string; q?: string; source_kind?: string; source_id?: string }) {
    const params = new URLSearchParams(window.location.search); for (const [key, value] of Object.entries(next)) { if (value) params.set(key, value); else params.delete(key); }
    router.replace(`/finance/expenses?${params}`, { scroll: false });
  }
  function selectDetail(record: ExpenseWorkspaceRecord) { setSelected(keyOf(record)); navigate({ source_kind: record.source_kind, source_id: record.source_id }); }
  const closeDetail = useCallback(() => { const previous = detail; setSelected(""); const params = new URLSearchParams(window.location.search); params.delete("source_kind"); params.delete("source_id"); router.replace(`/finance/expenses?${params}`, { scroll: false }); window.requestAnimationFrame(() => { if (previous) document.getElementById(`expense-source-${previous.source_kind}-${previous.source_id}`)?.focus(); }); }, [detail, router]);
  useEffect(() => { if (!detail) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") closeDetail(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [closeDetail, detail]);
  return <div className="space-y-5"><header className={card}><h1 className="text-3xl font-bold">지출관리</h1><p className="mt-2 text-slate-600">원본 지출과 승인·신탁·지급·회계 연결을 한곳에서 확인해.</p>{!workspace.viewer.staff && <p className="mt-2">본인이 신청한 개인 대납 정산만 표시돼.</p>}</header><ExpenseStart staff={workspace.viewer.staff} />
    <div className="@container/expense"><div className="@min-[1120px]/expense:grid @min-[1120px]/expense:grid-cols-[minmax(620px,1fr)_minmax(400px,480px)] @min-[1120px]/expense:items-start @min-[1120px]/expense:gap-5"><section className={`${card} min-w-0`}><h2 className="text-xl font-bold">지출 원본 목록</h2><p className="mt-2 text-sm text-slate-600">같은 사용을 결의·정산으로 전환한 기록도 원본별로 보존해. 이 목록의 금액을 합산하면 중복될 수 있어.</p><div className="@container/filters"><div className="my-4 grid gap-3 sm:grid-cols-2 @min-[720px]/filters:grid-cols-[minmax(150px,0.8fr)_minmax(170px,0.8fr)_minmax(240px,1.4fr)]"><label>원본 종류<select className={field} value={kind} onChange={e => { setKind(e.target.value); navigate({ kind: e.target.value }); }}><option value="ALL">전체</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>업무흐름 연결<select className={field} value={connection} onChange={e => { setConnection(e.target.value); navigate({ connection: e.target.value }); }}><option value="ALL">전체</option><option value="CONNECTED">연결됨</option><option value="UNCONNECTED">미연결</option></select></label><label className="sm:col-span-2 @min-[720px]/filters:col-span-1">지출 검색<input className={field} value={search} placeholder="제목·문서번호·거래처" onChange={e => { setSearch(e.target.value); navigate({ q: e.target.value }); }} /></label></div></div>
      <p className="mb-3">전체 원본 {workspace.records.length}건 · 조회 결과 {rows.length}건</p>{rows.some(r => r.approval_status === "SOURCE_PENDING") && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><span className="font-semibold">카드내역 연결대기</span> · {sourcePendingDescription}</p>}<div className="overflow-x-auto"><table className="w-full min-w-[650px] table-fixed text-left text-sm"><colgroup><col /><col className="w-28" /><col className="w-48" /><col className="w-36" /></colgroup><thead><tr><th className="p-2">원본</th><th className="px-2 text-right">금액</th><th className="px-2">원본 상태</th><th className="px-2">업무흐름 연결</th></tr></thead><tbody>{rows.map(r => { const active = selected === keyOf(r); return <tr aria-selected={active} key={keyOf(r)} className={`cursor-pointer border-t align-top transition-colors hover:bg-blue-50/60 ${active ? "bg-blue-50 shadow-[inset_4px_0_0_#2563eb]" : ""}`} onClick={() => selectDetail(r)}><td className="p-2"><button id={`expense-source-${r.source_kind}-${r.source_id}`} className="line-clamp-2 w-full text-left font-semibold underline decoration-slate-400 underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-pressed={active} onClick={event => { event.stopPropagation(); selectDetail(r); }}>{r.title}</button><p className="mt-1 truncate text-xs">{kinds[r.source_kind]}{r.number ? ` · ${r.number}` : ""}</p></td><td className="px-2 py-3 text-right font-medium tabular-nums whitespace-nowrap">{money(r.amount)}</td><td className="px-2 py-2">{r.approval_status === "SOURCE_PENDING" ? <div><span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900" title={sourcePendingDescription}>{labels[r.approval_status]}</span>{r.payment_status ? <p className="mt-1 text-xs">{r.payment_status}</p> : null}</div> : <>{labels[r.approval_status] ?? r.approval_status}{r.payment_status ? ` · ${r.payment_status}` : ""}</>}</td><td className="px-2 py-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${r.transaction_id ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"}`}>{r.transaction_id ? "업무흐름 연결됨" : "업무흐름 미연결"}</span></td></tr>; })}</tbody></table></div>{!rows.length && <p className="py-6 text-center">조건에 맞는 지출 원본이 없어.</p>}</section>
      {!detail && !selected && <div className="hidden @min-[1120px]/expense:block"><section className={`${card} sticky top-4`}><h2 className="font-bold">원본 상세</h2><p className="mt-2 text-sm text-slate-600">목록에서 원본을 선택하면 상세와 연결 현황을 확인할 수 있어.</p></section></div>}
      {detail && <><button aria-label="상세 패널 배경 닫기" className="fixed inset-x-0 bottom-0 top-[176px] z-40 bg-slate-950/25 backdrop-blur-[1px] md:top-[115px] @min-[1120px]/expense:hidden" onClick={closeDetail} type="button" /><aside aria-label="선택한 지출 원본 상세 패널" className="fixed right-0 bottom-0 top-[176px] z-50 w-full overflow-y-auto overscroll-contain bg-slate-50 p-3 shadow-2xl sm:max-w-[520px] md:top-[115px] @min-[1120px]/expense:sticky @min-[1120px]/expense:top-4 @min-[1120px]/expense:bottom-auto @min-[1120px]/expense:z-auto @min-[1120px]/expense:col-start-2 @min-[1120px]/expense:row-start-1 @min-[1120px]/expense:max-h-[calc(100vh-2rem)] @min-[1120px]/expense:max-w-none @min-[1120px]/expense:bg-transparent @min-[1120px]/expense:p-0 @min-[1120px]/expense:shadow-none"><ExpenseDetail canApprove={workspace.viewer.permissions.some(p => ["ADMIN","APPROVE"].includes(p))} expenseDetails={expenseDetails} key={keyOf(detail)} onClose={closeDetail} permissions={workspace.viewer.permissions} record={detail} staff={workspace.viewer.staff} /></aside></>}
      {!detail && selected && <aside className={`${card} fixed inset-x-3 top-[176px] z-50 sm:left-auto sm:w-[520px] md:top-[115px] @min-[1120px]/expense:static @min-[1120px]/expense:col-start-2 @min-[1120px]/expense:row-start-1 @min-[1120px]/expense:w-auto`}><button className={`${secondary} float-right`} onClick={closeDetail}>닫기</button><p className="pr-20" role="alert">조회 권한이 있는 원본 목록에서 해당 지출을 찾을 수 없어.</p></aside>}
    </div></div>
  </div>;
}
