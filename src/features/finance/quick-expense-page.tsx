"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import type { BankTransactionResolutionCandidate } from "./expense-compliance-repository";
import type { CorporateCardTransactionCandidate } from "./corporate-card-transaction";
import type { QuickExpenseRecord, QuickExpenseRecordInput, QuickExpensePaymentMethod } from "./quick-expense-record";
import type { CorporateCardTransactionImportRow } from "./corporate-card-transaction-import";
import { parseCorporateCardTransactionText } from "./corporate-card-transaction-import";
import { readBankTransactionFile } from "./bank-transaction-file";
import type { OperatingExpenseDetail } from "./operating-budget-classification";
import { recommendOperatingExpenseDetail } from "./expense-budget-recommendation";
import type { EvidenceOcrData, EvidenceOcrJobProgress, ExpenseEvidenceAttachment, ExpenseEvidenceUploadResult } from "./expense-evidence";

const paymentLabels: Record<QuickExpensePaymentMethod, string> = { AUTO_DEBIT: "자동이체", BANK_TRANSFER: "계좌이체", CASH: "현금", CORPORATE_CARD: "법인카드", PERSONAL_PREPAID: "개인 선결제" };
const paymentMethodOrder: QuickExpensePaymentMethod[] = ["CORPORATE_CARD", "PERSONAL_PREPAID", "CASH", "BANK_TRANSFER", "AUTO_DEBIT"];
export function QuickExpensePage({ attachEvidence, discardEvidence, getEvidenceOcrJob, retryEvidenceOcrJob, importCardTransactions, linkCardTransaction, initialBankTransactions, initialBudgetItems = [], initialExpenseDetails = [], initialCardTransactions, initialRecords, persistRecord, uploadEvidence = uploadQuickExpenseEvidence }: {
  attachEvidence?: (recordId: string, attachment: ExpenseEvidenceAttachment, operationKey: string) => Promise<unknown>;
  discardEvidence?: (ocrJobId: string) => Promise<void>;
  getEvidenceOcrJob?: (ocrJobId: string) => Promise<EvidenceOcrJobProgress>;
  retryEvidenceOcrJob?: (ocrJobId: string) => Promise<void>;
  importCardTransactions?: (rows: CorporateCardTransactionImportRow[]) => Promise<unknown>;
  linkCardTransaction?: (input: { recordId: string; cardTransactionId: string }) => Promise<{ recordStatus: "RECORDED" | "EVIDENCE_PENDING" | "NEEDS_RESOLUTION" }>;
  initialBankTransactions: BankTransactionResolutionCandidate[];
  initialBudgetItems?: string[];
  initialExpenseDetails?: OperatingExpenseDetail[];
  initialCardTransactions: CorporateCardTransactionCandidate[];
  initialRecords: QuickExpenseRecord[];
  persistRecord?: (input: QuickExpenseRecordInput) => Promise<QuickExpenseRecord>;
  uploadEvidence?: (file: File, resolutionNo: string, evidenceType: string) => Promise<ExpenseEvidenceUploadResult>;
}) {
  const [paymentMethod, setPaymentMethod] = useState<QuickExpensePaymentMethod>("BANK_TRANSFER");
  const [sourceId, setSourceId] = useState("");
  const [usageDescription, setUsageDescription] = useState("");
  const [budgetItem, setBudgetItem] = useState("");
  const [expenseDetailId, setExpenseDetailId] = useState("");
  const [expenseDetailSelection, setExpenseDetailSelection] = useState<"AUTO" | "MANUAL">("AUTO");
  const [manualAmount, setManualAmount] = useState("");
  const [manualCounterparty, setManualCounterparty] = useState("");
  const [manualOccurredAt, setManualOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [manualCardEntry, setManualCardEntry] = useState(false);
  const [receiptAvailable, setReceiptAvailable] = useState(true);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptInputKey, setReceiptInputKey] = useState(0);
  const [evidenceType, setEvidenceType] = useState("영수증");
  const [receiptAttachment, setReceiptAttachment] = useState<ExpenseEvidenceAttachment | null>(null);
  const [receiptOcrData, setReceiptOcrData] = useState<EvidenceOcrData>({});
  const [receiptProgress, setReceiptProgress] = useState(0);
  const [receiptState, setReceiptState] = useState<"IDLE" | "UPLOADING" | "PROCESSING" | "COMPLETED" | "FAILED">("IDLE");
  const [receiptError, setReceiptError] = useState("");
  const [isRetryingReceipt, setIsRetryingReceipt] = useState(false);
  const [ocrAppliedFields, setOcrAppliedFields] = useState({ amount: false, counterparty: false, occurredAt: false, usageDescription: false });
  const [missingEvidenceReason, setMissingEvidenceReason] = useState("");
  const [records, setRecords] = useState(initialRecords);
  const [linkingRecordId, setLinkingRecordId] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const editedFields = useRef({ amount: false, counterparty: false, occurredAt: false, usageDescription: false });
  const appliedOcrJobs = useRef(new Set<string>());
  const isBank = paymentMethod === "BANK_TRANSFER" || paymentMethod === "AUTO_DEBIT";
  const isCard = paymentMethod === "CORPORATE_CARD";
  const availableCards = initialCardTransactions.filter((item) => !item.linkedResolutionId && !records.some((record) => record.corporateCardTransactionId === item.id));
  const isManualCard = isCard && (manualCardEntry || availableCards.length === 0);
  const bank = initialBankTransactions.find((item) => item.id === sourceId);
  const card = initialCardTransactions.find((item) => item.id === sourceId);
  const amount = bank?.withdrawalAmount ?? card?.amount ?? Number(manualAmount);
  const counterparty = bank ? bank.counterparty || bank.description : card?.merchantName ?? manualCounterparty;
  const occurredAt = bank?.transactedAt ?? card?.approvedAt ?? `${manualOccurredAt}T12:00:00+09:00`;
  const expenseDetailRecommendation = recommendOperatingExpenseDetail(initialExpenseDetails, {
    counterparty,
    itemName: `${usageDescription} ${bank?.description ?? ""}`,
    vendorName: counterparty,
  });
  const automaticDetail = expenseDetailRecommendation?.detail.status === "CONFIRMED" && expenseDetailRecommendation.detail.quickExpenseEligible ? expenseDetailRecommendation.detail : undefined;
  const effectiveExpenseDetailId = expenseDetailSelection === "AUTO" ? automaticDetail?.id ?? "" : expenseDetailId;
  const effectiveBudgetItem = expenseDetailSelection === "AUTO" ? automaticDetail?.budgetItem ?? "" : budgetItem;
  const missingFields = [
    (isBank || (isCard && !isManualCard)) && !sourceId ? "실제 거래" : "",
    !(amount > 0) ? "금액" : "",
    !counterparty.trim() ? "거래처·사용처" : "",
    !usageDescription.trim() ? "사용내용" : "",
    !effectiveExpenseDetailId.trim() ? "지출 세부항목" : "",
    !receiptAvailable && !missingEvidenceReason.trim() ? "영수증 미첨부 사유" : "",
  ].filter(Boolean);

  const applyOcrData = useCallback((data: EvidenceOcrData, jobId: string) => {
    if (appliedOcrJobs.current.has(jobId)) return;
    appliedOcrJobs.current.add(jobId);
    const manualTransaction = isManualCard || (!isBank && !isCard);
    const description = data.items?.map((item) => item.itemName).filter(Boolean).join(", ") || data.itemName || "";
    if (manualTransaction && data.documentDate && !editedFields.current.occurredAt) { setManualOccurredAt(data.documentDate); setOcrAppliedFields((current) => ({ ...current, occurredAt: true })); }
    if (manualTransaction && data.totalAmount && data.totalAmount > 0 && !editedFields.current.amount) { setManualAmount(String(data.totalAmount)); setOcrAppliedFields((current) => ({ ...current, amount: true })); }
    if (manualTransaction && data.issuer && !editedFields.current.counterparty) { setManualCounterparty(data.issuer); setOcrAppliedFields((current) => ({ ...current, counterparty: true })); }
    if (description && !editedFields.current.usageDescription) { setUsageDescription(description); setOcrAppliedFields((current) => ({ ...current, usageDescription: true })); }
    if (data.normalizedEvidenceType) setEvidenceType(data.normalizedEvidenceType);
  }, [isBank, isCard, isManualCard]);

  useEffect(() => {
    const ocrJobId = receiptAttachment?.ocrJobId;
    if (!ocrJobId || !getEvidenceOcrJob || receiptState !== "PROCESSING") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const job = await getEvidenceOcrJob(ocrJobId);
        if (cancelled) return;
        setReceiptProgress(job.progress);
        if (job.status === "COMPLETED") {
          setReceiptOcrData(job.resultData);
          setReceiptState("COMPLETED");
          applyOcrData(job.resultData, ocrJobId);
          return;
        }
        if (job.status === "FAILED") {
          setReceiptError(job.errorMessage ?? "영수증 자동인식에 실패했어. 직접 입력하거나 다시 등록해줘.");
          setReceiptState("FAILED");
          return;
        }
        timer = setTimeout(poll, 1200);
      } catch (error) {
        if (cancelled) return;
        setReceiptError(error instanceof Error ? error.message : "OCR 상태를 확인하지 못했어.");
        setReceiptState("FAILED");
      }
    };
    timer = setTimeout(poll, 300);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [applyOcrData, getEvidenceOcrJob, receiptAttachment, receiptState]);

  async function discardCurrentReceipt() {
    const ocrJobId = receiptAttachment?.ocrJobId;
    if (ocrJobId && discardEvidence) await discardEvidence(ocrJobId);
    setReceiptAttachment(null); setReceiptFile(null); setReceiptOcrData({}); setReceiptProgress(0); setReceiptState("IDLE"); setReceiptError("");
    setReceiptInputKey((current) => current + 1); setOcrAppliedFields({ amount: false, counterparty: false, occurredAt: false, usageDescription: false });
  }

  async function selectNoReceipt() {
    try { await discardCurrentReceipt(); setReceiptAvailable(false); }
    catch (error) { setMessage(error instanceof Error ? error.message : "기존 영수증을 정리하지 못했어."); }
  }

  async function uploadReceiptFirst(file: File | undefined) {
    if (!file) return;
    setReceiptAvailable(true); setReceiptError(""); setMessage("");
    try {
      if (receiptAttachment) await discardCurrentReceipt();
      setReceiptFile(file); setReceiptState("UPLOADING"); setReceiptProgress(10);
      const result = await uploadEvidence(file, `QUICK-DRAFT-${crypto.randomUUID()}`, evidenceType);
      if (!result.ok) throw new Error(result.message);
      if (!result.attachment.ocrJobId) throw new Error("OCR 작업 정보를 확인하지 못했어.");
      setReceiptAttachment(result.attachment); setReceiptProgress(20); setReceiptState("PROCESSING");
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : "영수증을 등록하지 못했어.");
      setReceiptState("FAILED");
    }
  }

  async function retryReceiptOcr() {
    const ocrJobId = receiptAttachment?.ocrJobId;
    if (!ocrJobId || !retryEvidenceOcrJob) return setReceiptError("OCR 다시 분석 기능을 사용할 수 없어. 영수증을 제거한 뒤 다시 등록해줘.");
    setIsRetryingReceipt(true); setReceiptError("");
    try {
      appliedOcrJobs.current.delete(ocrJobId);
      await retryEvidenceOcrJob(ocrJobId);
      setReceiptProgress(20); setReceiptState("PROCESSING");
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : "OCR 다시 분석을 시작하지 못했어.");
      setReceiptState("FAILED");
    } finally {
      setIsRetryingReceipt(false);
    }
  }

  function submit() {
    if (paymentMethod === "PERSONAL_PREPAID") { window.location.assign("/finance/reimbursements"); return; }
    if (!persistRecord) return setMessage("저장소가 연결되지 않아 사용내용을 저장할 수 없습니다.");
    if (missingFields.length) return setMessage(`먼저 ${missingFields.join(", ")}을 입력해줘.`);
    const sourceType = isBank ? "BANK_TRANSACTION" as const : isCard && !isManualCard ? "CORPORATE_CARD" as const : "MANUAL" as const;
    startTransition(async () => {
      let saved: QuickExpenseRecord | undefined;
      try {
        saved = await persistRecord({ amount, approvalSkipReason: paymentMethod === "AUTO_DEBIT" ? "정기·반복 지출" : "승인 예산 내 일상 지출", bankTransactionId: isBank ? sourceId : undefined, budgetItem: effectiveBudgetItem, corporateCardTransactionId: isCard && !isManualCard ? sourceId : undefined, counterparty, evidenceKind: isCard ? "CARD_TRANSACTION" : isBank ? "BANK_TRANSFER" : "NONE", evidenceStatus: receiptAvailable ? "GENERAL" : "ALTERNATIVE", expenseDetailId: effectiveExpenseDetailId, missingEvidenceReason: receiptAvailable ? "" : missingEvidenceReason, occurredAt, paymentMethod, recordedByLabel: "오학동 사무장", sourceType, usageDescription });
      } catch (error) { setMessage(error instanceof Error ? error.message : "사용내용을 저장하지 못했습니다."); }
      if (!saved) return;
      setRecords((current) => [saved, ...current]);
      let receiptMessage = "";
      if (receiptAvailable && receiptAttachment) {
        try {
          if (!attachEvidence) throw new Error("영수증 연결 저장소가 연결되지 않았어.");
          await attachEvidence(saved.id, receiptAttachment, `quick-receipt:${saved.id}:${receiptAttachment.ocrJobId}`);
          receiptMessage = receiptState === "COMPLETED" ? "사용내용과 영수증을 등록했고 OCR 자동입력 결과도 반영했어." : "사용내용과 영수증을 등록했어. OCR 분석은 지출관리 상세에서도 이어서 확인할 수 있어.";
        } catch (error) {
          const reason = error instanceof Error ? error.message : "영수증을 등록하지 못했어.";
          receiptMessage = `사용내용은 등록했지만 영수증 연결에 실패했어. 지출관리 상세에서 다시 첨부해줘. (${reason})`;
        }
      }
      setUsageDescription(""); setBudgetItem(""); setExpenseDetailId(""); setExpenseDetailSelection("AUTO"); setSourceId(""); setManualAmount(""); setManualCounterparty(""); setMissingEvidenceReason(""); setReceiptFile(null); setReceiptAttachment(null); setReceiptOcrData({}); setReceiptProgress(0); setReceiptState("IDLE"); setReceiptError(""); setReceiptInputKey((current) => current + 1); setOcrAppliedFields({ amount: false, counterparty: false, occurredAt: false, usageDescription: false });
      editedFields.current = { amount: false, counterparty: false, occurredAt: false, usageDescription: false };
      setMessage(receiptMessage || (receiptError ? `사용내용은 등록했지만 영수증 자동입력은 완료하지 못했어. 지출관리 상세에서 다시 첨부해줘. (${receiptError})` : saved.recordStatus === "RECORDED" ? "지출결의 없이 사용내용을 등록했어." : saved.recordStatus === "SOURCE_PENDING" ? "사용내용을 임시등록했어. 카드 승인내역이 들어오면 실제 거래를 연결해줘." : saved.recordStatus === "EVIDENCE_PENDING" ? "사용내용을 등록했어. 영수증 또는 대체증빙을 확인하면 간편처리가 완료돼." : "정식 지출결의가 필요한 거래로 분류했어."));
    });
  }

  async function uploadCardFile(file: File) {
    if (!importCardTransactions) return setMessage("카드내역 저장소가 연결되지 않았어.");
    try {
      const text = await readBankTransactionFile(file);
      const rows = parseCorporateCardTransactionText(text);
      if (!rows.length) throw new Error("등록할 카드 이용내역이 없어.");
      await importCardTransactions(rows);
      setMessage(`${rows.length}건을 등록했어. 연결 후보를 불러오기 위해 새로고침할게.`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "카드 이용내역을 등록하지 못했어.");
    }
  }

  function candidates(record: QuickExpenseRecord) {
    return availableCards.filter((candidate) => Math.abs(candidate.amount - record.amount) <= 0.5
      && Math.abs(new Date(candidate.approvedAt).getTime() - new Date(record.occurredAt).getTime()) <= 172800000);
  }

  function connect(record: QuickExpenseRecord, cardTransactionId: string) {
    if (!linkCardTransaction) return setMessage("카드 연결 저장소가 연결되지 않았어.");
    startTransition(async () => {
      try {
        const result = await linkCardTransaction({ recordId: record.id, cardTransactionId });
        setRecords((current) => current.map((item) => item.id === record.id ? { ...item, corporateCardTransactionId: cardTransactionId, sourceType: "CORPORATE_CARD", recordStatus: result.recordStatus } : item));
        setLinkingRecordId("");
        setMessage(result.recordStatus === "RECORDED" ? "카드 이용내역을 연결하고 예산 내 간편처리를 완료했어." : result.recordStatus === "EVIDENCE_PENDING" ? "카드 이용내역을 연결했어. 영수증 또는 대체증빙 확인이 남았어." : "카드 이용내역은 연결했지만 승인예산이 부족하거나 없어 정식결의가 필요해.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "카드 이용내역을 연결하지 못했어.");
      }
    });
  }

  return <ErpShell activeDetailLabel="예산 내 간편지출" activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리"><div className="mx-auto grid max-w-[1180px] gap-6">
    <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-6"><p className="text-xs font-bold text-[var(--color-deep-cobalt)]">회계/자금 &gt; 전표·증빙관리</p><h1 className="mt-2 text-3xl font-bold">예산 내 간편지출</h1><p className="mt-2 text-sm text-[var(--color-stone)]">정식 지출결의서를 만들지 않고 실제 거래에 사용내용과 예산항목을 기록합니다. 한도초과·계약·예산 외 거래는 자동으로 정식 결의 대상으로 분류합니다.</p></section>
    <section className="grid gap-5 rounded-2xl border border-[var(--color-soft-border)] bg-white p-6">
      <fieldset><legend className="text-sm font-bold">결제수단</legend><div className="mt-3 flex flex-wrap gap-2">{paymentMethodOrder.map((method) => <button aria-pressed={paymentMethod === method} className={`rounded-full border px-4 py-2 text-sm font-bold ${paymentMethod === method ? "border-[var(--color-deep-cobalt)] bg-[var(--color-morning-tint)]" : "border-[var(--color-soft-border)]"}`} key={method} onClick={() => { setPaymentMethod(method); setSourceId(""); setManualCardEntry(false); setExpenseDetailSelection("AUTO"); setExpenseDetailId(""); setBudgetItem(""); setMessage(""); }} type="button">{paymentLabels[method]}</button>)}</div></fieldset>
      <fieldset className="grid gap-4 rounded-2xl border border-blue-300 bg-blue-50/45 p-5"><legend className="px-2 text-base font-bold text-blue-950">1. 영수증 먼저 등록</legend><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-blue-950">영수증을 등록하면 OCR이 입력을 도와줘.</p><p className="mt-1 text-sm text-blue-800">날짜·금액·가맹점·사용내용을 자동입력하고, 실제 카드·통장 거래와 다르면 확인할 수 있어.</p></div><div className="flex flex-wrap gap-2"><button aria-pressed={receiptAvailable} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={receiptState === "UPLOADING"} onClick={()=>{setReceiptAvailable(true);receiptInputRef.current?.click();}} type="button">영수증 선택 · OCR 자동입력</button><button aria-pressed={!receiptAvailable} className="rounded-full border border-amber-400 bg-white px-4 py-2 text-sm font-bold text-amber-900 disabled:opacity-50" disabled={receiptState === "UPLOADING"} onClick={()=>void selectNoReceipt()} type="button">영수증 없음 · 직접 입력</button></div></div>{receiptAvailable?<div className="grid gap-3 sm:grid-cols-[220px_1fr]"><label className="grid gap-2 text-sm font-bold"><span>증빙 종류</span><select className="h-11 rounded-lg border bg-white px-3" value={evidenceType} onChange={event=>setEvidenceType(event.target.value)}><option>영수증</option><option>주문내역</option><option>거래명세서</option><option>카드 승인내역</option><option>계좌이체 확인증</option><option>물품 사진</option><option>기타 대체증빙</option></select></label><label className="grid gap-2 text-sm font-bold"><span>증빙 파일</span><input accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv" aria-label="증빙 파일" className="h-11 rounded-lg border bg-white px-3 file:mr-3" disabled={receiptState === "UPLOADING"} key={receiptInputKey} onChange={event=>void uploadReceiptFirst(event.target.files?.[0])} ref={receiptInputRef} type="file"/><span className="text-xs font-normal text-slate-600">PDF·JPG·PNG·WEBP·TXT·CSV, 최대 10MB</span></label></div>:<label className="grid gap-2 text-sm font-bold"><span>영수증 미첨부 사유</span><textarea className="min-h-20 rounded-lg border bg-white p-3" value={missingEvidenceReason} onChange={event=>setMissingEvidenceReason(event.target.value)} placeholder="예: 구매 후 영수증 분실. 카드 승인내역과 주문내역을 제출합니다." /></label>}
      {receiptFile?<div className="rounded-xl border bg-white p-3" role="status"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{receiptFile.name}</p><div className="flex gap-3">{receiptState === "FAILED"?<button className="text-sm font-bold text-blue-700 underline disabled:opacity-50" disabled={isRetryingReceipt} onClick={()=>void retryReceiptOcr()} type="button">{isRetryingReceipt ? "다시 분석 요청 중" : "OCR 다시 분석"}</button>:null}<button className="text-sm font-bold text-red-700 underline disabled:opacity-50" disabled={receiptState === "UPLOADING" || isRetryingReceipt} onClick={()=>void discardCurrentReceipt()} type="button">영수증 제거</button></div></div><p className="mt-1 text-sm">{receiptState === "UPLOADING" ? "영수증 업로드 중" : receiptState === "PROCESSING" ? `OCR 자동입력 중 ${receiptProgress}%` : receiptState === "COMPLETED" ? "OCR 자동입력 완료 · 내용을 확인해줘." : receiptState === "FAILED" ? `자동입력 실패 · ${receiptError}` : "영수증을 선택했어."}</p>{receiptState === "COMPLETED"?<p className="mt-2 text-sm text-slate-700">인식 결과: {receiptOcrData.documentDate ?? "날짜 미인식"} · {receiptOcrData.issuer ?? "가맹점 미인식"} · {receiptOcrData.totalAmount === undefined ? "금액 미인식" : `${receiptOcrData.totalAmount.toLocaleString("ko-KR")}원`}</p>:null}{(bank || card) && receiptOcrData.totalAmount !== undefined && Math.abs(receiptOcrData.totalAmount - amount) > 0.5?<p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-900">실제 거래 금액 {amount.toLocaleString("ko-KR")}원과 OCR 금액 {receiptOcrData.totalAmount.toLocaleString("ko-KR")}원이 달라. 실제 거래 금액을 유지했어.</p>:null}</div>:null}</fieldset>
      {isBank ? <label className="grid gap-2 text-sm font-bold"><span>미처리 통장 출금거래</span><select className="h-11 rounded-lg border px-3" onChange={(event) => setSourceId(event.target.value)} value={sourceId}><option value="">거래 선택</option>{initialBankTransactions.filter((item) => !item.linkedResolutionId && !records.some((record) => record.bankTransactionId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.transactedAt.slice(0,10)} · {item.withdrawalAmount.toLocaleString("ko-KR")}원 · {item.counterparty || item.description}</option>)}</select></label> : null}
      {isCard && availableCards.length ? <div className="grid gap-3"><label className="grid gap-2 text-sm font-bold"><span>미처리 법인카드 승인내역</span><select className="h-11 rounded-lg border px-3" onChange={(event) => { setSourceId(event.target.value); setManualCardEntry(false); }} value={sourceId}><option value="">거래 선택</option>{availableCards.map((item) => <option key={item.id} value={item.id}>{item.approvedAt.slice(0,10)} · {item.amount.toLocaleString("ko-KR")}원 · {item.merchantName}</option>)}</select></label><button className="justify-self-start text-sm font-bold text-[var(--color-deep-cobalt)] underline underline-offset-4" onClick={() => { setManualCardEntry(true); setSourceId(""); }} type="button">승인내역 없이 임시등록</button></div> : null}
      {isCard && !availableCards.length ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-bold text-amber-900">등록된 미처리 법인카드 승인내역이 없습니다.</p><p className="mt-1 text-sm text-amber-800">결제 내용을 먼저 임시등록할 수 있어. 카드내역이 동기화되면 실제 승인거래를 연결해줘.</p></div> : null}
      {isManualCard ? <div className="grid gap-4 md:grid-cols-3"><label className="grid gap-2 text-sm font-bold"><span>카드 사용일 {ocrAppliedFields.occurredAt?<small className="text-blue-700">· OCR 자동입력</small>:null}</span><input className="h-11 rounded-lg border px-3" onChange={(event) => {editedFields.current.occurredAt=true;setOcrAppliedFields((current)=>({...current,occurredAt:false}));setManualOccurredAt(event.target.value);}} type="date" value={manualOccurredAt} /></label><label className="grid gap-2 text-sm font-bold"><span>카드 사용금액 {ocrAppliedFields.amount?<small className="text-blue-700">· OCR 자동입력</small>:null}</span><input className="h-11 rounded-lg border px-3" inputMode="numeric" onChange={(event) => {editedFields.current.amount=true;setOcrAppliedFields((current)=>({...current,amount:false}));setManualAmount(event.target.value.replace(/\D/g, ""));}} value={manualAmount} /></label><label className="grid gap-2 text-sm font-bold"><span>가맹점·사용처 {ocrAppliedFields.counterparty?<small className="text-blue-700">· OCR 자동입력</small>:null}</span><input className="h-11 rounded-lg border px-3" onChange={(event) => {editedFields.current.counterparty=true;setOcrAppliedFields((current)=>({...current,counterparty:false}));setManualCounterparty(event.target.value);}} value={manualCounterparty} /></label></div> : null}
      {!isBank && !isCard ? <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-bold"><span>금액 {ocrAppliedFields.amount?<small className="text-blue-700">· OCR 자동입력</small>:null}</span><input className="h-11 rounded-lg border px-3" inputMode="numeric" onChange={(event) => {editedFields.current.amount=true;setOcrAppliedFields((current)=>({...current,amount:false}));setManualAmount(event.target.value.replace(/\D/g, ""));}} value={manualAmount} /></label><label className="grid gap-2 text-sm font-bold"><span>거래처·지급대상 {ocrAppliedFields.counterparty?<small className="text-blue-700">· OCR 자동입력</small>:null}</span><input className="h-11 rounded-lg border px-3" onChange={(event) => {editedFields.current.counterparty=true;setOcrAppliedFields((current)=>({...current,counterparty:false}));setManualCounterparty(event.target.value);}} value={manualCounterparty} /></label></div> : null}
      <label className="grid gap-2 text-sm font-bold"><span>사용내용 {ocrAppliedFields.usageDescription?<small className="text-blue-700">· OCR 자동입력</small>:null}</span><textarea className="min-h-24 rounded-lg border p-3" onChange={(event) => {editedFields.current.usageDescription=true;setOcrAppliedFields((current)=>({...current,usageDescription:false}));setUsageDescription(event.target.value);}} placeholder="예: 조합 사무실 인터넷 요금" value={usageDescription} /></label>
      <label className="grid gap-2 text-sm font-bold"><span>지출 세부항목</span><select aria-label="지출 세부항목" className="h-11 rounded-lg border px-3" onChange={(event) => { const detail=initialExpenseDetails.find((item)=>item.id===event.target.value); setExpenseDetailSelection(event.target.value ? "MANUAL" : "AUTO"); setExpenseDetailId(event.target.value); setBudgetItem(detail?.budgetItem ?? ""); }} value={effectiveExpenseDetailId}><option value="">세부항목 선택</option>{initialExpenseDetails.map((detail)=><option disabled={!detail.quickExpenseEligible || detail.status!=="CONFIRMED"} key={detail.id} value={detail.id}>{detail.groupName} · {detail.name}{detail.status==="POLICY_REVIEW"?" (정책 확인 필요)":!detail.quickExpenseEligible?" (정식결의)":""}</option>)}</select><span className="text-xs font-normal text-[var(--color-stone)]">{effectiveExpenseDetailId && expenseDetailSelection === "AUTO" ? `사용내용·거래처에서 자동 선택 · ${expenseDetailRecommendation?.recommendation.reason ?? "추천 기준 일치"}` : expenseDetailRecommendation && (!expenseDetailRecommendation.detail.quickExpenseEligible || expenseDetailRecommendation.detail.status !== "CONFIRMED") ? `${expenseDetailRecommendation.detail.groupName} · ${expenseDetailRecommendation.detail.name}으로 인식했지만 정식 지출결의 또는 정책 확인이 필요해.` : "사용내용·거래처·실제 거래를 바탕으로 자동 선택하며, 직접 고른 값은 유지해."}</span></label>
      <label className="grid gap-2 text-sm font-bold"><span>연결 승인 예산</span><input className="h-11 rounded-lg border bg-slate-50 px-3" readOnly value={effectiveBudgetItem} placeholder={initialExpenseDetails.length ? "세부항목을 먼저 선택해줘" : "세부항목 기준을 불러오지 못했어"}/><datalist id="quick-expense-budget-items">{initialBudgetItems.map((item) => <option key={item} value={item} />)}</datalist></label>
      <div className="grid gap-3 rounded-xl border border-[var(--color-deep-cobalt)]/20 bg-[var(--color-morning-tint)]/35 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-sm font-bold">{amount > 0 ? `${counterparty || "거래처 미입력"} · ${amount.toLocaleString("ko-KR")}원` : "거래와 사용내용을 입력해줘."}</p><p className={`mt-1 text-xs font-semibold ${missingFields.length ? "text-[var(--color-tangerine)]" : "text-[var(--color-green-ink)]"}`}>{missingFields.length ? `입력 필요: ${missingFields.join(", ")}` : isManualCard ? "등록 후 카드내역 연결대기로 보관됩니다." : "등록 후 증빙 확인대기로 보관됩니다."}</p></div><Button className="min-w-36 bg-[var(--color-pressed-charcoal)] text-white" disabled={isPending || receiptState === "UPLOADING"} onClick={submit}>{receiptState === "UPLOADING" ? "영수증 업로드 중" : isPending ? "저장 중" : isManualCard ? "사용내용 임시등록" : "사용내용 등록"}</Button></div>
      {message ? <p aria-live="polite" className="rounded-lg bg-[var(--color-morning-tint)] px-4 py-3 text-sm font-bold text-[var(--color-deep-cobalt)]">{message}</p> : null}
      <details className="rounded-xl border border-dashed border-[var(--color-deep-cobalt)]/35 p-4"><summary className="cursor-pointer font-bold">법인카드 이용내역 파일 불러오기</summary><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--color-stone)]">CSV·XLSX·XLS 파일의 승인일자, 금액, 가맹점, 카드번호, 승인번호를 불러옵니다.</p><label className="cursor-pointer rounded-full bg-[var(--color-deep-cobalt)] px-4 py-2 text-sm font-bold text-white"><input accept=".csv,.tsv,.xlsx,.xls" aria-label="법인카드 이용내역 파일" className="sr-only" onChange={(event)=>{const file=event.target.files?.[0];if(file)void uploadCardFile(file);}} type="file"/>카드내역 파일 선택</label></div></details>
    </section>
    <Link href="/finance/reimbursements" className="rounded-xl border bg-white p-4 text-sm font-semibold text-blue-700">개인 선지출은 개인 지출 정산에서 신청·지급 상태를 관리해. 정산 화면으로 이동 →</Link>
    <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-6"><h2 className="text-lg font-bold">최근 간편지출 기록</h2><div className="mt-4 grid gap-3">{records.length ? records.map((record) => <article className="rounded-xl border p-4" key={record.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{record.usageDescription}</p>{record.recordStatus==="SOURCE_PENDING"?<button className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900" onClick={()=>setLinkingRecordId(record.id)} type="button">카드내역 연결대기</button>:<span className={`rounded-full px-3 py-1 text-xs font-bold ${record.recordStatus === "RECORDED" ? "bg-[var(--color-sprout)] text-[var(--color-green-ink)]" : "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]"}`}>{record.recordStatus === "RECORDED" ? "간편처리 완료" : record.recordStatus === "EVIDENCE_PENDING" ? "증빙 확인대기" : record.recordStatus === "CONVERTED" ? "정산·결의 연결" : "정식결의 필요"}</span>}</div><p className="mt-2 text-sm text-[var(--color-stone)]">{record.counterparty} · {record.amount.toLocaleString("ko-KR")}원 · {record.budgetItem}</p>{linkingRecordId===record.id?<div className="mt-3 grid gap-2 rounded-lg bg-[var(--color-cloud-veil)] p-3"><p className="text-sm font-bold">금액·사용일이 일치하는 카드내역</p>{candidates(record).length?candidates(record).map(card=><button className="rounded-lg border bg-white px-3 py-2 text-left text-sm" key={card.id} onClick={()=>connect(record,card.id)} type="button">{card.approvedAt.slice(0,10)} · {card.merchantName} · {card.amount.toLocaleString("ko-KR")}원 · 연결</button>):<p className="text-sm text-[var(--color-stone)]">일치 후보가 없어. 카드내역 파일을 먼저 등록해줘.</p>}</div>:null}</article>) : <p className="text-sm text-[var(--color-stone)]">등록된 간편지출이 없습니다.</p>}</div></section>
  </div></ErpShell>;
}

async function uploadQuickExpenseEvidence(file: File, resolutionNo: string, evidenceType: string): Promise<ExpenseEvidenceUploadResult> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("resolutionNo", resolutionNo);
  formData.set("evidenceType", evidenceType);
  const response = await fetch("/api/finance/expense-evidence", { body: formData, method: "POST" });
  const result = await response.json().catch(() => null) as ExpenseEvidenceUploadResult | null;
  if (result && typeof result === "object" && "ok" in result) return result;
  throw new Error("영수증 업로드 결과를 확인하지 못했어. 다시 시도해줘.");
}
